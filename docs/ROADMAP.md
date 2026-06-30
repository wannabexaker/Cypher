# Cypher Roadmap

Updated: 2026-06-30

This file is the source of truth for what is delivered, what is release-blocking, and what comes next. Technical details remain in `docs/plan 1.md`; historical handoff details remain under `docs/codex/`.

Legend: `[ ]` todo · `[~]` in progress · `[x]` delivered on the current development line

## Locked product decisions

- [x] Hosts require an account: email/password or optional Google OAuth.
- [x] Guests require only a display name, remembered locally, plus a signed server cookie.
- [x] Guests can participate but can never host a channel.
- [x] No email verification in the current MVP.
- [x] W/L votes lock after the first accepted choice in each vote context.
- [x] Channels are reusable venues and may run multiple numbered or concurrent contests.
- [x] Production anti-fraud uses signed identity, HMAC-hashed signals, Turnstile, Upstash sliding windows, IP caps, and database uniqueness.

## Delivered product foundation

- [x] H01 — Next.js scaffold, design system, motion-rich landing page.
- [x] H02 — PostgreSQL, Prisma migrations, Auth.js host accounts.
- [x] H03 — Channel creation, host management, join by code, registered and guest membership.
- [x] H04 — Private MP3/WAV uploads, embeds, moderation, signed playback.
- [x] H05 — Artist/Judge participation labels and moderator management.
- [x] H06 — W/L voting, live splits, database dedupe, initial anti-fraud controls.
- [x] H07 — Host-controlled voting windows and countdown UI.
- [x] H08 — In-app banners and optional VAPID web push.
- [x] H09 — Results visibility, finalization, ties, and champion selection.
- [x] H10/H10.1 — Single-elimination battles and deterministic bracket ordering.

## Delivered product evolution

- [x] H11 — Host stats dashboard and audit-log views.
- [x] H12 — Immutable-vote UX, explicit W/L labels, results visibility controls.
- [x] H13/H13.1 — Per-track multi-round voting, who-voted view, result-mode fixes.
- [x] H14 — Restricted file playback, recent submission reuse, host transfer/delete, retention cron.
- [x] H15 — YouTube embeds, hydration fix, and push-error surfacing.
- [x] H16a/H16b — Contest schema and lifecycle; channel-as-venue model.
- [x] H17 — Top-three podium, rankings, mode standings, and past contests.
- [x] H18 — Disqualify, kick, audit, and in-room moderation controls.
- [x] H19 — Safe oEmbed title lookup with SSRF restrictions.
- [x] H20a/H20b — Concurrent contests, per-contest voting scope, and contest room UI.
- [x] H21 — Dashboard information architecture and unified contest-start controls.
- [x] H22/H23 — P1/P2/P3 QA fixes, including hidden-result leaks, guest-vote flags, contest filtering, YouTube rendering, and vote confirmation copy.

## Delivered stability and security increments

- [x] Concurrent battle votes are scoped to the selected contest and matchup.
- [x] YouTube CSP and contest notification event wiring are repaired.
- [x] Vitest unit coverage, Playwright API/browser/mobile coverage, and GitHub Actions are active.
- [x] Guest display names persist locally without creating guest accounts.
- [x] Login, registration, join, upload, and vote routes have Upstash sliding-window protection in production.
- [x] Production guest voting requires FingerprintJS and Turnstile; signed guest identity remains authoritative.
- [x] File uploads use staging-to-final object promotion, fail-closed remote malware verdicts, and daily orphan cleanup.
- [x] Latest verified gates: 68 Vitest tests, 11 Playwright scenarios, Prisma validation, typecheck, lint, production build, and dependency audit.

## P0 — Release readiness

- [x] Reconcile operational docs with the implemented codebase.
- [ ] Merge the current post-H23 stability/security line into `main` through a reviewed PR and run CI there.
- [ ] Provision production PostgreSQL, private R2-compatible storage, Upstash Redis, Turnstile, and the HTTPS malware-scanner service.
- [ ] Set production secrets: database URLs, `AUTH_SECRET`, storage credentials, Turnstile, Upstash, scanner token, and `CRON_SECRET`.
- [ ] Apply all committed Prisma migrations in staging/production.
- [ ] Verify both Vercel crons: channel retention at 03:00 UTC and media maintenance at 03:15 UTC.
- [ ] Run a staging smoke: host registration/login, room creation, guest join, file upload/scan, moderation, W/L vote, results, battle, sign-out, and retention authorization.
- [ ] Confirm production logs/alerts for auth failures, rate-limit outages, scanner outages, cron failures, and storage errors.

## P1 — Next product work

Implement in this order after release readiness:

1. [ ] **Explore** — public, opt-in discovery for eligible public rooms/contests; no leakage of unlisted rooms.
2. [ ] **Profiles** — minimal registered-host/artist pages and public history controls; guests remain local-only identities.
3. [ ] **Admin** — server-authorized moderation, user/channel lookup, bans, audit access, and operational health views.
4. [ ] **Realtime** — live vote/result/room updates. Prefer SSE or a managed serverless-compatible transport before introducing WebSockets.

## P2 — Deferred robustness and policy work

- [ ] Expand Playwright coverage for complete file-upload moderation, multi-round track voting, full battle progression, concurrent-contest UI, and destructive host controls.
- [ ] Add load testing for high-concurrency voting and rate-limit behavior.
- [ ] Decide whether one browser push endpoint should subscribe to multiple channels; the current unique endpoint is last-channel-wins.
- [ ] Add password recovery only if host support needs justify the email dependency; email verification remains intentionally out of scope.
- [ ] Add audio normalization/transcoding if real-world WAV compatibility requires it.
- [ ] Define registered-user deletion/export policy before profiles store more durable personal data.

## Not planned for the current MVP

- Guest accounts, guest email, or guest login.
- Mandatory email verification.
- Redis as the vote source of truth; PostgreSQL remains authoritative.
- Native mobile apps, marketplace/feed mechanics, or microservices.
