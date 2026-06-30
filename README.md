# Cypher

**Drop your bars. The crowd decides.**

Cypher is a Next.js platform for short-lived online rap/trap competitions. A registered host creates a room, shares its six-character code, accepts artists and judges, moderates tracks, opens W/L voting, and can run leaderboard or single-elimination battle contests.

## Identity model

- **Host:** requires an account using email/password or optional Google OAuth.
- **Guest participant:** enters a display name only. The name is remembered in local browser storage and room identity is held in a signed httpOnly cookie.
- Guests can join, upload when enabled, and vote. They cannot create, own, or become host of a room.
- Email verification and password reset are not part of the current MVP.

## Implemented features

- Reusable channels with public/unlisted visibility and shareable join codes.
- Artist/Judge participation labels, moderators, host transfer, host deletion, and audit views.
- Multiple numbered and concurrent contests inside one channel.
- Private MP3/WAV uploads plus YouTube, Spotify, and SoundCloud embeds.
- Host/moderator review, disqualification, member removal, and signed media playback.
- Immutable W/L votes per identity and vote context, with live W%/L% results and visibility controls.
- Per-track multi-round voting, who-voted views, leaderboard finalization, ties, podiums, and mode standings.
- Single-elimination battle brackets with matchup-scoped votes and deterministic round ordering.
- Host-controlled voting windows, countdowns, in-app events, and optional web push.
- Stats dashboard, retention cleanup, and media-orphan cleanup.

## Security model

- Server-side authorization for every protected channel, contest, upload, moderation, and vote operation.
- Registered or signed guest identity is authoritative; FingerprintJS and IP are supplemental abuse signals.
- IP and fingerprint values are stored only as HMAC-SHA256 hashes.
- Vote uniqueness is enforced by database `UNIQUE` keys and serializable transactions.
- Production uses Upstash Redis sliding windows for login, registration, join, upload, and vote routes.
- Production registration and guest voting require Cloudflare Turnstile; guest voting also requires a FingerprintJS signal.
- Browser uploads receive a presigned PUT only for `media/staging/`. The server promotes bytes to a new `media/final/` key before validation and malware scanning, so replaying the upload URL cannot replace scanned media.
- Production file submission fails closed unless the configured HTTPS scanner returns `clean`.
- Media remains private and is served with short-lived signed GET URLs.

## Stack

| Layer | Technology |
|---|---|
| Application | Next.js 15 App Router, React 19, TypeScript strict |
| UI | Tailwind CSS 4, shadcn/ui, Framer Motion, lucide-react |
| Data | Prisma 6, PostgreSQL 16 |
| Auth | Auth.js v5, Argon2id, Zod |
| Storage | AWS SDK v3, MinIO locally, S3/R2-compatible private storage in production |
| Abuse controls | Cloudflare Turnstile, FingerprintJS, Upstash Redis |
| Notifications | VAPID web push and in-app events |
| Tooling | pnpm 10, Node 22, Vitest, Playwright, GitHub Actions |

## Local setup

Requirements: Node 22, pnpm through Corepack, Docker, and Docker Compose.

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm prisma migrate deploy
pnpm dev
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

Generate a real local auth secret and replace the placeholder in `.env`:

```bash
openssl rand -base64 33
```

The app runs at `http://localhost:3000`. MinIO runs at `http://localhost:9000`; its console runs at `http://localhost:9001`. Docker Compose uses PostgreSQL host port `5432` by default and supports an override through `POSTGRES_PORT`.

## Environment

Local defaults are documented in `.env.example`. Production requires:

- `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`
- the complete private `S3_*` group
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `MALWARE_SCAN_URL`, `MALWARE_SCAN_TOKEN`
- `CRON_SECRET`

Optional integrations:

- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

The malware endpoint receives asset metadata and a short-lived signed private-media URL. It must return HTTP 2xx with `{"verdict":"clean"}` or `{"verdict":"infected"}`. Local development and tests may leave scanner, Turnstile, and Upstash settings empty; production fails closed without them.

## Main routes

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/register`, `/login` | Host accounts |
| `/dashboard` | Host channel list |
| `/dashboard/channels/[id]` | Host management |
| `/c/[code]` | Public room venue |
| `/c/[code]/contest/[id]` | Leaderboard or battle contest |
| `/c/[code]/audit` | Authorized audit view |

API route handlers live under `src/app/api`. The data model is in `prisma/schema.prisma`; committed migrations are in `prisma/migrations`.

## Testing

Prepare an isolated E2E environment:

```bash
cp .env.e2e.example .env.e2e
docker compose up -d
pnpm prisma migrate deploy
pnpm exec playwright install chromium
```

Run the gates:

```bash
pnpm prisma validate
pnpm typecheck
pnpm lint
pnpm test:coverage
pnpm test:playwright
pnpm build
pnpm audit --prod
```

The latest verified local run on 2026-06-30 passed 68 Vitest tests and 11 Playwright API/browser/mobile scenarios. Playwright fixtures clean up their database rows. Failure traces, screenshots, videos, and reports stay under ignored `.artifacts/` paths.

GitHub Actions runs install, Prisma validation, typecheck, lint, coverage, PostgreSQL/MinIO-backed Playwright tests, and the production build on pull requests and pushes to `main`.

## Scheduled maintenance

- `GET /api/cron/purge` at 03:00 UTC removes channels whose retention deadline has passed.
- `GET /api/cron/media-maintenance` at 03:15 UTC removes aged unlinked media rows and DB-less objects.
- Both routes require `Authorization: Bearer <CRON_SECRET>`.

## Repository layout

```text
prisma/                 schema and migrations
public/                 static assets and service worker
src/app/                pages and API route handlers
src/components/         design-system and feature UI
src/lib/                auth, membership, voting, contests, storage, security
tests/unit/              Vitest tests
tests/api/               Playwright API integration tests
tests/e2e/               desktop browser journeys
tests/mobile/            mobile browser journeys
docs/ROADMAP.md          delivered and remaining work
docs/CODEX_TASKS.md      implementation queue
docs/codex/              handoff and delivery history
```

## Current status

The core MVP and post-H23 stability/security work are implemented on the current development line. Production integration and staging verification remain before release. After that, planned product work is Explore, Profiles, Admin, then Realtime.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the exact checklist.
