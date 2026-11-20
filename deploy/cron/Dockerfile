# Minimal scheduler for the self-hosted stack: curls the app's /api/cron/*
# endpoints with the CRON_SECRET bearer. The schedule is in entrypoint.sh.
FROM alpine:3.20
RUN apk add --no-cache curl tzdata
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
