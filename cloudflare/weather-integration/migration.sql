-- Run via: wrangler d1 execute plant-care-db --file=migration.sql

CREATE TABLE IF NOT EXISTS weather_daily (
  date         TEXT    PRIMARY KEY,  -- YYYY-MM-DD (local NYC date)
  max_temp_c   REAL,                 -- daily high °C
  min_temp_c   REAL,                 -- daily low °C
  precip_mm    REAL,                 -- total precipitation mm
  humidity_pct INTEGER,              -- mean relative humidity %
  et0_mm       REAL,                 -- reference evapotranspiration mm (FAO-56)
  gdd          REAL,                 -- growing degree days (base 10 °C)
  fetched_at   TEXT DEFAULT (datetime('now'))
);
