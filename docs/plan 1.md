# Cypher — Technical Plan (Plan 1)

> Online μουσικοί διαγωνισμοί & battles, με έμφαση σε rap/trap. Φιλικό vibe, δυνατό UI/UX.
> Tagline: **«Ρίξε τα bars σου. Αποφασίζει ο κόσμος.»**

Status: **DRAFT v1** · Owner: solo dev · Στόχος: πρώτα ένα απλό λειτουργικό MVP, μετά advanced features.

Αυτό το έγγραφο είναι το canonical technical reference του project. Η λειτουργική «συμπίεση» για κάθε session ζει στο skill `cypher-project`.

---

## 0. TL;DR — σειρά υλοποίησης

1. **Foundation:** repo + Next.js + Prisma + Postgres + Redis (Docker) → schema → auth → storage upload.
2. **Core loop:** organizer δημιουργεί διαγωνισμό → users ανεβάζουν → approve/reject → public ψηφοφορία με anti-fraud → results.
3. **Battle + ωριμότητα:** bracket system → scheduled transitions → stats → fraud detection → UI/UX polish → hardening.

---

## 1. Αρχιτεκτονική — high level

```
[ Browser / SPA ]
      │  HTTPS
      ▼
[ Next.js (frontend + API routes) ]──┬─→ [ PostgreSQL ]   ← source of truth (votes, entries, logs)
      │                              ├─→ [ Redis ]        ← rate limit, vote dedup cache, sessions
      │                              ├─→ [ Object Storage (R2/S3/MinIO) ] ← audio files (private)
      │                              └─→ [ Worker / Queue (BullMQ) ] ← transcode (ffmpeg), virus scan
      ▼
[ External embeds: Spotify / SoundCloud iframes ]
```

**Βασική αρχή:** το **PostgreSQL είναι το source of truth για τις ψήφους**. Το Redis είναι μόνο για ταχύτητα/rate-limit. Ποτέ ψήφος που να ζει μόνο στο Redis. Τελικός φύλακας κατά διπλοψήφισης = **UNIQUE constraint στη DB**, όχι application code.

---

## 1b. Channel / Room model (κεντρική έννοια)

Το **Channel είναι ένα «room» με κωδικό** — η κεντρική οντότητα της πλατφόρμας:

```
Host (account) ──creates──> Channel { code: "7K2P9X", host, settings }
                                  │
            artists enter the CODE ──join──> ChannelMember { displayName, role: MEMBER }
                                  │
                       members ──upload──> Submission (PENDING → host approves)
                                  │
                          crowd ──vote──> Vote (anti-fraud, plan §6)
                                  │
                  VOTING_CLOSED ──> Results ──> Battle bracket ──> Champion
```

- **Host** = creator, έχει account, είναι admin του room (approve/reject, ανοιγοκλείνει voting, ορίζει battles).
- **Join** = με τον `code`. Ο member μπορεί να είναι registered user **ή** lightweight guest (`guestToken` + `displayName`), ανάλογα το `allowGuestUploads`.
- **Visibility:** `UNLISTED` (code-only) ή `PUBLIC` (φαίνεται στο `/explore`).
- Το «competition» (lifecycle, voting, battles) **ζει μέσα στο channel** — δεν υπάρχει standalone competition entity.

> **Terminology:** όπου παρακάτω αναφέρεται «competition/διαγωνισμός», εννοείται το contest που τρέχει **μέσα σε ένα Channel**. Το data model χρησιμοποιεί `Channel` (όχι `Competition`).

**Defaults (2026-06-23):** host = account· participants join με code + display name· uploads περνούν host approval· voting = guest-allowed με anti-fraud. Αλλάζουν per-channel.

---

## 2. Tech stack

