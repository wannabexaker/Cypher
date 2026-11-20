# Nightly backup for the self-hosted stack: a database dump plus a copy of the
# MinIO volume. Same Postgres major as the `postgres` service, so pg_dump
# matches the server. busybox crond comes with the Alpine base.
FROM postgres:16-alpine
COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /usr/local/bin/backup.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
