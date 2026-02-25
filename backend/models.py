from datetime import datetime, timezone
from sqlalchemy import String, Float, Integer, DateTime
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
