/**
 * Watering Can — ESP32-S3 Feather
 *
 * Hardware (daisy-chained on STEMMA QT / I2C):
 *   ESP32-S3 → LSM6DS3 IMU (0x6A) → MPRLS pressure sensor (0x18)
 *   OLED SSD1306 128×32 (0x3C) — not installed yet, init is non-fatal
 *
 * Features:
 *   - Tilt-based pour detection (IMU accelerometer)
 *   - Water volume measurement (pressure ΔP × ML_PER_HPA)
 *   - 20-plant selection stored in NVS (rolling avg of last 3 waterings)
 *   - Single tap = next plant, double tap = previous plant (OLED nav)
 *   - MQTT event publish + status heartbeat (30s interval)
 *   - Offline event buffering (up to 20 events) when WiFi down
 *   - NTP timestamps on watering events
 *   - Battery monitoring (VBAT via A13 voltage divider)
 *   - Refill detection (pressure spike → update baseline, not a pour)
 *   - Deep sleep after 2 min inactivity; INT1 tap wakes device (GPIO9)
 *   - ArduinoOTA for wireless firmware updates
 *
 * Volume formula:
 *   ΔP is measured between two upright readings so tilt geometry
 *   during the pour does not affect the result.
 *   See config.h for calibration instructions.
 *
 * Wiring note for deep sleep wake:
 *   LSM6DS3 INT1 pin → GPIO9 with 10kΩ pull-down resistor to GND.
 *   See config.h WAKE_PIN.
 */

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Adafruit_LSM6DS3TRC.h>
#include <Adafruit_MPRLS.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoOTA.h>
#include <Preferences.h>
#include <esp_sleep.h>
#include <time.h>
#include "secrets.h"
#include "config.h"


// ════════════════════════════════════════════════════════════
// Hardware objects
// ════════════════════════════════════════════════════════════

Adafruit_LSM6DS3TRC imu;
Adafruit_MPRLS      mprls(-1, -1);    // no reset/EOC pins
Adafruit_SSD1306    display(DISPLAY_WIDTH, DISPLAY_HEIGHT, &Wire, -1);
Preferences         prefs;

// ════════════════════════════════════════════════════════════
// Connectivity
// ════════════════════════════════════════════════════════════

WiFiClientSecure wifiSecure;
PubSubClient     mqtt(wifiSecure);

// ════════════════════════════════════════════════════════════
// State machine
// ════════════════════════════════════════════════════════════

enum State { IDLE, POURING, SETTLING, REPORTING };
State state = IDLE;

// ════════════════════════════════════════════════════════════
// Plant record (per plant, persisted in NVS)
// ════════════════════════════════════════════════════════════

struct PlantRecord {
    float   volumes[HISTORY_SIZE];  // last HISTORY_SIZE watering volumes (ml)
    uint8_t count;                  // valid entries (0..HISTORY_SIZE)
    int32_t lastTs;                 // Unix timestamp of last watering (0 = never)
};

// ════════════════════════════════════════════════════════════
// Runtime globals
// ════════════════════════════════════════════════════════════

int   currentPlant    = 0;          // 0-based index (0 = plant 1, 19 = plant 20)
float pressureUpright = 0.0f;       // last stable upright pressure (updated in IDLE)
float pressureStart   = 0.0f;       // upright pressure snapshot at pour start

unsigned long pourStartMs    = 0;
unsigned long settleStartMs  = 0;
unsigned long lastActivityMs = 0;
unsigned long lastStatusMs   = 0;

bool oledPresent = false;
bool ntpSynced   = false;

// Tap detection window
bool          tapPending   = false;
bool          tapIsDouble  = false;
unsigned long tapPendingMs = 0;


// ════════════════════════════════════════════════════════════
// IMU raw register helpers (tap detection not exposed by Adafruit lib)
// ════════════════════════════════════════════════════════════

