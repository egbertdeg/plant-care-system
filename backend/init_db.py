"""
Database initialization script.
Safe to run multiple times — all operations are idempotent.

Usage:
    python init_db.py

Requires TimescaleDB extension to be installed on the PostgreSQL server.
Railway TimescaleDB: add the TimescaleDB plugin to your Railway project.
"""

from sqlalchemy import text
from database import engine, Base
import models  # noqa: F401 — registers models with Base


def init():
    with engine.connect() as conn:

        # 1. Enable TimescaleDB extension
        print("Enabling TimescaleDB extension...")
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"))
        conn.commit()
        print("  OK")

        # 2. Create tables
        print("Creating tables...")
        Base.metadata.create_all(bind=engine, checkfirst=True)
        print("  OK")

        # 3. Convert sensor_readings to a hypertable (time-partitioned)
        #    if_not_exists => TRUE makes this safe to re-run
        print("Creating hypertable for sensor_readings...")
        conn.execute(text("""
            SELECT create_hypertable(
                'sensor_readings',
                'timestamp',
                if_not_exists => TRUE
            );
        """))
        conn.commit()
        print("  OK")

    print("\nDatabase initialized successfully.")


if __name__ == "__main__":
    init()
