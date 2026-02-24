# Sensor Pod Firmware

ESP32-S3 firmware for the plant sensor pod.

## Hardware
- Adafruit ESP32-S3 Feather (#5477)
- 3× STEMMA Soil Sensors via PCA9546 I2C multiplexer
- SHT40 temperature & humidity sensor
- TSL2591 light sensor

## Setup

1. Install [PlatformIO](https://platformio.org/)
2. Copy `include/secrets.h.example` to `include/secrets.h`
3. Fill in your WiFi and HiveMQ credentials in `secrets.h`
4. Build and upload: `pio run --target upload`
5. Monitor serial output: `pio device monitor`

## Current Status
Phase 1 — blink test only. See [CLAUDE.md](CLAUDE.md) for development roadmap.
