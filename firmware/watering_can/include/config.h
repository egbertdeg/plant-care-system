#pragma once

// ─── Development mode ────────────────────────────────────────
// Uncomment to enable dev mode:
//   • Debug display (pressure, tilt, fill level, battery/MQTT)
//   • Extended sleep timeout (10 min instead of 2 min)
// Comment out before deploying.
#define DEV_MODE

// ─── Device identity ────────────────────────────────────────
#define DEVICE_ID   "watering_can_001"

// ─── MQTT topics ────────────────────────────────────────────
// App → device:  {"plant_index": 3}   (1-based, selects current plant)
// Device → app:  {"device_id":..., "plant_index":..., "volume_ml":..., ...}
#define TOPIC_SET_PLANT  "plant/watering_can_001/set_plant"
#define TOPIC_EVENT      "plant/watering_can_001/event"
#define TOPIC_STATUS     "plant/watering_can_001/status"

// ─── I2C addresses ──────────────────────────────────────────
#define I2C_IMU      0x6A   // LSM6DS3 (alt: 0x6B if SDO pulled high)
#define I2C_PRESSURE 0x18   // MPRLS
#define I2C_OLED     0x3C   // SSD1306 128×32 (not installed yet)

// ─── Tilt detection ─────────────────────────────────────────
// Angle from vertical (degrees). 0° = upright, 90° = on its side.
#define POUR_ANGLE    30.0f   // tilt beyond this → watering event starts
#define STOP_ANGLE    15.0f   // tilt below this  → watering event ends

// ─── Volume calibration ─────────────────────────────────────
// Physics: 1 hPa pressure change ≈ 1.02 cm of water column height.
// For a cylindrical can: volume (ml) = height (cm) × area (cm²).
//   → ML_PER_HPA = 1.02 × CAN_AREA_CM2
//
// To find CAN_AREA_CM2 for a circular can:
//   measure inner diameter → radius r → area = π × r²
//   e.g. diameter 14cm → r=7cm → area = π×49 ≈ 154 cm²
//
// To calibrate empirically (most accurate):
//   1. Record pressure when can is full (P_full).
//   2. Pour exactly 500ml into a measuring jug.
//   3. Record pressure again (P_after).
//   4. ML_PER_HPA = 500.0 / (P_full - P_after)
//
#define CAN_AREA_CM2   154.0f              // inner cross-section (cm²) — measure your can
#define ML_PER_HPA     (1.02f * CAN_AREA_CM2)  // ≈ 157 ml/hPa for the default above

// Ignore events smaller than this (accidental tips, drips)
#define MIN_VOLUME_ML  20.0f

// Atmospheric pressure reference for water-remaining estimate.
// Measure the sensor hPa reading when the can is completely empty and set this.
// Standard atmosphere (1013.25) is a reasonable starting point.
#define ATMOSPHERE_HPA  1013.0f

// ─── Plant management ───────────────────────────────────────
#define NUM_PLANTS          20      // plants 1-20 (plants 1-3 = soil sensor pods)
#define HISTORY_SIZE        3       // watering volumes kept per plant (rolling avg)
#define MAX_BUFFERED_EVENTS 20      // offline events stored in NVS while WiFi down
#define NEEDS_WATER_DAYS    7       // flag plant as "dry" if not watered in N days

// ─── Timing ─────────────────────────────────────────────────
// After the can returns upright, wait this long before recording
// the end pressure (lets water settle and sloshing stop).
#define SETTLE_MS           2000
// Main loop delay — controls IMU polling rate (~10 Hz)
#define LOOP_DELAY_MS       100
// No activity for this long → enter deep sleep
#ifdef DEV_MODE
  #define INACTIVITY_MS     600000UL   // 10 minutes (dev mode)
#else
  #define INACTIVITY_MS     120000UL   // 2 minutes (production)
#endif
// Publish status MQTT message this often while awake
#define STATUS_INTERVAL_MS  30000UL     // 30 seconds

// ─── Refill detection ───────────────────────────────────────
// If upright pressure increases by more than this between readings,
// treat it as a refill and update the baseline (don't count as pour).
#define REFILL_THRESHOLD_HPA  2.0f      // tune during calibration

// ─── Deep sleep wake pin ────────────────────────────────────
// Connect IMU INT1 → GPIO9. Tap wakes the device from deep sleep.
// Wire: LSM6DS3 INT1 pin → ESP32-S3 GPIO9 (with 10kΩ pull-down to GND)
#define WAKE_PIN  9

// ─── Battery monitoring ─────────────────────────────────────
// Battery is read from the on-board MAX17048 fuel gauge IC (I2C 0x36).
// The Adafruit ESP32-S3 Feather has NO analog VBAT pin — A13 maps to GPIO12
// (a capacitive touch pin), NOT the battery rail. Do not use analogRead for battery.
// MAX17048: cellVoltage() → float V,  cellPercent() → float % SoC

// ─── NTP ────────────────────────────────────────────────────
#define NTP_SERVER    "pool.ntp.org"
#define NTP_OFFSET_S  0     // UTC offset in seconds; e.g. -18000 for EST

// ─── LSM6DS3 tap detection registers ────────────────────────
// These registers are not exposed by the Adafruit library.
// Written directly via I2C in setupTapDetection().
#define LSM6DS3_TAP_CFG      0x58   // tap config (axes enable, LIR)
#define LSM6DS3_TAP_THS_6D   0x59   // tap threshold
#define LSM6DS3_INT_DUR2     0x5A   // tap duration / quiet / shock timings
#define LSM6DS3_WAKE_UP_THS  0x5B   // single+double tap enable
#define LSM6DS3_MD1_CFG      0x5E   // route to INT1
#define LSM6DS3_TAP_SRC      0x1C   // read tap event (TAP_IA, DOUBLE_TAP, SINGLE_TAP)

// ─── OLED display ───────────────────────────────────────────
// 128×32 SSD1306. Non-fatal if not installed.
// All display calls are guarded by oledPresent flag.
// When OLED is added, solder to the IMU I2C pads (SDO connects via same STEMMA chain).
#define DISPLAY_WIDTH   128
#define DISPLAY_HEIGHT   32
