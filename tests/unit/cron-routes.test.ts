import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    channel: { findMany: vi.fn() },
    mediaAsset: { findMany: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/storage", () => ({
  deleteObject: vi.fn(),
  listStorageObjectsPage: vi.fn(),
}));

vi.mock("@/lib/ops-alerts", () => ({
  emitOpsAlert: vi.fn(async () => {}),
}));

import { prisma } from "@/lib/prisma";
import { deleteObject, listStorageObjectsPage } from "@/lib/storage";
import { emitOpsAlert } from "@/lib/ops-alerts";
import { GET as purgeGet } from "@/app/api/cron/purge/route";
import { GET as maintenanceGet } from "@/app/api/cron/media-maintenance/route";

const CRON_SECRET = "unit-test-cron-secret";

function authorized() {
  return new Request("https://cypher.test/api/cron/purge", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

function unauthorized() {
  return new Request("https://cypher.test/api/cron/purge");
}

const auditCreate = prisma.auditLog.create as unknown as ReturnType<typeof vi.fn>;
const channelFindMany = prisma.channel.findMany as unknown as ReturnType<typeof vi.fn>;
const mediaFindMany = prisma.mediaAsset.findMany as unknown as ReturnType<typeof vi.fn>;
const mediaDeleteMany = prisma.mediaAsset.deleteMany as unknown as ReturnType<typeof vi.fn>;
const listPageMock = listStorageObjectsPage as unknown as ReturnType<typeof vi.fn>;
const deleteObjectMock = deleteObject as unknown as ReturnType<typeof vi.fn>;
const emitAlertMock = emitOpsAlert as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  auditCreate.mockReset().mockResolvedValue({});
  channelFindMany.mockReset();
  mediaFindMany.mockReset();
  mediaDeleteMany.mockReset();
  listPageMock.mockReset();
  deleteObjectMock.mockReset();
  emitAlertMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/purge", () => {
  it("rejects unauthorized calls with 401", async () => {
    const response = await purgeGet(unauthorized());
    expect(response.status).toBe(401);
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("writes a cron.purge.ok audit row on the happy path", async () => {
    channelFindMany.mockResolvedValue([]);

    const response = await purgeGet(authorized());
    expect(response.status).toBe(200);

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "cron.purge.ok",
          entityType: "cron",
          entityId: "purge",
          actorUserId: null,
        }),
      }),
    );
    expect(emitAlertMock).not.toHaveBeenCalled();
  });

  it("writes cron.purge.failed and returns 500 on unhandled errors", async () => {
    channelFindMany.mockRejectedValue(new Error("db exploded"));

    const response = await purgeGet(authorized());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Cron purge failed." });

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "cron.purge.failed",
          entityType: "cron",
          entityId: "purge",
          metadata: expect.objectContaining({ message: "db exploded" }),
        }),
      }),
    );
    expect(emitAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({ job: "cron.purge", status: "failed" }),
    );
  });
});

describe("GET /api/cron/media-maintenance", () => {
  function authMaint() {
    return new Request("https://cypher.test/api/cron/media-maintenance", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
  }

  it("rejects unauthorized calls with 401", async () => {
    const response = await maintenanceGet(
      new Request("https://cypher.test/api/cron/media-maintenance"),
    );
    expect(response.status).toBe(401);
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("writes cron.media_maintenance.ok when the run has no failures", async () => {
    mediaFindMany.mockResolvedValue([]);
    listPageMock.mockResolvedValue({
      objects: [],
      nextContinuationToken: undefined,
    });

    const response = await maintenanceGet(authMaint());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.degraded).toBeUndefined();
    expect(body.deletionFailures).toBe(0);
    expect(body.inventoryComplete).toBe(true);

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "cron.media_maintenance.ok",
          entityType: "cron",
          entityId: "media-maintenance",
        }),
      }),
    );
    expect(emitAlertMock).not.toHaveBeenCalled();
  });

  it("returns 200 degraded and writes an audit row when inventory fails", async () => {
    mediaFindMany.mockResolvedValue([]);
    listPageMock.mockRejectedValue(new Error("bucket down"));

    const response = await maintenanceGet(authMaint());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.degraded).toBe(true);
    expect(body.inventoryComplete).toBe(false);

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "cron.media_maintenance.degraded",
          entityType: "cron",
          entityId: "media-maintenance",
        }),
      }),
    );
    expect(emitAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        job: "cron.media_maintenance",
        status: "degraded",
      }),
    );
  });

  it("writes cron.media_maintenance.failed and returns 500 on unhandled errors", async () => {
    mediaFindMany.mockRejectedValue(new Error("db offline"));

    const response = await maintenanceGet(authMaint());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Cron media-maintenance failed." });

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "cron.media_maintenance.failed",
          entityType: "cron",
          entityId: "media-maintenance",
          metadata: expect.objectContaining({ message: "db offline" }),
        }),
      }),
    );
    expect(emitAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        job: "cron.media_maintenance",
        status: "failed",
      }),
    );
  });
});
