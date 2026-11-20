#!/bin/sh
# Installs the backup schedule and runs busybox crond in the foreground.
set -eu

: "${PGHOST:?PGHOST is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"

SCHEDULE="${BACKUP_SCHEDULE:-30 3 * * *}"

# crond starts jobs with an empty environment. The password goes to ~/.pgpass
# (0600), never into the crontab; the rest is not secret.
umask 077
escape() { printf '%s' "$1" | sed 's/[\:]/\&/g'; }
printf '%s:5432:%s:%s:%s\n' "$PGHOST" "$(escape "$PGDATABASE")" \
  "$(escape "$PGUSER")" "$(escape "$PGPASSWORD")" > /root/.pgpass

cat > /etc/crontabs/root <<CRONTAB
$SCHEDULE PGHOST=$PGHOST PGDATABASE=$PGDATABASE PGUSER=$PGUSER BACKUP_KEEP_DAILY=${BACKUP_KEEP_DAILY:-14} BACKUP_KEEP_MONTHLY=${BACKUP_KEEP_MONTHLY:-0} BACKUP_OWNER=${BACKUP_OWNER:-} /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1
CRONTAB

echo "backup installed (UTC) -> '$SCHEDULE', keep ${BACKUP_KEEP_DAILY:-14} daily / ${BACKUP_KEEP_MONTHLY:-0} monthly"
exec crond -f -l 8
