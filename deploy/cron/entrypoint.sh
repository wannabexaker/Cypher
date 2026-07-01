#!/bin/sh
set -eu

: "${CRON_SECRET:?CRON_SECRET is required}"
APP_URL="${APP_URL:-http://app:3000}"

# Same cadence as vercel.json (UTC): purge 03:00, media-maintenance 03:15.
# Output is written to crond's stdout (PID 1) so it shows in `docker logs`.
cat > /etc/crontabs/root <<EOF
0 3 * * * curl -fsS -m 120 -H "Authorization: Bearer ${CRON_SECRET}" ${APP_URL}/api/cron/purge >> /proc/1/fd/1 2>&1
15 3 * * * curl -fsS -m 300 -H "Authorization: Bearer ${CRON_SECRET}" ${APP_URL}/api/cron/media-maintenance >> /proc/1/fd/1 2>&1
EOF

echo "cron installed (UTC) -> purge 03:00, media-maintenance 03:15 @ ${APP_URL}"
exec crond -f -l 8
