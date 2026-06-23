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
- [~] **H01** → Codex: scaffold + design system + landing page (motion) — `docs/codex/handoff-01-foundation-landing.md`
- [ ] **H02** → Postgres (Neon/Supabase) + `prisma migrate dev` + Auth.js (host accounts)
- [ ] **H03** → Channel create + join-by-code + membership
- [ ] Auth.js (register/login/session) + role middleware
- [ ] Object storage (R2/MinIO) + presigned upload + validation
- [ ] Upstash Redis (rate limit + vote dedup) — serverless-friendly για Vercel

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
