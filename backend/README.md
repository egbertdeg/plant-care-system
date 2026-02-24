# Backend API

Cloud backend for plant sensor data storage and processing.

## Status

⏳ **Not yet implemented**

Backend development will begin after firmware is stable and collecting real sensor data (approximately Week 9-12).

## Planned Architecture

**Stack:**
- FastAPI (Python async web framework)
- PostgreSQL (relational database)
- MQTT Subscriber (receives sensor data)
- Deployed on: Railway.app or Render.com

**Components:**
```
firmware/                     backend/
  sensor_pod                    api/
      ↓                           ↓
   WiFi/MQTT  →  HiveMQ Cloud  ← MQTT Subscriber
                      ↓
                 PostgreSQL ← FastAPI API
                      ↓           ↓
                  Storage    REST Endpoints
                                  ↓
                            Mobile App (future)
```

## Planned Features

### MQTT Subscriber
- Subscribe to `plant/#` topics
- Parse sensor data JSON
- Store readings in database
- Handle connection failures

### REST API
- `GET /api/sensors` - List all sensors
- `GET /api/sensors/{id}/readings` - Get sensor history
- `GET /api/plants/{id}/status` - Current plant status
- `POST /api/watering` - Log watering event
- WebSocket for real-time updates

### Database Schema
- `sensors` - Sensor metadata
- `readings` - Time-series sensor data
- `watering_events` - Watering history
- `users` - User accounts (future)

## Development Timeline

- **Week 9:** Basic FastAPI skeleton, database schema
- **Week 10:** MQTT subscriber, data ingestion
- **Week 11:** REST API endpoints
- **Week 12:** Deploy to cloud, test with real data

## Setup (Future)

```bash
# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start development server
uvicorn api.main:app --reload

# Run tests
pytest
```

## Why Not Yet?

We're focusing on hardware first because:
1. Need real sensor data to design database schema properly
2. Want stable firmware before building around it
3. Can test with local MQTT broker initially
4. Backend is easier to iterate than hardware

Once firmware is working and we have data flowing, backend development will be much faster and more informed.
