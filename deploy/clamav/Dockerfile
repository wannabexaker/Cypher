# ClamAV for arm64. The official clamav/clamav image is amd64-only, so we build
# from Debian's clamav-daemon + freshclam packages (multi-arch, incl. arm64).
FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     clamav-daemon clamav-freshclam netcat-openbsd ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Enable clamd over TCP and raise the stream/scan limits so larger audio
# uploads can be scanned (clamd's default StreamMaxLength is only 25M).
RUN for d in TCPSocket TCPAddr StreamMaxLength MaxScanSize MaxFileSize; do \
      sed -i "/^#*$d /d" /etc/clamav/clamd.conf; \
    done \
  && printf 'TCPSocket 3310\nTCPAddr 0.0.0.0\nStreamMaxLength 200M\nMaxScanSize 400M\nMaxFileSize 200M\n' \
     >> /etc/clamav/clamd.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3310
HEALTHCHECK --interval=30s --timeout=10s --start-period=360s --retries=5 \
  CMD echo PING | nc -w 3 127.0.0.1 3310 | grep -q PONG || exit 1
ENTRYPOINT ["/entrypoint.sh"]