void imuWriteReg(uint8_t reg, uint8_t val) {
    Wire.beginTransmission(I2C_IMU);
    Wire.write(reg);
    Wire.write(val);
    Wire.endTransmission();
}

uint8_t imuReadReg(uint8_t reg) {
    Wire.beginTransmission(I2C_IMU);
    Wire.write(reg);
    Wire.endTransmission(false);
    Wire.requestFrom((uint8_t)I2C_IMU, (uint8_t)1);
    return Wire.available() ? Wire.read() : 0;
}

void setupTapDetection() {
    // TAP_CFG (0x58): INTERRUPTS_ENABLE | TAP_X/Y/Z_EN | LIR (latched interrupt)
    //   0x8F = 1000_1111
    imuWriteReg(LSM6DS3_TAP_CFG, 0x8F);

    // TAP_THS_6D (0x59): threshold mid-range (~375mg at ±2g)
    //   0x8C = 1000_1100
    imuWriteReg(LSM6DS3_TAP_THS_6D, 0x8C);

    // INT_DUR2 (0x5A): DUR=3 (~920ms double-tap window) | QUIET=2 (~77ms) | SHOCK=1 (~77ms)
    //   0x39 = 0011_1001
    imuWriteReg(LSM6DS3_INT_DUR2, 0x39);

    // WAKE_UP_THS (0x5B): SINGLE_DOUBLE_TAP enable (bit 7)
    imuWriteReg(LSM6DS3_WAKE_UP_THS, 0x80);

    // MD1_CFG (0x5E): route both single (bit 6) + double (bit 3) tap to INT1
    //   0x48 = 0100_1000
    imuWriteReg(LSM6DS3_MD1_CFG, 0x48);

    Serial.printf("Tap detection configured → INT1 on GPIO%d\n", WAKE_PIN);
}


// ════════════════════════════════════════════════════════════
// NVS helpers
// ════════════════════════════════════════════════════════════

PlantRecord loadPlant(int idx) {
    PlantRecord rec = {};
    char ns[8];
    snprintf(ns, sizeof(ns), "p%d", idx);
    prefs.begin(ns, true);
    rec.count  = prefs.getUChar("n", 0);
    rec.lastTs = prefs.getInt("ts", 0);
    for (int i = 0; i < HISTORY_SIZE; i++) {
        char key[4];
        snprintf(key, sizeof(key), "v%d", i);
        rec.volumes[i] = prefs.getFloat(key, 0.0f);
    }
    prefs.end();
    return rec;
}

void savePlant(int idx, const PlantRecord& rec) {
    char ns[8];
    snprintf(ns, sizeof(ns), "p%d", idx);
    prefs.begin(ns, false);
    prefs.putUChar("n", rec.count);
    prefs.putInt("ts", rec.lastTs);
    for (int i = 0; i < HISTORY_SIZE; i++) {
        char key[4];
        snprintf(key, sizeof(key), "v%d", i);
        prefs.putFloat(key, rec.volumes[i]);
    }
    prefs.end();
}

float plantAvgVolume(const PlantRecord& rec) {
    if (rec.count == 0) return 0.0f;
    float sum = 0.0f;
    for (int i = 0; i < rec.count; i++) sum += rec.volumes[i];
    return sum / rec.count;
}

void recordWatering(int plantIdx, float volumeMl, time_t ts) {
    PlantRecord rec = loadPlant(plantIdx);
    // Shift history and insert new reading at front
    for (int i = HISTORY_SIZE - 1; i > 0; i--) rec.volumes[i] = rec.volumes[i - 1];
    rec.volumes[0] = volumeMl;
    if (rec.count < HISTORY_SIZE) rec.count++;
    rec.lastTs = (int32_t)ts;
    savePlant(plantIdx, rec);
}

int loadCurrentPlant() {
    prefs.begin("state", true);
    int idx = prefs.getInt("plant", 0);
    prefs.end();
    return constrain(idx, 0, NUM_PLANTS - 1);
}

