# Cypher — Testing routines

Ready-made, repeatable test routines. Three automated layers (unit → API → browser
E2E) plus a Claude-extension live playbook for exploratory/manual runs.

| Layer | Runner | Command | Needs DB/storage? | Typical time |
|---|---|---|---|---|
| Unit | Vitest | `corepack pnpm test:unit` | no | ~20s |
| Unit + coverage | Vitest | `corepack pnpm test:coverage` | no | ~20s |
| API | Playwright (`api` project) | `corepack pnpm test:api` | **yes** | ~1–2 min |
| Browser E2E | Playwright (`chromium` + `mobile`) | `corepack pnpm test:e2e` | **yes** | ~6–10 min (dev host) |
| Everything | — | `corepack pnpm test` | yes | ~10 min |
| Live / exploratory | Claude Chrome extension | see [claude-extension-playbook.md](claude-extension-playbook.md) | yes | manual |

## Prerequisites (API + E2E only)

The unit layer is hermetic. The API and browser layers boot a real Next.js server
and talk to a real database + object store, so bring those up first:

```powershell
# 1. Backing services (Postgres + MinIO) — from repo root
docker compose up -d            # provides cypher-postgres + cypher-minio

# 2. Environment — Playwright loads .env.e2e if present, else .env
#    (see .env.e2e.example to override port / base URL / CRON_SECRET)
copy .env.example .env          # first time only, then fill real local values

# 3. Schema
corepack pnpm prisma migrate deploy
```

Playwright manages its own dev server (`next dev` on `PLAYWRIGHT_PORT`, default
`3100`) — you do **not** start the app yourself. It also sets `AUTH_URL` /
`NEXTAUTH_URL` to that origin so the Auth.js session cookie survives the
post-login redirect.

## Layers in detail

### Unit — `test:unit` / `test:coverage`
Pure logic: validation, votes, embeds, rate-limit, turnstile, storage, cron auth,
`/api/health`, ops-alerts, media scan. No network, no DB. Run these constantly.
Coverage thresholds are enforced in `vitest.config.ts`.

### API — `test:api`
Database-backed route contracts under `tests/api/` — authorization, battle vote
scoping, media security/maintenance, security headers. Fast because there is no
page rendering; each spec seeds its own fixtures via `tests/support/database.ts`
and cleans them up.

### Browser E2E — `test:e2e`
Full user journeys under `tests/e2e/` (desktop `chromium`) and `tests/mobile/`
(`mobile`, Pixel 5):
- `auth-host` — register → create room → open → sign out.
- `contest-timer` — host arms + closes a leaderboard voting window; audit trail.
- `guest-voting` — guest judge joins, casts independent W/L, dedupe lock holds.
- `landing` (mobile) — landing renders on a phone viewport.

**Why the `setup` project exists.** Dev-mode Next.js (Turbopack) compiles each
route lazily on its first request — 30–50s per page on a cold host. That used to
blow the per-test budget and made the journeys flake. The `setup` project
(`tests/support/warmup.setup.ts`) hits the heavy routes once, up front, with a
generous budget; `chromium` and `mobile` declare it as a dependency, so the real
journeys run against already-compiled routes. Combined with the raised
`timeout: 180s` / `expect: 30s`, the suite is reliable even on a slow dev host.
CI (Linux) runs well under those budgets.

> The E2E layer stays in **dev mode on purpose**. A production build
> (`next start`, `NODE_ENV=production`) flips on the fail-closed anti-fraud
> controls — guest votes then require FingerprintJS + Turnstile + Upstash — which
> would (correctly) reject the guest-voting journey. Test those controls at the
> unit/API layer and in staging, not here.

## Focused runs

```powershell
# One project
corepack pnpm exec playwright test --project=chromium
corepack pnpm exec playwright test --project=mobile

# One spec / one title
corepack pnpm exec playwright test tests/e2e/guest-voting.spec.ts
corepack pnpm exec playwright test -g "contest timer"

# Watch unit tests
corepack pnpm test:unit:watch

# Run against a server you started yourself (skips Playwright's managed server)
$env:PLAYWRIGHT_BASE_URL="http://localhost:3100"; corepack pnpm test:e2e
```

## Reports & artifacts

- HTML report: `.artifacts/playwright-report/` → `corepack pnpm exec playwright show-report .artifacts/playwright-report`
- Failure traces / video / screenshots / `error-context.md`: `.artifacts/playwright/<test>/`
- Coverage: printed by `test:coverage`.

`.artifacts/` is disposable; delete it any time.

## Fixtures & cleanup

`tests/support/database.ts` builds hosts, rooms, submissions, contests, and battle
brackets, and cleans them up in each spec's `finally`. `tests/support/global-setup.ts`
sweeps any leftover `e2e_*@example.test` users before a run, so an aborted run never
poisons the next one. Fixtures use throwaway `e2e_*` identifiers — safe against your
local dev database.

## CI

`.github/workflows/ci.yml` runs Prisma validate, typecheck, lint, coverage, the
Playwright projects, build, and the production audit. Keep every layer green there
before merging a development line into `main`.
