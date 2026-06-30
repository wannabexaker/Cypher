# Cypher — Codex Task Queue

Updated: 2026-06-30

One implementation concern per increment. Each completed increment must have focused tests, full required gates, a commit, and a checkpoint tag before the next concern starts.

Legend: `[ ]` queued · `[~]` in progress · `[x]` delivered on the current development line

## Handoff history

| ID | Scope | Specification / delivery | Status |
|---|---|---|---|
| H01 | Foundation, design system, landing | [spec](codex/handoff-01-foundation-landing.md) · [delivery](codex/handoff-01-delivery.md) | `[x]` |
| H02 | PostgreSQL, Prisma, Auth.js host accounts | [spec](codex/handoff-02-db-auth.md) · [delivery](codex/handoff-02-delivery.md) | `[x]` |
| H03 | Channels, join codes, membership | [spec](codex/handoff-03-channels.md) · [delivery](codex/handoff-03-delivery.md) | `[x]` |
| H04 | Uploads, embeds, moderation, player | [spec](codex/handoff-04-uploads.md) · [delivery](codex/handoff-04-delivery.md) | `[x]` |
| H05 | Artist/Judge labels and moderators | [spec](codex/handoff-05-roles.md) · [delivery](codex/handoff-05-delivery.md) | `[x]` |
| H06 | W/L voting and anti-fraud foundation | [spec](codex/handoff-06-voting.md) · [delivery](codex/handoff-06-delivery.md) | `[x]` |
| H07 | Voting windows and countdown | [spec](codex/handoff-07-timers.md) · [delivery](codex/handoff-07-delivery.md) | `[x]` |
| H08 | Web push and in-app notifications | [spec](codex/handoff-08-notifications.md) · [delivery](codex/handoff-08-delivery.md) | `[x]` |
| H09 | Results finalization and champion | [spec](codex/handoff-09-results.md) · [delivery](codex/handoff-09-delivery.md) | `[x]` |
| H10 | Battle bracket and ordering fix | [spec](codex/handoff-10-battle.md) · [delivery](codex/handoff-10-delivery.md) | `[x]` |
| H11 | Stats dashboard and audit views | [delivery](codex/handoff-11-delivery.md) | `[x]` |
| H12 | Voting/results UX polish | [delivery](codex/handoff-12-delivery.md) | `[x]` |
| H13 | Per-track multi-round voting | [spec](codex/handoff-13-voting-v2.md) · [delivery](codex/handoff-13-delivery.md) | `[x]` |
| H13.1 | Voting/finalization/cron fixup | [spec](codex/handoff-13-1-fixup.md) · [delivery](codex/handoff-13-1-delivery.md) | `[x]` |
| H14 | Access, host transfer/delete, retention | [spec](codex/handoff-14-access-lifecycle.md) | `[x]` |
| H15 | YouTube embeds and notification fixes | [spec](codex/handoff-15-bugfix-youtube.md) · [delivery](codex/handoff-15-delivery.md) | `[x]` |
| H16a | Contest schema foundation | [spec](codex/handoff-16-contest-core.md) · [delivery](codex/handoff-16a-delivery.md) | `[x]` |
| H16b | Contest lifecycle and channel-as-venue | [spec](codex/handoff-16b-contest-lifecycle.md) · [delivery](codex/handoff-16b-delivery.md) | `[x]` |
| H17 | Results presentation | [spec](codex/handoff-17-results-presentation.md) · [delivery](codex/handoff-17-delivery.md) | `[x]` |
| H18 | Moderation | [spec](codex/handoff-18-moderation.md) · [delivery](codex/handoff-18-delivery.md) | `[x]` |
| H19 | oEmbed title lookup | [spec](codex/handoff-19-embed-oembed-title.md) · [delivery](codex/handoff-19-delivery.md) | `[x]` |
| H20a | Concurrent contests backend | [spec](codex/handoff-20a-concurrent-contests-backend.md) · [delivery](codex/handoff-20a-delivery.md) | `[x]` |
| H20b | Concurrent contest room UI | [spec](codex/handoff-20b-contest-room-ui.md) · [delivery](codex/handoff-20b-delivery.md) | `[x]` |
| H21 | Management information architecture | [spec](codex/handoff-21-management-ia-cleanup.md) · [delivery](codex/handoff-21-delivery.md) | `[x]` |
| H22 | P1 QA fixes | [spec](codex/handoff-22-qa-fix-p1.md) · [delivery](codex/handoff-22-delivery.md) | `[x]` |
| H23 | P2/P3 QA fixes | [spec](codex/handoff-23-qa-fix-p2.md) · [delivery](codex/handoff-23-delivery.md) | `[x]` |

## Post-H23 stability and security

| ID | Scope | Commit / evidence | Status |
|---|---|---|---|
| S01 | Concurrent battle scoping, YouTube CSP, notification reconnect | `d6fc335` | `[x]` |
| S02 | Vitest, API/browser/mobile Playwright, GitHub Actions | `bda5778`, `8ca5d5b` | `[x]` |
| S03 | Local guest display-name persistence | `ea0fc2e` | `[x]` |
| S04 | FingerprintJS, production Turnstile, Upstash sliding windows | `a9ac6fa` | `[x]` |
| S05 | Malware scan, staging promotion, orphan cleanup | `00b149e` · [delivery](codex/media-security-delivery.md) | `[x]` |
| S06 | ROADMAP, task queue, agent instructions, README reconciliation | this docs increment | `[x]` |

## Queue

| Priority | ID | Scope | Status | Exit condition |
|---|---|---|---|---|
| P0 | R01 | Integrate current development line into `main` | `[~]` | Local fast-forward is complete; remote review/push and green CI remain |
| P0 | R02 | Production provider/secrets setup | `[ ]` | Postgres, private storage, Upstash, Turnstile, scanner, cron secret configured |
| P0 | R03 | Staging migration and complete smoke | `[ ]` | Core host/guest/upload/vote/result/battle journey passes against production-like services |
| P0 | R04 | Operational alerts and cron verification | `[ ]` | Failures are visible and both scheduled jobs are observed succeeding |
| P1 | N01 | Public Explore | `[ ]` | Opt-in public discovery with no unlisted-room leakage |
| P1 | N02 | Profiles | `[ ]` | Minimal registered-user profiles; guests remain local-only |
| P1 | N03 | Admin | `[ ]` | Server-authorized moderation and operational tools |
| P1 | N04 | Realtime | `[ ]` | Serverless-compatible live room/result updates |

## Review checklist

- Scope matches one queue item; no unrelated product expansion.
- Product invariants in `AGENTS.md` remain intact.
- Auth, ownership, roles, and contest/channel scope are resolved server-side.
- Vote/upload changes preserve signed identity, HMAC-only signals, database uniqueness, and fail-closed production controls.
- UI uses design tokens, reduced-motion fallbacks, accessible labels/focus, and mobile tap targets.
- Prisma migration is committed when the schema changes.
- Focused regression coverage proves the changed behavior.
- Required gates pass: Prisma validate, typecheck, lint, coverage, Playwright, build, and production audit.
- Delivery note and roadmap/task status are updated before the increment is marked complete.
