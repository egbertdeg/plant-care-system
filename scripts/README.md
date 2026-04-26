# Utility Scripts

## Available

### `cleanup-test-notes.mjs`
Strips test sensor/general note lines from all plants' notes field in production.
Calls the live REST API — run from repo root:
```bash
node scripts/cleanup-test-notes.mjs
```
Removes lines matching `[YYYY-MM-DD] Sensor:`, `[YYYY-MM-DD] General:`, and bare `test note` lines.
Already run against production (April 2026). Safe to re-run — idempotent.

## Planned / future
- `flash_firmware.sh` — flash firmware to multiple ESP32 boards
- `backup_database.sh` — backup production D1 database
