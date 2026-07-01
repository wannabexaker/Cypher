# Cypher — Raspberry Pi self-hosted deployment

Runs the whole stack in Docker Compose on a Raspberry Pi (arm64), exposed to the
internet through a **Cloudflare Tunnel** (no port-forwarding, home IP hidden).

**Stack:** `app` (Next.js standalone) · `postgres` · `minio` (private) ·
`redis` + `srh` (Upstash-REST-compatible rate limits) · `clamav` + `scanner`
(malware) · `migrate` (one-shot) · `cron` · `cloudflared`.

## 0. Prerequisites

- **Raspberry Pi 4 or 5, ≥4GB RAM** (ClamAV needs ~1–1.5GB). 64-bit OS
  (Raspberry Pi OS 64-bit or Ubuntu Server arm64).
- Docker Engine + Compose plugin:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"   # re-login after this
  ```
- A **domain on Cloudflare** (free plan is fine). You will use two hostnames:
  - `cypher.example.com` — the app
  - `media.example.com` — MinIO (browser fetches presigned media URLs from here)
- A **Cloudflare Turnstile** widget (free): Dashboard → Turnstile → Add site
  (add `cypher.example.com`) → copy the **site key** + **secret key**.

## 1. Get the code onto the Pi

```bash
git clone https://github.com/wannabexaker/Cypher.git
cd Cypher
cp .env.production.example .env.production
```

## 2. Create the Cloudflare Tunnel

Cloudflare **Zero Trust** dashboard → Networks → **Tunnels** → Create a tunnel
(type *Cloudflared*) → name it `cypher` → **copy the tunnel token**.

Add two **Public Hostnames** to the tunnel:

| Public hostname | Service |
|---|---|
| `cypher.example.com` | `http://app:3000` |
| `media.example.com` | `http://minio:9000` |

> Leave “HTTP Host Header” blank so the original host is preserved (MinIO needs
> `Host: media.example.com` to match presigned signatures). Do **not** expose the
> scanner or the MinIO console.

## 3. Fill `.env.production`

Generate strong secrets:

```bash
openssl rand -base64 33   # AUTH_SECRET
openssl rand -hex 32      # CRON_SECRET
openssl rand -hex 24      # UPSTASH_REDIS_REST_TOKEN (== SRH token)
openssl rand -hex 24      # MALWARE_SCAN_TOKEN
openssl rand -hex 24      # POSTGRES_PASSWORD / S3_SECRET_ACCESS_KEY
```

Edit `.env.production` and set: the two domains (`AUTH_URL`/`NEXTAUTH_URL` =
`https://cypher.example.com`, `S3_ENDPOINT` = `https://media.example.com`), the
Postgres/MinIO passwords (keep them consistent inside `DATABASE_URL`), the
Turnstile keys, and `CLOUDFLARE_TUNNEL_TOKEN`. Keep `MALWARE_SCAN_URL`,
`UPSTASH_REDIS_REST_URL`, and the internal service tokens as templated.

> `.env.production` is gitignored — never commit it.

## 4. Generate the scanner's internal TLS cert

The app requires an **https** scanner URL in production; this keeps the scanner
fully internal (never tunneled) with a self-signed cert the app trusts.

```bash
mkdir -p deploy/scanner/certs
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout deploy/scanner/certs/scanner.key \
  -out    deploy/scanner/certs/scanner.crt \
  -subj "/CN=scanner" -addext "subjectAltName=DNS:scanner"
```

## 5. Build and start

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

- The **first build** compiles Next.js on the Pi — several minutes on a Pi 5,
  longer on a Pi 4. (Alternatively cross-build on a laptop:
  `docker buildx build --platform linux/arm64 -t cypher-app --load .`)
- The **first `clamav` start** downloads virus signatures via freshclam
  (~3–5 min). Uploads fail-closed until it is healthy — that is expected.
- `migrate` runs `prisma migrate deploy` (all 14 migrations) before `app` starts.

Watch it come up:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f app cloudflared
```

## 6. Verify

- `https://cypher.example.com/api/health` → `{"status":"ok","checks":{"database":true,"storage":true}}`.
- Register a host (Turnstile challenge appears) → dashboard → create + open a room.
- Submit a YouTube/Spotify embed (plays) and, once ClamAV is healthy, a file upload (becomes playable only when `CLEAN`).
- Guest joins + casts a W and an L (fingerprint + Turnstile enforced; a repeat is locked).
- Run a leaderboard + a battle contest end-to-end.
- Cron check: `docker compose ... exec cron sh -c 'curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://app:3000/api/cron/media-maintenance'` → 200; confirm a `cron.*.ok` audit row.

## 7. Operations

- **Update / redeploy:** `git pull` then re-run the `up -d --build` command. `migrate` applies any new migrations automatically.
- **Logs:** `docker compose --env-file .env.production -f docker-compose.prod.yml logs -f <service>`.
- **Backups:** the state lives in named volumes `cypher_pg_data` + `cypher_minio_data`. Back them up, e.g.:
  ```bash
  docker run --rm -v cypher_pg_data:/v -v "$PWD":/b alpine tar czf /b/pg-backup.tgz -C /v .
  ```
- **Timezone:** cron runs in **UTC** (matches the original schedule). Adjust the times in `deploy/cron/entrypoint.sh` if you want local-time runs.
- **Large uploads + ClamAV:** clamd's default `StreamMaxLength` is 25MB. For bigger audio files, raise it (and `MaxScanSize`) in the clamav container's `/etc/clamav/clamd.conf` and restart `clamav`; otherwise large files fail-closed (blocked, never served unscanned).

## 8. Security notes

- Only `cloudflared` faces the internet. Postgres (5432) and the MinIO console (9001) bind to `127.0.0.1` for admin; the MinIO S3 API and scanner are reachable only inside the Docker network + tunnel.
- The MinIO bucket is **private** (`anonymous none`); media is served only through short-lived presigned URLs.
- All rate-limit / Turnstile / fingerprint / scanner controls run **fail-closed** in production — a missing or broken dependency blocks the action (503/403) rather than letting it through.
- Consider a Cloudflare **WAF** rule / rate limit in front of `cypher.example.com`, and Cloudflare **Access** on any admin surface you later expose.

## 9. Troubleshooting

- **Media 403 / signature errors:** ensure the tunnel preserves the Host header and `S3_ENDPOINT` host == the media public hostname. If it persists, set `MINIO_SERVER_URL=https://media.example.com` on the `minio` service and restart.
- **Uploads always fail:** ClamAV not healthy yet (`docker compose ... ps`), or `MALWARE_SCAN_URL` not `https://scanner:8443`, or the cert CN/SAN isn't `scanner`.
- **Votes return 503:** the SRH/Redis backend is down, or `UPSTASH_REDIS_REST_TOKEN` ≠ the `srh` `SRH_TOKEN` — they must match.
- **Login redirect loops:** `AUTH_URL`/`NEXTAUTH_URL` must be the exact public origin and `AUTH_TRUST_HOST=true`.
