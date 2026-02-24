#pragma once

// ============================================================
// WiFi
// Credentials live in secrets.h — never commit that file!
// ============================================================
#define WIFI_RECONNECT_DELAY_MS  5000
#define WIFI_MAX_ATTEMPTS        20

// ============================================================
// MQTT Broker — HiveMQ Cloud (free tier, TLS)
// Cluster URL and credentials live in secrets.h
// Get a free account at: https://console.hivemq.cloud/
// ============================================================
#define MQTT_PORT                8883   // TLS
#define MQTT_RECONNECT_DELAY_MS  5000

// ============================================================
// Device Identity
// ============================================================
#define DEVICE_ID  "watering_can_001"

// ============================================================
// MQTT Topics
// ============================================================
#define TOPIC_WATERING_EVENT  "plant/watering_can_001/event"
#define TOPIC_STATUS          "plant/watering_can_001/status"

// ============================================================
// I2C Addresses
// ============================================================
#define I2C_IMU       0x6A  // LSM6DS3 (default)
#define I2C_PRESSURE  0x18  // MPRLS
#define I2C_OLED      0x3C  // SSD1306 128×64

// ============================================================
// Tilt Detection Thresholds
// ============================================================
#define TILT_START_DEGREES  45.0f  // Begin watering event
#define TILT_END_DEGREES    30.0f  // End watering event

// ============================================================
// Display
// ============================================================
#define DISPLAY_WIDTH   128
#define DISPLAY_HEIGHT   64

// ============================================================
// General
// ============================================================
#define SERIAL_BAUD  115200
