# Internal malware-scan wrapper. Talks to clamd over TCP (no clamav binaries
# needed here) and serves HTTPS with the mounted self-signed cert.
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server.mjs ./
EXPOSE 8443
CMD ["node", "server.mjs"]
