/**
 * Sensor Pod - ESP32-S3 Feather
 * Phase 3: Light + Soil + OLED via PCA9546 multiplexer
 *
 * Wiring:
 *   ESP32-S3 STEMMA QT → PCA9546 Multiplexer (0x70)
 *     Channel 0 → TSL2591 Light (0x29) → OLED Display (0x3C)  [daisy-chained]
 *     Channel 1 → Soil Sensor 1 (0x36)
 *     Channel 2 → (future: Soil Sensor 2)
 *     Channel 3 → (future: Soil Sensor 3 or SHT40)
 */

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_TSL2591.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_seesaw.h>

#define LED_PIN        13
#define DISPLAY_WIDTH  128
#define DISPLAY_HEIGHT  32
#define DISPLAY_ADDR   0x3C

// PCA9546 — write bitmask to select channels (bit N = channel N)
#define MUX_ADDR          0x70
#define MUX_CH_LIGHT_DISP 0x01  // Ch0: TSL2591 (0x29) + OLED (0x3C) daisy-chained
#define MUX_CH_SOIL_1     0x02  // Ch1: Soil sensor 1 (0x36)
#define MUX_NONE          0x00  // All channels off

// PAR approximation: Lux × 0.0185 µmol/m²/s
// Valid for sunlight and white LEDs. Varies significantly by source spectrum.
// Use a dedicated quantum sensor (e.g. Apogee SQ-520) for accuracy.
#define PAR_PER_LUX  0.0185f

Adafruit_TSL2591 tsl = Adafruit_TSL2591(2591);
Adafruit_SSD1306 display(DISPLAY_WIDTH, DISPLAY_HEIGHT, &Wire, -1);
Adafruit_seesaw soilSensor;

void muxSelect(uint8_t channel) {
  Wire.beginTransmission(MUX_ADDR);
  Wire.write(channel);
  Wire.endTransmission();
}

const char* lightLevel(float lux) {
  if (lux < 50)   return "Dark";
  if (lux < 200)  return "Low";
  if (lux < 1000) return "Medium";
  if (lux < 5000) return "High";
  return "Bright";
}

void updateDisplay(float lux, float par, uint16_t moisture, float tempC) {
  // ── 128×32 layout ─────────────────────────────────
  //  y= 0  "Light"(left)        "Soil"(right)
  //  y=10  lux sz2(left)        moisture sz1(right)
  //  y=24  PAR (left)           temp (right)
  // ──────────────────────────────────────────────────
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Row 1 — headers
  display.setTextSize(1);
  display.setCursor(0, 0);  display.print("Light");
  display.setCursor(70, 0); display.print("Soil");

  // Row 2 — lux (medium) and moisture (small)
  display.setTextSize(2);
  display.setCursor(0, 10);
  display.print((int)lux);

  display.setTextSize(1);
  display.setCursor(70, 10);
  display.print(moisture);

  // Row 3 — PAR and temperature
  display.setTextSize(1);
  display.setCursor(0, 24);
  display.print(par, 1); display.print("PAR");
  display.setCursor(70, 24);
  display.print(tempC, 1); display.print("C");

  display.display();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("=================================");
  Serial.println("  Plant Sensor Pod");
  Serial.println("  Light + Soil + Display");
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

  // Channel 0 — init TSL2591 and OLED (daisy-chained, different addresses)
  muxSelect(MUX_CH_LIGHT_DISP);

  if (!tsl.begin()) {
    Serial.println("ERROR: TSL2591 not found on Ch0!");
    while (1) delay(100);
  }
  Serial.println("TSL2591 light sensor found!");
  tsl.setGain(TSL2591_GAIN_MED);
  tsl.setTiming(TSL2591_INTEGRATIONTIME_300MS);

  if (!display.begin(SSD1306_SWITCHCAPVCC, DISPLAY_ADDR)) {
    Serial.println("ERROR: SSD1306 not found on Ch0!");
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

  // Channel 1 — init soil sensor
  muxSelect(MUX_CH_SOIL_1);

  if (!soilSensor.begin(0x36)) {
    Serial.println("ERROR: Soil sensor not found on Ch1!");
    while (1) delay(100);
  }
  Serial.println("Soil sensor found!");

  digitalWrite(LED_PIN, LOW);
  Serial.println("Setup complete.\n");
  delay(1000);
}

void loop() {
  // Read light sensor — Channel 0
  muxSelect(MUX_CH_LIGHT_DISP);
  uint32_t lum = tsl.getFullLuminosity();
  uint16_t ir   = lum >> 16;
  uint16_t full = lum & 0xFFFF;
  float lux = tsl.calculateLux(full, ir);
  if (lux < 0 || isnan(lux)) lux = 0;
  float par = lux * PAR_PER_LUX;

  // Read soil sensor — Channel 1
  muxSelect(MUX_CH_SOIL_1);
  uint16_t moisture = soilSensor.touchRead(0);
  float tempC = soilSensor.getTemp();

  // Serial output
  Serial.print("Light: "); Serial.print(lux, 1);
  Serial.print(" lux  PAR: "); Serial.print(par, 2);
  Serial.print("  Soil: "); Serial.print(moisture);
  Serial.print("  Temp: "); Serial.print(tempC, 1);
  Serial.println("C");

  // Update display — Channel 0
  muxSelect(MUX_CH_LIGHT_DISP);
  updateDisplay(lux, par, moisture, tempC);

  muxSelect(MUX_NONE);  // release all channels when idle

  delay(2000);
}
