import type { NextRequest } from "next/server";

import { GUEST_COOKIE_NAME, readGuestToken } from "@/lib/guest-session";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

type SessionUser = Awaited<ReturnType<typeof getCurrentUser>>;

export type ChannelIdentity = {
  user: SessionUser;
  guestToken: string | null;
};

const MEMBER_SELECT = {
  id: true,
  role: true,
  userId: true,
  guestToken: true,
  displayName: true,
} as const;

export type ChannelMembership = {
  id: string;
  role: "HOST" | "MODERATOR" | "MEMBER";
  userId: string | null;
  guestToken: string | null;
  displayName: string;
};

// Resolve the caller identity for a route handler: a logged-in user takes
// precedence; otherwise fall back to a signed guest cookie token.
export async function resolveChannelIdentity(
  request: NextRequest,
): Promise<ChannelIdentity> {
  const user = await getCurrentUser();
  const guestToken = user
    ? null
    : readGuestToken(request.cookies.get(GUEST_COOKIE_NAME)?.value);
  return { user, guestToken };
}

export async function findChannelMembership(
  channelId: string,
  identity: ChannelIdentity,
): Promise<ChannelMembership | null> {
  if (identity.user) {
    return prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId: identity.user.id } },
      select: MEMBER_SELECT,
    });
  }
  if (identity.guestToken) {
    return prisma.channelMember.findUnique({
      where: {
        channelId_guestToken: { channelId, guestToken: identity.guestToken },
      },
      select: MEMBER_SELECT,
    });
  }
  return null;
}