void saveCurrentPlant(int idx) {
    prefs.begin("state", false);
    prefs.putInt("plant", idx);
    prefs.end();
}

void bufferEvent(const char* json) {
    prefs.begin("evbuf", false);
    uint8_t n = prefs.getUChar("n", 0);
    if (n < MAX_BUFFERED_EVENTS) {
        char key[8];
        snprintf(key, sizeof(key), "e%d", n);
        prefs.putString(key, json);
        prefs.putUChar("n", n + 1);
        Serial.printf("Event buffered (%d in queue)\n", n + 1);
    } else {
        Serial.println("Event buffer full — event discarded");
    }
    prefs.end();
}

void flushBufferedEvents() {
    prefs.begin("evbuf", false);
    uint8_t n = prefs.getUChar("n", 0);
    if (n == 0) { prefs.end(); return; }
    Serial.printf("Flushing %d buffered events\n", n);
    for (uint8_t i = 0; i < n; i++) {
        char key[8];
        snprintf(key, sizeof(key), "e%d", i);
        String json = prefs.getString(key, "");
        if (json.length() > 0 && mqtt.connected()) {
            mqtt.publish(TOPIC_EVENT, json.c_str());
            Serial.printf("  Flushed [%d]: %s\n", i, json.c_str());
        }
        prefs.remove(key);
    }
    prefs.putUChar("n", 0);
    prefs.end();
}


// ════════════════════════════════════════════════════════════
// Display helpers (128×32, 4 rows at textSize 1: y = 0, 8, 16, 24)
// ════════════════════════════════════════════════════════════

void updateDisplayIdle(float pressureHpa, float battV) {
    if (!oledPresent) return;
    PlantRecord rec = loadPlant(currentPlant);

    int  daysAgo   = 0;
    bool needsWater = false;
    if (rec.lastTs > 0 && ntpSynced) {
        daysAgo    = (int)((time(nullptr) - (time_t)rec.lastTs) / 86400L);
        needsWater = (daysAgo >= NEEDS_WATER_DAYS);
    }

    int battPct = constrain((int)((battV - 3.3f) / 0.9f * 100.0f), 0, 100);

    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);

    // Row 0: plant number + dry indicator
    display.setCursor(0, 0);
    display.printf("Plant %d/20%s", currentPlant + 1, needsWater ? " *DRY*" : "");

    // Row 1: pressure
    display.setCursor(0, 8);
    display.printf("P: %.1f hPa", pressureHpa);

    // Row 2: battery
    display.setCursor(0, 16);
    display.printf("Bat: %.2fV  %d%%", battV, battPct);

    // Row 3: MQTT status + days since last water
    display.setCursor(0, 24);
    if (rec.lastTs > 0 && ntpSynced)
        display.printf("%s  %dd ago", mqtt.connected() ? "OK" : "--", daysAgo);
    else
        display.printf("MQTT: %s", mqtt.connected() ? "OK" : "--");

    display.display();
}

void updateDisplayPouring(float pressureHpa, unsigned long elapsedMs) {
    if (!oledPresent) return;
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0,  0); display.print(">>>> POURING <<<<");
    display.setCursor(0,  8); display.printf("Plant %d/20", currentPlant + 1);
    display.setCursor(0, 16); display.printf("Elapsed: %lus", elapsedMs / 1000UL);
    display.setCursor(0, 24); display.printf("P: %.1f hPa", pressureHpa);
    display.display();
}

void updateDisplayComplete(float volumeMl, unsigned long durationMs) {
    if (!oledPresent) return;
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0,  0); display.printf("Done! %.0f ml", volumeMl);
    display.setCursor(0,  8); display.printf("Plant %d/20", currentPlant + 1);
    display.setCursor(0, 16); display.printf("Duration: %lus", durationMs / 1000UL);
    display.setCursor(0, 24); display.print("Tap to navigate");
    display.display();
}

void updateDisplaySleep() {
    if (!oledPresent) return;
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(16, 12); display.print("Tap to wake");
    display.display();
    delay(50);
}


