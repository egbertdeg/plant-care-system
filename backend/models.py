from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Float, Integer, DateTime, Text, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id:        Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[str]      = mapped_column(String(64), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    light:     Mapped[float]    = mapped_column(Float)
    par:       Mapped[float]    = mapped_column(Float)
    temp:      Mapped[float]    = mapped_column(Float)
    humidity:  Mapped[float]    = mapped_column(Float)
    soil1:     Mapped[int]      = mapped_column(Integer)
    soil2:     Mapped[int]      = mapped_column(Integer)
    soil3:     Mapped[int]      = mapped_column(Integer)


class Plant(Base):
    """User-editable plant profile. id = plant_index on the watering can (1-20)."""
    __tablename__ = "plants"

    id:                   Mapped[int]             = mapped_column(Integer, primary_key=True)  # 1-based, matches device plant_index
    name:                 Mapped[Optional[str]]   = mapped_column(String(128), nullable=True)
    species:              Mapped[Optional[str]]   = mapped_column(String(128), nullable=True)
    location:             Mapped[Optional[str]]   = mapped_column(String(128), nullable=True)
    size_cm:              Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pot_size_l:           Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    soil_sensor:          Mapped[Optional[int]]   = mapped_column(Integer, nullable=True)  # 1, 2, or 3 — which soil channel is in this pot
    target_volume_ml:     Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_interval_days: Mapped[Optional[int]]   = mapped_column(Integer, nullable=True)
    notes:                Mapped[Optional[str]]   = mapped_column(Text, nullable=True)
    updated_at:           Mapped[datetime]        = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class PlantPhoto(Base):
    """Photo attached to a plant profile. Image data stored as binary in the DB."""
    __tablename__ = "plant_photos"

    id:           Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id:     Mapped[int]           = mapped_column(Integer, index=True)
    filename:     Mapped[str]           = mapped_column(String(256))
    content_type: Mapped[str]           = mapped_column(String(64))
    data:         Mapped[bytes]         = mapped_column(LargeBinary)
    caption:      Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    uploaded_at:  Mapped[datetime]      = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class WateringEvent(Base):
    """Recorded watering from the watering can device."""
    __tablename__ = "watering_events"

    id:            Mapped[int]             = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_index:   Mapped[int]             = mapped_column(Integer, index=True)
    device_id:     Mapped[str]             = mapped_column(String(64))
    source:        Mapped[str]             = mapped_column(String(16), default="device")  # "device" or "manual"
    volume_ml:     Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    duration_s:    Mapped[Optional[int]]   = mapped_column(Integer, nullable=True)
    avg_volume_ml: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    timestamp:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    received_at:   Mapped[datetime]        = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
