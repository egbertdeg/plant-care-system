# Watering Can — ESP32-S3 Feather

## Current Phase: Firmware Live (IMU only — pressure sensor not yet installed)

---

## ESP32-S3 Upload Process (CRITICAL - READ FIRST)

**Board:** Adafruit ESP32-S3 Feather (native USB — no UART chip)

**Key Issue:** Native USB means standard auto-reset does NOT work. Must manually enter bootloader mode for every USB upload.

### USB Upload Workflow (Every Time)

1. **Enter bootloader mode:**
   - Hold **BOOT** button
   - Press and release **RESET** button
   - Release **BOOT** button
   - Board switches to COM7 (bootloader mode)

2. **Run upload:**
   ```
   C:\Users\egber\.platformio\penv\Scripts\pio.exe run -e adafruit_feather_esp32s3 --target upload
   ```

3. **Start firmware:**
   - Press **RESET** once
   - Board switches back to COM6 (normal mode)
   - Serial monitor on COM6

### OTA Upload (After First USB Flash)

Once device IP is known, update `platformio.ini` `[env:adafruit_feather_esp32s3_ota]` with the IP:
```
upload_port = 192.168.1.XXX   ; fill in after first USB flash
```
Then upload via:
```
C:\Users\egber\.platformio\penv\Scripts\pio.exe run -e adafruit_feather_esp32s3_ota --target upload
```
- OTA hostname: `watering_can_001` (mDNS: `watering_can_001.local` — unreliable on Windows, use IP)
- After OTA, no RESET needed; device reboots automatically

### COM Port Reference

- **COM3** = Intel AMT (laptop built-in — ignore)
- **COM6** = ESP32 normal/run mode → serial monitor here
- **COM7** = ESP32 bootloader mode → upload here (only appears after BOOT+RESET)

### Quick Reference

```
Upload:  BOOT+RESET → pio upload → RESET
Monitor: C:\Users\egber\.platformio\penv\Scripts\pio.exe device monitor --port COM6
PIO bin: C:\Users\egber\.platformio\penv\Scripts\pio.exe  (not in PATH)
```

---

## Hardware

- **Board:** Adafruit ESP32-S3 Feather
- **IMU:** LSM6DS3 at 0x6A — installed, tilt + tap detection live
- **Pressure sensor:** MPRLS at 0x18 — not installed yet (init is non-fatal)
- **OLED:** SSD1306 128x32 at 0x3C — not installed (init is non-fatal)
- **Battery:** 400mAh LiPo; VBAT sense on A13 (GPIO35 via 2:1 divider)
- **Deep sleep wake:** IMU INT1 → GPIO9 (wire not connected until pressure sensor installed)

I2C chain: ESP32-S3 → LSM6DS3 → (MPRLS when installed) → (OLED when installed)

---

## Feature Status

| Feature | Status | Notes |
|---|---|---|
| IMU tilt detection | Live | IDLE → POURING → SETTLING → REPORTING |
| LSM6DS3 tap detection | Live | Single tap = next plant, double = previous |
| MQTT event publish | Live | `plant/watering_can_001/event` |
| MQTT status heartbeat | Live | Every 30s on `plant/watering_can_001/status` |
| MQTT plant select | Live | `plant/watering_can_001/set_plant` |
| 20-plant NVS storage | Live | Rolling avg of last 3 waterings per plant |
| Offline event buffer | Live | Up to 20 events in NVS while WiFi down |
| NTP timestamps | Live | UTC; adjust NTP_OFFSET_S in config.h |
| Battery monitoring | Live | A13 ADC; included in status MQTT payload |
| ArduinoOTA | Live | hostname: watering_can_001 |
| Pressure-based volume | Pending | Needs MPRLS installed; non-fatal without |
| OLED display | Pending | All display code present, guarded by oledPresent |
| Deep sleep | Pending | Needs INT1→GPIO9 wire; code present |

---

## MQTT Topics

| Topic | Direction | Payload |
|---|---|---|
| `plant/watering_can_001/set_plant` | App to Device | `{"plant_index": 3}` (1-based, 1-20) |
| `plant/watering_can_001/event` | Device to App | `{"device_id":..., "plant_index":..., "volume_ml":..., "duration_s":..., "timestamp":..., "avg_volume_ml":...}` |
| `plant/watering_can_001/status` | Device to App | `{"device_id":..., "plant_index":..., "pressure_hpa":..., "battery_v":..., "battery_pct":..., "days_since_water":..., "needs_water":...}` |

---

## Volume Calibration (When Pressure Sensor Installed)

Physics: `volume_ml = delta_P_hPa x ML_PER_HPA`
Where `ML_PER_HPA = 1.02 x CAN_AREA_CM2`.

**Empirical calibration (most accurate):**
1. Can upright, full — record P_full
2. Pour exactly 500 ml — record P_after
3. Set `ML_PER_HPA = 500.0 / (P_full - P_after)` in config.h

Default: `CAN_AREA_CM2 = 154.0` (14cm diameter can). Measure your can.

---

## Coding Style

- Arduino framework with PlatformIO
- Non-fatal sensor init: IMU is fatal (required); MPRLS and OLED are non-fatal
- All display calls guarded by `oledPresent` flag
- All pressure calls guarded by `mprlsPresent` flag
- Serial debug at 115200 baud
- NVS via Preferences library (persists across deep sleep and reboots)
