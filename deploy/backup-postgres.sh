#!/bin/sh
set -eu

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="/backups/telegram_sophia-${STAMP}.sql.gz"

pg_dump | gzip > "$FILE"
echo "backup written to $FILE"

RETENTION="${BACKUP_RETENTION_DAYS:-7}"
find /backups -name 'telegram_sophia-*.sql.gz' -mtime +"$RETENTION" -delete 2>/dev/null || true