# Sensor Pod Firmware

Monitors 3 plants with multiple environmental sensors.

## Hardware

- **Board:** Adafruit ESP32-S3 Feather
- **Sensors:**
  - 3× Adafruit STEMMA Soil Sensors (I2C 0x36)
  - 1× SHT40 Temperature & Humidity (I2C 0x44)
  - 1× TSL2591 Light Sensor (I2C 0x29)
  - 1× PCA9546 I2C Multiplexer (address 0x70)

## Wiring

See [../../docs/hardware/sensor-pod-wiring.md](../../docs/hardware/sensor-pod-wiring.md) *(to be created)*

**Quick version:**
```
ESP32-S3 STEMMA QT → PCA9546 Multiplexer
    Mux Channel 0 → Soil Sensor 1 (via adapter)
    Mux Channel 1 → Soil Sensor 2 (via adapter)
    Mux Channel 2 → Soil Sensor 3 (via adapter)
    Mux Channel 3 → SHT40 Temp/Humidity
ESP32-S3 STEMMA QT → TSL2591 Light Sensor
```

## Setup

1. **Configure WiFi credentials:**
   ```bash
   cp include/secrets.h.example include/secrets.h
   # Edit secrets.h with your WiFi SSID and password
   ```

2. **Configure MQTT (optional for now):**
   - Get free account at https://console.hivemq.cloud/
   - Update `secrets.h` with broker credentials

3. **Build and upload:**
   - Open this folder in VS Code
   - Click PlatformIO: Build (✓)
   - Click PlatformIO: Upload (→)
   - Click Serial Monitor (🔌)

## Development Phases

### Phase 1: Basic Testing
- [x] Blink LED test
- [ ] Read ONE soil sensor
- [ ] Print to serial monitor

### Phase 2: I2C Multiplexer
- [ ] Add PCA9546 multiplexer
- [ ] Read all 3 soil sensors
- [ ] Add temp/humidity sensor
- [ ] Add light sensor

### Phase 3: WiFi Connectivity
- [ ] Connect to WiFi
- [ ] Auto-reconnect on disconnect
- [ ] Status LED indicators

### Phase 4: MQTT Integration
- [ ] Connect to MQTT broker
- [ ] Publish sensor readings
- [ ] Topic structure: `plant/sensor_pod_001/{sensor_type}`
- [ ] QoS 1 (at least once delivery)

### Phase 5: Optimization
- [ ] Deep sleep between readings (15 min intervals)
- [ ] Battery monitoring (if unplugged)
- [ ] OTA updates
- [ ] Error handling & recovery

## Serial Output Example

```
=== Sensor Pod Starting ===
WiFi: Connected (192.168.1.42)
MQTT: Connected to broker

--- Reading Sensors ---
Plant 1 - Moisture: 487, Temp: 22.3°C
Plant 2 - Moisture: 512, Temp: 22.1°C
Plant 3 - Moisture: 445, Temp: 22.5°C
Environment - Temp: 22.4°C, Humidity: 45.2%, Light: 234 lux

Publishing to MQTT... OK
Next reading in 15 minutes
```

## Configuration

**config.h** - MQTT topics, I2C addresses, reading intervals
**secrets.h** - WiFi/MQTT credentials (not in git)

## Troubleshooting

**No sensor readings:**
- Check I2C wiring
- Run I2C scanner to verify addresses
- Verify power connections

**WiFi won't connect:**
- Check SSID/password in secrets.h
- Ensure 2.4GHz network (not 5GHz)
- Move closer to router

**MQTT connection fails:**
- Verify broker URL and port
- Check username/password
- Test broker with MQTT.fx client first

## Libraries Used

- `Adafruit_seesaw` - Soil sensors
- `Adafruit_SHT4x` - Temperature/humidity
- `Adafruit_TSL2591` - Light sensor
- `PubSubClient` - MQTT client
- `ArduinoJson` - JSON formatting
