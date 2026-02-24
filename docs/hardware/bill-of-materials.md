# Bill of Materials - Plant Care System

**Project:** Smart Plant Monitoring & Watering System
**Date:** February 11, 2026
**Status:** Prototype Phase - Hardware Ordered

---

## System Overview

Two main hardware units:
1. **Sensor Pod** - Monitors 3 plants (moisture, temp, humidity, light)
2. **Watering Can** - Detects watering events, measures volume dispensed

---

## Sensor Pod Hardware

### Microcontroller
| Item | Part # | Qty | Unit Price | Total | Supplier | Status |
|------|--------|-----|------------|-------|----------|--------|
| Adafruit ESP32-S3 Feather (4MB Flash, 2MB PSRAM, STEMMA QT) | 5477 | 1 | $17.50 | $17.50 | Adafruit | ✅ Ordered |

### Sensors
| Item | Part # | Qty | Unit Price | Total | Supplier | Notes |
|------|--------|-----|------------|-------|----------|-------|
| Adafruit STEMMA Soil Sensor (I2C Capacitive) | 4026 | 3 | $7.50 | $22.50 | Adafruit | JST PH connector, I2C address 0x36 |
| Adafruit SHT40 Temperature & Humidity Sensor (STEMMA QT) | 4885 | 1 | $5.95 | $5.95 | Adafruit | I2C address 0x44 |
| Adafruit TSL2591 Light Sensor (STEMMA QT) | 1980 | 1 | $6.95 | $6.95 | Adafruit | I2C address 0x29 |

### Interface Components
| Item | Part # | Qty | Unit Price | Total | Supplier | Notes |
|------|--------|-----|------------|-------|----------|-------|
| Adafruit PCA9546 I2C Multiplexer (STEMMA QT) | 5664 | 1 | $3.95 | $3.95 | Adafruit | Required for 3 soil sensors (same address) |

### Cables & Connectors
| Item | Part # | Qty | Unit Price | Total | Supplier | Notes |
|------|--------|-----|------------|-------|----------|-------|
| STEMMA QT Cable 100mm (JST SH 4-pin) | 4210 | 6 | $0.95 | $5.70 | Adafruit | Internal connections |
| STEMMA QT Cable 400mm (JST SH 4-pin) | 5385 | 4 | $1.50 | $6.00 | Adafruit | To sensors in pots |
| STEMMA to QT Adapter Cable 200mm (JST PH to JST SH) | 4424 | 3 | $0.95 | $2.85 | Adafruit | Soil sensor adapters |

**Sensor Pod Subtotal: $71.40**

---

## Watering Can Hardware

### Microcontroller
| Item | Part # | Qty | Unit Price | Total | Supplier | Status |
|------|--------|-----|------------|-------|----------|--------|
| Adafruit ESP32-S3 Feather (4MB Flash, 2MB PSRAM, STEMMA QT) | 5477 | 1 | $17.50 | $17.50 | Adafruit | ✅ Ordered |

### Sensors
| Item | Part # | Qty | Unit Price | Total | Supplier | Notes |
|------|--------|-----|------------|-------|----------|-------|
| Adafruit LSM6DS3TR-C 6-DoF IMU (STEMMA QT) | 4503 | 1 | $7.95 | $7.95 | Adafruit | Accelerometer + Gyro for tilt detection |
| Adafruit MPRLS Ported Pressure Sensor | 2713 (1528-2713-ND) | 1 | $29.95 | $29.95 | DigiKey | 0-25 PSI, measures water column pressure |

### Display & UI
| Item | Part # | Qty | Unit Price | Total | Supplier | Notes |
|------|--------|-----|------------|-------|----------|-------|
| Adafruit I2C OLED Display (STEMMA QT) | 4440 (1528-4440-ND) | 1 | $12.50 | $12.50 | DigiKey | 128×64 monochrome display |

### Power
| Item | Part # | Qty | Unit Price | Total | Supplier | Notes |
|------|--------|-----|------------|-------|----------|-------|
| Lithium Ion Battery 3.7V 400mAh | 3898 (1528-2731-ND) | 1 | $6.95 | $6.95 | DigiKey | JST connector, rechargeable |

