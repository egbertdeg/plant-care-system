/**
 * Sensor Pod - ESP32-S3 Feather
 * Phase 4: Light + 3× Soil + SHT40 + OLED via PCA9546 multiplexer
 *
 * Wiring:
 *   ESP32-S3 STEMMA QT → PCA9546 Multiplexer (0x70)
 *     Channel 0 → TSL2591 Light (0x29) → Soil Sensor 1 (0x36)  [daisy-chained]
 *     Channel 1 → Soil Sensor 2 (0x36)
 *     Channel 2 → OLED Display (0x3C)
 *     Channel 3 → SHT40 Temp/Humidity (0x44) → Soil Sensor 3 (0x36)  [daisy-chained]
 */

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Adafruit_TSL2591.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_seesaw.h>
#include <Adafruit_SHT4x.h>
#include "secrets.h"
#include <ArduinoOTA.h>

#define LED_PIN        13
#define DISPLAY_WIDTH  128
#define DISPLAY_HEIGHT  32
#define DISPLAY_ADDR   0x3C

// PCA9546 — write bitmask to select channels (bit N = channel N)
#define MUX_ADDR          0x70
#define MUX_CH_TSL_SOIL1  0x01  // Ch0: TSL2591 (0x29) + Soil sensor 1 (0x36) daisy-chained
#define MUX_CH_SOIL_2     0x02  // Ch1: Soil sensor 2 (0x36)
#define MUX_CH_OLED       0x04  // Ch2: OLED (0x3C)
#define MUX_CH_SHT_SOIL3  0x08  // Ch3: SHT40 (0x44) + Soil sensor 3 (0x36) daisy-chained
#define MUX_NONE          0x00  // All channels off

// PAR approximation: Lux × 0.0185 µmol/m²/s
// Valid for sunlight and white LEDs. Varies significantly by source spectrum.
// Use a dedicated quantum sensor (e.g. Apogee SQ-520) for accuracy.
#define PAR_PER_LUX  0.0185f

WiFiClientSecure wifiSecure;
PubSubClient mqtt(wifiSecure);

Adafruit_TSL2591 tsl = Adafruit_TSL2591(2591);
Adafruit_SSD1306 display(DISPLAY_WIDTH, DISPLAY_HEIGHT, &Wire, -1);
Adafruit_seesaw soilSensor1;
Adafruit_seesaw soilSensor2;
Adafruit_seesaw soilSensor3;
Adafruit_SHT4x sht4;

// 2-minute averaging accumulators (60 samples × 2 s = 120 s)
static float    sumLux = 0, sumPar = 0, sumTemp = 0, sumRH = 0;
static uint32_t sumSoil1 = 0, sumSoil2 = 0, sumSoil3 = 0;
static int      sampleCount = 0;
const  int      PUBLISH_SAMPLES = 60;

void muxSelect(uint8_t channel) {
  Wire.beginTransmission(MUX_ADDR);
  Wire.write(channel);
  Wire.endTransmission();
}

void updateDisplay(float lux, float par,
                   uint16_t m1, uint16_t m2, uint16_t m3,
                   float airTempC, float rh) {
  // ── 128×32 layout (text size 1) ────────────────────────────────
  //  y= 0  "XXXX lx  PAR XX.X"
  //  y=11  "T:XX.XC  H:XX.X%"
  //  y=22  "1:XXX 2:XXX 3:XXX"
  // ────────────────────────────────────────────────────────────────
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  // Row 1 — light
  display.setCursor(0, 0);
  display.print((int)lux);
  display.print(" lx  PAR ");
  display.print(par, 1);

  // Row 2 — SHT40 air temp + humidity
  display.setCursor(0, 11);
  display.print("T:");
  display.print(airTempC, 1);
  display.print("C  H:");
  display.print(rh, 1);
  display.print("%");

  // Row 3 — all 3 soil moisture readings
  display.setCursor(0, 22);
  display.print("1:");
  display.print(m1);
  display.print(" 2:");
  display.print(m2);
  display.print(" 3:");
  display.print(m3);

  display.display();
}

