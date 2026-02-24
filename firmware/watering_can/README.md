# Watering Can Firmware

Detects watering events and measures volume dispensed.

## Hardware

- **Board:** Adafruit ESP32-S3 Feather
- **Sensors:**
  - LSM6DS3 IMU (tilt detection)
  - MPRLS Pressure Sensor (water volume measurement)
  - 128×64 OLED Display (user feedback)
- **Power:** 400mAh LiPo battery (rechargeable via USB-C)

## Status

⏳ **Not yet started** - Sensor pod has priority.

This firmware will be developed after the sensor pod is stable and collecting data (approximately Week 7-8).

## Planned Features

- Tilt detection (IMU accelerometer)
- Water volume measurement (pressure sensor + tube)
- Real-time display (OLED)
- Event logging to MQTT
- Battery monitoring
- Low-power sleep mode

## Algorithm

1. Monitor tilt angle continuously
2. When tilt > 45°:
   - Start watering event
   - Record start volume
   - Update display with "Pouring..."
3. While pouring:
   - Track volume dispensed in real-time
   - Display: "250ml dispensed"
4. When tilt < 30°:
   - End watering event
   - Calculate total volume
   - Log to MQTT: `plant/watering_can_001/event`
   - Display: "Watered 250ml" (5 sec)
   - Return to idle

## Development Plan

See [CLAUDE.md](CLAUDE.md) for detailed development approach.

Will be implemented after sensor pod firmware is complete.
