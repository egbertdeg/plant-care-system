import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from database import engine, get_db, Base
from models import SensorReading
from mqtt_client import create_mqtt_client, start_mqtt

logging.basicConfig(level=logging.INFO)

mqtt_client = create_mqtt_client()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables and start MQTT on startup
    Base.metadata.create_all(bind=engine)
    start_mqtt(mqtt_client)
    yield
    mqtt_client.loop_stop()
    mqtt_client.disconnect()


app = FastAPI(title="Plant Care API", lifespan=lifespan)


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
    readings = (
        db.query(SensorReading)
        .filter(SensorReading.device_id == device_id)
        .order_by(desc(SensorReading.timestamp))
        .limit(limit)
        .all()
    )
    return readings
