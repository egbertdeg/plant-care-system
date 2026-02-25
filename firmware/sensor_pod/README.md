# Sensor Pod Firmware

Monitors 3 plants with multiple environmental sensors. Publishes 2-minute averaged readings to HiveMQ Cloud via MQTT.

## Status

✅ **Complete and running** — OTA updates enabled (no USB required after initial flash)

## Hardware

- **Board:** Adafruit ESP32-S3 Feather
- **Sensors:**
  - 3× Adafruit STEMMA Soil Sensors (I2C 0x36)
  - 1× SHT40 Temperature & Humidity (I2C 0x44)
  - 1× TSL2591 Light Sensor (I2C 0x29)
  - 1× PCA9546 I2C Multiplexer (0x70)
  - 1× SSD1306 OLED Display 128×32 (0x3C)

## Wiring

```
ESP32-S3 STEMMA QT → PCA9546 Multiplexer (0x70)
    Ch0 (0x01): TSL2591 (0x29) → Soil sensor 1 (0x36)  [daisy-chained]
    Ch1 (0x02): Soil sensor 2 (0x36)
    Ch2 (0x04): SSD1306 OLED (0x3C)
    Ch3 (0x08): SHT40 (0x44) → Soil sensor 3 (0x36)   [daisy-chained]
```

## Setup

1. **Configure credentials:**
   ```bash
   cp include/secrets.h.example include/secrets.h
   # Edit secrets.h with WiFi SSID/password and MQTT credentials
   ```

2. **First-time USB flash** (required once to enable OTA):
   - Enter bootloader: hold BOOT, press RESET, release BOOT
   - Select `adafruit_feather_esp32s3` env in PlatformIO → Upload
   - Press RESET after upload completes
   - See [CLAUDE.md](CLAUDE.md) for COM port details

3. **All future updates via OTA** (wireless, no USB):
   ```bash
   pio run -e adafruit_feather_esp32s3_ota -t upload
   ```
   OTA target IP: `192.168.1.207` (update in `platformio.ini` if the device gets a new IP)

## Behaviour

- Reads all sensors every **2 seconds** (displayed on OLED)
- Publishes **2-minute average** to MQTT every 120 seconds (60 samples)
- MQTT topic: `plant/sensor_pod_001/sensors`
- Payload: JSON with light, par, temp, humidity, soil1, soil2, soil3

**Example MQTT payload:**
```json
{
  "light": 113.6,
  "par": 2.10,
  "temp": 20.8,
  "humidity": 46.3,
  "soil1": 1015,
  "soil2": 926,
  "soil3": 769
}
```

## OLED Display Layout (128×32)

```
114 lx  PAR 2.1
T:20.8C  H:46.3%
1:1015 2:926 3:769
```

## Serial Output

```
Light: 113.6 lux  PAR: 2.10  Air: 20.8C  RH: 46.3%
Soil 1: 1015  Soil 2: 926  Soil 3: 769
...  (every 2s)
MQTT published (2min avg): {"light":113.6,"par":2.10,...}
```

Monitor: `pio device monitor --port COM4 --baud 115200`

## Libraries

- `Adafruit_seesaw` — Soil sensors
- `Adafruit_SHT4x` — Temperature/humidity
- `Adafruit_TSL2591` — Light sensor
- `Adafruit_SSD1306` — OLED display
- `PubSubClient` — MQTT client
- `ArduinoJson` — JSON formatting
- `ArduinoOTA` — Wireless firmware updates

## Troubleshooting

**OTA upload fails ("No response from device"):**
- mDNS (`sensor_pod_001.local`) is unreliable on Windows — use the device IP directly via `--upload-port 192.168.1.207`
- Windows Firewall may block the OTA callback port; using IP directly is more reliable than hostname
- Confirm device is on WiFi and running before attempting OTA

**MQTT rc=5 (not authorized):**
- Password contains special characters (`#`) that get truncated by some env var parsers
- In Railway, use the Raw Editor to set the password — do not wrap in quotes

**No sensor readings:**
- Check I2C wiring and multiplexer connections
- Verify PCA9546 found at 0x70 in serial output

**WiFi won't connect:**
- ESP32-S3 is 2.4GHz only — verify you're not on a 5GHz network
- Check SSID/password in `secrets.h`
