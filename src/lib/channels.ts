import { randomInt } from "node:crypto";

import {
  MemberRole,
  Prisma,
  type PrismaClient,
  Role,
  type User,
} from "@prisma/client";

import { CHANNEL_CODE_ALPHABET } from "@/lib/channel-code";
import { prisma } from "@/lib/prisma";

const CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 8;

export type ChannelManager = Pick<User, "id" | "role">;

// H22 fix #1: the public room page is code-based (`/c/[code]/contest/[id]`),
// so host-action routes that ride that page (voting-window, finalize, battle
// round close) receive the 6-char CODE in the `[channel]` param — not the id.
// `findUnique({ where: { id } })` silently 404s on the code. Resolve by either
// id OR uppercased code so old (id-passing) and new (code-passing) callers
// both work.
type ChannelDb = PrismaClient | Prisma.TransactionClient;

export async function resolveChannelByParam<
  TSelect extends Prisma.ChannelSelect,
>(
  db: ChannelDb,
  param: string,
  select: TSelect,
): Promise<Prisma.ChannelGetPayload<{ select: TSelect }> | null> {
  if (!param) return null;
  return db.channel.findFirst({
    where: { OR: [{ id: param }, { code: param.toUpperCase() }] },
    select,
  }) as Promise<Prisma.ChannelGetPayload<{ select: TSelect }> | null>;
}

export function generateChannelCode() {
  return Array.from(
    { length: CODE_LENGTH },
    () => CHANNEL_CODE_ALPHABET[randomInt(CHANNEL_CODE_ALPHABET.length)],
  ).join("");
}

export function canManageChannel(
  user: ChannelManager,
  channel: { hostId: string },
) {
  return user.role === Role.ADMIN || channel.hostId === user.id;
}

// Who may review submissions: the host, a platform ADMIN, or a registered user
// who is a MODERATOR member of that channel. Channel settings/status stay
// host/ADMIN only (canManageChannel).
export async function canModerateChannel(
  user: ChannelManager,
  channel: { id: string; hostId: string },
) {
  if (canManageChannel(user, channel)) return true;

  const moderator = await prisma.channelMember.findFirst({
    where: {
      channelId: channel.id,
      userId: user.id,
      role: MemberRole.MODERATOR,
    },
    select: { id: true },
  });

  return moderator !== null;
}

export async function createChannelWithUniqueCode({
  host,
  input,
}: {
  host: Pick<User, "id" | "username" | "displayName">;
  input: {
    name: string;
    tagline?: string;
    description?: string;
    rules?: string;
    genre?: string;
    visibility: "PUBLIC" | "UNLISTED";
    resultsVisibility: "LIVE" | "AFTER_CLOSE" | "HIDDEN";
    allowGuestUploads: boolean;
  };
}) {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = generateChannelCode();

    try {
      return await prisma.$transaction(async (transaction) => {
        const channel = await transaction.channel.create({
          data: {
            ...input,
            code,
            hostId: host.id,
          },
          select: {
            id: true,
            code: true,
          },
        });

        await transaction.channelMember.create({
          data: {
            channelId: channel.id,
            userId: host.id,
            displayName: host.displayName ?? host.username,
            role: "HOST",
          },
        });

        await transaction.auditLog.create({
          data: {
            actorUserId: host.id,
            action: "channel.create",
            entityType: "channel",
            entityId: channel.id,
            metadata: { code },
          },
        });

        return channel;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to allocate a unique channel code.");
}
