#!/bin/sh
# Back up Cypher: a database dump and a copy of the MinIO volume, into
#   /backups/daily/cypher-db-YYYY-MM-DD.sql.gz
#   /backups/daily/cypher-media-YYYY-MM-DD.tar.gz
# On the 1st of the month the pair is also kept under /backups/monthly when
# BACKUP_KEEP_MONTHLY > 0. Retention counts files, newest first:
# BACKUP_KEEP_DAILY (default 14) and BACKUP_KEEP_MONTHLY (default 0).
#
# Runs nightly from crond in the `backup` container; run it by hand with
#   docker compose ... exec backup backup.sh
# Restore steps: docs/deploy/RPI.md, "Backups".
set -eu
umask 077

ROOT=/backups
KEEP_DAILY="${BACKUP_KEEP_DAILY:-14}"
KEEP_MONTHLY="${BACKUP_KEEP_MONTHLY:-0}"
DAY=$(date -u +%Y-%m-%d)
TMP="$ROOT/.tmp-$DAY"

mkdir -p "$ROOT/daily" "$ROOT/monthly"
# Leftovers of a failed run never look like a finished backup.
rm -rf "$ROOT"/.tmp-*
mkdir -p "$TMP"

# --clean --if-exists: the dump drops and recreates every object, so it can be
# restored over the live database as well as into an empty one.
pg_dump --clean --if-exists --no-owner --no-privileges --file "$TMP/db.sql"
gzip -9 "$TMP/db.sql"

# The whole MinIO data directory, bucket metadata (.minio.sys) included, so a
# restore is "stop minio, unpack into the volume, start minio".
tar -czf "$TMP/media.tar.gz" -C /minio .

DB="$ROOT/daily/cypher-db-$DAY.sql.gz"
MEDIA="$ROOT/daily/cypher-media-$DAY.tar.gz"
mv -f "$TMP/db.sql.gz" "$DB"
mv -f "$TMP/media.tar.gz" "$MEDIA"
rmdir "$TMP"

if [ "$KEEP_MONTHLY" -gt 0 ] && [ "$(date -u +%d)" = "01" ]; then
  # Hard links: no extra space, and pruning the daily copy keeps this one.
  for f in "$DB" "$MEDIA"; do
    ln -f "$f" "$ROOT/monthly/" 2>/dev/null || cp -f "$f" "$ROOT/monthly/"
  done
fi

# Keep the newest N of each kind. The date in the name sorts chronologically.
prune() {
  dir=$1
  kind=$2
  keep=$3
  find "$dir" -maxdepth 1 -type f -name "cypher-$kind-*" | sort -r |
    tail -n +"$((keep + 1))" | while read -r old; do
      rm -f "$old"
    done
}
prune "$ROOT/daily" db "$KEEP_DAILY"
prune "$ROOT/daily" media "$KEEP_DAILY"
prune "$ROOT/monthly" db "$KEEP_MONTHLY"
prune "$ROOT/monthly" media "$KEEP_MONTHLY"

date -u +%Y-%m-%dT%H:%M:%SZ > "$ROOT/LAST_OK"

if [ -n "${BACKUP_OWNER:-}" ]; then
  chown -R "$BACKUP_OWNER" "$ROOT"
fi

echo "backup ok $DAY: db $(du -h "$DB" | cut -f1), media $(du -h "$MEDIA" | cut -f1)"