// ════════════════════════════════════════════════════════════
// Sensor helpers
// ════════════════════════════════════════════════════════════

// Returns tilt angle from vertical in degrees.
// 0° = upright, 90° = on its side, >90° = inverted.
float readTiltDegrees() {
    sensors_event_t accel, gyro, temp;
    imu.getEvent(&accel, &gyro, &temp);
    float ax = accel.acceleration.x;
    float ay = accel.acceleration.y;
    float az = accel.acceleration.z;
    float mag = sqrtf(ax * ax + ay * ay + az * az);
    if (mag < 0.1f) return 0.0f;
    return acosf(constrain(az / mag, -1.0f, 1.0f)) * 180.0f / PI;
}

float readBatteryV() {
    int raw = analogRead(BATTERY_PIN);
    return raw * (VREF / ADC_MAX) * BATTERY_DIVIDER;
}

// Poll LSM6DS3 TAP_SRC register and update tap state.
// With LIR=1, the latch is cleared when TAP_SRC is read.
// Single tap: sets tapPending, starts 600ms window.
// Double tap (detected before window expires): upgrades tapIsDouble.
void pollTapDetection() {
    uint8_t tapSrc = imuReadReg(LSM6DS3_TAP_SRC);
    if (!(tapSrc & 0x40)) return;   // TAP_IA not set

    lastActivityMs = millis();

    if (tapSrc & 0x10) {
        // DOUBLE_TAP detected — upgrade if window open, or start new
        tapIsDouble  = true;
        tapPending   = true;
        tapPendingMs = millis();
        Serial.println("Tap: DOUBLE detected");
    } else if (tapSrc & 0x20) {
        // SINGLE_TAP detected
        if (!tapPending) {
            tapIsDouble  = false;
            tapPending   = true;
            tapPendingMs = millis();
            Serial.println("Tap: SINGLE detected");
        }
        // If tapPending already set, we're inside the double-tap window — do nothing
    }
}

// Process tap 600ms after first detection (allows IMU double-tap window to complete).
void processTapIfReady() {
    if (!tapPending) return;
    if (millis() - tapPendingMs < 600) return;
    tapPending = false;

    if (tapIsDouble) {
        currentPlant = (currentPlant - 1 + NUM_PLANTS) % NUM_PLANTS;
        Serial.printf("← Previous plant: %d\n", currentPlant + 1);
    } else {
        currentPlant = (currentPlant + 1) % NUM_PLANTS;
        Serial.printf("→ Next plant: %d\n", currentPlant + 1);
    }
    saveCurrentPlant(currentPlant);
}


// ════════════════════════════════════════════════════════════
// MQTT
// ════════════════════════════════════════════════════════════

// Incoming: {"plant_index": 3}  (1-based, 1..NUM_PLANTS)
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    Serial.printf("MQTT rx [%s]\n", topic);
    lastActivityMs = millis();

    JsonDocument doc;
    if (deserializeJson(doc, payload, length)) return;

    if (strcmp(topic, TOPIC_SET_PLANT) == 0) {
        int idx = doc["plant_index"] | 0;
        if (idx >= 1 && idx <= NUM_PLANTS) {
            currentPlant = idx - 1;
            saveCurrentPlant(currentPlant);
            Serial.printf("Plant set to %d via MQTT\n", currentPlant + 1);
        }
    }
}

void connectMQTT() {
    if (WiFi.status() != WL_CONNECTED) return;
    Serial.print("Connecting to MQTT");
    for (int i = 0; i < 5 && !mqtt.connected(); i++) {
        if (mqtt.connect(DEVICE_ID, MQTT_USER, MQTT_PASSWORD)) {
            Serial.println(" connected!");
            mqtt.subscribe(TOPIC_SET_PLANT);
            Serial.printf("Subscribed to %s\n", TOPIC_SET_PLANT);
        } else {
            Serial.printf(" failed (rc=%d), retrying...\n", mqtt.state());
            delay(2000);
        }
    }
}

