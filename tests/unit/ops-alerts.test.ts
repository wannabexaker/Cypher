import { afterEach, describe, expect, it, vi } from "vitest";

import { emitOpsAlert } from "@/lib/ops-alerts";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("emitOpsAlert", () => {
  it("does nothing when OPS_ALERT_WEBHOOK_URL is unset", async () => {
    vi.stubEnv("OPS_ALERT_WEBHOOK_URL", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await emitOpsAlert({ job: "cron.purge", status: "failed" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs compact JSON to the webhook when configured", async () => {
    vi.stubEnv("OPS_ALERT_WEBHOOK_URL", "https://alerts.example/hook");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await emitOpsAlert({
      job: "cron.media_maintenance",
      status: "degraded",
      detail: { deletionFailures: 2 },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://alerts.example/hook");
    expect(init).toBeDefined();
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["content-type"]).toBe(
      "application/json",
    );
    expect(JSON.parse(init?.body as string)).toEqual({
      job: "cron.media_maintenance",
      status: "degraded",
      detail: { deletionFailures: 2 },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("swallows network errors and never throws", async () => {
    vi.stubEnv("OPS_ALERT_WEBHOOK_URL", "https://alerts.example/hook");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(
      emitOpsAlert({ job: "cron.purge", status: "failed" }),
    ).resolves.toBeUndefined();
  });
});