void connectMQTT() {
  Serial.print("Connecting to MQTT");
  int attempts = 0;
  while (!mqtt.connected() && attempts < 5) {
    if (mqtt.connect("sensor_pod_001", MQTT_USER, MQTT_PASSWORD)) {
      Serial.println(" connected!");
    } else {
      Serial.print(" failed ("); Serial.print(mqtt.state()); Serial.println("), retrying...");
      delay(2000);
      attempts++;
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("=================================");
  Serial.println("  Plant Sensor Pod");
  Serial.println("  Full sensor suite");
  Serial.println("=================================");

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);

  Wire.begin();

  // Verify multiplexer
  Wire.beginTransmission(MUX_ADDR);
  if (Wire.endTransmission() != 0) {
    Serial.println("ERROR: PCA9546 not found at 0x70!");
    while (1) delay(100);
  }
  Serial.println("PCA9546 multiplexer found!");

  // Channel 0 — TSL2591 + soil sensor 1 (daisy-chained, different addresses)
  muxSelect(MUX_CH_TSL_SOIL1);

  if (!tsl.begin()) {
    Serial.println("ERROR: TSL2591 not found on Ch0!");
    while (1) delay(100);
  }
  Serial.println("TSL2591 light sensor found!");
  tsl.setGain(TSL2591_GAIN_MED);
  tsl.setTiming(TSL2591_INTEGRATIONTIME_300MS);

  if (!soilSensor1.begin(0x36)) {
    Serial.println("ERROR: Soil sensor 1 not found on Ch0!");
    while (1) delay(100);
  }
  Serial.println("Soil sensor 1 found!");

  // Channel 1 — soil sensor 2
  muxSelect(MUX_CH_SOIL_2);
  if (!soilSensor2.begin(0x36)) {
    Serial.println("ERROR: Soil sensor 2 not found on Ch1!");
    while (1) delay(100);
  }
  Serial.println("Soil sensor 2 found!");

  // Channel 2 — OLED display
  muxSelect(MUX_CH_OLED);
  if (!display.begin(SSD1306_SWITCHCAPVCC, DISPLAY_ADDR)) {
    Serial.println("ERROR: SSD1306 not found on Ch2!");
    while (1) delay(100);
  }
  Serial.println("SSD1306 OLED found!");

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("Plant Sensors");
  display.println("Starting...");
  display.display();

  // Channel 3 — SHT40 + soil sensor 3 (daisy-chained, different addresses)
  muxSelect(MUX_CH_SHT_SOIL3);
  if (!sht4.begin()) {
    Serial.println("ERROR: SHT40 not found on Ch3!");
    while (1) delay(100);
  }
  sht4.setPrecision(SHT4X_HIGH_PRECISION);
  Serial.println("SHT40 temp/humidity sensor found!");

  if (!soilSensor3.begin(0x36)) {
    Serial.println("ERROR: Soil sensor 3 not found on Ch3!");
    while (1) delay(100);
  }
  Serial.println("Soil sensor 3 found!");

  // WiFi connection
  muxSelect(MUX_CH_OLED);
  display.clearDisplay();
  display.setCursor(0, 0);
  display.print("WiFi connecting...");
  display.display();

  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  muxSelect(MUX_CH_OLED);
  display.clearDisplay();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected: " + WiFi.localIP().toString());
    display.setCursor(0, 0);  display.print("WiFi OK");
    display.setCursor(0, 11); display.print(WiFi.localIP().toString());
  } else {
    Serial.println("\nWiFi failed - running sensors only");
    display.setCursor(0, 0);  display.print("WiFi failed");
    display.setCursor(0, 11); display.print("Sensors only");
  }
  display.display();
  delay(2000);

  // MQTT connection (TLS, skip cert verification for prototype)
  if (WiFi.status() == WL_CONNECTED) {
    wifiSecure.setInsecure();
    mqtt.setServer(MQTT_HOST, MQTT_PORT);
    connectMQTT();

    muxSelect(MUX_CH_OLED);
    display.clearDisplay();
    display.setCursor(0, 0);
    if (mqtt.connected()) {
      display.print("MQTT OK");
    } else {
      display.print("MQTT failed");
      display.setCursor(0, 11);
      display.print("Sensors only");
    }
    display.display();
    delay(2000);
  }

  // OTA updates
  if (WiFi.status() == WL_CONNECTED) {
    ArduinoOTA.setHostname("sensor_pod_001");
    ArduinoOTA.begin();
    Serial.println("OTA ready at sensor_pod_001.local");
  }

  digitalWrite(LED_PIN, LOW);
  Serial.println("Setup complete.\n");
  delay(1000);
}

