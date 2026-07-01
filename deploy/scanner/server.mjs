// Cypher malware-scan wrapper.
// Implements the contract in src/lib/malware-scan.ts:
//   POST {MALWARE_SCAN_URL}
//   Authorization: Bearer <MALWARE_SCAN_TOKEN>
//   body: { assetId, downloadUrl, mimeType, sizeBytes }
//   -> 200 { "verdict": "clean" | "infected" }
// Anything else (401/4xx/5xx/non-verdict body) is treated by the app as
// "unavailable" => the upload is rejected (fail-closed).
//
// Serves HTTPS with a self-signed cert (CN=scanner) so it satisfies the app's
// production "must be https" check while staying INTERNAL — it is never routed
// through the tunnel. The app trusts the cert via NODE_EXTRA_CA_CERTS.

import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import NodeClam from "clamscan";

const {
  SCANNER_TOKEN,
  CLAMD_HOST = "clamav",
  CLAMD_PORT = "3310",
  TLS_KEY = "/certs/scanner.key",
  TLS_CERT = "/certs/scanner.crt",
  PORT = "8443",
} = process.env;

if (!SCANNER_TOKEN) {
  console.error("SCANNER_TOKEN is required");
  process.exit(1);
}

const MAX_BODY_BYTES = 8_192;
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024; // 200MB hard cap
const DOWNLOAD_TIMEOUT_MS = 60_000;

let clam = null;
async function getClam() {
  if (clam) return clam;
  clam = await new NodeClam().init({
    clamdscan: {
      host: CLAMD_HOST,
      port: Number(CLAMD_PORT),
      timeout: 120_000,
      localFallback: false,
    },
    preference: "clamdscan",
  });
  return clam;
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer(
  { key: readFileSync(TLS_KEY), cert: readFileSync(TLS_CERT) },
  async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      return send(res, 200, { ok: true });
    }
    if (req.method !== "POST") return send(res, 405, { error: "method" });
    if ((req.headers.authorization || "") !== `Bearer ${SCANNER_TOKEN}`) {
      return send(res, 401, { error: "unauthorized" });
    }

    let raw = "";
    try {
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > MAX_BODY_BYTES) return send(res, 413, { error: "body" });
      }
    } catch {
      return send(res, 400, { error: "read" });
    }

    let body;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      return send(res, 400, { error: "json" });
    }

    const downloadUrl = body?.downloadUrl;
    if (typeof downloadUrl !== "string" || !/^https?:\/\//.test(downloadUrl)) {
      return send(res, 400, { error: "downloadUrl" });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const clamInstance = await getClam();
      const resp = await fetch(downloadUrl, {
        redirect: "error",
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) return send(res, 502, { error: "download" });

      const declared = Number(resp.headers.get("content-length") || "0");
      if (declared > MAX_DOWNLOAD_BYTES) return send(res, 413, { error: "size" });

      const { isInfected } = await clamInstance.scanStream(
        Readable.fromWeb(resp.body),
      );
      return send(res, 200, { verdict: isInfected ? "infected" : "clean" });
    } catch (error) {
      // clamd not ready / scan/download error -> app blocks the upload.
      clam = null; // force re-init next request
      console.error("scan failed:", error?.message || error);
      return send(res, 500, { error: "scan-unavailable" });
    } finally {
      clearTimeout(timer);
    }
  },
);

server.listen(Number(PORT), "0.0.0.0", () => {
  console.log(
    `cypher-scanner on :${PORT} -> clamd ${CLAMD_HOST}:${CLAMD_PORT}`,
  );
});
