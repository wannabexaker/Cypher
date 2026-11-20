# Cypher — light mode on a shared Raspberry Pi

The full stack in [RPI.md](RPI.md) needs ~1.5 GB of RAM before anyone visits,
mostly ClamAV. On a Pi that also hosts other projects, and with no real users
yet, that is a waste. Light mode keeps the site up and correct for visitors and
leaves the expensive parts off.

It is what `docker-compose.prod.yml` + `docker-compose.pi.yml` start by default:
ClamAV and the scanner sit in the `scanner` profile, so a plain `up` leaves
them off, and full mode is the same command with `--profile scanner`. Switching
only starts or stops those two containers; nothing else is recreated. Every
volume and all data stay as they are.

## What runs, what is off

| Service | Light | Why |
|---|---|---|
| `app`, `postgres`, `minio` | on | the site itself, its data and its media |
| `redis` + `srh` | on | rate limits; sign-in, sign-up, joining and voting fail closed without them |
| `cron` | on | nightly purge + orphan cleanup, ~1 MB |
| `backup` | on | nightly DB dump + media copy at 03:30 UTC ([RPI.md](RPI.md#backups)) |
| `migrate`, `createbuckets` | one-shot | run on `up`, then exit |
| `clamav` + `scanner` | **off** | ~1 GB; only with `--profile scanner` |

Measured on a Pi 4 (8 GB), process RSS per container, 2026-11-20:

| Container | RSS |
|---|---|
| app | 167 MB |
| minio | 141 MB |
| postgres | 78 MB |
| srh | 58 MB |
| redis | 8 MB |
| cron | <1 MB |
| **total** | **~450 MB** |

For comparison the full stack used ~3 GB on the same Pi, 1.6 GB of it `srh`
(see below; fixed since, in both modes) and ~1 GB `clamav`.

## What a visitor can and cannot do

- **Can:** open every page, register and sign in (email/password, Google if
  configured), create channels and contests, join as a guest, vote, submit
  Spotify/SoundCloud links, play media that is already stored.
- **Cannot upload audio files.** The scanner is not running, so the app's scan
  request to `MALWARE_SCAN_URL` fails; in production it treats the scan as
  unavailable and answers the submission with **503 "File security scanning is
  temporarily unavailable"** (a unit test pins this). This is
  fail-closed. The server first copies the upload to an immutable
  `media/final/` key (the copy it would scan), but the asset stays `PENDING`,
  is linked to no submission and is never served: the media route only signs
  `CLEAN` files (423 otherwise). The nightly `media-maintenance` job deletes
  such unlinked uploads after `MEDIA_ORPHAN_TTL_HOURS` (default 24 h).

Checked end to end on 2026-11-21 against a local copy of this exact stack
(production build, Turnstile test keys, a proxy in place of the tunnel): sign-up,
sign-in, room creation, guest join, a YouTube link submission, approval, a
leaderboard contest and a guest W vote all worked; the file upload was signed
and stored, then refused with 503.

That is the intended trade-off for a showcase. To accept uploads, switch to full.

## Memory caps (and why `mem_limit` is not used)

The Raspberry Pi kernel boots with `cgroup_disable=memory`. Docker says so in
`docker info` (`WARNING: No memory limit support`) and `docker stats` reads 0.
A `mem_limit` would be accepted and silently ignored. The compose files use
limits that the kernel or the program enforces per process instead, in both
modes (`nofile` and the digest pin in `docker-compose.prod.yml`, the rest in
`docker-compose.pi.yml`):

- **srh** — `ulimits.nofile: 16384` and `ulimits.data: 256 MiB`.
  The 1.6 GB was not a slow leak: the Erlang VM inside `srh` sizes its port
  table from the open-files limit, and Docker's default here is 1,073,741,816.
  With a sane `nofile` the VM starts at ~60 MB. `data` (RLIMIT_DATA) is the
  backstop for a real leak: allocations past 256 MiB fail, the VM exits, and
  `restart: unless-stopped` starts a fresh one. The image is pinned by digest to
  the current multi-arch `latest`.
- **redis** — `--maxmemory 64mb --maxmemory-policy volatile-ttl`. It holds only
  rate-limit keys, all with a TTL.
- **app** — `NODE_OPTIONS=--max-old-space-size=256` caps the V8 heap.

Check the caps on the running containers:

```bash
P=$(docker inspect -f '{{.State.Pid}}' cypher-srh-1)
grep -E 'Max (data|open)' /proc/$P/limits
ps -o rss= -p "$P"                       # KB
```

## Commands

The usual redeploy is one command, `scripts/deploy-pi.sh` (light is its
default; `--full` switches to the full stack). It pulls `origin/main`, rebuilds,
stops ClamAV when coming from full mode, and waits for `/api/health`.

For anything else, run from the checkout on the Pi. Define a shortcut first:

```bash
C="docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.pi.yml"
```

- **Start / redeploy light:** `$C up -d --no-build` (add `--build` after a
  `git pull` that changes the app).
- **Status:** `$C ps -a`. `clamav` and `scanner` show as exited (or are
  missing on a fresh host); that is expected.
- **Full → light:** `$C --profile scanner stop clamav scanner`.
- **Light → full:** `$C --profile scanner up -d --no-build`. This only starts
  ClamAV and the scanner; ClamAV needs a few minutes to load its signatures
  before uploads work. Full mode also needs the scanner's TLS certificate
  ([RPI.md](RPI.md) §4).
- **Stop everything (keep data):** `$C --profile scanner stop`.

Never use `down -v` or `docker system prune` on this host: the volumes hold the
data, and other projects share the Docker daemon.

A reboot brings back exactly what was running: the light services have
`restart: unless-stopped`, and the stopped ClamAV containers stay stopped.

Public routing does not change. The host `cloudflared` keeps sending the site to
`localhost:3001` and `/cypher-media/*` to `localhost:9000`, both published by
`docker-compose.pi.yml`.
