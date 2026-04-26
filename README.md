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
- PWA (React + Vite) for outdoor plant logging — **live**
- Mobile app (Flutter) — *shelved*

## Project Status

- ✅ Sensor pod firmware (all sensors reading, HTTP POST to Cloudflare)
- ✅ Watering can firmware (IMU, tap detection, deep sleep, OTA, HTTP POST)
- ✅ OTA firmware updates (no USB required)
- ✅ Cloudflare Worker — MCP server (Claude.ai) + ingest (firmware)
- ✅ Cloudflare Worker — REST API for PWA (`plant-care-api`) — **live**
- ✅ D1 database (SQLite at the edge)
- ✅ R2 photo storage
- ✅ MCP server — Claude.ai connected via Connectors
- ✅ PWA — 5 workflows: moisture, pH, watering, plant notes, photos (`pwa/`)
- ✅ Weather backend integration code — ready to wire into Cloudflare Worker (`cloudflare/weather-integration/`)
- ⏳ Flash updated firmware to devices (sensor pod + watering can)
- ⏳ Deploy weather cron to Cloudflare Worker + run D1 migration
- ⏳ Watering alerts (once weather data accumulates)
- ⏳ ML predictions (future)

## Live Endpoints

### MCP + Ingest worker
`https://plant-care-mcp.egbert-degroot.workers.dev`

| Endpoint | Description |
|---|---|
| `GET /mcp` | MCP server endpoint for Claude.ai |
| `POST /ingest/sensors` | Sensor pod readings |
| `POST /ingest/watering` | Watering can events |
| `POST /ingest/status` | Watering can status |

### REST API worker (used by PWA)
`https://plant-care-api.egbert-degroot.workers.dev`

| Endpoint | Description |
|---|---|
| `GET /plants` | All plant profiles |
| `GET /plants/{id}` | Single plant |
| `PUT /plants/{id}` | Update plant fields |
| `POST /plants/{id}/notes` | Append a dated note (atomic) |
| `GET /plants/{id}/waterings` | Watering history |
| `POST /plants/{id}/waterings` | Log a watering |
| `GET /plants/{id}/photos` | List photos |
| `POST /plants/{id}/photos` | Upload photo to R2 |
| `GET /readings` | Sensor reading history |
| `GET /readings/latest` | Most recent reading |
| `GET /weather/daily` | Daily weather history (max temp, precip, humidity, ET₀, GDD) |
| `GET /weather/latest` | Most recent weather record |

## PWA — Outdoor Logging App

Mobile-first progressive web app for standing-in-the-garden use. Designed for big touch targets and no keyboard input.

```bash
cd pwa
npm install
npm run dev       # dev server → http://localhost:5173
npm run build     # production build → dist/ (includes service worker)
```

**Five workflows:**

| Route | Frequency | What it does |
|---|---|---|
| `/sensors` | Weekly | Soil moisture for all 10 plants — tap 1–10, auto-advance, batch-log |
| `/ph` | Monthly | Soil pH for all 10 plants — tap 4.0–8.5, auto-advance, batch-log |
| `/water` | After watering | Multi-select plants → AM/PM/Evening → volume → log |
| `/note` | As needed | Pick one plant → free-text observation → up to 3 photos |
| `/photos` | Weekly | Per-plant camera capture for all plants → review → upload all |

Calls the Cloudflare Worker REST API directly. No proxy needed.

## Quick Start

### Cloud backend (Codespaces or local)

The easiest way to work on the Cloudflare Worker is via **GitHub Codespaces** — no local setup needed.

1. Open the repo on GitHub → green **Code** button → **Codespaces** → **Create codespace**
2. The devcontainer installs Node 22 and all dependencies automatically
3. Add your `CLOUDFLARE_API_TOKEN` as a Codespace secret (repo Settings → Secrets → Codespaces)

```bash
# REST API worker (used by PWA)
cd cloudflare/rest-api
npx wrangler deploy

# MCP + ingest worker (Claude.ai + firmware)
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
├── cloudflare/         # Cloudflare Workers
│   ├── rest-api/             # REST API worker — used by PWA
│   └── weather-integration/  # D1 migration + cron handler — ready to integrate
├── pwa/                # React PWA — 5 workflows (moisture, pH, water, notes, photos)
├── backend/            # FastAPI backend — deprecated, replaced by Cloudflare
├── mobile/             # Flutter app — shelved
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
