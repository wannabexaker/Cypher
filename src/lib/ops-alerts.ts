// Optional operational alert hook. If OPS_ALERT_WEBHOOK_URL is configured the
// module posts a compact JSON payload to it. Fire-and-forget: never throws,
// never blocks callers, and stays silent when unconfigured.

const REQUEST_TIMEOUT_MS = 3_000;

export type OpsAlertStatus = "failed" | "degraded";

export type OpsAlertInput = {
  job: string;
  status: OpsAlertStatus;
  detail?: Record<string, unknown> | string;
};

export async function emitOpsAlert(input: OpsAlertInput): Promise<void> {
  const url = process.env.OPS_ALERT_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        job: input.job,
        status: input.status,
        detail: input.detail ?? null,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Alert hook must never surface errors back to the caller.
  }
}
