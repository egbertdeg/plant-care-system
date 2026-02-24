/**
 * Watering Can - ESP32-S3 Feather
 * Phase 1: Stub / blink test
 *
 * Status: Not yet in active development.
 * Priority: After sensor pod is stable (Week 7-8).
 *
 * Planned sensors:
 *   - LSM6DS3 IMU       (tilt detection)
 *   - MPRLS             (water volume via pressure)
 *   - 128×64 OLED       (status display)
 *   - 400mAh LiPo       (battery)
 */

#include <Arduino.h>

// Adafruit ESP32-S3 Feather built-in LED
#define LED_PIN 13

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("====================================");
  Serial.println("  Watering Can - v0.1 (Stub)");
  Serial.println("  Adafruit ESP32-S3 Feather");
  Serial.println("====================================");
  Serial.println("Development starts after sensor pod is stable.");
  Serial.println("See CLAUDE.md for roadmap.");
  Serial.println();

  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  // Slow blink indicates "not yet active"
  digitalWrite(LED_PIN, HIGH);
  delay(2000);
  digitalWrite(LED_PIN, LOW);
  delay(2000);

  // TODO Week 7: Read LSM6DS3 IMU tilt angle
  // TODO Week 7: Detect watering start/stop events
  // TODO Week 8: Read MPRLS pressure → calculate volume dispensed
  // TODO Week 8: Update OLED display with status
  // TODO Week 8: Publish watering events via MQTT
}