void publishEvent(float volumeMl, unsigned long durationMs, time_t ts) {
    JsonDocument doc;
    doc["device_id"]    = DEVICE_ID;
    doc["plant_index"]  = currentPlant + 1;
    doc["volume_ml"]    = round(volumeMl * 10) / 10.0f;
    doc["duration_s"]   = (int)(durationMs / 1000UL);
    if (ts > 0) doc["timestamp"] = (long)ts;

    PlantRecord rec = loadPlant(currentPlant);
    float avg = plantAvgVolume(rec);
    if (avg > 0.0f) doc["avg_volume_ml"] = round(avg * 10) / 10.0f;

    char payload[300];
    serializeJson(doc, payload);

    if (mqtt.connected()) {
        mqtt.publish(TOPIC_EVENT, payload);
        Serial.printf("MQTT event: %s\n", payload);
    } else {
        bufferEvent(payload);
    }
}

void publishStatus() {
    if (!mqtt.connected()) return;
    float battV    = readBatteryV();
    float pressure = mprls.readPressure();
    int   battPct  = constrain((int)((battV - 3.3f) / 0.9f * 100.0f), 0, 100);

    PlantRecord rec = loadPlant(currentPlant);
    int daysSince = 0;
    bool dry = false;
    if (rec.lastTs > 0 && ntpSynced) {
        daysSince = (int)((time(nullptr) - (time_t)rec.lastTs) / 86400L);
        dry = (daysSince >= NEEDS_WATER_DAYS);
    }

    JsonDocument doc;
    doc["device_id"]    = DEVICE_ID;
    doc["plant_index"]  = currentPlant + 1;
    doc["pressure_hpa"] = round(pressure * 10) / 10.0f;
    doc["battery_v"]    = round(battV * 100) / 100.0f;
    doc["battery_pct"]  = battPct;
    if (rec.lastTs > 0 && ntpSynced) {
        doc["days_since_water"] = daysSince;
        doc["needs_water"]      = dry;
    }

    char payload[250];
    serializeJson(doc, payload);
    mqtt.publish(TOPIC_STATUS, payload);
}


// ════════════════════════════════════════════════════════════
// Deep sleep
// ════════════════════════════════════════════════════════════

void enterDeepSleep() {
    Serial.printf("Entering deep sleep (tap GPIO%d to wake)\n", WAKE_PIN);
    updateDisplaySleep();
    if (oledPresent) display.ssd1306_command(SSD1306_DISPLAYOFF);
    mqtt.disconnect();
    WiFi.disconnect(true);
    delay(100);
    // Wake when INT1 (GPIO WAKE_PIN) goes HIGH (tap detected by IMU)
    esp_sleep_enable_ext1_wakeup(1ULL << WAKE_PIN, ESP_EXT1_WAKEUP_ANY_HIGH);
    esp_deep_sleep_start();
}


