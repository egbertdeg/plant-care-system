# Plant Care System

Smart IoT system for monitoring plant health and tracking watering patterns.

## Overview

**Hardware:**
- ESP32-S3 sensor pods (soil moisture, temperature, humidity, light)
- ESP32-S3 smart watering can (tilt detection, volume measurement via pressure sensor)

**Software:**
- Embedded firmware (Arduino/PlatformIO) — **live**
- Cloud backend (FastAPI + PostgreSQL on Railway) — **live**
- Mobile app (Flutter) — *in development*
- ML models for watering prediction — *planned*

## Project Status

**Phase 3 in progress — watering can firmware live.**

- ✅ Sensor pod firmware (all sensors reading)
- ✅ WiFi + MQTT → HiveMQ Cloud
- ✅ FastAPI backend deployed on Railway
- ✅ PostgreSQL storing averaged readings
- ✅ OTA firmware updates (no USB required)
- ✅ Watering can firmware (flashed, IMU live — pressure sensor to be added)
- ⏳ Mobile app
- ⏳ ML predictions

## Live Endpoints

Base URL: `https://plant-api-production-7c02.up.railway.app`

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |
| `GET /readings/latest` | Most recent sensor reading |
| `GET /readings?device_id=sensor_pod_001&limit=100` | Reading history |
| `GET /plants` | All plant profiles + last watered + schedule status |
| `GET /plants/{id}` | Single plant (id = 1–20) |
| `PUT /plants/{id}` | Create / update plant profile |
| `GET /plants/{id}/waterings` | Watering history for one plant |
| `GET /waterings` | All recent watering events |

## Quick Start

### Prerequisites
- VS Code with PlatformIO extension
- Git
- ESP32-S3 boards and sensors (see [Bill of Materials](docs/hardware/bill-of-materials.md))

### Firmware
1. Clone this repository
2. Open `firmware/sensor_pod/` in VS Code
3. See [firmware/sensor_pod/README.md](firmware/sensor_pod/README.md) for build/OTA instructions

### Backend
- Deployed automatically on Railway from `backend/` on every push to `master`
- See [backend/README.md](backend/README.md) for local dev and deployment details

## Project Structure

```
├── firmware/           # ESP32 embedded code
│   ├── sensor_pod/     # Monitors plants (LIVE)
│   └── watering_can/   # Tracks watering events (in progress)
├── backend/            # FastAPI + PostgreSQL (LIVE on Railway)
├── mobile/             # Flutter app (future)
├── ml/                 # ML models (future)
├── docs/               # Documentation
└── scripts/            # Utility scripts
```

## Hardware

See complete [Bill of Materials](docs/hardware/bill-of-materials.md)

**Sensor Pod:**
- 1× ESP32-S3 Feather
- 3× Soil moisture sensors (I2C, Adafruit STEMMA)
- 1× SHT40 temp/humidity sensor
- 1× TSL2591 light sensor
- 1× PCA9546 I2C multiplexer
- 1× SSD1306 OLED display (128×32)

**Watering Can:**
- 1× ESP32-S3 Feather
- 1× LSM6DS3 IMU (tilt detection)
- 1× MPRLS pressure sensor (volume measurement)
- 1× OLED display
- 1× 400mAh LiPo battery

## Development Roadmap

### Phase 1: Hardware (Complete)
- [x] Order and receive hardware
- [x] Set up development environment
- [x] Sensor pod firmware (all sensors)
- [x] WiFi + MQTT connectivity

### Phase 2: Cloud Backend (Complete)
- [x] FastAPI REST API
- [x] PostgreSQL database
- [x] MQTT subscriber service
- [x] Deploy to Railway
- [x] OTA firmware updates

### Phase 3: Watering Can + Plant Management (In Progress)
- [x] Watering can firmware (IMU, tap detection, deep sleep, OTA)
- [x] Backend plant profiles (name, species, location, size, pot, schedule)
- [x] Backend watering event logging (MQTT → PostgreSQL)
- [x] Plant photo storage (upload/download via API)
- [ ] MPRLS pressure sensor (volume measurement) — hardware pending
- [ ] OLED display — hardware pending

### Phase 4: Mobile App (In Development)
- [ ] Backend: soil sensor mapping + manual watering log endpoint
- [ ] Flutter project setup + API service + data models
- [ ] Plants tab — list, detail, edit, log watering
- [ ] Photo upload from camera / photo library
- [ ] Sensors tab — room conditions + soil moisture per plant
- [ ] Local notifications for overdue plants

See [mobile/README.md](mobile/README.md) for full screen designs and implementation plan.

### Phase 5: ML & Intelligence
- [ ] Collect training data (soil moisture trends + watering history)
- [ ] Train watering prediction model
- [ ] Integrate predictions into app

## Documentation

- [Bill of Materials](docs/hardware/bill-of-materials.md)
- [Backend README](backend/README.md)
- [Mobile App README](mobile/README.md)
- [Sensor Pod README](firmware/sensor_pod/README.md)
- [Watering Can README](firmware/watering_can/README.md)

## License

MIT License

## Contact

Egbert de Groot - egbert.degroot@gmail.com
