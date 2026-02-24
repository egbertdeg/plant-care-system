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
#define DEVICE_ID  "sensor_pod_001"

// ============================================================
// MQTT Topics
// ============================================================
#define TOPIC_MOISTURE_1   "plant/sensor_pod_001/moisture/plant_1"
#define TOPIC_MOISTURE_2   "plant/sensor_pod_001/moisture/plant_2"
#define TOPIC_MOISTURE_3   "plant/sensor_pod_001/moisture/plant_3"
#define TOPIC_TEMPERATURE  "plant/sensor_pod_001/temperature"
#define TOPIC_HUMIDITY     "plant/sensor_pod_001/humidity"
#define TOPIC_LIGHT        "plant/sensor_pod_001/light"
#define TOPIC_STATUS       "plant/sensor_pod_001/status"

// ============================================================
// I2C Addresses
// ============================================================
#define I2C_MULTIPLEXER  0x70  // PCA9546
#define I2C_SOIL_SENSOR  0x36  // STEMMA soil sensor (all 3, via mux)
#define I2C_SHT40        0x44  // Temperature & humidity
#define I2C_TSL2591      0x29  // Light sensor

// PCA9546 multiplexer channel assignments
#define MUX_CH_SOIL_1  0
#define MUX_CH_SOIL_2  1
#define MUX_CH_SOIL_3  2
#define MUX_CH_SHT40   3

// ============================================================
// Timing
// ============================================================
#define READING_INTERVAL_MS  (15UL * 60 * 1000)  // 15 minutes
#define SERIAL_BAUD          115200