void loop() {
  ArduinoOTA.handle();

  // Keep MQTT alive and reconnect if dropped
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqtt.connected()) connectMQTT();
    mqtt.loop();
  }

  // Read light sensor + soil sensor 1 — Channel 0
  muxSelect(MUX_CH_TSL_SOIL1);
  uint32_t lum = tsl.getFullLuminosity();
  uint16_t ir   = lum >> 16;
  uint16_t full = lum & 0xFFFF;
  float lux = tsl.calculateLux(full, ir);
  if (lux < 0 || isnan(lux)) lux = 0;
  float par = lux * PAR_PER_LUX;
  uint16_t moisture1 = soilSensor1.touchRead(0);

  // Read soil sensor 2 — Channel 1
  muxSelect(MUX_CH_SOIL_2);
  uint16_t moisture2 = soilSensor2.touchRead(0);

  // Read SHT40 + soil sensor 3 — Channel 3
  muxSelect(MUX_CH_SHT_SOIL3);
  sensors_event_t humidity_evt, temp_evt;
  sht4.getEvent(&humidity_evt, &temp_evt);
  float airTempC = temp_evt.temperature;
  float rh       = humidity_evt.relative_humidity;
  uint16_t moisture3 = soilSensor3.touchRead(0);

  // Serial output
  Serial.print("Light: "); Serial.print(lux, 1);
  Serial.print(" lux  PAR: "); Serial.print(par, 2);
  Serial.print("  Air: "); Serial.print(airTempC, 1);
  Serial.print("C  RH: "); Serial.print(rh, 1);
  Serial.println("%");
  Serial.print("Soil 1: "); Serial.print(moisture1);
  Serial.print("  Soil 2: "); Serial.print(moisture2);
  Serial.print("  Soil 3: "); Serial.println(moisture3);

  // Update display — Channel 2
  muxSelect(MUX_CH_OLED);
  updateDisplay(lux, par, moisture1, moisture2, moisture3, airTempC, rh);

  muxSelect(MUX_NONE);  // release all channels when idle

  // Accumulate for 2-minute average
  sumLux   += lux;  sumPar  += par;
  sumTemp  += airTempC;  sumRH += rh;
  sumSoil1 += moisture1;  sumSoil2 += moisture2;  sumSoil3 += moisture3;
  sampleCount++;

  if (sampleCount >= PUBLISH_SAMPLES && mqtt.connected()) {
    JsonDocument doc;
    doc["light"]    = round((sumLux  / sampleCount) * 10)  / 10.0;
    doc["par"]      = round((sumPar  / sampleCount) * 100) / 100.0;
    doc["temp"]     = round((sumTemp / sampleCount) * 10)  / 10.0;
    doc["humidity"] = round((sumRH   / sampleCount) * 10)  / 10.0;
    doc["soil1"]    = (int)round((float)sumSoil1 / sampleCount);
    doc["soil2"]    = (int)round((float)sumSoil2 / sampleCount);
    doc["soil3"]    = (int)round((float)sumSoil3 / sampleCount);

    char payload[200];
    serializeJson(doc, payload);
    mqtt.publish("plant/sensor_pod_001/sensors", payload);
    Serial.print("MQTT published (2min avg): "); Serial.println(payload);

    sumLux = sumPar = sumTemp = sumRH = 0;
    sumSoil1 = sumSoil2 = sumSoil3 = 0;
    sampleCount = 0;
  }

  delay(2000);
}
