import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import engine, get_db, Base
from models import SensorReading, Plant, WateringEvent
from mqtt_client import create_mqtt_client, start_mqtt

logging.basicConfig(level=logging.INFO)

mqtt_client = create_mqtt_client()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)  # creates any new tables (plants, watering_events)
    start_mqtt(mqtt_client)
    yield
    mqtt_client.loop_stop()
    mqtt_client.disconnect()


app = FastAPI(title="Plant Care API", lifespan=lifespan)


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class PlantUpdate(BaseModel):
    name:                 Optional[str]   = None
    location:             Optional[str]   = None
    target_volume_ml:     Optional[float] = None
    target_interval_days: Optional[int]   = None
    notes:                Optional[str]   = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _days_since(ts: Optional[datetime]) -> Optional[int]:
    if ts is None:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    delta = datetime.now(timezone.utc) - ts
    return delta.days


def _plant_summary(plant: Plant, last_event: Optional[WateringEvent]) -> dict:
    last_ts = None
    if last_event:
        last_ts = last_event.timestamp or last_event.received_at

    days_since = _days_since(last_ts)
    needs_water = None
    if days_since is not None and plant.target_interval_days:
        needs_water = days_since >= plant.target_interval_days

    return {
        "id":                   plant.id,
        "name":                 plant.name,
        "location":             plant.location,
        "target_volume_ml":     plant.target_volume_ml,
        "target_interval_days": plant.target_interval_days,
        "notes":                plant.notes,
        "last_watered":         last_ts,
        "days_since_water":     days_since,
        "needs_water":          needs_water,
    }


# ── Sensor pod endpoints (unchanged) ─────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/readings/latest")
def latest_reading(db: Session = Depends(get_db)):
    reading = (
        db.query(SensorReading)
        .order_by(desc(SensorReading.timestamp))
        .first()
    )
    if not reading:
        return {"message": "No readings yet"}
    return reading


@app.get("/readings")
def get_readings(
    device_id: str = "sensor_pod_001",
    limit: int = Query(default=100, le=1000),
    db: Session = Depends(get_db),
):
    return (
        db.query(SensorReading)
        .filter(SensorReading.device_id == device_id)
        .order_by(desc(SensorReading.timestamp))
        .limit(limit)
        .all()
    )


# ── Plant profile endpoints ───────────────────────────────────────────────────

@app.get("/plants")
def list_plants(db: Session = Depends(get_db)):
    """All plants that have a profile. Includes last watering and schedule status."""
    plants = db.query(Plant).order_by(Plant.id).all()
    result = []
    for plant in plants:
        last_event = (
            db.query(WateringEvent)
            .filter(WateringEvent.plant_index == plant.id)
            .order_by(desc(WateringEvent.received_at))
            .first()
        )
        result.append(_plant_summary(plant, last_event))
    return result


@app.get("/plants/{plant_id}")
def get_plant(plant_id: int, db: Session = Depends(get_db)):
    """Single plant profile + last watering status."""
    if plant_id < 1 or plant_id > 20:
        raise HTTPException(status_code=400, detail="plant_id must be 1-20")
    plant = db.query(Plant).filter(Plant.id == plant_id).first()
    if not plant:
        raise HTTPException(status_code=404, detail=f"Plant {plant_id} has no profile yet")
    last_event = (
        db.query(WateringEvent)
        .filter(WateringEvent.plant_index == plant_id)
        .order_by(desc(WateringEvent.received_at))
        .first()
    )
    return _plant_summary(plant, last_event)


@app.put("/plants/{plant_id}")
def upsert_plant(plant_id: int, body: PlantUpdate, db: Session = Depends(get_db)):
    """Create or update a plant profile. Only provided fields are changed."""
    if plant_id < 1 or plant_id > 20:
        raise HTTPException(status_code=400, detail="plant_id must be 1-20")

    plant = db.query(Plant).filter(Plant.id == plant_id).first()
    if plant is None:
        plant = Plant(id=plant_id)
        db.add(plant)

    # Only update fields that were explicitly supplied in the request
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(plant, field, value)
    plant.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(plant)

    last_event = (
        db.query(WateringEvent)
        .filter(WateringEvent.plant_index == plant_id)
        .order_by(desc(WateringEvent.received_at))
        .first()
    )
    return _plant_summary(plant, last_event)


# ── Watering history endpoints ────────────────────────────────────────────────

@app.get("/plants/{plant_id}/waterings")
def plant_waterings(
    plant_id: int,
    limit: int = Query(default=20, le=200),
    db: Session = Depends(get_db),
):
    """Watering history for a single plant (newest first)."""
    if plant_id < 1 or plant_id > 20:
        raise HTTPException(status_code=400, detail="plant_id must be 1-20")
    return (
        db.query(WateringEvent)
        .filter(WateringEvent.plant_index == plant_id)
        .order_by(desc(WateringEvent.received_at))
        .limit(limit)
        .all()
    )


@app.get("/waterings")
def all_waterings(
    limit: int = Query(default=50, le=500),
    db: Session = Depends(get_db),
):
    """All recent watering events across all plants (newest first)."""
    return (
        db.query(WateringEvent)
        .order_by(desc(WateringEvent.received_at))
        .limit(limit)
        .all()
    )