### Cables & Tubing
| Item | Part # | Qty | Unit Price | Total | Supplier | Notes |
|------|--------|-----|------------|-------|----------|-------|
| STEMMA QT Cable 100mm | 4210 | 3 | $0.95 | $2.85 | Adafruit | Sensor connections |
| Silicone Tubing (2-3mm ID) | - | 1-2 ft | ~$5 | $5.00 | Amazon/Hardware | For pressure sensor |

**Watering Can Subtotal: $82.70**

---

## Development Tools & Supplies

### Computer
| Item | Specs | Qty | Price | Supplier | Status |
|------|-------|-----|-------|----------|--------|
| Lenovo ThinkPad T480 (Refurbished) | i7-8550U, 16GB RAM, 512GB SSD | 1 | $269.95 | Back Market | ✅ Ordered |

### Prototyping Supplies (DigiKey Order)
| Item | Part # | Qty | Unit Price | Total | Notes |
|------|--------|-----|------------|-------|-------|
| Breadboard (General Purpose) | 1528-1101-ND | 1 | $3.95 | $3.95 | For prototyping |
| Hook-up Wire 22AWG (6×25ft spools) | 1528-1744-ND | 1 | $19.95 | $19.95 | Various colors |
| Nylon Screws & Standoffs Set | 1528-2528-ND | 1 | $14.95 | $14.95 | White nylon hardware |
| Double-sided Tape (3/4"×1.5") | 1528-5019-ND | 5 | $0.75 | $3.75 | Blue mounting tape |
| STEMMA QT Cable 300mm | 1528-5384-ND | 2 | $1.25 | $2.50 | Extra cables |

