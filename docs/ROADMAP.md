# Cypher — Roadmap

Phase tracking. Πηγή αλήθειας για το «τι έγινε / τι μένει». Λεπτομέρειες στο [plan 1.md](plan%201.md).

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase 0 — Planning & decisions  ✅
- [x] Technical plan (`docs/plan 1.md`)
- [x] Project name: **Cypher**
- [x] Project `CLAUDE.md` + `cypher-project` skill
- [x] Decisions locked (2026-06-23):
  - [x] Ψήφος: **guest-allowed** (fingerprint + IP cap + Turnstile captcha)
  - [x] Stack: **TS — Next.js 15 + Prisma**
  - [x] Hosting: **Vercel** (MVP)
  - [x] Όνομα: **Cypher**

### Core concept (locked 2026-06-23)
**Channel = room με join `code`.** Host (account) δημιουργεί → μοιράζει code → members μπαίνουν & ανεβάζουν tracks → host moderates → crowd votes → battle → champion. Δες plan §1b.

## Phase 1 — Foundation  ← τρέχουσα
- [x] `prisma/schema.prisma` (channels + channel_members + submissions + media + votes + battles + audit)
- [x] Codex orchestration set up (`docs/CODEX_TASKS.md`, `docs/codex/`)
- [x] **H01** → scaffold + design system + landing page (motion) — ✅ reviewed, 100/100 Lighthouse
- [x] **H02** → Postgres + `prisma migrate dev` (init) + Auth.js (host accounts) — ✅ reviewed
- [x] **H03** → Channel create + join-by-code + membership — ✅ reviewed + 🔒 security pass
- [x] **H01–H03 merged to `main`** (linear) 2026-06-24
- [x] **H04** → Uploads (presigned) + submissions + host moderation + player — ✅ reviewed + 🔒 security pass + merged (`598e4fc`)
- [x] **H05** → Participant roles (Judge/Artist) + Moderator promotion — ✅ reviewed + 🔒 security pass + merged (`46cc8a0`)
- [x] **H01–H05 merged to `main`** (linear, ff-only) 2026-06-24

### v1.1 features (locked 2026-06-24 — δες plan §1c)
Judge/Artist participation · Moderators · Timers (auto-close+extend) · Notifications (in-app + web push).
- [~] **H06** → Voting (**W/L** per track, live W% split, everyone votes) + anti-fraud — `docs/codex/handoff-06-voting.md` (queued)
- [ ] **H07** → Timers (auto-close + extend) + live countdown
- [ ] **H08** → Notifications: web push (VAPID + SW) + in-app banners
- [ ] **H09** → Results + battle bracket · **H10** → Stats · **H11** → Hardening (rate limits/CSP/worker)

## Phase 2 — Core loop (MVP)
- [ ] Organizer: create competition + review (approve/reject)
- [ ] Submission flow (file upload + Spotify/SoundCloud embed)
- [ ] `<TrackPlayer>` component
- [ ] Vote pipeline (DB unique → captcha → IP cap → fingerprint)
- [ ] Public competition page + results
- [ ] Basic audit log
- [ ] **MVP shippable**

## Phase 3 — Battle + maturity
- [ ] Battle/bracket system (single-elimination)
- [ ] Scheduled state transitions (BullMQ)
- [ ] WAV transcode + virus scan pipeline
- [ ] Stats dashboard + γραφήματα
- [ ] Post-hoc fraud detection / recount
- [ ] UI/UX polish (rap/trap vibe) + responsive
- [ ] Hardening (rate limits, CSP, load test ψηφοφορίας)

## Phase 4+ — Later
- [ ] Notifications (email/web push), comments/reactions, sharing cards
- [ ] Multi-round seasons, leaderboards, artist profiles
- [ ] Real-time live results (WS/SSE)
- [ ] Admin analytics & moderation tools
