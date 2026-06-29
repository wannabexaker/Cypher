# Cypher

Online rap/trap music competitions and battles where the crowd decides the winner

## Overview

Cypher runs music competitions as rooms ("channels"). A host opens a channel and shares a join code; artists drop tracks, the crowd votes win/loss on each track, and the host either crowns the highest-rated track or runs a single-elimination battle bracket to a champion. Voting is open to guests, so the vote path is built around anti-fraud (signed membership identity, hashed IP and fingerprint signals, a database-enforced dedupe key, a per-IP cap, and optional captcha) rather than requiring accounts. PostgreSQL is the source of truth for votes; object storage holds the audio.

## Features

- Channels with shareable six-character join codes; join as a registered user or a guest (name only, via a signed httpOnly cookie)
- Participation roles per channel: Artist (submits a track), Judge (votes), plus host-granted Moderators
- Audio submissions by presigned upload (MP3/WAV, verified by magic bytes) or SoundCloud/Spotify embed, with host approve/reject moderation
- Win/Loss voting per track with a live W%/L% split; one vote per identity per track, changeable until voting closes
- Anti-fraud vote pipeline: signed user/guest identity, HMAC-hashed IP and fingerprint signals, a unique `dedupeKey` enforced by the database, a per-IP cap, production-required Cloudflare Turnstile, and a serializable write
- Production abuse controls: FingerprintJS guest signals, mandatory Turnstile checks, and Upstash Redis sliding-window limits on login, registration, joins, uploads, and voting
- Host-armed voting window: arm/extend/close a deadline with a live countdown; votes lock at the deadline
- Web push notifications (VAPID + service worker) and in-app banners on voting events
- Results finalization with a crowned champion, host tie-break, and per-channel results visibility (`LIVE`, `AFTER_CLOSE`, `HIDDEN`)
- Single-elimination battle bracket: top-K seeding by win ratio, per-matchup W/L voting, round advancement to a champion
- Audit log for votes, moderation, and channel lifecycle actions

## Architecture

A single Next.js App Router application. Pages are server components; the API is route handlers under `src/app/api`. Prisma talks to PostgreSQL, which is authoritative for channels, submissions, votes, and battle state. Audio lives in S3-compatible object storage and is served through short-lived signed URLs. Vote uniqueness is enforced by a database unique constraint on a per-context dedupe key, not by application code, so concurrent and replayed votes collapse to one row.

### Components

| Component | Role |
|---|---|
| `src/app/api/channels/[channel]/*` | Channel lifecycle: join, submissions, votes, timer, results, finalize, battles, push |
| `src/lib/cast-wl-vote.ts` | Shared W/L vote pipeline (hashing, captcha, IP cap, serializable upsert, audit) used by qualifying and battle votes |
| `src/lib/battles.ts` | Battle bracket state and per-matchup tally computed from votes |
| `src/lib/membership.ts` | Resolves voter identity (user or guest token) and channel membership |
| `src/lib/storage.ts`, `src/lib/media.ts` | Presigned upload/download and MIME/magic-byte verification |
| `prisma/schema.prisma` | Data model and migrations |

## Tech Stack

| Technology | Role |
|---|---|
| Next.js 15 (App Router, Turbopack) | Server rendering and API routes |
| React 19, TypeScript (strict) | UI runtime and language |
| Tailwind CSS 4 + shadcn/ui, Framer Motion | Styling and motion |
| Prisma 6 + PostgreSQL 16 | ORM and primary datastore |
| Auth.js v5 (credentials + Google), Argon2id, Zod | Auth, password hashing, validation |
| AWS SDK v3 + S3-compatible storage (MinIO / Cloudflare R2) | Audio storage via presigned URLs |
| web-push (VAPID) | Browser push notifications |
| Cloudflare Turnstile | Production anti-bot challenge for registration and guest voting |
| FingerprintJS + Upstash Redis | Guest device signal and serverless sliding-window rate limits |
| pnpm 10, Node 22 | Package manager and runtime |
| Docker Compose | Local PostgreSQL + MinIO |

## Installation

```bash
git clone https://github.com/wannabexaker/Cypher.git
cd Cypher
pnpm install
cp .env.example .env
```

Fill `AUTH_SECRET` in `.env` with a real value:

```bash
openssl rand -base64 33
```

Start PostgreSQL and MinIO, then apply migrations:

```bash
docker compose up -d
pnpm db:migrate
```

Required env vars are `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, and the `S3_*` group (defaults match the Docker MinIO service). Production also requires both `TURNSTILE_*` keys and `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`; protected mutations fail closed when these controls are unavailable. They remain optional during local development and tests. `VAPID_*`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, and `AUTH_GOOGLE_*` are optional; `VOTE_IP_CAP` defaults to 40.

## Usage

```bash
pnpm dev
```

Serves at `http://localhost:3000`. Register a host at `/register`, create a channel from `/dashboard`, open it, then share the join code. Participants open `/c/<CODE>` to join, submit, and vote; the battle board is at `/c/<CODE>/battle`.

```bash
pnpm build && pnpm start
```

Other scripts: `pnpm typecheck`, `pnpm lint`, `pnpm db:studio`.

## Testing

The automated suite covers validation and vote calculations, embed URL
hardening, API authorization and security headers, concurrent battle vote
scoping, the complete host registration/room flow, guest W/L voting, contest
timer banners, and a mobile landing-page smoke test.

For the database-backed API and browser tests, copy the isolated test env and
make sure its database/MinIO ports match your Docker Compose setup:

```bash
cp .env.e2e.example .env.e2e
docker compose up -d
pnpm prisma migrate deploy
pnpm exec playwright install chromium
```

Run individual gates or the complete suite:

```bash
pnpm test:unit       # fast Vitest suite
pnpm test:coverage   # Vitest plus enforced coverage thresholds
pnpm test:api        # Playwright API integration tests
pnpm test:e2e        # desktop and mobile browser journeys
pnpm test            # unit plus all Playwright projects
```

Playwright creates uniquely named `e2e_*@example.test` fixtures and removes
them after each journey. Failure screenshots, traces, videos, and the HTML
report are written under `.artifacts/` and are not committed. CI runs the same
gates against fresh PostgreSQL and MinIO services before the production build.

## Project Structure

```
Cypher/
├── prisma/
│   ├── schema.prisma          — data model
│   └── migrations/            — applied migrations
├── public/                    — static assets, service worker (sw.js)
├── src/
│   ├── app/
│   │   ├── api/               — route handlers (channels, votes, battles, push, auth)
│   │   ├── c/[code]/          — public room + battle board
│   │   └── dashboard/         — host management
│   ├── components/            — UI (voting, channels, submissions, notifications)
│   └── lib/                   — vote pipeline, battles, membership, storage, auth
├── docker-compose.yml         — PostgreSQL + MinIO
├── docs/                      — ROADMAP and technical plan
└── .env.example
```

## Notes

- PostgreSQL is authoritative for votes. The unique constraint on `Vote.dedupeKey` (namespaced per submission or per matchup, keyed by user id or the signed guest token) is the final guard against double voting; fingerprint and IP are supplemental abuse signals, since NAT and mobile networks share addresses.
- IP and fingerprint are stored only as HMAC hashes, never raw.
- Turnstile and Upstash rate limiting may be omitted only in development/tests. Production guest votes and registration require Turnstile, while protected mutations require Upstash. Web push remains optional and becomes a no-op when VAPID keys are unset.
- The Docker Compose PostgreSQL maps to host port `5434` to avoid colliding with a local `5432`; the committed `.env.example` default uses `5432`, so align `DATABASE_URL` with whichever you run.
