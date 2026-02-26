import json
import ssl
import logging
from datetime import datetime, timezone, timedelta
import paho.mqtt.client as mqtt
from sqlalchemy import desc
from database import SessionLocal
from models import SensorReading, WateringEvent
from config import settings

logger = logging.getLogger(__name__)

TOPIC_SENSORS      = "plant/+/sensors"
TOPIC_EVENTS       = "plant/+/event"
MERGE_WINDOW_HOURS = 6   # pours within this window are merged into one watering event


def _device_id_from_topic(topic: str) -> str:
    parts = topic.split("/")
    return parts[1] if len(parts) >= 2 else "unknown"


def _handle_sensor(topic: str, data: dict):
    device_id = _device_id_from_topic(topic)
    reading = SensorReading(
        device_id=device_id,
        light=data["light"],
        par=data["par"],
        temp=data["temp"],
        humidity=data["humidity"],
        soil1=data["soil1"],
        soil2=data["soil2"],
        soil3=data["soil3"],
    )
    db = SessionLocal()
    try:
        db.add(reading)
        db.commit()
        logger.info(f"Sensor reading saved from {device_id}: light={data['light']} soil1={data['soil1']}")
    finally:
        db.close()


def _handle_watering_event(topic: str, data: dict):
    device_id   = _device_id_from_topic(topic)
    plant_index = data.get("plant_index")
    if not plant_index:
        logger.warning(f"Watering event missing plant_index: {data}")
        return

    # Parse device timestamp (Unix epoch) if provided
    ts = None
    if "timestamp" in data and data["timestamp"]:
        try:
            ts = datetime.fromtimestamp(data["timestamp"], tz=timezone.utc)
        except Exception:
            pass

    db = SessionLocal()
    try:
        # Merge into an existing event if one exists within the window
        cutoff   = datetime.now(timezone.utc) - timedelta(hours=MERGE_WINDOW_HOURS)
        existing = (
            db.query(WateringEvent)
            .filter(
                WateringEvent.plant_index == plant_index,
                WateringEvent.received_at >= cutoff,
            )
            .order_by(desc(WateringEvent.received_at))
            .first()
        )

        if existing:
            if data.get("volume_ml") is not None:
                existing.volume_ml = (existing.volume_ml or 0) + data["volume_ml"]
            if data.get("duration_s") is not None:
                existing.duration_s = (existing.duration_s or 0) + data["duration_s"]
            if ts:
                existing.timestamp = ts   # keep latest device timestamp
            if data.get("avg_volume_ml") is not None:
                existing.avg_volume_ml = data["avg_volume_ml"]
            existing.received_at = datetime.now(timezone.utc)
            db.commit()
            logger.info(
                f"Merged watering event: plant={plant_index} device={device_id} "
                f"total_volume={existing.volume_ml} ml"
            )
        else:
            event = WateringEvent(
                plant_index=plant_index,
                device_id=device_id,
                source="device",
                volume_ml=data.get("volume_ml"),
                duration_s=data.get("duration_s"),
                avg_volume_ml=data.get("avg_volume_ml"),
                timestamp=ts,
            )
            db.add(event)
            db.commit()
            logger.info(
                f"Watering event saved: plant={plant_index} device={device_id} "
                f"volume={data.get('volume_ml')} ml duration={data.get('duration_s')} s"
            )
    finally:
        db.close()


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        logger.info("MQTT connected")
        client.subscribe(TOPIC_SENSORS)
        client.subscribe(TOPIC_EVENTS)
        logger.info(f"Subscribed to {TOPIC_SENSORS} and {TOPIC_EVENTS}")
    else:
        logger.error(f"MQTT connect failed: rc={rc}")


def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload.decode())
        if msg.topic.endswith("/event"):
            _handle_watering_event(msg.topic, data)
        elif msg.topic.endswith("/sensors"):
            _handle_sensor(msg.topic, data)
        else:
            logger.debug(f"Unhandled topic: {msg.topic}")
    except Exception as e:
        logger.error(f"Failed to process message on {msg.topic}: {e}")


def create_mqtt_client() -> mqtt.Client:
    client = mqtt.Client(client_id="plant_backend", protocol=mqtt.MQTTv311)
    client.username_pw_set(settings.mqtt_user, settings.mqtt_password)
    client.tls_set(cert_reqs=ssl.CERT_NONE)
    client.tls_insecure_set(True)
    client.on_connect = on_connect
    client.on_message = on_message
    return client


def start_mqtt(client: mqtt.Client):
    client.connect(settings.mqtt_broker, settings.mqtt_port, keepalive=60)
    client.loop_start()
