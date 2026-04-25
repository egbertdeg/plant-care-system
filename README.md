# Plant Care System

Smart IoT system for monitoring plant health and tracking watering patterns.

## Overview

**Hardware:**
- ESP32-S3 sensor pods (soil moisture, temperature, humidity, light)
- ESP32-S3 smart watering can (tilt detection, volume measurement via pressure sensor)

**Software:**
- Embedded firmware (Arduino/PlatformIO)
- Cloud backend (Cloudflare Worker + D1 + R2) — **live**
- MCP server for Claude.ai integration — **live**
- Mobile app (Flutter) — *shelved*

## Project Status

- ✅ Sensor pod firmware (all sensors reading, HTTP POST to Cloudflare)
- ✅ Watering can firmware (IMU, tap detection, deep sleep, OTA, HTTP POST)
- ✅ OTA firmware updates (no USB required)
- ✅ Cloudflare Worker backend (plants, sensors, waterings, photos)
- ✅ D1 database (SQLite at the edge)
- ✅ R2 photo storage
- ✅ MCP server — Claude.ai connected via Connectors
- ⏳ Flash updated firmware to devices (sensor pod + watering can)
- ⏳ ML predictions (future)

## Live Endpoints

Worker URL: `https://plant-care-mcp.egbert-degroot.workers.dev`

### MCP (Claude.ai)
| Endpoint | Description |
|---|---|
| `GET /mcp` | MCP server endpoint for Claude.ai |

### Ingest (from firmware)
| Endpoint | Description |
|---|---|
| `POST /ingest/sensors` | Sensor pod readings |
| `POST /ingest/watering` | Watering can events |
| `POST /ingest/status` | Watering can status |

### API
| Endpoint | Description |
|---|---|
| `GET /plants` | All plant profiles |
| `GET /plants/{id}` | Single plant |
| `PUT /plants/{id}` | Create / update plant |
| `GET /plants/{id}/waterings` | Watering history |
| `POST /plants/{id}/waterings` | Log a watering |
| `GET /plants/{id}/photos` | List photos |
| `POST /plants/{id}/photos` | Upload photo |
| `GET /readings` | Sensor reading history |
| `GET /readings/latest` | Most recent reading |

## Quick Start

### Cloud backend (Codespaces or local)

The easiest way to work on the Cloudflare Worker is via **GitHub Codespaces** — no local setup needed.

1. Open the repo on GitHub → green **Code** button → **Codespaces** → **Create codespace**
2. The devcontainer installs Node 22 and all dependencies automatically
3. Add your `CLOUDFLARE_API_TOKEN` as a Codespace secret (repo Settings → Secrets → Codespaces)

```bash
cd cloudflare
npm run dev      # local dev server
npm run deploy   # deploy to production
```

### Firmware (local only — requires USB/OTA)

Firmware flashing requires a local machine with PlatformIO.

```bash
# Build and flash via OTA
pio run -e adafruit_feather_esp32s3_ota --target upload
```

See [firmware/sensor_pod/README.md](firmware/sensor_pod/README.md) and [firmware/watering_can/README.md](firmware/watering_can/README.md).

## Project Structure

```
├── firmware/           # ESP32 embedded code
│   ├── sensor_pod/     # Monitors plants — HTTP POST to Cloudflare
│   └── watering_can/   # Tracks watering events — HTTP POST to Cloudflare
├── cloudflare/         # Cloudflare Worker (backend + MCP server)
├── backend/            # FastAPI backend — deprecated, replaced by Cloudflare
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
- 1× VL53L1X ToF sensor (water level via float in guide tube)
- 1× OLED display
- 1× 400mAh LiPo battery

## Documentation

- [Bill of Materials](docs/hardware/bill-of-materials.md)
- [Sensor Pod README](firmware/sensor_pod/README.md)
- [Watering Can README](firmware/watering_can/README.md)

## License

MIT License

## Contact

Egbert de Groot - egbert.degroot@gmail.com
