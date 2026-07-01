# Cypher — Claude Chrome-extension live playbook

Driven, exploratory test routines for the **real running app**, executed through the
Claude Chrome extension (`mcp__claude-in-chrome__*`). Automated Playwright covers the
deterministic contracts; this playbook is for live end-to-end journeys, visual/UX
checks, and regression sweeps of past bugs — things a human (or Claude driving the
browser) verifies by looking.

Each routine is self-contained: **Goal → Preconditions → Steps → Expected → Verify**.
Run them top-to-bottom for a full pass, or cherry-pick one.

## How to run

1. **Boot the app** (not Playwright's server — the real dev app):
   - Backing services: `docker compose up -d` (Postgres + MinIO).
   - App: use the `run-app` skill (or `corepack pnpm dev`) → serves `http://localhost:3000`.
   - Confirm `/api/health` returns `{ status: "ok" }`.
2. **Attach the extension**: `list_connected_browsers` → `select_browser`, then
   `navigate` to `http://localhost:3000`.
3. **Driving tips** (from prior sessions):
   - Screenshots lag ~1–2 actions — confirm real state from the dev log / DB, not
     only the screenshot.
   - Coordinate clicks miss; prefer `find` + ref-clicks and `form_input`.
   - The extension can't supply a host file path for uploads — use **embed URLs**
     (YouTube/Spotify/SoundCloud) for submissions, or seed media via API.
   - Two identities in parallel: drive the host in the main tab; simulate a
     voter/artist via `javascript_tool` `fetch()` against the API with a separate
     guest cookie (or a second browser profile).

---

## R1 — Host onboarding
**Goal:** a new host can register, land on the dashboard, and open a room.
**Preconditions:** signed out.
**Steps:**
1. `/register` → fill Email / Username / Password → "Create host account".
2. Expect redirect to `/dashboard`; header shows `@username`.
3. "New channel" → name it → check "Allow guest members" → "Create channel".
4. On the management page → "Open the room".
**Expected:** management page shows "Close the room"; a join code is visible.
**Verify:** `Channel.status = OPEN`; a `HOST` `ChannelMember` exists.

## R2 — Submissions & moderation
**Goal:** artist submits via embed; host moderates.
**Preconditions:** R1 room open; grab its `/c/<CODE>` link.
**Steps:**
1. In a guest context open `/c/<CODE>` → join as **Artist** → submit a YouTube and a
   Spotify link (oEmbed should auto-fill the title — H19).
2. As host: approve both; then **disqualify** one.
**Expected:** titles auto-populated (not a raw URL); disqualified track leaves the
active roster but the action is recorded.
**Verify:** `Submission.status` transitions; an `AuditLog` `submission.*` /
`disqualify` row exists (disqualify keeps an audit trail — it does not hard-delete).

## R3 — Leaderboard contest + timer
**Goal:** full leaderboard lifecycle with a voting window.
**Preconditions:** room has ≥2 approved tracks.
**Steps:**
1. Host: **Start leaderboard contest** → the "Active contests" list updates
   **without a manual reload** (H23-P2) and is **numbered**.
2. Open the contest view `/c/<CODE>/contest/<ID>` → arm the **1 min** timer.
3. As a guest judge: join, cast **W** on one track, **L** on another.
4. Host: "Close voting now".
**Expected:** live banner "Voting is open — closes in …" then closed; medals
(🥇🥈🥉) render on results; kicker text is clean (**no** `Â·` / `â€"` mojibake — H23-P3).
**Verify:** two `contest.voting_window` audit rows (open+close); `ContestParticipant`
wins/losses reflect the votes; contest shows under **Past contests only after
COMPLETED** (H23-P2), never while VOTING_OPEN.

## R4 — Battle bracket (per-track W/L)
**Goal:** battle mode decides a champion by per-track win ratio.
**Preconditions:** room with ≥2 approved tracks.
**Steps:**
1. Host: **Start battle contest** (seed auto by W% + curate).
2. Guest judge in the round's matchup: vote **track A = WIN** and **track B = LOSS**
   (both sides — this is allowed; the verdict is W/L *per track*).
3. Try to re-vote the same track → must be **locked** (returns your original vote).
4. Host: "Close voting" on the round.
**Expected:** matchup resolves to the higher win-ratio track; with one matchup the
winner becomes champion and the battle contest is COMPLETED.
**Verify:** exactly **2** votes for that identity in the matchup (one per track, not
per side); `Matchup.winnerSubmissionId` set; `Contest.status = COMPLETED` with
`championSubmissionId`. (Guards the `battles/votes` dedupe + `close` route.)

## R5 — Concurrent contests
**Goal:** many contests per room, clearly labelled, votes scoped correctly.
**Preconditions:** room open.
**Steps:**
1. Start **two** leaderboard contests → both appear, **numbered**, in "Active".
2. Enter each contest view; confirm the room tells you *which* contest you're in.
3. Vote in contest #1; then vote the same track in contest #2.
**Expected:** both votes succeed independently; neither contest shows the other's
tally. A no-`contestId` vote when 2 are active returns `CONTEST_REQUIRED` (pick one).
**Verify:** votes carry the correct `contestId`; each `ContestParticipant` tally is
independent.

## R6 — Results visibility (HIDDEN must not leak)
**Goal:** confirm the H22 visibility fix.
**Steps:** set a contest's results visibility to **HIDDEN**, complete it, then open
the room/results as a **non-member** (fresh guest, no join).
**Expected:** champion + counts are **not** shown to the crowd — HIDDEN reveals to
host/mod only. `LIVE` shows always; `AFTER_CLOSE` only once that contest's window closed.

## R7 — Guest anti-fraud sanity
**Goal:** signed-identity dedupe + guest-name persistence hold.
**Steps:**
1. As a guest, vote; re-POST the same track with a *rotated* fingerprint →
   still **locked** to the first choice (identity, not fingerprint, is authoritative).
2. Reload `/c/<CODE>` → the remembered display name pre-fills (H-S03).
3. If the room has guest voting **off** (`allowGuestVotes=false`) → a guest vote
   returns **403** ("Sign in to vote").
**Verify:** one vote row per identity per contest; `Vote.fingerprintHash` present but
not identity-forming.

## R8 — Ops health & cron auth (R04)
**Goal:** the new observability endpoints behave.
**Steps (via `javascript_tool` fetch):**
1. `GET /api/health` → `200 { status: "ok", checks: { database: true, storage: true } }`.
2. `GET /api/cron/purge` **without** `Authorization` → **401**.
3. `GET /api/cron/media-maintenance` with `Authorization: Bearer <CRON_SECRET>` →
   `200` summary (and `degraded: true` only if there were deletion failures).
**Verify:** health leaks no secrets/stack traces; a `cron.*.ok` audit row is written.

---

## Regression sweep (fast pass over closed bugs)

Tick these while doing R1–R8 — each maps to a shipped fix:

- [ ] Contest-view host controls (arm timer / finalize / battle round close) return
      **200, not 404** on a code-based room URL. *(H22 #1)*
- [ ] HIDDEN results/champion not visible to non-members. *(H22 #2)*
- [ ] Guest vote blocked when `allowGuestVotes=false` / `requireLoginToVote=true`. *(H22 #3)*
- [ ] One identity can't double-vote the **same** track in a matchup; **can** rate
      both tracks once. *(H22 #4 / battle re-scope)*
- [ ] No-`contestId` vote with only a DRAFT contest → **409**, not accepted. *(H22 #5)*
- [ ] A 2nd battle contest in one room creates cleanly (**no 500**). *(H22 #6)*
- [ ] LIVE `/results` shows real per-contest counts, not 0 / 50%. *(H22 #7)*
- [ ] Starting a leaderboard updates "Active contests" without reload. *(H23-P2)*
- [ ] "Past contests" lists COMPLETED only. *(H23-P2)*
- [ ] No `Â·` / `â€"` mojibake on `/c/<CODE>/contest/<ID>`. *(H23-P3)*
- [ ] YouTube embeds play in the contest track list. *(H23-P3)*
- [ ] No duplicate "PAST CONTESTS" header / "You voted" line. *(H23-P3)*

Log anything that fails as a new QA finding for the next Copilot fix handoff.
