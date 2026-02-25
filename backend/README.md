# Backend API

Cloud backend for plant sensor data storage and retrieval.

## Status

✅ **Live on Railway** — `https://plant-api-production-7c02.up.railway.app`

## Architecture

```
sensor_pod (ESP32)
    ↓ MQTT/TLS
HiveMQ Cloud
    ↓ MQTT subscribe
FastAPI backend (Railway)
    ↓ SQLAlchemy
PostgreSQL (Railway, private network)
    ↑
REST API (public)
```

**Stack:**
- FastAPI + uvicorn
- PostgreSQL via SQLAlchemy
- paho-mqtt MQTT subscriber
- Deployed on Railway (auto-deploys on push to `master`)

## API Endpoints

### Sensor pod

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/readings/latest` | Most recent sensor reading |
| GET | `/readings?device_id=sensor_pod_001&limit=100` | Sensor reading history |

### Plant profiles

| Method | Path | Description |
|---|---|---|
| GET | `/plants` | All plants with last watering + schedule status |
| GET | `/plants/{id}` | Single plant (id = 1-20) |
| PUT | `/plants/{id}` | Create / update plant profile |

**`PUT /plants/{id}` body** (all fields optional, only supplied fields are updated):
```json
{
  "name": "Monstera",
  "location": "Living room",
  "target_volume_ml": 250,
  "target_interval_days": 7,
  "notes": "Likes indirect light"
}
```

**`GET /plants` response includes derived fields:**
```json
{
  "id": 3,
  "name": "Monstera",
  "target_volume_ml": 250,
  "target_interval_days": 7,
  "last_watered": "2026-02-20T10:30:00+00:00",
  "days_since_water": 5,
  "needs_water": false
}
```

### Watering history

| Method | Path | Description |
|---|---|---|
| GET | `/waterings?limit=50` | All recent watering events |
| GET | `/plants/{id}/waterings?limit=20` | Watering history for one plant |

**Example response (`/readings/latest`):**
```json
{
  "id": 65,
  "device_id": "sensor_pod_001",
  "timestamp": "2026-02-25T12:49:14+00:00",
  "light": 113.6,
  "par": 2.1,
  "temp": 20.8,
  "humidity": 46.3,
  "soil1": 1015,
  "soil2": 926,
  "soil3": 769
}
```

## Data Model

### `sensor_readings`

2-minute averages published by the sensor pod (60 samples × 2s).

| Field | Type | Description |
|---|---|---|
| `light` | float | Lux (TSL2591) |
| `par` | float | µmol/m²/s (lux × 0.0185) |
| `temp` | float | °C (SHT40) |
| `humidity` | float | % RH (SHT40) |
| `soil1/2/3` | int | Capacitive moisture (Adafruit STEMMA) |

### `plants`

User-maintained plant profiles. `id` = `plant_index` on the watering can (1–20).

| Field | Type | Description |
|---|---|---|
| `id` | int | Plant index 1-20 (matches watering can) |
| `name` | str? | Display name |
| `location` | str? | Room / shelf |
| `target_volume_ml` | float? | Desired pour volume |
| `target_interval_days` | int? | Days between waterings |
| `notes` | str? | Free text |

### `watering_events`

One row per watering event published by the watering can.

| Field | Type | Description |
|---|---|---|
| `plant_index` | int | Which plant was watered (1-20) |
| `device_id` | str | Source device |
| `volume_ml` | float? | Volume dispensed (null until MPRLS installed) |
| `duration_s` | int? | Pour duration |
| `avg_volume_ml` | float? | Rolling avg from device NVS |
| `timestamp` | datetime? | Device NTP timestamp |
| `received_at` | datetime | Server receive time (always set) |

## Railway Deployment

### Initial Setup (one-time)

1. Push repo to GitHub first — Railway needs the repo to exist
2. Create Railway project → Add service → GitHub repo → `plant-care-system`
3. Set **Root Directory** to `backend`
4. Add environment variables (see below)
5. Railway auto-injects `DATABASE_URL` pointing to the Postgres private network

### Environment Variables

Set these in Railway → Service → Variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Add as **reference** from the Postgres service (uses private network — free) |
| `MQTT_BROKER` | `222e0611d49d4dbf832d7f7fb828b39e.s1.eu.hivemq.cloud` |
| `MQTT_PORT` | `8883` |
| `MQTT_USER` | `GratefulPlantsAdmin` |
| `MQTT_PASSWORD` | `DP6%abx#tiny!` |

### Lessons Learned

**Use Railway's private network for Postgres** — `postgres.railway.internal` is only reachable from within Railway. Running the backend locally against this URL won't work. Deploy the backend to Railway and use the reference variable, which is free (no egress fees).

**`DATABASE_URL` must be a reference, not typed manually** — In Railway Variables, click "Add Reference" and select it from the Postgres service dropdown. This auto-populates the private URL and stays in sync if credentials rotate.

**GitHub repo must exist before Railway can find it** — Railway's GitHub App lists repos that exist on GitHub. If you haven't pushed yet, Railway shows nothing. Push first, then connect.

**Railway GitHub App permissions** — If the repo doesn't appear in Railway, go to GitHub → Settings → Applications → Installed GitHub Apps → Railway → Configure → set Repository access to "All repositories".

**Special characters in env var values** — Railway's variable UI treats `#` as a comment character when pasting values. The password `DP6%abx#tiny!` was truncated to `DP6%abx` on first entry. Use the Raw Editor (top right of Variables tab) to paste values with special characters safely. Do NOT wrap in quotes — they get stored literally and cause auth failures.

## Local Development

The `DATABASE_URL` in `.env` uses the Railway internal hostname which won't resolve locally. For local dev, use a local Postgres instance or Railway's public URL (note: public URL incurs egress fees).

```bash
cd backend
pip install -r requirements.txt
# Edit .env with a local DATABASE_URL
uvicorn main:app --reload
```

## Files

| File | Purpose |
|---|---|
| `main.py` | FastAPI app, lifespan, endpoints |
| `mqtt_client.py` | MQTT subscriber, writes to DB |
| `models.py` | SQLAlchemy `SensorReading` model |
| `database.py` | Engine, session, Base |
| `config.py` | Pydantic settings from env vars |
| `railway.toml` | Railway build/start config |
| `requirements.txt` | Python dependencies |
