/**
 * Watering Can — ESP32-S3 Feather
 *
 * Hardware (daisy-chained on STEMMA QT / I2C):
 *   ESP32-S3 → LSM6DS3 IMU (0x6A) → MPRLS pressure sensor (0x18)
 *   OLED SSD1306 128×64 (0x3C) — not installed yet, init is non-fatal
 *
 * Workflow:
 *   1. App publishes plant_id to TOPIC_SET_PLANT before watering.
 *   2. Tilt > POUR_ANGLE  → watering event starts, record P_start.
 *   3. Tilt < STOP_ANGLE  → watering event ends, wait SETTLE_MS.
 *   4. Record P_end, compute volume = ΔP × ML_PER_HPA.
 *   5. Publish event JSON to TOPIC_EVENT.
 *
 * Volume formula:
 *   ΔP is measured between two upright readings so tilt geometry
 *   during the pour does not affect the result.
 *   See config.h for calibration instructions.
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
#include "secrets.h"
#include "config.h"

// ─── Hardware objects ────────────────────────────────────────
Adafruit_LSM6DS3TRC imu;
Adafruit_MPRLS      mprls(-1, -1);   // no reset pin, no EOC pin
Adafruit_SSD1306    display(DISPLAY_WIDTH, DISPLAY_HEIGHT, &Wire, -1);

// ─── Connectivity ────────────────────────────────────────────
WiFiClientSecure wifiSecure;
PubSubClient     mqtt(wifiSecure);

// ─── State machine ───────────────────────────────────────────
enum State { IDLE, POURING, SETTLING, REPORTING };
State state = IDLE;

// ─── Runtime state ───────────────────────────────────────────
char    plantId[64]   = "unset";
float   pressureStart = 0.0f;
unsigned long pourStartMs  = 0;
unsigned long settleStartMs = 0;
bool    oledPresent   = false;


// ════════════════════════════════════════════════════════════
// Display helpers
// ════════════════════════════════════════════════════════════

void displayClear() {
    if (!oledPresent) return;
    display.clearDisplay();
}

void displayShow() {
    if (!oledPresent) return;
    display.display();
}

void updateDisplayIdle(float pressureHpa) {
    if (!oledPresent) return;
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);

    display.setCursor(0, 0);  display.print("Watering Can");
    display.setCursor(0, 16); display.print("Plant: "); display.print(plantId);
    display.setCursor(0, 32); display.print("P: "); display.print(pressureHpa, 1); display.print(" hPa");
    display.setCursor(0, 48); display.print(mqtt.connected() ? "MQTT: OK" : "MQTT: --");
    display.display();
}

void updateDisplayPouring(unsigned long elapsedMs) {
    if (!oledPresent) return;
    display.clearDisplay();
    display.setTextSize(2);
    display.setCursor(0, 0);  display.print("POURING");
    display.setTextSize(1);
    display.setCursor(0, 20); display.print(plantId);
    display.setCursor(0, 36); display.print(elapsedMs / 1000); display.print("s");
    display.display();
}

void updateDisplayComplete(float volumeMl, unsigned long durationMs) {
    if (!oledPresent) return;
    display.clearDisplay();
    display.setTextSize(2);
    display.setCursor(0, 0);  display.print("Done!");
    display.setTextSize(1);
    display.setCursor(0, 20); display.print(plantId);
    display.setCursor(0, 36); display.print((int)volumeMl); display.print(" ml");
    display.setCursor(0, 52); display.print(durationMs / 1000); display.print("s");
    display.display();
}


// ════════════════════════════════════════════════════════════
// Sensor helpers
// ════════════════════════════════════════════════════════════

// Returns tilt angle from vertical in degrees.
// 0° = upright, 90° = horizontal, >90° = inverted.
float readTiltDegrees() {
    sensors_event_t accel, gyro, temp;
    imu.getEvent(&accel, &gyro, &temp);

    float ax = accel.acceleration.x;
    float ay = accel.acceleration.y;
    float az = accel.acceleration.z;
    float magnitude = sqrt(ax * ax + ay * ay + az * az);

    if (magnitude < 0.1f) return 0.0f;  // guard against divide-by-zero
    float cosAngle = constrain(az / magnitude, -1.0f, 1.0f);
    return acos(cosAngle) * 180.0f / PI;
}


// ════════════════════════════════════════════════════════════
// MQTT
// ════════════════════════════════════════════════════════════

// Incoming message: app sets plant_id before watering.
// Expected payload: {"plant_id":"sensor_pod_001"}
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    Serial.print("MQTT rx ["); Serial.print(topic); Serial.println("]");

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, payload, length);
    if (err) {
        Serial.print("JSON parse failed: "); Serial.println(err.c_str());
        return;
    }

    if (strcmp(topic, TOPIC_SET_PLANT) == 0) {
        const char* id = doc["plant_id"];
        if (id) {
            strncpy(plantId, id, sizeof(plantId) - 1);
            plantId[sizeof(plantId) - 1] = '\0';
            Serial.print("Plant ID set: "); Serial.println(plantId);
        }
    }
}

void connectMQTT() {
    Serial.print("Connecting to MQTT");
    int attempts = 0;
    while (!mqtt.connected() && attempts < 5) {
        if (mqtt.connect(DEVICE_ID, MQTT_USER, MQTT_PASSWORD)) {
            Serial.println(" connected!");
            mqtt.subscribe(TOPIC_SET_PLANT);
            Serial.print("Subscribed to "); Serial.println(TOPIC_SET_PLANT);
        } else {
            Serial.print(" failed (rc="); Serial.print(mqtt.state()); Serial.println("), retrying...");
            delay(2000);
            attempts++;
        }
    }
}

void publishEvent(float volumeMl, unsigned long durationMs) {
    JsonDocument doc;
    doc["device_id"]  = DEVICE_ID;
    doc["plant_id"]   = plantId;
    doc["volume_ml"]  = round(volumeMl * 10) / 10.0;
    doc["duration_s"] = durationMs / 1000;

    char payload[200];
    serializeJson(doc, payload);
    mqtt.publish(TOPIC_EVENT, payload);
    Serial.print("MQTT published: "); Serial.println(payload);
}


// ════════════════════════════════════════════════════════════
// Setup
// ════════════════════════════════════════════════════════════

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("=================================");
    Serial.println("  Watering Can");
    Serial.println("  ESP32-S3 Feather");
    Serial.println("=================================");

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

    // ── Pressure sensor ──────────────────────────────────────
    if (!mprls.begin()) {
        Serial.println("ERROR: MPRLS not found at 0x18!");
        while (1) delay(100);
    }
    Serial.println("MPRLS pressure sensor found!");

    // ── OLED (non-fatal — not installed yet) ─────────────────
    oledPresent = display.begin(SSD1306_SWITCHCAPVCC, I2C_OLED);
    if (oledPresent) {
        Serial.println("SSD1306 OLED found!");
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(0, 0); display.print("Watering Can");
        display.setCursor(0, 16); display.print("Starting...");
        display.display();
    } else {
        Serial.println("OLED not found — display disabled (OK, not installed yet)");
    }

    // ── WiFi ─────────────────────────────────────────────────
    Serial.print("Connecting to WiFi");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 40) {
        delay(500); Serial.print("."); attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi connected: " + WiFi.localIP().toString());
    } else {
        Serial.println("\nWiFi failed — sensors only");
    }

    // ── MQTT ─────────────────────────────────────────────────
    if (WiFi.status() == WL_CONNECTED) {
        wifiSecure.setInsecure();
        mqtt.setServer(MQTT_HOST, MQTT_PORT);
        mqtt.setCallback(onMqttMessage);
        connectMQTT();
    }

    // ── OTA ──────────────────────────────────────────────────
    if (WiFi.status() == WL_CONNECTED) {
        ArduinoOTA.setHostname(DEVICE_ID);
        ArduinoOTA.begin();
        Serial.print("OTA ready — hostname: "); Serial.println(DEVICE_ID);
        Serial.print("OTA IP: "); Serial.println(WiFi.localIP());
    }

    digitalWrite(LED_BUILTIN, LOW);
    Serial.println("Setup complete.\n");
    Serial.print("ML_PER_HPA = "); Serial.println(ML_PER_HPA, 1);
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

    float tilt = readTiltDegrees();
    float pressure = mprls.readPressure();

    switch (state) {

        case IDLE:
            Serial.printf("IDLE  tilt=%.1f°  P=%.2f hPa  plant=%s\n",
                          tilt, pressure, plantId);
            updateDisplayIdle(pressure);

            if (tilt > POUR_ANGLE) {
                pressureStart = pressure;
                pourStartMs   = millis();
                state = POURING;
                Serial.printf("→ POURING started  P_start=%.2f hPa  plant=%s\n",
                              pressureStart, plantId);
            }
            break;

        case POURING: {
            unsigned long elapsed = millis() - pourStartMs;
            Serial.printf("POURING  tilt=%.1f°  elapsed=%lus\n",
                          tilt, elapsed / 1000);
            updateDisplayPouring(elapsed);

            if (tilt < STOP_ANGLE) {
                settleStartMs = millis();
                state = SETTLING;
                Serial.println("→ SETTLING (waiting for water to settle)");
            }
            break;
        }

        case SETTLING:
            Serial.printf("SETTLING  tilt=%.1f°  remaining=%lums\n",
                          tilt, SETTLE_MS - (millis() - settleStartMs));

            if (tilt > POUR_ANGLE) {
                // resumed pouring
                state = POURING;
                Serial.println("→ POURING resumed");
            } else if (millis() - settleStartMs >= SETTLE_MS) {
                state = REPORTING;
            }
            break;

        case REPORTING: {
            float pressureEnd = mprls.readPressure();
            float deltaP      = pressureStart - pressureEnd;
            float volumeMl    = deltaP * ML_PER_HPA;
            unsigned long durationMs = millis() - pourStartMs;

            Serial.printf("→ REPORTING  P_start=%.2f  P_end=%.2f  ΔP=%.2f hPa\n",
                          pressureStart, pressureEnd, deltaP);
            Serial.printf("   volume=%.0f ml  duration=%lus  plant=%s\n",
                          volumeMl, durationMs / 1000, plantId);

            if (volumeMl >= MIN_VOLUME_ML && mqtt.connected()) {
                publishEvent(volumeMl, durationMs);
            } else if (volumeMl < MIN_VOLUME_ML) {
                Serial.printf("   Volume %.0f ml below minimum (%.0f ml) — not publishing\n",
                              volumeMl, (float)MIN_VOLUME_ML);
            } else {
                Serial.println("   MQTT not connected — event not published");
            }

            updateDisplayComplete(volumeMl, durationMs);
            delay(5000);   // show result on display for 5 seconds

            state = IDLE;
            Serial.println("→ IDLE");
            break;
        }
    }

    delay(LOOP_DELAY_MS);
}
