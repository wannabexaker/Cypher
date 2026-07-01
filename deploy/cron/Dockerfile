# Minimal scheduler that replaces Vercel Cron: curls the app's /api/cron/*
# endpoints with the CRON_SECRET bearer on the same schedule as vercel.json.
FROM alpine:3.20
RUN apk add --no-cache curl tzdata
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
