import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/storage", () => ({
  listStorageObjectsPage: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { listStorageObjectsPage } from "@/lib/storage";
import { GET } from "@/app/api/health/route";

const queryRawMock = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;
const listMock = listStorageObjectsPage as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  queryRawMock.mockReset();
  listMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("returns 200 ok when database and storage respond", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    listMock.mockResolvedValue({ objects: [], nextContinuationToken: undefined });

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: "ok",
      checks: { database: true, storage: true },
    });
    expect(typeof body.timestamp).toBe("string");
  });

  it("returns 503 unhealthy when the database check throws", async () => {
    queryRawMock.mockRejectedValue(new Error("connection refused"));
    listMock.mockResolvedValue({ objects: [], nextContinuationToken: undefined });

    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe("unhealthy");
    expect(body.checks.database).toBe(false);
    expect(JSON.stringify(body)).not.toContain("connection refused");
  });

  it("returns 200 degraded when only storage fails", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    listMock.mockRejectedValue(new Error("bucket unreachable"));

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: "degraded",
      checks: { database: true, storage: false },
    });
    expect(JSON.stringify(body)).not.toContain("bucket unreachable");
  });
});
