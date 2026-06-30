# Cypher — Project Instructions

Cypher is a Next.js platform for short-lived online rap/trap competitions and battles.

Tagline: **Drop your bars. The crowd decides.**

Read this file before changing the repository.

## Sources of truth

Use this precedence when documents disagree:

1. `prisma/schema.prisma` and committed migrations for the data model.
2. Current code and automated tests for implemented behavior.
3. `docs/ROADMAP.md` for delivered and remaining work.
4. `docs/plan 1.md` for the original architecture and product baseline.
5. `docs/codex/*-delivery.md` for historical handoff details.

Call out a conflict before implementing behavior that would violate a higher-priority source.

## Product invariants

- A host must have an account. Hosts authenticate with email/password or optional Google OAuth.
- Email verification and password reset are intentionally not part of the current MVP.
- Guests join with a display name only. The browser remembers the name locally and the server uses a signed httpOnly guest cookie.
- A guest can participate, upload when allowed, and vote, but can never create or own a channel.
- A channel is a reusable venue. It may contain multiple numbered contests, including concurrent contests.
- Votes are W/L and immutable after the first accepted choice in that voting context.
- Channel, contest, upload, moderation, and voting authorization is always enforced server-side.

## Current phase

As of 2026-06-30, H01–H23 and the post-H23 stability/security increments are implemented on the current development line. The core MVP includes channels, guests, submissions, moderation, W/L voting, per-track rounds, concurrent contests, results, battles, stats, audit views, notifications, retention, and automated tests.

Current phase: **release readiness**. See `docs/ROADMAP.md`. After release integration, product work proceeds in this order: explore, profiles, admin, realtime.

## Locked stack

- Next.js 15 App Router, React 19, TypeScript strict
- Tailwind CSS 4, shadcn/ui, Framer Motion, lucide-react
- Prisma 6, PostgreSQL 16
- Auth.js v5, Argon2id, Zod
- S3-compatible private storage: MinIO locally, Cloudflare R2-compatible in production
- FingerprintJS, Cloudflare Turnstile, Upstash Redis
- Vercel, pnpm 10, Node 22

Do not replace the stack or introduce another datastore, queue, or auth system without explicit approval.

## Security invariants

- Never trust client-supplied ownership, role, channel, contest, or identity claims.
- Registered identity or the signed guest token is authoritative. Fingerprint and IP are supplemental abuse signals only.
- Store IP and fingerprint values only as `HMAC-SHA256(AUTH_SECRET, value)` hashes.
- Keep vote uniqueness behind a database `UNIQUE` constraint and serializable writes.
- Production protected mutations fail closed when required Upstash, Turnstile, or malware-scanner controls are unavailable.
- Browser uploads write only to `media/staging/`. Scan and serve only server-promoted `media/final/` objects.
- Keep storage private and expose media only through short-lived signed GET URLs.
- Never commit `.env*`, credentials, tokens, private keys, test output, or generated artifacts.

## Conventions

- Database tables and columns use the mappings already defined in Prisma; do not redesign the schema casually.
- API resources are plural and route nesting stays shallow unless an existing route contract requires otherwise.
- Components use `PascalCase`; hooks and utilities use `camelCase`; environment variables use `SCREAMING_SNAKE_CASE`.
- Reuse validators under `src/lib/validation`, server authorization helpers, design tokens, and existing UI components.
- Client components are limited to browser state, interaction, and motion. Data access and authorization stay server-side.
- Respect reduced motion, keyboard access, focus visibility, AA contrast, and 44px minimum tap targets.

## Workflow

1. Inspect the relevant docs, schema, routes, helpers, and tests before editing.
2. For non-trivial work, record a short plan and keep scope to one concern.
3. Create a checkpoint commit or tag before risky merge/security work.
4. Implement the smallest complete increment.
5. Add focused regression coverage for every bug or security boundary changed.
6. Run the relevant focused tests, then the complete required gates.
7. Commit each verified increment separately. Do not push or merge without the user's request.
8. Run a security review whenever auth, votes, uploads, secrets, guest identity, or authorization changes.

Required gates before a normal handoff:

```bash
pnpm prisma validate
pnpm typecheck
pnpm lint
pnpm test:coverage
pnpm test:playwright
pnpm build
pnpm audit --prod
```

## Documentation

- Update `docs/ROADMAP.md` when phase status or priorities change.
- Update `docs/CODEX_TASKS.md` when an implementation increment starts or finishes.
- Add a delivery note under `docs/codex/` for substantial handoffs.
- Keep `README.md` limited to current product behavior, setup, testing, and production requirements.
