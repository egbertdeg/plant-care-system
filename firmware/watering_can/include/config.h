#pragma once

// ─── Device identity ────────────────────────────────────────
#define DEVICE_ID   "watering_can_001"

// ─── MQTT topics ────────────────────────────────────────────
#define TOPIC_SET_PLANT  "plant/watering_can_001/set_plant"
#define TOPIC_EVENT      "plant/watering_can_001/event"

// ─── I2C addresses ──────────────────────────────────────────
#define I2C_IMU      0x6A   // LSM6DS3 (alt: 0x6B if SDO pulled high)
#define I2C_PRESSURE 0x18   // MPRLS
#define I2C_OLED     0x3C   // SSD1306 128×64 (not installed yet)

// ─── Tilt detection ─────────────────────────────────────────
// Angle from vertical (degrees). 0° = upright, 90° = on its side.
#define POUR_ANGLE    45.0f   // tilt beyond this → watering event starts
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

// ─── Timing ─────────────────────────────────────────────────
// After the can returns upright, wait this long before recording
// the end pressure (lets water settle and sloshing stop).
#define SETTLE_MS      2000

// Main loop delay — controls IMU polling rate (10 Hz)
#define LOOP_DELAY_MS  100

// ─── OLED display ───────────────────────────────────────────
// 128×64 SSD1306. Not physically installed yet.
// Initialization is non-fatal; all display calls are guarded by oledPresent.
#define DISPLAY_WIDTH   128
#define DISPLAY_HEIGHT   64
