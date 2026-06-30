# Media security hardening delivery

Date: 2026-06-30
Branch: `codex/guest-antifraud-20260629`

## Built

- Production file submissions now require a `clean` verdict from a configured HTTPS malware-scanner API before `MediaAsset.scanStatus` becomes `CLEAN`.
- Browser uploads are isolated under `media/staging/`. Before validation or malware scanning, the server copies the current bytes to a fresh `media/final/` key that has never had caller PUT capability, persists that key, and removes the staging object.
- Reusing a still-valid presigned PUT URL can only recreate the staging object; it cannot replace already-scanned media. A MinIO-backed regression test covers this exact replay condition.
- The scanner receives only asset metadata and a short-lived signed private-storage URL. Its bearer token and storage credentials are never exposed to the browser.
- Missing, malformed, timed-out, redirected, or failed scanner responses fail closed in production with `503`; local/test keeps the previous size, MIME, and magic-byte fallback.
- `PENDING` and `INFECTED` media cannot receive playback URLs or host approval.
- `GET /api/cron/media-maintenance`, protected by `CRON_SECRET`, removes aged unlinked `MediaAsset` rows and DB-less `media/` objects. The default age is 24 hours and work is batch-bounded.
- Cron authorization now uses constant-time bearer comparison and is shared with the existing channel-retention cron.
- `vercel.json` schedules media maintenance daily at 03:15 UTC.

## Scanner contract

Configure:

```env
MALWARE_SCAN_URL="https://scanner.example/scan"
MALWARE_SCAN_TOKEN="generated-secret"
MALWARE_SCAN_TIMEOUT_MS="25000"
```

Cypher sends:

```json
{
  "assetId": "uuid",
  "downloadUrl": "short-lived signed URL",
  "mimeType": "audio/mpeg",
  "sizeBytes": 12345
}
```

The scanner must return HTTP 2xx with exactly one supported verdict:

```json
{"verdict":"clean"}
```

or:

```json
{"verdict":"infected"}
```

Production scanner URLs must use HTTPS. R2 event notifications can trigger a future asynchronous scanner worker, but R2 itself does not provide a malware engine; this delivery keeps the application provider-neutral.

## Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test:coverage` — 68 tests passed; all thresholds passed
- `pnpm test:playwright` — 11 tests passed
- `pnpm prisma validate`
- `pnpm build`
- `pnpm audit --prod` — no known vulnerabilities

The integration suite verifies cron authorization, MinIO object deletion, fresh-asset retention, authenticated playback denial for `PENDING` media, host approval denial until a clean verdict exists, and immutability of promoted media after presigned-URL replay.
