# Watering Can Firmware

Detects watering events, measures volume dispensed, and publishes data via MQTT.

## Hardware

- **Board:** Adafruit ESP32-S3 Feather
- **Sensors:**
  - LSM6DS3 IMU — tilt detection + tap wake
  - MPRLS Pressure Sensor — water volume measurement (not yet soldered)
  - SSD1306 128×32 OLED — user feedback (not yet soldered)
- **Power:** LiPo battery via USB-C; deep sleep between uses

## Flashing

### OTA (normal workflow)

The device must be **awake** (tap it first — deep sleep timeout is 2 min production / 10 min dev mode).

```
pio run -e adafruit_feather_esp32s3_ota -t upload
```

**Known IP:** `192.168.1.113` — stored in `platformio.ini`.

**Windows gotchas:**
- mDNS (`watering_can_001.local`) does not resolve reliably on Windows — use the direct IP.
- ArduinoOTA uses UDP so TCP port checks (Test-NetConnection) always show false even when the device is reachable.
- First build takes ~2.5 min; the device's 2-min sleep timeout can fire before upload starts. Either use dev mode (10-min timeout) or tap the device again after the build finishes.
- Identify the ESP32 on the network by TTL: ESP32/lwIP responds with **TTL=64**; Windows is TTL=128.

### Finding the device IP (if it changes)

```bash
# Ping-sweep then dump ARP
for i in $(seq 1 254); do ping -n 1 -w 30 192.168.1.$i > /dev/null 2>&1 & done
sleep 8
arp -a
# Look for TTL=64 on ping, or MAC prefix b8:f8:62 (this device)
```

### USB (first flash / recovery)

Bootloader mode: hold BOOT, press RESET, release BOOT. Device appears on COM7.

```
pio run -e adafruit_feather_esp32s3 -t upload
```

## Development Mode

Toggle in [include/config.h](include/config.h) — line 8:

```c
#define DEV_MODE   // comment out for production
```

| | Dev mode | Production |
|---|---|---|
| Sleep timeout | 10 minutes | 2 minutes |
| Idle display | Debug (plant, pressure, tilt, fill) | Plant info (last watered, water remaining, avg) |

**Dev display layout (128×32):**
```
Plant 3 / 20
P: 1013.2 hPa
Tilt: 12.3  [IDLE]
Fill: ~850 ml
```

Battery % and MQTT status appear on the **startup screen** (3 s after boot), not on the dev idle screen.

State codes: `IDLE` `POUR` `SETL` (settling) `REPT` (reporting)

## Display Modes

| Screen | When |
|---|---|
| Startup status | Boot — shows battery %, MQTT, NTP for 3 s |
| Idle | Upright, waiting — plant info or dev debug |
| Pouring | Tilt > 30° — live pressure + elapsed time |
| Complete | After pour — volume + duration for 5 s |
| Sleep | Before deep sleep — "Tap to wake" |

## Tap Detection

Single tap → next plant. Double tap → previous plant.

Taps are handled two ways:
- **While awake:** `pollTapDetection()` reads `TAP_SRC` every 100 ms and acts in-loop.
- **From deep sleep:** On wake, `setup()` reads `TAP_SRC` once (150 ms after power-on) and navigates before connecting to WiFi.

### LSM6DS3TRC quirks in polling mode

**`TAP_IA` (bit 6) is never set when polling.** The datasheet implies TAP_IA should be the gate bit, but on the LSM6DS3TRC it only fires on the interrupt pin — not in the register when reading without an interrupt. Detection must check `SINGLE_TAP` (bit 5) and `DOUBLE_TAP` (bit 4) directly:

```cpp
if (!(tapSrc & 0x30)) return;   // bit5=SINGLE_TAP, bit4=DOUBLE_TAP
```

**Hardware `DOUBLE_TAP` (bit 4) is unreliable in polling mode.** Reading `TAP_SRC` clears the latch (LIR=1). If the first tap fires between two consecutive 100 ms polls, the latch is cleared before the second tap arrives, so the chip never combines them into a double-tap event. The solution is **software double-tap detection**: a second `SINGLE_TAP` within 600 ms of the first is treated as a double tap.

### Register configuration

| Register | Value | Notes |
|---|---|---|
| `TAP_CFG` (0x58) | 0x8F | All axes enabled, LIR=1 (latched) |
| `TAP_THS_6D` (0x59) | 0x04 | Threshold 4/32 × 2g ≈ 250 mg (was 0x8C = 750 mg, too stiff) |
| `INT_DUR2` (0x5A) | 0x7F | DUR=7, QUIET=3, SHOCK=3 (wide windows) |
| `WAKE_UP_THS` (0x5B) | 0x80 | Single+double tap enable |
| `MD1_CFG` (0x5E) | 0x48 | Route single+double tap to INT1 |

