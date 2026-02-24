# Firmware

Embedded code for ESP32-S3 devices.

## Projects

### [sensor_pod/](sensor_pod/)
Monitors 3 plants with soil moisture, temperature, humidity, and light sensors.

**Status:** 🔄 In development

### [watering_can/](watering_can/)
Detects watering events via tilt sensor, measures volume dispensed via pressure sensor.

**Status:** ⏳ Not started (sensor pod has priority)

## Development

**Requirements:**
- PlatformIO IDE (VS Code extension)
- ESP32-S3 Feather boards
- USB-C cable for programming

**Build & Upload:**
```bash
# Navigate to project
cd sensor_pod/

# Build
pio run

# Upload to board
pio run --target upload

# Monitor serial output
pio device monitor
```

**Or use VS Code PlatformIO buttons:**
- ✓ Build
- → Upload
- 🔌 Serial Monitor

## Common Issues

**"Serial port not found"**
- Check Device Manager for COM port
- Update `platformio.ini` with correct port
- Try different USB cable/port

**"Sensor not found on I2C bus"**
- Check wiring (SDA, SCL, power)
- Verify sensor I2C address
- Run I2C scanner sketch

**"WiFi connection failed"**
- Check credentials in `secrets.h`
- Verify WiFi network is 2.4GHz (ESP32 doesn't support 5GHz)
- Check signal strength

## Coding Standards

- Use Arduino framework
- Prefer Adafruit libraries when available
- Serial debug output at 115200 baud
- Comment hardware-specific code
- Test incrementally (one sensor at a time)