| Layer | Επιλογή | Γιατί |
|---|---|---|
| Frontend | **Next.js 15 (App Router) + TypeScript strict + Tailwind + shadcn/ui** | SSR για SEO/sharing cards, ωραίο UI γρήγορα, ένα repo |
| Backend | **Next.js Route Handlers (MVP)** → split σε NestJS/Fastify αν χρειαστεί | Ξεκινάς full-stack μονοκόμματα |
| ORM / DB | **Prisma + PostgreSQL 16** | Type-safe schema, migrations, aggregates· `schema.prisma` = data-model source of truth |
| Cache / RL / Queue | **Redis 7 + BullMQ** | Rate limiting, vote dedup, live counts, async jobs |
| Storage | **Cloudflare R2 / S3 / MinIO** (S3-compatible) | Φθηνό, presigned URLs, range requests για streaming |
| Auth | **Auth.js (NextAuth)** — email/password + 1 OAuth + guest sessions | Role-based, δωρεάν |
| Bot defense | **Cloudflare Turnstile** (ή hCaptcha) | Captcha σε vote/upload/register |
| Fingerprint | **FingerprintJS (open-source build)** | Signal #2 για guest anti-fraud |
| Media | **ffmpeg** (worker) | Transcode WAV→streaming preview, duration extraction |
| Package manager | **pnpm** | — |
| Node | **22 LTS** | — |
| Deploy | Vercel (MVP) ή Docker + VPS/Hetzner (production) | Ξεκίνα απλά |

Εναλλακτικό Python stack αν προτιμηθεί: **FastAPI + SQLAlchemy + Celery + Postgres + Redis** — ίδια λογική. Default = TS monorepo (ένα set από types frontend↔backend).

---

## 3. User roles

| Role | Δικαιώματα |
|---|---|
| **GUEST** (anonymous session) | Ακούει, ψηφίζει (αν το επιτρέπει ο διαγωνισμός), βλέπει αποτελέσματα κατά ρύθμιση |
| **USER** | + ανεβάζει submission, ιστορικό ψήφων, προφίλ |
| **ORGANIZER** | Δημιουργεί/διαχειρίζεται **δικούς του** διαγωνισμούς, approve/reject submissions, ανοιγοκλείνει voting, βλέπει stats, ορίζει winners/battles |
| **ADMIN** | Όλα + διαχείριση χρηστών, bans, global logs, override |

Το role ζει στο `users.role`. Ο guest **δεν** είναι row — είναι anonymous session (signed httpOnly cookie token). Authorization επιβάλλεται **server-side** σε κάθε route (όχι μόνο στο UI), με έλεγχο role **+ ownership**.

---

## 4. Database schema (core)

PostgreSQL, Prisma-style. PK `id` = UUID. FK = `{table_singular}_id`. Tables `snake_case` plural.
**Το πλήρες, canonical schema ζει στο [`prisma/schema.prisma`](../prisma/schema.prisma)** — εδώ είναι η περίληψη. Κεντρική οντότητα = `channels` (room με `code`) + `channel_members`.