// ════════════════════════════════════════════════════════════
// Setup
// ════════════════════════════════════════════════════════════

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("=================================");
    Serial.println("  Watering Can v2");
    Serial.println("  ESP32-S3 Feather");
    Serial.println("=================================");

    esp_sleep_wakeup_cause_t wakeReason = esp_sleep_get_wakeup_cause();
    bool wokeFromTap = (wakeReason == ESP_SLEEP_WAKEUP_EXT1);
    if (wokeFromTap) Serial.println("Woke from deep sleep (tap)");

    pinMode(LED_BUILTIN, OUTPUT);
    digitalWrite(LED_BUILTIN, HIGH);

    Wire.begin();

    // ── IMU ──────────────────────────────────────────────────
    if (!imu.begin_I2C(I2C_IMU)) {
        Serial.println("ERROR: LSM6DS3 not found at 0x6A!");
        while (1) delay(100);
    }
    Serial.println("LSM6DS3 IMU found!");
    imu.setAccelRange(LSM6DS_ACCEL_RANGE_2_G);
    imu.setAccelDataRate(LSM6DS_RATE_104_HZ);
    setupTapDetection();

    // ── Pressure sensor ──────────────────────────────────────
    if (!mprls.begin()) {
        Serial.println("ERROR: MPRLS not found at 0x18!");
        while (1) delay(100);
    }
    Serial.println("MPRLS pressure sensor found!");
    pressureUpright = mprls.readPressure();
    Serial.printf("Baseline pressure: %.2f hPa\n", pressureUpright);

    // ── OLED (non-fatal — not installed yet) ─────────────────
    oledPresent = display.begin(SSD1306_SWITCHCAPVCC, I2C_OLED);
    if (oledPresent) {
        Serial.println("SSD1306 OLED (128×32) found!");
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(0,  8); display.print("Watering Can v2");
        display.setCursor(0, 20); display.print("Starting...");
        display.display();
    } else {
        Serial.println("OLED not found — display disabled (OK, not installed yet)");
    }

    // ── NVS: load saved plant selection ──────────────────────
    currentPlant = loadCurrentPlant();
    Serial.printf("Current plant: %d\n", currentPlant + 1);

    // If woke from tap, immediately handle plant navigation
    if (wokeFromTap) {
        delay(150);   // let TAP_SRC register settle post-wake
        uint8_t tapSrc = imuReadReg(LSM6DS3_TAP_SRC);
        if (tapSrc & 0x10) {   // DOUBLE_TAP
            currentPlant = (currentPlant - 1 + NUM_PLANTS) % NUM_PLANTS;
            Serial.printf("← (wake) Previous plant: %d\n", currentPlant + 1);
        } else {               // SINGLE_TAP or ambiguous → next
            currentPlant = (currentPlant + 1) % NUM_PLANTS;
            Serial.printf("→ (wake) Next plant: %d\n", currentPlant + 1);
        }
        saveCurrentPlant(currentPlant);
    }

    // ── WiFi ─────────────────────────────────────────────────
    Serial.print("Connecting to WiFi");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
        delay(500); Serial.print(".");
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\nWiFi connected: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("\nWiFi failed — operating offline");
    }

    // ── MQTT ─────────────────────────────────────────────────
    if (WiFi.status() == WL_CONNECTED) {
        wifiSecure.setInsecure();
        mqtt.setServer(MQTT_HOST, MQTT_PORT);
        mqtt.setCallback(onMqttMessage);
        connectMQTT();
        if (mqtt.connected()) flushBufferedEvents();
    }

    // ── NTP ──────────────────────────────────────────────────
    if (WiFi.status() == WL_CONNECTED) {
        configTime(NTP_OFFSET_S, 0, NTP_SERVER);
        Serial.print("NTP sync");
        for (int i = 0; i < 20; i++) {
            if (time(nullptr) > 1000000000L) { ntpSynced = true; break; }
            delay(500); Serial.print(".");
        }
        Serial.println(ntpSynced ? " OK" : " failed (no timestamps)");
    }

    // ── OTA ──────────────────────────────────────────────────
    if (WiFi.status() == WL_CONNECTED) {
        ArduinoOTA.setHostname(DEVICE_ID);
        ArduinoOTA.begin();
        Serial.printf("OTA ready — %s\n", WiFi.localIP().toString().c_str());
    }

    lastActivityMs = millis();
    lastStatusMs   = millis();

    digitalWrite(LED_BUILTIN, LOW);
    Serial.printf("Setup complete. ML_PER_HPA=%.1f  Plant=%d\n\n",
                  (float)ML_PER_HPA, currentPlant + 1);
}


// ════════════════════════════════════════════════════════════
// Main loop
// ════════════════════════════════════════════════════════════

