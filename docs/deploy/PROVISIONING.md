# Production provisioning checklist

What a production deployment needs before it can serve traffic: the services,
every environment variable (the app is **fail-closed** in production, so a
missing one blocks the feature instead of letting it through), and the smoke and
security checks to run afterwards. Contains **no secrets**, only names and
placeholders. Real values live in `.env.production` on the host, never in the
repo.

The step-by-step runbook for the Raspberry Pi is [RPI.md](RPI.md); light mode,
the default on the shared Pi, is [RPI-LIGHT.md](RPI-LIGHT.md). The template for
the env file is `.env.production.example`.

## Services

Everything except Turnstile runs as a container in `docker-compose.prod.yml`.

| Concern | Production | Notes |
|---|---|---|
| Hosting | Docker Compose on a Raspberry Pi, behind a Cloudflare Tunnel | no open ports; admin ports bind to `127.0.0.1` |
| Database | `postgres` (16) | `migrate` applies Prisma migrations on every `up` |
| Object storage | `minio` (the `pgsty/minio` fork) | bucket must stay **private**; the code is also R2-compatible |
| Rate limits | `redis` + `srh` (Upstash-REST shim) | the app talks the Upstash REST protocol |
| Bot / anti-fraud | Cloudflare Turnstile (cloud, free) | widget bound to the production hostname |
| Malware scan | `clamav` + `scanner` (internal TLS) | off in light mode, where file uploads are refused |
| Scheduled jobs | `cron` (busybox crond) | calls `/api/cron/*` with `CRON_SECRET` |
| Web push (optional) | VAPID keypair | disabled when the keys are empty |

## 1. Mandatory in production

| Env var | What / how | If missing in production |
|---|---|---|
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | credentials for the `postgres` container | database does not start |
| `DATABASE_URL` | Postgres URL used by the app at runtime | app cannot read or write |
| `DIRECT_URL` | direct Postgres URL used by migrations (same as `DATABASE_URL` without a pooler) | `migrate` fails |
| `AUTH_SECRET` | `openssl rand -base64 33` | auth broken |
| `AUTH_URL` / `NEXTAUTH_URL` | exact public origin, e.g. `https://cypher.example.com` | login redirect breaks |
| `AUTH_TRUST_HOST` | `true` (behind the tunnel) | Auth.js rejects the callback host |
| `TURNSTILE_SECRET_KEY` | Turnstile secret key | **every first vote and every registration → 403** |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key, baked in at build time | widget cannot issue a token |
| `UPSTASH_REDIS_REST_URL` | `http://srh:80` inside the stack | **all rate-limited routes → 503** |
| `UPSTASH_REDIS_REST_TOKEN` | must equal the `srh` service's `SRH_TOKEN` | (register, login, join, votes, battles, submissions, uploads) |
| `S3_ENDPOINT` | **public** media origin; the browser fetches presigned URLs from it | storage broken |
| `S3_REGION` | e.g. `auto` | " |
| `S3_BUCKET` | **private** bucket name | " |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | MinIO root credentials | " |
| `S3_FORCE_PATH_STYLE` | `true` for MinIO | presigned URLs malformed |
| `MALWARE_SCAN_URL` | `https://scanner:8443` in full mode; empty in light mode | **file submissions → 503** (embeds unaffected); light mode relies on this |
| `MALWARE_SCAN_TOKEN` | must equal the `scanner` service's `SCANNER_TOKEN` | scan reported `unavailable` → 503 |
| `CRON_SECRET` | `openssl rand -hex 32` | **both cron jobs → 401** (never run) |
| `CLOUDFLARE_TUNNEL_TOKEN` | only for the single-box `edge` profile | no public access (on a host with its own `cloudflared`, leave empty) |

> Guest voting also needs the client **FingerprintJS** integration active in the
> production build: in production a guest vote without a fingerprint is
> rejected with **403**.

## 2. Optional

| Env var | What | Default if absent |
|---|---|---|
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google login | credentials-only login. Redirect URI: `{AUTH_URL}/api/auth/callback/google` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | web push | push disabled (opt-in UI hidden). Generate: `corepack pnpm exec web-push generate-vapid-keys`. The public and `NEXT_PUBLIC_` values MUST match |
| `OPS_ALERT_WEBHOOK_URL` | cron `*.failed` / `*.degraded` alerts | no outbound alerts |
| `VOTE_IP_CAP` | per-channel distinct-vote IP cap | `40` |
| `MEDIA_URL_TTL_SECONDS` | signed media GET TTL | `300` |
| `MEDIA_ORPHAN_TTL_HOURS` | orphan cleanup age | `24` |
| `MALWARE_SCAN_TIMEOUT_MS` | scanner timeout | `25000` |

## 3. Order

1. Point the public hostname(s) at the tunnel (see [RPI.md](RPI.md) §2 and the
   ingress comment in `docker-compose.pi.yml`).
2. Create the Turnstile widget for the production hostname → site key + secret key.
3. Copy `.env.production.example` to `.env.production` and fill it in. Generate
   `AUTH_SECRET`, `CRON_SECRET`, the Postgres/MinIO passwords and the internal
   tokens with `openssl rand`.
4. Full mode only: generate the scanner's internal TLS certificate ([RPI.md](RPI.md) §4).
5. Deploy: `scripts/deploy-pi.sh` (light, the default) or `scripts/deploy-pi.sh --full`.
   `migrate` applies every committed migration before `app` starts.
6. The `cron` container schedules both jobs in UTC: `purge` at 03:00 and
   `media-maintenance` at 03:15 (`deploy/cron/entrypoint.sh`).

## 4. Smoke

- `GET /api/health` → `200 { status:"ok", checks:{database:true, storage:true} }`.
- Register a host (Turnstile challenge appears) → dashboard.
- Create and open a room; submit one **embed**. Full mode: also a **file**
  upload, playable only once the scan says `CLEAN`. Light mode: a file
  submission is refused with **503**.
- A guest joins and casts a W and an L (fingerprint + Turnstile enforced; a
  repeat vote is locked).
- Start a leaderboard contest, arm and close its timer, finalize → podium.
- Run one battle contest end to end → champion.
- Call both cron routes with `Authorization: Bearer $CRON_SECRET` → `200`, then
  check the liveness rows:
  `SELECT job, last_status, last_success_at FROM cron_runs;`

## 5. Security gate

- [ ] The bucket is **not** public (`mc anonymous get` → `none`).
- [ ] Secrets live only in `.env.production` on the host; nothing real is committed.
- [ ] `AUTH_URL` and `AUTH_TRUST_HOST` match the real public origin.
- [ ] Stop `srh` once → votes return **503** (fail-closed), then start it again.
- [ ] A vote without a Turnstile token → **403**.
- [ ] Full mode: an EICAR test file → scan `infected` → **422**, never stored or served.