### Tools & Equipment
| Item | Part # | Qty | Price | Notes |
|------|--------|-----|-------|-------|
| Ladyada's Electronics Toolkit | 1528-2451-ND | 1 | $100.00 | Soldering iron, multimeter, tools |
| Magnifier Stand (2.5" 4×) | 2144-ND | 1 | $6.95 | For close work |
| Slide Switch SPDT | EG1917-ND | 1 | $0.78 | Power switch |

### Enclosures & Organization
| Item | Part # | Qty | Unit Price | Total | Notes |
|------|--------|-----|------------|-------|-------|
| Clear ABS Case (2.756"×2.362") | 1738-1455-ND | 1 | $4.00 | $4.00 | Transparent enclosure |
| Adjustable Parts Box | 1738-FIT0205-ND | 1 | $2.50 | $2.50 | Component storage |

**Tools & Supplies Subtotal: $159.38**

---

## Optional / Backup Components

### Alternative Sensors (Not Currently Used)
| Item | Part # | Qty | Unit Price | Total | Supplier | Notes |
|------|--------|-----|------------|-------|----------|-------|
| Flow Sensor 0.3-6 LPM | 1597-1615-ND | 1 | $9.50 | $9.50 | DigiKey | Backup for watering can |
| Flow Sensor 1-25 LPM | 1597-1520-ND | 1 | $5.90 | $5.90 | DigiKey | Backup for watering can |
| Adafruit Feather nRF52840 Sense | 1528-4516-ND | 1 | $39.50 | $39.50 | DigiKey | BLE version (not WiFi) |
| NeoPixel LED Module | 1528-1354-ND | 1 | $5.95 | $5.95 | DigiKey | RGB status indicator |

**Optional Subtotal: $60.85**

---

## Component Specifications

### ESP32-S3 Feather [5477]
- **Processor:** Dual-core Xtensa LX7 @ 240MHz
- **Memory:** 4MB Flash, 2MB PSRAM
- **Wireless:** WiFi 802.11b/g/n, Bluetooth 5 (LE)
- **GPIO:** 21 pins available
- **I2C/SPI:** Yes (STEMMA QT connector included)
- **Power:** USB-C, JST battery connector, 3.3V/5V output
- **Built-in:** Red LED (GPIO 13), NeoPixel (GPIO 33)

### Soil Moisture Sensor [4026]
- **Technology:** Capacitive (corrosion-resistant)
- **Interface:** I2C (seesaw chip)
- **I2C Address:** 0x36 (fixed, requires multiplexer for multiples)
- **Output:** Touch reading (0-1023), temperature
- **Connector:** JST PH 2mm 4-pin
- **Power:** 3-5V

### SHT40 Temperature & Humidity [4885]
- **Temperature Range:** -40°C to +125°C (±0.2°C accuracy)
- **Humidity Range:** 0-100% RH (±1.8% accuracy)
- **Interface:** I2C
- **I2C Address:** 0x44 (default)
- **Connector:** STEMMA QT (JST SH)

### TSL2591 Light Sensor [1980]
- **Range:** 188 µlux to 88,000 lux
- **Interface:** I2C
- **I2C Address:** 0x29 (default)
- **Features:** IR blocking, adjustable gain/integration
- **Connector:** STEMMA QT (JST SH)

### PCA9546 I2C Multiplexer [5664]
- **Channels:** 4 independent I2C channels
- **I2C Address:** 0x70 (default, configurable 0x70-0x77)
- **Purpose:** Allow multiple sensors with same address
- **Connector:** STEMMA QT (JST SH)

### LSM6DS3TR-C IMU [4503]
- **Sensors:** 3-axis accelerometer + 3-axis gyroscope
- **Accel Range:** ±2/±4/±8/±16 g
- **Gyro Range:** ±125/±245/±500/±1000/±2000 dps
- **Interface:** I2C or SPI
- **I2C Address:** 0x6A or 0x6B (selectable)
- **Use Case:** Tilt detection for watering can

### MPRLS Pressure Sensor [2713 / 1528-2713-ND]
- **Range:** 0-25 PSI (0-172 kPa)
- **Resolution:** 0.012 PSI
- **Accuracy:** ±0.25 PSI full scale
- **Interface:** I2C
- **I2C Address:** 0x18 (default)
- **Port:** 2mm barbed fitting for tubing
- **Use Case:** Measure water column pressure (volume)

---

## System Architecture

### Sensor Pod Configuration
```
ESP32-S3 Feather
    │
    ├── STEMMA QT → PCA9546 Multiplexer
    │                   ├─ Channel 0 → Soil Sensor 1 (via adapter cable)
    │                   ├─ Channel 1 → Soil Sensor 2 (via adapter cable)
    │                   ├─ Channel 2 → Soil Sensor 3 (via adapter cable)
    │                   └─ Channel 3 → SHT40 Temp/Humidity
    │
    └── STEMMA QT → TSL2591 Light Sensor

Power: USB-C (5V wall adapter, always plugged in)
Communication: WiFi → MQTT → Cloud
Reading Interval: Every 15 minutes
```

### Watering Can Configuration
```
ESP32-S3 Feather
    │
    ├── STEMMA QT → LSM6DS3 IMU (tilt detection)
    ├── STEMMA QT → MPRLS Pressure Sensor
    │                   └─ Silicone tube → Water reservoir
    ├── STEMMA QT → OLED Display (status/volume)
    └── JST → 400mAh LiPo Battery

Power: Rechargeable battery (charge via USB-C)
Communication: WiFi → MQTT → Cloud
Operation: Event-based (detects tilt, measures volume, logs)
```

---

## I2C Address Map

### Sensor Pod
| Device | Address | Channel | Notes |
|--------|---------|---------|-------|
| PCA9546 Multiplexer | 0x70 | Main bus | Controls 4 channels |
| Soil Sensor 1 | 0x36 | Mux Ch 0 | Via multiplexer |
| Soil Sensor 2 | 0x36 | Mux Ch 1 | Via multiplexer |
| Soil Sensor 3 | 0x36 | Mux Ch 2 | Via multiplexer |
| SHT40 Temp/Humidity | 0x44 | Mux Ch 3 | Via multiplexer |
| TSL2591 Light | 0x29 | Main bus | Direct connection |

### Watering Can
| Device | Address | Notes |
|--------|---------|-------|
| LSM6DS3 IMU | 0x6A | Default address |
| MPRLS Pressure | 0x18 | Default address |
| OLED Display | 0x3C | Default for SSD1306 |

---

## Cable Requirements Summary

### STEMMA QT (JST SH 4-pin)
- 100mm cables: 9× (internal connections)
- 300mm cables: 2× (medium runs)
- 400mm cables: 4× (sensor pod to plants)

### STEMMA to QT Adapters (JST PH → JST SH)
- 200mm adapter cables: 3× (soil sensors)

### Other
- Silicone tubing (2-3mm ID): 1-2 feet (pressure sensor)
- USB-C cables: 2× (ESP32 programming/charging)

---

## Power Budget

### Sensor Pod (Always Plugged In)
| Component | Current (Active) | Current (Sleep) | Notes |
|-----------|------------------|-----------------|-------|
| ESP32-S3 | ~200mA (WiFi TX) | ~10µA (deep sleep) | Main controller |
| Soil Sensors (3×) | ~15mA total | 30µA total | Seesaw chips |
| SHT40 | ~0.6mA | <0.15µA | Low power |
| TSL2591 | ~2mA | ~2µA | Can disable between reads |
| PCA9546 | ~1mA | ~1µA | Multiplexer |
| **Total Active** | **~220mA** | - | During reading/transmit |
| **Total Sleep** | - | **~50µA** | Between readings (future) |

**Power Source:** USB 5V wall adapter (≥500mA)
**Future:** Could run on battery with deep sleep (months of life)

### Watering Can (Battery Powered)
| Component | Current (Active) | Current (Idle) | Notes |
|-----------|------------------|----------------|-------|
| ESP32-S3 | ~200mA (WiFi) | ~10µA (sleep) | Main controller |
| LSM6DS3 IMU | ~0.9mA | ~6µA | Always monitoring tilt |
| MPRLS Pressure | ~1mA | <1µA | Read when pouring |
| OLED Display | ~20mA | 0mA (off) | On during use |
| **Active (Pouring)** | **~220mA** | - | WiFi + all sensors |
| **Idle (Monitoring)** | **~1mA** | - | Just IMU active |
| **Deep Sleep** | - | **~20µA** | Between uses |

**Battery:** 400mAh LiPo
**Estimated Runtime:**
- Active use (10 min/day): ~5-7 days
- Mostly idle: 2-3 weeks
- Deep sleep mode: 1-2 months

---

## Cost Summary

| Category | Subtotal |
|----------|----------|
| Sensor Pod Components | $71.40 |
| Watering Can Components | $82.70 |
| Development Tools & Supplies | $159.38 |
| Computer (Laptop) | $269.95 |
| Optional/Backup Items | $60.85 |
| **Total Hardware Investment** | **$644.28** |

**Additional needed:**
- Silicone tubing: ~$5 (local hardware/Amazon)
- **Grand Total: ~$650**

---

## Supplier Order Summary

### Adafruit (2 orders)
- **Order 1 (Sensor Pod):** $68.55 + shipping
- **Order 2 (Watering Can):** $33.15 + shipping
- **Total:** ~$110

### DigiKey
- **Order:** $303.75 (includes shipping + tax)

### Back Market
- **Laptop:** $269.95 (includes shipping, no tax)

### Still to Purchase
- Silicone tubing: ~$5 (Amazon or hardware store)

---

## Delivery Status

| Supplier | Order Date | Est. Delivery | Status |
|----------|------------|---------------|--------|
| Back Market | Feb 2026 | Feb 18-23 | ✅ Ordered |
| Adafruit #1 | Earlier | Feb 17-20 | ✅ Ordered |
| Adafruit #2 | Feb 11, 2026 | Feb 19-21 | ✅ Ordered |
| DigiKey | Feb 11, 2026 | Feb 15-18 | ✅ Ordered |

**Expected:** All parts arrive mid-to-late February 2026

---

## Next Steps

1. **Wait for deliveries** (all arriving ~Feb 15-23)
2. **Laptop setup** (VS Code, PlatformIO, Git, drivers)
3. **Test blink program** on ESP32-S3
4. **Build sensor pod** (wire sensors, read values)
5. **Build watering can** (tilt + pressure + display)
6. **Cloud connectivity** (WiFi, MQTT, data logging)
7. **Mobile app** (view data, control system)

---

## References

- [Adafruit ESP32-S3 Feather Guide](https://learn.adafruit.com/adafruit-esp32-s3-feather)
- [STEMMA Soil Sensor Guide](https://learn.adafruit.com/adafruit-stemma-soil-sensor)
- [SHT40 Datasheet](https://cdn-learn.adafruit.com/assets/assets/000/116/607/original/Sensirion_SHT4x_Datasheet.pdf)
- [TSL2591 Datasheet](https://cdn-learn.adafruit.com/assets/assets/000/078/658/original/TSL2591_DS000338_6-00.pdf)
- [LSM6DS3 Datasheet](https://www.st.com/resource/en/datasheet/lsm6ds3tr-c.pdf)
- [MPRLS Datasheet](https://sensing.honeywell.com/mpr-series-datasheet-32332628.pdf)

---

**Last Updated:** February 11, 2026
**Maintained by:** Egbert de Groot
**Project Status:** Prototype Development