void loop() {
    ArduinoOTA.handle();

    if (WiFi.status() == WL_CONNECTED) {
        if (!mqtt.connected()) connectMQTT();
        mqtt.loop();
    }

    float tilt     = readTiltDegrees();
    float pressure = mprls.readPressure();
    float battV    = readBatteryV();

    pollTapDetection();
    processTapIfReady();

    switch (state) {

        case IDLE: {
            // Update upright baseline whenever can is level
            if (tilt < STOP_ANGLE) {
                float prev = pressureUpright;
                pressureUpright = pressure;
                if (pressureUpright - prev > REFILL_THRESHOLD_HPA) {
                    Serial.printf("Refill detected: +%.2f hPa → new baseline %.2f hPa\n",
                                  pressureUpright - prev, pressureUpright);
                }
            }

            Serial.printf("IDLE  tilt=%.1f°  P=%.2f hPa  bat=%.2fV  plant=%d\n",
                          tilt, pressure, battV, currentPlant + 1);
            updateDisplayIdle(pressure, battV);

            if (tilt > POUR_ANGLE) {
                pressureStart  = pressureUpright;   // snapshot last stable reading
                pourStartMs    = millis();
                lastActivityMs = millis();
                state = POURING;
                Serial.printf("→ POURING  P_start=%.2f hPa  plant=%d\n",
                              pressureStart, currentPlant + 1);
            }
            break;
        }

        case POURING: {
            unsigned long elapsed = millis() - pourStartMs;
            lastActivityMs = millis();
            Serial.printf("POURING  tilt=%.1f°  P=%.2f hPa  elapsed=%lus\n",
                          tilt, pressure, elapsed / 1000UL);
            updateDisplayPouring(pressure, elapsed);

            if (tilt < STOP_ANGLE) {
                settleStartMs = millis();
                state = SETTLING;
                Serial.println("→ SETTLING");
            }
            break;
        }

        case SETTLING:
            Serial.printf("SETTLING  tilt=%.1f°  remaining=%ldms\n",
                          tilt, (long)(SETTLE_MS - (millis() - settleStartMs)));

            if (tilt > POUR_ANGLE) {
                state = POURING;
                lastActivityMs = millis();
                Serial.println("→ POURING resumed");
            } else if (millis() - settleStartMs >= SETTLE_MS) {
                state = REPORTING;
            }
            break;

        case REPORTING: {
            float pressureEnd  = mprls.readPressure();
            pressureUpright    = pressureEnd;       // update baseline for next pour
            float deltaP       = pressureStart - pressureEnd;
            float volumeMl     = deltaP * ML_PER_HPA;
            unsigned long durationMs = millis() - pourStartMs;
            time_t now = ntpSynced ? time(nullptr) : 0;

            Serial.printf("→ REPORT  P_start=%.2f  P_end=%.2f  ΔP=%.2f hPa\n",
                          pressureStart, pressureEnd, deltaP);
            Serial.printf("   volume=%.0f ml  duration=%lus  plant=%d\n",
                          volumeMl, durationMs / 1000UL, currentPlant + 1);

            if (volumeMl >= MIN_VOLUME_ML) {
                recordWatering(currentPlant, volumeMl, now);
                publishEvent(volumeMl, durationMs, now);
            } else {
                Serial.printf("   Volume %.0f ml < %.0f ml min — not recording\n",
                              volumeMl, (float)MIN_VOLUME_ML);
            }

            updateDisplayComplete(volumeMl, durationMs);
            delay(5000);   // show result for 5 s

            lastActivityMs = millis();
            state = IDLE;
            Serial.println("→ IDLE\n");
            break;
        }
    }

    // ── Status heartbeat ─────────────────────────────────────
    if (millis() - lastStatusMs >= STATUS_INTERVAL_MS) {
        lastStatusMs = millis();
        publishStatus();
    }

    // ── Deep sleep after inactivity (IDLE only) ───────────────
    if (state == IDLE && millis() - lastActivityMs >= INACTIVITY_MS) {
        enterDeepSleep();
    }

    delay(LOOP_DELAY_MS);
}
