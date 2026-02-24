# Sensor Pod - ESP32-S3

## Current Phase: Prototype - Getting Started

## Hardware
- Board: Adafruit ESP32-S3 Feather
- Sensors (to be added incrementally):
  - 3× Soil moisture (I2C 0x36) via PCA9546 multiplexer
  - 1× SHT40 temp/humidity (I2C 0x44)
  - 1× TSL2591 light sensor (I2C 0x29)

## Development Approach
Start simple, add complexity incrementally:
1. Week 1: Blink test, then ONE soil sensor
2. Week 2: Add multiplexer + all 3 soil sensors
3. Week 3: Add temp/humidity and light sensors
4. Week 4: Add WiFi + MQTT connectivity

## MQTT Topics (Future)
- `plant/sensor_pod_001/moisture/plant_1`
- `plant/sensor_pod_001/moisture/plant_2`
- `plant/sensor_pod_001/moisture/plant_3`
- `plant/sensor_pod_001/temperature`
- `plant/sensor_pod_001/humidity`
- `plant/sensor_pod_001/light`

## Coding Style
- Arduino framework with PlatformIO
- Adafruit libraries preferred
- Extensive Serial.println() debug output (115200 baud)
- Test each sensor individually before integrating
- Error handling for all I2C operations

## Upload Process (Confirmed Working)

**Key fact:** Board uses native USB (no UART chip). Standard 1200bps auto-reset does NOT work.

**Every upload requires manual bootloader entry:**
1. Hold **BOOT** + press **RESET** → board switches to COM5 (bootloader mode)
2. Run upload (`pio run --target upload`)
3. Press **RESET** once after upload → firmware starts, board back on COM4

**COM ports on this machine:**
- COM3 = Intel AMT (laptop built-in — ignore)
- COM4 = ESP32 normal/run mode (serial monitor here)
- COM5 = ESP32 bootloader mode (only appears after BOOT+RESET)

**PlatformIO binary:** `C:\Users\egber\.platformio\penv\Scripts\pio.exe` (not in PATH)

**platformio.ini settings that make this work:**
```ini
upload_port = COM5        ; bootloader mode port
monitor_port = COM4       ; normal run mode port
upload_flags =
    --before=no_reset     ; skip auto-reset, board already in bootloader
    --after=hard_reset
```

## Current Status
- [x] Blink test working
- [ ] One soil sensor reading
- [ ] I2C multiplexer integrated
- [ ] All sensors reading
- [ ] WiFi connection
- [ ] MQTT publishing
