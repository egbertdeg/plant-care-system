import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import FastAPI, Depends, Query, HTTPException, UploadFile, File, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, text

from database import engine, get_db, Base
from models import SensorReading, Plant, PlantPhoto, WateringEvent
from mqtt_client import create_mqtt_client, start_mqtt

logging.basicConfig(level=logging.INFO)

mqtt_client = create_mqtt_client()


def _run_migrations():
    """Idempotent column additions for schema changes on existing tables."""
    with engine.connect() as conn:
        migrations = [
            "ALTER TABLE plants ADD COLUMN IF NOT EXISTS soil_sensor INTEGER",
            "ALTER TABLE plants ADD COLUMN IF NOT EXISTS species VARCHAR(128)",
            "ALTER TABLE plants ADD COLUMN IF NOT EXISTS size_cm FLOAT",
            "ALTER TABLE plants ADD COLUMN IF NOT EXISTS pot_size_l FLOAT",
            "ALTER TABLE plant_photos ADD COLUMN IF NOT EXISTS caption VARCHAR(256)",
            "ALTER TABLE watering_events ADD COLUMN IF NOT EXISTS source VARCHAR(16) DEFAULT 'device'",
        ]
        for sql in migrations:
            try:
                conn.execute(text(sql))
            except Exception as e:
                logging.warning(f"Migration skipped ({sql[:50]}...): {e}")
        conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)  # creates any new tables on startup
    _run_migrations()                       # adds new columns to existing tables
    start_mqtt(mqtt_client)
    yield
    mqtt_client.loop_stop()
    mqtt_client.disconnect()


app = FastAPI(title="Plant Care API", version="2.1", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class PlantUpdate(BaseModel):
    name:                 Optional[str]   = None
    species:              Optional[str]   = None
    location:             Optional[str]   = None
    size_cm:              Optional[float] = None
    pot_size_l:           Optional[float] = None
    soil_sensor:          Optional[int]   = None  # 1, 2, or 3
    target_volume_ml:     Optional[float] = None
    target_interval_days: Optional[int]   = None
    notes:                Optional[str]   = None


class ManualWatering(BaseModel):
    volume_ml:  Optional[float] = None
    notes:      Optional[str]   = None


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
        "species":              plant.species,
        "location":             plant.location,
        "size_cm":              plant.size_cm,
        "pot_size_l":           plant.pot_size_l,
        "soil_sensor":          plant.soil_sensor,
        "target_volume_ml":     plant.target_volume_ml,
        "target_interval_days": plant.target_interval_days,
        "notes":                plant.notes,
        "last_watered":         last_ts,
        "days_since_water":     days_since,
        "needs_water":          needs_water,
    }


# ── Sensor pod endpoints ──────────────────────────────────────────────────────

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


MERGE_WINDOW_HOURS = 6   # pours within this window are merged into one watering event


@app.post("/plants/{plant_id}/waterings", status_code=201)
def log_manual_watering(plant_id: int, body: ManualWatering, db: Session = Depends(get_db)):
    """Manually log a watering. Multiple logs within 6 hours are merged into one event."""
    if plant_id < 1 or plant_id > 20:
        raise HTTPException(status_code=400, detail="plant_id must be 1-20")
    if not db.query(Plant).filter(Plant.id == plant_id).first():
        raise HTTPException(status_code=404, detail=f"Plant {plant_id} has no profile yet")

    now    = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=MERGE_WINDOW_HOURS)
    existing = (
        db.query(WateringEvent)
        .filter(
            WateringEvent.plant_index == plant_id,
            WateringEvent.received_at >= cutoff,
        )
        .order_by(desc(WateringEvent.received_at))
        .first()
    )

    if existing:
        if body.volume_ml is not None:
            existing.volume_ml = (existing.volume_ml or 0) + body.volume_ml
        existing.timestamp   = now
        existing.received_at = now
        db.commit()
        db.refresh(existing)
        return existing

    event = WateringEvent(
        plant_index=plant_id,
        device_id="manual",
        source="manual",
        volume_ml=body.volume_ml,
        timestamp=now,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


# ── Plant photo endpoints ─────────────────────────────────────────────────────

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@app.post("/plants/{plant_id}/photos", status_code=201)
async def upload_photo(
    plant_id: int,
    file: UploadFile = File(...),
    caption: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Upload a photo for a plant. Accepts JPEG, PNG, WebP, GIF."""
    if plant_id < 1 or plant_id > 20:
        raise HTTPException(status_code=400, detail="plant_id must be 1-20")
    if not db.query(Plant).filter(Plant.id == plant_id).first():
        raise HTTPException(status_code=404, detail=f"Plant {plant_id} has no profile yet")
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {file.content_type}")

    data = await file.read()
    photo = PlantPhoto(
        plant_id=plant_id,
        filename=file.filename,
        content_type=file.content_type,
        data=data,
        caption=caption,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return {
        "id":           photo.id,
        "plant_id":     photo.plant_id,
        "filename":     photo.filename,
        "content_type": photo.content_type,
        "caption":      photo.caption,
        "uploaded_at":  photo.uploaded_at,
    }


@app.get("/plants/{plant_id}/photos")
def list_photos(plant_id: int, db: Session = Depends(get_db)):
    """List photo metadata for a plant (no image data)."""
    if plant_id < 1 or plant_id > 20:
        raise HTTPException(status_code=400, detail="plant_id must be 1-20")
    photos = (
        db.query(PlantPhoto)
        .filter(PlantPhoto.plant_id == plant_id)
        .order_by(PlantPhoto.uploaded_at)
        .all()
    )
    return [
        {
            "id":           p.id,
            "plant_id":     p.plant_id,
            "filename":     p.filename,
            "content_type": p.content_type,
            "caption":      p.caption,
            "uploaded_at":  p.uploaded_at,
        }
        for p in photos
    ]


@app.get("/plants/{plant_id}/photos/{photo_id}")
def get_photo(plant_id: int, photo_id: int, db: Session = Depends(get_db)):
    """Download a photo (returns raw image bytes with correct content-type)."""
    photo = (
        db.query(PlantPhoto)
        .filter(PlantPhoto.id == photo_id, PlantPhoto.plant_id == plant_id)
        .first()
    )
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    return Response(content=photo.data, media_type=photo.content_type)


@app.delete("/plants/{plant_id}/photos/{photo_id}", status_code=204)
def delete_photo(plant_id: int, photo_id: int, db: Session = Depends(get_db)):
    """Delete a photo."""
    photo = (
        db.query(PlantPhoto)
        .filter(PlantPhoto.id == photo_id, PlantPhoto.plant_id == plant_id)
        .first()
    )
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    db.delete(photo)
    db.commit()


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