```
users
  id, email (unique), username (unique), password_hash | oauth_provider,
  display_name, avatar_url, role [USER|ADMIN],   -- channel-level roles → channel_members
  is_banned (bool), created_at

channels                                   -- το "room" με κωδικό
  id, code (unique, shareable), slug (unique, optional),
  name, description, rules (text), cover_image_url, genre,
  host_id → users.id,
  status [DRAFT|OPEN|SUBMISSIONS_CLOSED|VOTING_OPEN|VOTING_CLOSED|RESULTS|BATTLE|COMPLETED],
  visibility [PUBLIC|UNLISTED],
  submission_start_at, submission_end_at, voting_start_at, voting_end_at,
  results_visibility [LIVE|HIDDEN|AFTER_CLOSE],
  vote_scope [PER_SUBMISSION|PER_COMPETITION], max_votes_per_voter (int),
  allow_guest_votes (bool), require_login_to_vote (bool), allow_guest_uploads (bool),
  created_at, updated_at

channel_members                            -- όποιος μπήκε με τον code
  id, channel_id → channels.id,
  user_id (nullable) → users.id,            -- registered member
  guest_token (nullable), display_name,     -- ή lightweight guest
  role [HOST|MODERATOR|MEMBER], created_at
  -- UNIQUE(channel_id, user_id), UNIQUE(channel_id, guest_token)

submissions
  id, channel_id → channels.id, submitter_member_id → channel_members.id,
  artist_name, track_title, description,
  source_type [FILE_MP3|FILE_WAV|SOUNDCLOUD|SPOTIFY|OTHER_URL],
  media_asset_id (nullable) → media_assets.id,   -- για uploads
  external_url (nullable),                        -- για embeds
  status [PENDING|APPROVED|REJECTED],
  rejection_reason, reviewed_by, reviewed_at,
  vote_count (denormalized int default 0),
  created_at
  -- index: (channel_id, status)

media_assets
  id, owner_user_id, storage_key, mime_type, size_bytes,
  duration_seconds, original_filename,
  scan_status [PENDING|CLEAN|INFECTED],
  transcode_status [PENDING|DONE|FAILED], preview_key (nullable),
  created_at

votes
  id, channel_id, submission_id → submissions.id,
  round_id (nullable) → battle_rounds.id,         -- null = κανονικός γύρος
  matchup_id (nullable) → matchups.id,
  voter_user_id (nullable),
  ip_hash, fingerprint_hash, cookie_token, user_agent,
  is_valid (bool default true),                   -- soft-invalidate σε fraud
  created_at
  -- UNIQUE constraints: βλέπε §6

battle_rounds
  id, channel_id, round_number, name,             -- π.χ. "Ημιτελικοί"
  status [PENDING|VOTING_OPEN|CLOSED],
  voting_start_at, voting_end_at

matchups            -- head-to-head ζευγάρι μέσα σε γύρο
  id, round_id → battle_rounds.id,
  submission_a_id, submission_b_id (nullable = bye),
  votes_a (int), votes_b (int), winner_submission_id (nullable),
  status [PENDING|VOTING_OPEN|DECIDED]

audit_logs
  id, actor_user_id (nullable), action, entity_type, entity_id,
  metadata (jsonb), ip_hash, created_at
```

Σημειώσεις:
- `vote_count` / `votes_a` / `votes_b` είναι **denormalized** για ταχύτητα. Το «αληθινό» count = `COUNT(*) WHERE is_valid = true`· σε recount τα ξανασυγχρονίζεις.
- `ip_hash`, `fingerprint_hash` = **HMAC με server secret**, ποτέ raw IP/PII (GDPR).
- Submitting → απαιτεί λογαριασμό (USER). Ψήφος → guest-allowed κατά ρύθμιση.

---

## 5. Competition lifecycle (state machine)

```
DRAFT
  └─(organizer publishes)→ SUBMISSIONS_OPEN
        └─(submission_end_at)→ SUBMISSIONS_CLOSED   (organizer reviews/approves)
              └─(voting_start_at)→ VOTING_OPEN
                    └─(voting_end_at)→ VOTING_CLOSED
                          └─(organizer finalizes)→ RESULTS
                                ├─(τέλος)→ COMPLETED
                                └─(seed battle)→ BATTLE ──(rounds loop)──→ COMPLETED
```

Μεταβάσεις: **scheduled job** (BullMQ repeatable) που τσεκάρει timestamps **+ manual override** από organizer. Κάθε μετάβαση → εγγραφή στο `audit_logs`. (MVP: manual transitions· auto-scheduling έρχεται Phase 2.)

---

## 6. Vote validation — η καρδιά του συστήματος

Layered defense, από αυστηρό σε χαλαρό ανάλογα τη ρύθμιση του διαγωνισμού.

