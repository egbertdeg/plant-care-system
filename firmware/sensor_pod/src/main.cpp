/**
 * Sensor Pod - ESP32-S3 Feather
 * Phase 1: Blink test + serial output
 *
 * Next steps (see CLAUDE.md for full roadmap):
 *   Week 1 - Add one soil sensor reading
 *   Week 2 - Add I2C multiplexer + all 3 soil sensors
 *   Week 3 - Add temp/humidity and light sensors
 *   Week 4 - Add WiFi + MQTT publishing
 */

#include <Arduino.h>

// Adafruit ESP32-S3 Feather built-in LED
#define LED_PIN 13

void setup() {
  Serial.begin(115200);
  delay(1000);  // Give serial monitor time to connect

  Serial.println("=================================");
  Serial.println("  Plant Sensor Pod - v0.1");
  Serial.println("  Adafruit ESP32-S3 Feather");
  Serial.println("=================================");
  Serial.println("Phase: Blink test");
  Serial.println();

  pinMode(LED_PIN, OUTPUT);

  Serial.println("Setup complete. Starting main loop...");
}

void loop() {
  Serial.println("LED on");
  digitalWrite(LED_PIN, HIGH);
  delay(1000);

  Serial.println("LED off");
  digitalWrite(LED_PIN, LOW);
  delay(1000);

  // TODO Week 1: Read one soil sensor via I2C
  // TODO Week 2: Enable PCA9546 multiplexer, read all 3 soil sensors
  // TODO Week 3: Read SHT40 temp/humidity and TSL2591 light sensor
  // TODO Week 4: Connect to WiFi, publish readings via MQTT
}
