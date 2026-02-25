"""
Database initialization script.
Safe to run multiple times — all operations are idempotent.

Usage:
    python init_db.py
"""

from database import engine, Base
import models  # noqa: F401 — registers models with Base

# TimescaleDB (add later if migrating to Timescale Cloud):
#
#   from sqlalchemy import text
#   conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"))
#   conn.execute(text("""
#       SELECT create_hypertable(
#           'sensor_readings', 'timestamp', if_not_exists => TRUE
#       );
#   """))


def init():
    print("Creating tables...")
    Base.metadata.create_all(bind=engine, checkfirst=True)
    print("  OK")
    print("\nDatabase initialized successfully.")


if __name__ == "__main__":
    init()