### Α) Eligibility (πριν καν δεχτείς το POST)
1. `channel.status == VOTING_OPEN` (ή `matchup.status == VOTING_OPEN` σε battle).
2. Αν `require_login_to_vote` → απαιτεί user session, αλλιώς **401**.
3. **Turnstile token valid** (captcha).
4. **Minimum listen gate:** το frontend ξεκλειδώνει το vote button μόνο αφού παίξει ≥ X sec· ο server το επιβεβαιώνει χαλαρά (χρόνος από page-load / nonce).

### Β) Dedup — DB-enforced via `dedupe_key` (το πιο σημαντικό)
Το Prisma δεν κάνει καθαρά conditional/partial unique constraints, οπότε όλη η μοναδικότητα στηρίζεται σε **ένα `votes.dedupe_key` column με ένα `@@unique`**. Ο server το υπολογίζει namespaced ανά context:

```
identity = "u:{user_id}"  αν logged-in,  αλλιώς  "f:{fingerprint_hash}"

PER_SUBMISSION : dedupe_key = "ch:{channel_id}:s:{submission_id}:{identity}"
PER_COMPETITION: dedupe_key = "ch:{channel_id}:{identity}"           (+ app cap: max_votes_per_voter)
battle matchup : dedupe_key = "m:{matchup_id}:{identity}"
```

Έτσι ένα μόνο constraint καλύπτει **user + guest + battle** ομοιόμορφα και πιάνει race conditions (double-click, 2 tabs) ντετερμινιστικά. Επιπλέον soft signals: `cookie_token` (signed httpOnly) και `ip_hash`.

**Γιατί το IP δεν μπαίνει στο dedupe_key:** NAT / mobile / πανεπιστήμια μοιράζονται IP → θα μπλόκαρες νόμιμους ψηφοφόρους. Άρα IP = **όριο** (π.χ. max N ψήφοι/IP/channel μέσω Redis), fingerprint = το βασικό guest identity, cookie = επιπλέον τριβή για casual διπλοψήφιση.

### Γ) Rate limiting (Redis sliding window)
- `vote:ip:{hash}` → π.χ. 10/λεπτό, 30/ώρα.
- `vote:fp:{hash}` → παρόμοιο.
- Υπέρβαση → **429**.

### Δ) Atomic write (transaction)
```
BEGIN
  INSERT INTO votes (...)              -- UNIQUE constraint πιάνει races (double-click, 2 tabs)
  UPDATE submissions SET vote_count = vote_count + 1 WHERE id = ?
  INSERT INTO audit_logs (...)
COMMIT
-- ON CONFLICT (unique) → 409 "Έχεις ήδη ψηφίσει"
```
Race conditions τα πιάνει ντετερμινιστικά το **DB constraint**, όχι ο app code.

### Ε) Post-hoc fraud detection (Phase 2+)
Job που σαρώνει patterns (ίδιο fingerprint + πολλά cookies, μπουρστ από IP range) → `is_valid = false` + recount, **χωρίς** να σβήνει ιστορικό (audit trail μένει).

---

## 7. Battle system flow (single-elimination bracket)

```
1. VOTING_CLOSED → organizer πατάει "Create Battle".
2. Σύστημα παίρνει top-K submissions (K = 2/4/8/16, organizer επιλέγει), seeding κατά vote_count.
3. Δημιουργεί battle_round #1 με matchups (A vs B). Αν όχι power of 2 → byes στους κορυφαίους seeds.
4. round.status = VOTING_OPEN, νέο voting window.
   → ψήφοι → votes.round_id + votes.matchup_id, ενημερώνουν matchup.votes_a / votes_b.
   → ίδιο vote-validation pipeline (§6).
5. round κλείνει → matchup.winner = max(votes_a, votes_b).
   Tie-break: organizer choice ή vote_count του αρχικού γύρου.
6. winners → seed στον επόμενο round.
7. Επανάληψη μέχρι 1 matchup → ΤΕΛΙΚΟΣ ΝΙΚΗΤΗΣ.
8. competition.status = COMPLETED, κλείδωμα όλων.
```

