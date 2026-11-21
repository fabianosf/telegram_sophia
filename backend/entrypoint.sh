#!/bin/sh
set -e

python - <<'PY'
import os
import time

import psycopg

params = dict(
    host=os.environ.get("POSTGRES_HOST", "db"),
    port=os.environ.get("POSTGRES_PORT", "5432"),
    user=os.environ.get("POSTGRES_USER", "postgres"),
    password=os.environ.get("POSTGRES_PASSWORD", "postgres"),
    dbname=os.environ.get("POSTGRES_DB", "telegram_sophia"),
)
for attempt in range(40):
    try:
        with psycopg.connect(**params):
            print("database is ready", flush=True)
            break
    except Exception as exc:
        print(f"waiting for database ({attempt + 1}/40): {exc}", flush=True)
        time.sleep(1)
else:
    raise SystemExit("database is not ready")
PY

python manage.py migrate --noinput
python manage.py createcachetable sophia_drf_cache 2>/dev/null || true
exec "$@"
