# Watering Can - ESP32-S3

## Current Phase: Prototype - Not Yet Started

## Hardware
- Board: Adafruit ESP32-S3 Feather
- Sensors (to be added incrementally):
  - LSM6DS3 IMU (tilt detection)
  - MPRLS pressure sensor (water volume via tube)
  - 128×64 OLED display
- Power: 400mAh LiPo battery

## Development Approach
1. Week 1-6: Focus on sensor pod first
2. Week 7: Start watering can
   - IMU tilt detection + serial output
   - Pressure sensor calibration
3. Week 8: Display + cloud connectivity
   - Display volume on OLED
   - WiFi + MQTT event logging

## Algorithm (Future)
1. Monitor tilt angle from IMU
2. If tilt > 45° → start watering event
3. Track water volume from pressure sensor
4. If tilt < 30° → end event, log volume
5. Publish event to MQTT

## Display States (Future)
- Ready:    "2.0L | 87%"
- Pouring:  "250ml dispensed"
- Complete: "Watered 250ml"

## Coding Style
- Arduino framework with PlatformIO
- Real-time display updates
- Battery monitoring
- Serial debug output (115200 baud)
- Test each component separately first

## Current Status
- [ ] Not started yet (sensor pod has priority)
- [ ] IMU tilt detection
- [ ] Pressure sensor reading
- [ ] OLED display working
- [ ] WiFi + MQTT logging
