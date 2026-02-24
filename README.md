# Plant Care System

Smart IoT system for monitoring plant health and tracking watering patterns.

## Overview

**Hardware:**
- ESP32-S3 sensor pods (soil moisture, temperature, humidity, light)
- ESP32-S3 smart watering can (tilt detection, volume measurement via pressure sensor)

**Software:**
- Embedded firmware (Arduino/PlatformIO)
- Cloud backend (FastAPI + PostgreSQL) - *planned*
- Mobile app (Flutter) - *planned*
- ML models for watering prediction - *planned*

## Project Status

🚧 **Phase 1: Hardware Prototyping** (Current)
- ✅ Hardware ordered and received
- ✅ Development environment setup
- 🔄 Building sensor pod firmware
- ⏳ Watering can (after sensor pod works)

## Quick Start

### Prerequisites
- VS Code with PlatformIO extension
- Git
- ESP32-S3 boards and sensors (see [Bill of Materials](docs/hardware/bill-of-materials.md))

### First Steps
1. Clone this repository
2. Open `firmware/sensor_pod/` in VS Code
3. See [firmware/sensor_pod/README.md](firmware/sensor_pod/README.md) for build instructions

## Project Structure

```
├── firmware/           # ESP32 embedded code
│   ├── sensor_pod/     # Monitors plants
│   └── watering_can/   # Tracks watering events
├── backend/            # Cloud API (future)
├── mobile/             # Flutter app (future)
├── ml/                 # ML models (future)
├── docs/               # Documentation
└── scripts/            # Utility scripts
```

## Hardware

See complete [Bill of Materials](docs/hardware/bill-of-materials.md)

**Sensor Pod:**
- 1× ESP32-S3 Feather
- 3× Soil moisture sensors (I2C)
- 1× SHT40 temp/humidity sensor
- 1× TSL2591 light sensor
- 1× PCA9546 I2C multiplexer

**Watering Can:**
- 1× ESP32-S3 Feather
- 1× LSM6DS3 IMU (tilt detection)
- 1× MPRLS pressure sensor (volume measurement)
- 1× OLED display
- 1× 400mAh LiPo battery

## Development Roadmap

### Phase 1: Hardware (Weeks 1-8) - *Current*
- [x] Order and receive hardware
- [x] Set up development environment
- [ ] Sensor pod firmware (read all sensors)
- [ ] WiFi + MQTT connectivity
- [ ] Watering can firmware
- [ ] End-to-end hardware test

### Phase 2: Cloud Backend (Weeks 9-12)
- [ ] FastAPI REST API
- [ ] PostgreSQL database
- [ ] MQTT subscriber service
- [ ] Deploy to cloud (Railway/Render)

### Phase 3: Mobile App (Weeks 13-16)
- [ ] Flutter app UI
- [ ] Real-time sensor data display
- [ ] Watering history
- [ ] Push notifications

### Phase 4: ML & Intelligence (Weeks 17-20)
- [ ] Collect training data
- [ ] Train watering prediction model
- [ ] Integrate predictions into app

## Documentation

- [Bill of Materials](docs/hardware/bill-of-materials.md)
- [Hardware Setup](docs/hardware/) - *to be added*
- [API Documentation](docs/api/) - *to be added*
- [Development Setup](docs/setup/) - *to be added*

## License

MIT License

## Contact

Egbert de Groot - egbert.degroot@gmail.com
