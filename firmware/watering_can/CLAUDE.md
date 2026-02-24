# Watering Can - ESP32-S3

## Current Phase: Prototype - Not Yet Started

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