Frontend: bracket ως δέντρο· κάθε matchup = mini head-to-head player (A vs B, ψηφίζεις τον έναν).

---

## 8. API endpoints

Πρόθεμα `/api`. Plural resources, ένα επίπεδο nesting max. Zod validation σε κάθε input.

**Auth**
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/session
```

**Competitions**
```
GET   /api/competitions                 # list + filters (status, genre)
GET   /api/competitions/:slug           # detail + approved submissions
POST  /api/competitions                 # [ORGANIZER]
PATCH /api/competitions/:id             # [ORGANIZER own]
POST  /api/competitions/:id/transition  # [ORGANIZER] manual state change
GET   /api/competitions/:id/stats       # [ORGANIZER] vote analytics
```

**Submissions**
```
POST  /api/uploads/sign                          # [USER] presigned URL για direct upload
POST  /api/competitions/:id/submissions          # [USER] create (file ή link)
GET   /api/competitions/:id/submissions          # approved (public) / all (organizer)
PATCH /api/submissions/:id/review                # [ORGANIZER] approve/reject
DELETE/api/submissions/:id                       # [ORGANIZER/owner]
```

**Votes**
```
POST /api/competitions/:id/votes        # body: submission_id, fingerprint, turnstile_token
GET  /api/competitions/:id/results      # live/hidden κατά ρύθμιση
```

**Battles**
```
POST /api/competitions/:id/battles      # [ORGANIZER] seed battle (top-K)
GET  /api/competitions/:id/battles      # bracket state
POST /api/matchups/:id/votes            # ψήφος σε head-to-head
POST /api/battles/:roundId/close        # [ORGANIZER] close round → advance
```

**Admin**
```
GET   /api/admin/users
PATCH /api/admin/users/:id              # ban / role
GET   /api/admin/logs                   # audit trail
```

---

## 9. Frontend pages

**Public**
- `/` — landing, featured/active διαγωνισμοί (φιλικό rap/trap vibe).
- `/competitions` — λίστα + filters.
- `/c/[slug]` — competition detail: rules, submissions grid, **audio player**, vote buttons, countdown.
- `/c/[slug]/results` — αποτελέσματα (αν visible).
- `/c/[slug]/battle` — bracket view.
- `/login`, `/register`, `/u/[username]` — προφίλ.

**User**
- `/submit/[slug]` — upload form (file ή Spotify/SoundCloud link).
- `/dashboard` — οι συμμετοχές & ψήφοι μου.

**Organizer**
- `/organizer` — οι διαγωνισμοί μου.
- `/organizer/new` — wizard δημιουργίας.
- `/organizer/[id]/submissions` — approve/reject queue με inline player.
- `/organizer/[id]/stats` — γραφήματα ψήφων.
- `/organizer/[id]/battle` — seed & manage bracket.

**Admin**
- `/admin` — users, bans, global logs.

**`<TrackPlayer>` component** (ενιαίο): δέχεται `source_type` και κάνει render:
- `FILE` → native `<audio>` με range streaming από presigned URL.
- `SPOTIFY` → Spotify iframe embed.
- `SOUNDCLOUD` → SoundCloud Widget API (δίνει και play-progress events για το listen-gate).

---

## 10. File upload security

1. **Direct-to-storage με presigned URL** — το αρχείο δεν περνά από τον API server (scale + κόστος).
2. **Validation:** whitelist MIME (`audio/mpeg`, `audio/wav`), έλεγχος **magic bytes** (όχι μόνο extension), max size (~50MB), max duration.
3. **Virus scan** (ClamAV worker) πριν γίνει διαθέσιμο → `scan_status`.
4. **Transcode** σε streaming preview (ffmpeg → 128k MP3 ή HLS) — ποτέ raw WAV στο public.
5. Serve μόνο μέσω **signed, expiring URLs** + `Content-Disposition: inline`· ποτέ public bucket.
6. Strip metadata· ξεχωριστό CDN domain (no cookies) για media.
7. Embeds: validate ότι το URL ανήκει στα **επίσημα domains** (allowlist + κανονικοποίηση) πριν μπει σε iframe → anti-XSS.

---

## 11. Security requirements

- **Rate limiting** σε όλα τα mutating endpoints (Redis sliding window)· πιο σφιχτό σε votes/upload/auth.
- **Anti-spam:** Turnstile captcha σε vote + register + submission· honeypot fields.
- **Auth:** httpOnly + Secure + SameSite cookies· argon2/bcrypt για passwords· CSRF tokens.
- **Input validation:** Zod σε κάθε endpoint· parameterized queries (Prisma).
- **Privacy:** IP/fingerprint αποθηκεύονται **hashed (HMAC)** — GDPR-friendly, ποτέ raw PII.
- **Audit logs** για κάθε σημαντική ενέργεια (vote, approve, transition, ban).
- **Authorization:** middleware role + ownership σε κάθε organizer/admin route.
- **Headers:** CSP (whitelist Spotify/SoundCloud frames), HSTS, X-Frame-Options.
- **Secrets:** σε vault/env (δες `/vault` skill), ποτέ στο repo.

---

## 12. MVP vs Later

**MVP (end-to-end λειτουργικό):**
- Auth (email + 1 OAuth).
- Organizer: create competition, approve/reject, open/close voting (manual).
- Submissions: MP3 upload + Spotify/SoundCloud link.
- Public: listen + vote (login-required ή fingerprint+captcha+IP cap).
- Results (live ή after-close).
- Basic audit log.

**Phase 2:**
- Battle/bracket system.
- Scheduled auto-transitions (cron/BullMQ).
- WAV + transcode pipeline + virus scan.
- Stats dashboard με γραφήματα.
- Advanced fraud detection (post-hoc recount).

**Phase 3:**
- Notifications (email/web push), comments/reactions, social sharing cards.
- Multi-round seasons, leaderboards, artist profiles.
- Real-time live results (WebSocket/SSE).
- Admin analytics, moderation tools.

---

## 13. Development phases — τι πρώτο/δεύτερο/τρίτο

**Πρώτο (foundation)**
1. Repo + Next.js + Prisma + Postgres + Docker compose (db + redis).
2. Schema migration: `users, competitions, submissions, votes, audit_logs`.
3. Auth (register/login/session) + role middleware.
4. Object storage + presigned upload + validation.

**Δεύτερο (core loop)**
5. Organizer: create competition + review submissions.
6. Submission flow (file + embed) με `<TrackPlayer>`.
7. **Vote pipeline §6** (DB unique constraints → captcha → IP cap → fingerprint).
8. Public competition page + results.

**Τρίτο (το «wow» + ωριμότητα)**
9. Battle/bracket system.
10. Scheduled state transitions.
11. Stats dashboard + fraud detection.
12. UI/UX polish (rap/trap vibe — `/ui-ux-pro-max`), responsive, animations.
13. Hardening: rate limits παντού, CSP, virus scan, load test ψηφοφορίας.

---

## 14. Ανοιχτές αποφάσεις (να κλειδωθούν νωρίς — επηρεάζουν schema)

1. **Ψήφος = υποχρεωτικό login ή guest-allowed;** Αλλάζει πόσο anti-fraud χρειάζεται (guest → fingerprint+captcha+IP· login → απλό unique constraint).
2. **Tech stack:** TS monorepo (Next.js + Prisma) [default] ή Python (FastAPI);
3. **Hosting:** Vercel για MVP ή απευθείας Docker/VPS;
4. **Όνομα:** Cypher [επιλεγμένο] ή εναλλακτική (BARZ / Clash / 16Barz);

---

_Επόμενα παραδοτέα όταν κλειδωθούν οι αποφάσεις: (α) `schema.prisma`, (β) ER + bracket διαγράμματα, (γ) scaffold Phase 1._
