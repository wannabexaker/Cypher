import { prisma } from "@/lib/prisma";

export const AUDIT_PAGE_SIZE = 25;

export type ChannelAuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  createdAt: Date;
  actor: {
    id: string;
    username: string;
    displayName: string | null;
  } | null;
};

export type ChannelAuditPage = {
  entries: ChannelAuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// Audit rows reference the channel either directly (entityType=channel,
// entityId=channel.id) or via metadata.channelId on per-submission, per-vote,
// per-member actions. The same OR filter is used by /dashboard/.../stats and
// by the room-reachable /c/<code>/audit page.
export async function fetchChannelAuditPage(
  channelId: string,
  page: number,
): Promise<ChannelAuditPage> {
  const safePage = Math.max(1, Math.floor(page));
  const where = {
    OR: [
      { entityId: channelId },
      { metadata: { path: ["channelId"], equals: channelId } },
    ],
  };

  const [total, entries] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: {
        actor: {
          select: { id: true, username: true, displayName: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
  ]);

  return {
    entries,
    total,
    page: safePage,
    pageSize: AUDIT_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
  };
}

export function parseAuditPageParam(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function summarizeAuditMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "-";
  try {
    const raw = JSON.stringify(metadata);
    return raw.length > 140 ? `${raw.slice(0, 140)}...` : raw;
  } catch {
    return "-";
  }
}
