import json
import ssl
import logging
import paho.mqtt.client as mqtt
from database import SessionLocal
from models import SensorReading
from config import settings

logger = logging.getLogger(__name__)

TOPIC = "plant/+/sensors"  # subscribes to all device sensor topics


def _device_id_from_topic(topic: str) -> str:
    # "plant/sensor_pod_001/sensors" → "sensor_pod_001"
    parts = topic.split("/")
    return parts[1] if len(parts) >= 2 else "unknown"


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        logger.info("MQTT connected")
        client.subscribe(TOPIC)
        logger.info(f"Subscribed to {TOPIC}")
    else:
        logger.error(f"MQTT connect failed: rc={rc}")


def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload.decode())
        device_id = _device_id_from_topic(msg.topic)

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
            logger.info(f"Saved reading from {device_id}: light={data['light']} soil1={data['soil1']}")
        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to process message: {e}")


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
