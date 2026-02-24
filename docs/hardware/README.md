# Hardware Documentation

All hardware-related documentation, specifications, and assembly guides.

## Available Documentation

- **[Bill of Materials](bill-of-materials.md)** - Complete parts list with suppliers, prices, and specs

## Planned Documentation

### Wiring Diagrams
- [ ] Sensor pod wiring diagram
- [ ] Watering can wiring diagram
- [ ] I2C address map diagram

### Assembly Guides
- [ ] Sensor pod assembly instructions
- [ ] Watering can assembly instructions
- [ ] Cable management best practices

### Calibration
- [ ] Soil sensor calibration procedure
- [ ] Pressure sensor calibration (volume measurement)
- [ ] IMU tilt angle calibration

### Datasheets
Collection of sensor datasheets for reference (not in git, too large)

## Quick Reference

### I2C Addresses

**Sensor Pod:**
- `0x70` - PCA9546 Multiplexer
- `0x36` - Soil sensors (3×, via multiplexer)
- `0x44` - SHT40 Temperature/Humidity
- `0x29` - TSL2591 Light sensor

**Watering Can:**
- `0x6A` - LSM6DS3 IMU
- `0x18` - MPRLS Pressure sensor
- `0x3C` - OLED Display

### Power Requirements

**Sensor Pod:** 5V/500mA (USB powered, always on)
**Watering Can:** 3.7V LiPo, ~1-2 weeks battery life
