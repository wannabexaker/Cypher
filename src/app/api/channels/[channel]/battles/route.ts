import {
  ChannelStatus,
  ResultsVisibility,
} from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { getBattleState } from "@/lib/battles";
import { canManageChannel } from "@/lib/channels";
import {
  findChannelMembership,
  resolveChannelIdentity,
} from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { channelCodeSchema } from "@/lib/validation/channels";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string }>;
};

// H16b: POST was removed — battle bracket creation now happens via
// POST /api/channels/[channel]/contests with `{ mode: "BATTLE", bracketSize }`
// so there is ONE create-a-contest path. This file only exposes the GET that
// reads the current battle state for the room.
export async function GET(request: NextRequest, context: RouteContext) {
  const { channel: rawCode } = await context.params;
  const parsedCode = channelCodeSchema.safeParse(rawCode);
  if (!parsedCode.success) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  const channel = await prisma.channel.findUnique({
    where: { code: parsedCode.data },
    select: {
      id: true,
      status: true,
      hostId: true,
      resultsVisibility: true,
      completedAt: true,
    },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }
  if (
    channel.status !== ChannelStatus.BATTLE &&
    channel.status !== ChannelStatus.COMPLETED
  ) {
    return NextResponse.json(
      { error: "Battle bracket is not available for this room." },
      { status: 409 },
    );
  }

  const identity = await resolveChannelIdentity(request);
  const membership = await findChannelMembership(channel.id, identity);
  const completed = channel.status === ChannelStatus.COMPLETED;

  const callerIsHostOrModerator =
    membership?.role === "HOST" ||
    membership?.role === "MODERATOR" ||
    Boolean(
      identity.user &&
        canManageChannel(identity.user, { hostId: channel.hostId }),
    );

  const canSeeCounts =
    channel.resultsVisibility === ResultsVisibility.LIVE ||
    (channel.resultsVisibility === ResultsVisibility.AFTER_CLOSE && completed) ||
    (channel.resultsVisibility === ResultsVisibility.HIDDEN && completed) ||
    callerIsHostOrModerator;

  const state = await getBattleState(
    channel.id,
    membership
      ? identity.user
        ? { voterUserId: identity.user.id }
        : identity.guestToken
          ? { cookieToken: identity.guestToken }
          : undefined
      : undefined,
  );

  const rounds = canSeeCounts
    ? state.rounds
    : state.rounds.map((round) => ({
        ...round,
        matchups: round.matchups.map((matchup) => ({
          ...matchup,
          sideA: matchup.sideA
            ? {
                ...matchup.sideA,
                winCount: 0,
                lossCount: 0,
                total: 0,
                winPct: 0,
              }
            : null,
          sideB: matchup.sideB
            ? {
                ...matchup.sideB,
                winCount: 0,
                lossCount: 0,
                total: 0,
                winPct: 0,
              }
            : null,
        })),
      }));

  return NextResponse.json({
    ...state,
    rounds,
    resultsHidden: !canSeeCounts,
    reason: canSeeCounts
      ? null
      : channel.resultsVisibility === ResultsVisibility.HIDDEN
        ? "Results reveal when the host finalizes the room."
        : "Results reveal when the battle is finalized.",
    member: Boolean(membership),
  });
}
