# Cypher — light mode on a shared Raspberry Pi

The full stack in [RPI.md](RPI.md) needs ~1.5 GB of RAM before anyone visits,
mostly ClamAV. On a Pi that also hosts other projects, and with no real users
yet, that is a waste. Light mode keeps the site up and correct for visitors and
leaves the expensive parts off.

It is one extra compose file, `docker-compose.pi-light.yml`, layered on top of
`docker-compose.prod.yml` + `docker-compose.pi.yml`. Nothing is removed: the
stopped containers, every volume and all data stay as they are, and switching
back to full is one command.

## What runs, what is off

| Service | Light | Why |
|---|---|---|
| `app`, `postgres`, `minio` | on | the site itself, its data and its media |
| `redis` + `srh` | on | rate limits; sign-in, sign-up, joining and voting fail closed without them |
| `cron` | on | nightly purge + orphan cleanup, ~1 MB |
| `backup` | on | nightly DB dump + media copy at 03:30 UTC ([RPI.md](RPI.md#backups)) |
| `migrate`, `createbuckets` | one-shot | run on `up`, then exit |
| `clamav` + `scanner` | **off** | ~1 GB; moved to the `scanner` profile |

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
(see below; fixed since, the `nofile` cap is now in `docker-compose.prod.yml`
too) and ~1 GB `clamav`.

## What a visitor can and cannot do

- **Can:** open every page, register and sign in (email/password, Google if
  configured), create channels and contests, join as a guest, vote, submit
  Spotify/SoundCloud links, play media that is already stored.
- **Cannot upload audio files.** The app gets an empty `MALWARE_SCAN_URL`, so in
  production it treats the scanner as unavailable and answers the submission
  with **503 "File security scanning is temporarily unavailable"**. This is
  fail-closed: the file stays in `media/staging/`, is never promoted to
  `media/final/` and is never served. The nightly `media-maintenance` job
  deletes such unlinked uploads after `MEDIA_ORPHAN_TTL_HOURS` (default 24 h).

That is the intended trade-off for a showcase. To accept uploads, switch to full.

## Memory caps (and why `mem_limit` is not used)

The Raspberry Pi kernel boots with `cgroup_disable=memory`. Docker says so in
`docker info` (`WARNING: No memory limit support`) and `docker stats` reads 0.
A `mem_limit` would be accepted and silently ignored. Light mode uses limits
that the kernel or the program enforces per process instead:

- **srh** — `ulimits.nofile: 16384` and `ulimits.data: 256 MiB`.
  The 1.6 GB was not a slow leak: the Erlang VM inside `srh` sizes its port
  table from the open-files limit, and Docker's default here is 1,073,741,816.
  With a sane `nofile` the VM starts at ~60 MB. `data` (RLIMIT_DATA) is the
  backstop for a real leak: allocations past 256 MiB fail, the VM exits, and
  `restart: unless-stopped` starts a fresh one. The image is pinned by digest to
  the current `latest` (0.0.10, the newest release).
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

For anything else, run from the checkout on the Pi, with the same
`.env.production` as the full stack. Define a shortcut first:

```bash
LIGHT="docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.pi.yml -f docker-compose.pi-light.yml"
FULL="docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.pi.yml"
```

- **Start / redeploy light:** `$LIGHT up -d --no-build` (add `--build` after a
  `git pull` that changes the app).
- **Status:** `$LIGHT ps -a`. `clamav` and `scanner` show as exited; that is
  expected.
- **Full → light:** `$LIGHT up -d --no-build`, then
  `$LIGHT --profile scanner stop clamav scanner`.
- **Light → full:** `$FULL up -d --no-build`. This recreates `app`, `redis` and
  `srh` without the light settings and starts ClamAV, which needs a few minutes
  to load its signatures before uploads work. `srh` keeps its `nofile` cap,
  which lives in `docker-compose.prod.yml`; only the `data` backstop and the
  digest pin are light-only.
- **Stop everything (keep data):** `$LIGHT --profile scanner stop`.

Never use `down -v` or `docker system prune` on this host: the volumes hold the
data, and other projects share the Docker daemon.

A reboot brings back exactly what was running: the light services have
`restart: unless-stopped`, and the stopped ClamAV containers stay stopped.

Public routing does not change. The host `cloudflared` keeps sending the site to
`localhost:3001` and `/cypher-media/*` to `localhost:9000`, both published by
`docker-compose.pi.yml`.
