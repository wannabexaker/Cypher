# R02 — Production provisioning & deploy checklist

Owner-driven: you create the accounts and paste the secrets. This lists exactly
what to provision, why each is mandatory (the app is **fail-closed** in
production), and the deploy + smoke steps. Contains **no secrets** — only names,
placeholders, and provider guidance. Real values go in the host's env store, never
in the repo (`.env` stays local + gitignored).

## Provider targets (recommended)

| Concern | Recommended | Notes |
|---|---|---|
| Hosting | **Vercel** | `vercel.json` already declares the two cron jobs |
| Database | Managed **Postgres** (Neon / Supabase / RDS) | needs a pooled URL + a direct URL |
| Object storage | **Cloudflare R2** (S3-compatible) | bucket must be **PRIVATE** |
| Rate limits | **Upstash Redis** (REST) | sliding-window limiter |
| Bot / anti-fraud | **Cloudflare Turnstile** | bound to the prod domain |
| Malware scan | HTTPS scanner returning `{"verdict":"clean"|"infected"}` | bearer-token protected |
| Web push (optional) | VAPID keypair | disable by leaving keys empty |

## 1. MANDATORY in production — app breaks fail-closed without these

| Env var | What / how | If missing in prod |
|---|---|---|
| `DATABASE_URL` | pooled Postgres URL (app runtime) | app can't read/write |
| `DIRECT_URL` | direct (non-pooled) Postgres URL, for migrations | `migrate deploy` fails |
| `AUTH_SECRET` | `openssl rand -base64 33` | auth broken |
| `AUTH_URL` | canonical prod URL, e.g. `https://cypher.example.com` | login redirect breaks |
| `AUTH_TRUST_HOST` | `true` (behind Vercel/proxy) | Auth.js rejects the callback host |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret | **every first vote + register → 403** |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key (client widget) | widget can't issue a token |
| `UPSTASH_REDIS_REST_URL` | Upstash REST URL | **all rate-limited routes → 503** |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token | (register/join/votes/battles/submissions/uploads) |
| `S3_ENDPOINT` | R2 S3 endpoint | storage broken |
| `S3_REGION` | e.g. `auto` | " |
| `S3_BUCKET` | **private** bucket name | " |
| `S3_ACCESS_KEY_ID` | R2 access key | " |
| `S3_SECRET_ACCESS_KEY` | R2 secret | " |
| `S3_FORCE_PATH_STYLE` | `false` for R2 (virtual-hosted) | signed URLs malformed |
| `MALWARE_SCAN_URL` | HTTPS scanner endpoint | uploaded FILE media never becomes `CLEAN` → playback **423** (embeds unaffected) |
| `MALWARE_SCAN_TOKEN` | scanner bearer token | scan reported `unavailable` |
| `CRON_SECRET` | `openssl rand -hex 32` | **both cron jobs → 401** (never run) |

> Guest voting also needs the client **FingerprintJS** integration active in the
> prod build — in production a guest vote with no fingerprint is rejected **403**.

## 2. Optional / recommended

| Env var | What | Default if absent |
|---|---|---|
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google login | credentials-only login. Redirect URI: `{AUTH_URL}/api/auth/callback/google` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | web push | push disabled (opt-in UI hidden). Generate: `corepack pnpm exec web-push generate-vapid-keys`. The public + `NEXT_PUBLIC_` values MUST match |
| `OPS_ALERT_WEBHOOK_URL` | cron `*.failed`/`*.degraded` alerts (R04) | no outbound alerts |
| `VOTE_IP_CAP` | per-channel distinct-vote IP cap | `40` |
| `MEDIA_URL_TTL_SECONDS` | signed media GET TTL | `300` |
| `MEDIA_ORPHAN_TTL_HOURS` | orphan cleanup age | `24` |
| `MALWARE_SCAN_TIMEOUT_MS` | scanner timeout | `25000` |

## 3. Provisioning order

1. Postgres → copy pooled `DATABASE_URL` + direct `DIRECT_URL`.
2. R2 bucket (PRIVATE, block all public access) + scoped API token → the five `S3_*` values.
3. Upstash Redis DB → REST URL + token.
4. Turnstile site (add the prod domain) → site key + secret key.
5. Stand up the malware scanner (HTTPS + bearer) → URL + token.
6. Generate `AUTH_SECRET`, `CRON_SECRET`, and (optional) VAPID keys.
7. (optional) Google OAuth app → client id/secret, register the prod redirect URI.
8. Paste **all** of the above into the Vercel project env (Production scope). Do not commit real values.

## 4. Schema + deploy

1. `corepack pnpm prisma migrate deploy` against `DIRECT_URL` — applies all **14** migrations to the fresh DB.
2. Deploy to Vercel; confirm the build passes and the CI gates are green.
3. Confirm Vercel Cron registered both jobs: `purge` at `0 3 * * *`, `media-maintenance` at `15 3 * * *` (UTC). Vercel automatically sends `Authorization: Bearer $CRON_SECRET`.

## 5. Smoke (R03 — do on staging first, prod-like services)

- `GET /api/health` → `200 { status:"ok", checks:{database:true, storage:true} }`.
- Register a host (Turnstile challenge appears) → dashboard.
- Create + open a room; submit one **embed** and one **file** upload (scanner runs; file becomes playable only when `CLEAN`).
- Guest joins + casts a W and an L (fingerprint + Turnstile enforced; dedupe locks a repeat).
- Start a leaderboard contest, arm/close its timer, finalize → podium/medals.
- Run one battle contest end-to-end → champion.
- Manually hit both crons with `Authorization: Bearer $CRON_SECRET` → `200`; confirm `cron.*.ok` audit rows (R04 verification).

## 6. Security gate before go-live

- [ ] R2 bucket is **not** public.
- [ ] All secrets live only in the host env store; nothing real committed; `.env` gitignored.
- [ ] `AUTH_URL` + `AUTH_TRUST_HOST` set to the real prod origin (login redirect).
- [ ] Deliberately break Upstash once → votes return **503** (confirms fail-closed), then restore.
- [ ] A vote without a Turnstile token → **403** (confirms enforcement).
- [ ] An infected test file → scan `infected` → media **410** and never served.