In DEV_MODE all registers are read back on boot to verify writes took effect.

## Battery

Battery voltage and percentage come from the **MAX17048 fuel gauge IC** (I2C 0x36), which is built into the Adafruit ESP32-S3 Feather.

There is **no analog VBAT pin** on this board. `A13` on ESP32-S3 maps to GPIO12 (a capacitive touch input), not the battery rail — do not use `analogRead`/`analogReadMilliVolts` for battery on this board.

Library: `Adafruit MAX1704X` (`Adafruit_MAX17048`).
- `maxlipo.cellVoltage()` → float V
- `maxlipo.cellPercent()` → float % state-of-charge (0–100)

## Calibration

### Step 1 — Atmospheric baseline (`ATMOSPHERE_HPA`)

The fill-level estimate is a gauge pressure: `volume ≈ (P − ATMOSPHERE_HPA) × ML_PER_HPA`.
`ATMOSPHERE_HPA` is the sensor reading when the can is **completely empty and upright**.

1. Empty the can completely.
2. Read the serial log: `IDLE  tilt=...  P=XXXX.X hPa`
3. Set `ATMOSPHERE_HPA` to that value in `config.h`.

Default is 1013.0 hPa (standard atmosphere) — fine for development.

### Step 2 — Volume scale (`ML_PER_HPA`)

The conversion factor depends on the can's cross-sectional area.

**Empirical method (most accurate):**
1. Fill the can to a convenient level. Note the pressure (`P_full`) from serial log.
2. Pour exactly 500 ml into a measuring jug (dipstick to confirm). Note pressure (`P_after`).
3. `ML_PER_HPA = 500.0 / (P_full − P_after)`
4. Update `CAN_AREA_CM2` in `config.h` to match: `CAN_AREA_CM2 = ML_PER_HPA / 1.02`

**Geometric method:**
Measure the inner diameter of the can → `CAN_AREA_CM2 = π × (diameter/2)²`.
Default assumes 14 cm diameter → 154 cm² → `ML_PER_HPA ≈ 157`.

### Step 3 — Flow rate experiment (one-time, optional)

This experiment characterises how much water flows at different **tilt angles** and **fill levels**.
It tells you whether the simple ΔP-at-rest approach is sufficient or whether real-time
angle compensation is needed.

**Why it matters:** The firmware currently measures volume as `ΔP × ML_PER_HPA` using two
upright pressure snapshots (before and after pour). This is accurate independent of pour angle.
A flow-rate model would only be needed if you later want real-time in-pour volume estimation.

**Protocol:**

| Variable | Values to test |
|---|---|
| Fill level | 25 %, 50 %, 75 %, 100 % of capacity |
| Tilt angle | 30°, 45°, 60°, 90° |

For each (fill, angle) combination:
1. Fill can to target level. Confirm with pressure reading.
2. Plug the spout (finger or tape).
3. Tilt to target angle and hold steady for 2 s with spout plugged.
4. Unplug spout, hold for exactly **5 s**, plug again.
5. Weigh or measure the water dispensed.
6. Record: `fill_level_ml, angle_deg, volume_dispensed_ml, time_s` → `flow_ml_per_s`.

**Analysis:** Plot `flow_ml_per_s` vs angle and vs fill level separately.
- If flow rate scales strongly with fill level but weakly with angle → **pressure/head dominates** → simple ΔP approach is sufficient, no angle correction needed.
- If flow rate scales strongly with angle but weakly with fill level → **angle dominates** → pour angle must be tracked for real-time estimation.
- In practice, head typically dominates at low fill and angle dominates at high tilt; a two-variable fit `flow ≈ k × sin(angle) × sqrt(fill)` (Torricelli-derived) usually fits well with 2 parameters.

## MQTT Topics

| Topic | Direction | Payload |
|---|---|---|
| `plant/watering_can_001/event` | device → broker | `{plant_index, volume_ml, duration_s, timestamp, avg_volume_ml}` |
| `plant/watering_can_001/status` | device → broker | `{plant_index, pressure_hpa, battery_v, battery_pct, days_since_water, needs_water}` |
| `plant/watering_can_001/set_plant` | broker → device | `{plant_index}` (1-based) |
