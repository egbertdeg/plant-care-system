# Sensor Pod - ESP32-S3

## Current Phase: Prototype - COMPLETE

---

## ESP32-S3 Upload Process (CRITICAL - READ FIRST)

**Board:** Adafruit ESP32-S3 Feather (native USB - no UART chip)

**Key Issue:** Native USB means standard auto-reset does NOT work. Must manually enter bootloader mode every upload.

### Upload Workflow (Every Time)

1. **Enter bootloader mode:**
   - Hold **BOOT** button
   - Press and release **RESET** button
   - Release **BOOT** button
   - Board switches to COM5 (bootloader mode)

2. **Run upload:**
   - PlatformIO uploads to COM5
   - Uses `--before=no_reset` flag (board already in bootloader)

3. **Start firmware:**
   - Press **RESET** once
   - Board switches back to COM4 (normal mode)
   - Firmware runs, serial monitor on COM4

### platformio.ini Settings

```ini
upload_port = COM5        ; bootloader mode port
monitor_port = COM4       ; normal run mode port
upload_flags =
    --before=no_reset     ; skip auto-reset, board already in bootloader
    --after=hard_reset
```

### COM Port Reference

- **COM3** = Intel AMT (laptop built-in — ignore)
- **COM4** = ESP32 normal/run mode → serial monitor here
- **COM5** = ESP32 bootloader mode → upload here (only appears after BOOT+RESET)

### Quick Reference

```
Upload:  BOOT+RESET → pio upload → RESET
Monitor: pio device monitor --port COM4
PIO bin: C:\Users\egber\.platformio\penv\Scripts\pio.exe  (not in PATH)
```

---

## Hardware
- Board: Adafruit ESP32-S3 Feather
- PCA9546 I2C Multiplexer (0x70)
  - Ch0 (0x01): TSL2591 light sensor (0x29) → Soil sensor 1 (0x36)  [daisy-chained]
  - Ch1 (0x02): Soil sensor 2 (0x36)
  - Ch2 (0x04): SSD1306 OLED display 128×32 (0x3C)
  - Ch3 (0x08): SHT40 temp/humidity (0x44) → Soil sensor 3 (0x36)  [daisy-chained]

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

## Current Status
- [x] Blink test working
- [x] One soil sensor reading
- [x] I2C multiplexer integrated (PCA9546)
- [x] All sensors reading (TSL2591 + SHT40 + 3× soil + OLED display)
- [x] WiFi connection
- [x] MQTT publishing (HiveMQ Cloud, TLS, JSON to plant/sensor_pod_001/sensors)
