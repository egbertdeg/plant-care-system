# Sensor Pod - ESP32-S3

## Current Phase: Complete — OTA enabled

---

## Upload Methods

### OTA (normal workflow — no USB needed)

```bash
pio run -e adafruit_feather_esp32s3_ota -t upload
```

- Target: `192.168.1.207` (device IP, set in `platformio.ini`)
- mDNS hostname `sensor_pod_001.local` resolves correctly but OTA via hostname is unreliable on Windows — use IP directly
- Windows Firewall can block the OTA callback port; using IP directly bypasses this

### USB (first-time flash or if OTA fails)

**Board:** Adafruit ESP32-S3 Feather (native USB — no UART chip, manual bootloader required)

1. **Enter bootloader mode:**
   - Hold **BOOT** → press+release **RESET** → release **BOOT**
   - Board enumerates as COM5

2. **Upload:**
   ```bash
   pio run -e adafruit_feather_esp32s3 -t upload
   ```

3. **Start firmware:**
   - Press **RESET** once → board switches to COM4 → firmware runs

### COM Port Reference

| Port | Mode |
|---|---|
| COM3 | Intel AMT (laptop built-in — ignore) |
| COM4 | ESP32 normal/run mode → serial monitor |
| COM5 | ESP32 bootloader mode → USB upload (only after BOOT+RESET) |

### platformio.ini Environments

```ini
[env:adafruit_feather_esp32s3]      ; USB upload
upload_port = COM5
upload_flags = --before=no_reset --after=hard_reset

[env:adafruit_feather_esp32s3_ota]  ; OTA upload
upload_protocol = espota
upload_port = 192.168.1.207
```

### Serial Monitor

```bash
~/.platformio/penv/Scripts/pio device monitor --port COM4 --baud 115200
```

---

## Hardware

- Board: Adafruit ESP32-S3 Feather
- PCA9546 I2C Multiplexer (0x70)
  - Ch0 (0x01): TSL2591 light sensor (0x29) → Soil sensor 1 (0x36) [daisy-chained]
  - Ch1 (0x02): Soil sensor 2 (0x36)
  - Ch2 (0x04): SSD1306 OLED 128×32 (0x3C)
  - Ch3 (0x08): SHT40 temp/humidity (0x44) → Soil sensor 3 (0x36) [daisy-chained]

---

## Behaviour

- Reads sensors every **2 seconds**, updates OLED each cycle
- Accumulates 60 samples, publishes **2-minute average** to MQTT
- MQTT topic: `plant/sensor_pod_001/sensors` (single JSON payload)
- OTA hostname: `sensor_pod_001.local` (ArduinoOTA)

**Actual MQTT topic** (not per-sensor topics as originally planned):
```
plant/sensor_pod_001/sensors  →  {"light":...,"par":...,"temp":...,"humidity":...,"soil1":...,"soil2":...,"soil3":...}
```

---

## Coding Style

- Arduino framework with PlatformIO
- Adafruit libraries preferred
- Extensive `Serial.println()` debug output (115200 baud)
- Test each sensor individually before integrating
- Error handling for all I2C operations

---

## Current Status

- [x] Blink test
- [x] One soil sensor reading
- [x] I2C multiplexer (PCA9546)
- [x] All sensors (TSL2591 + SHT40 + 3× soil + OLED)
- [x] WiFi connection
- [x] MQTT publishing (HiveMQ Cloud, TLS, JSON)
- [x] 2-minute averaging before publish
- [x] OTA updates (ArduinoOTA, IP-based on Windows)
