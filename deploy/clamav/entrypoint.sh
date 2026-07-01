#!/bin/sh
set -e

mkdir -p /run/clamav /var/lib/clamav /var/log/clamav
chown -R clamav:clamav /run/clamav /var/lib/clamav /var/log/clamav

# On a fresh volume the signature DB is empty; clamd will not start without it.
# Pull the initial signatures synchronously (a few minutes) before starting clamd.
if [ ! -f /var/lib/clamav/main.cvd ] && [ ! -f /var/lib/clamav/main.cld ]; then
  echo "clamav: downloading initial signatures (this can take a few minutes)..."
  su -s /bin/sh clamav -c "freshclam --stdout" || echo "freshclam initial run non-zero; continuing"
fi

# Background periodic updater, then clamd in the foreground (drops to the
# clamav user via the User directive in clamd.conf).
su -s /bin/sh clamav -c "freshclam -d --stdout" &
exec clamd --foreground
