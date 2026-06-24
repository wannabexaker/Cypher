import { ChannelStatus, MemberRole, Prisma } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import {
  createGuestSession,
  GUEST_COOKIE_MAX_AGE,
  GUEST_COOKIE_NAME,
  readGuestToken,
} from "@/lib/guest-session";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  channelCodeSchema,
  joinChannelSchema,
} from "@/lib/validation/channels";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { channel: rawCode } = await context.params;
  const parsedCode = channelCodeSchema.safeParse(rawCode);
  if (!parsedCode.success) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid join details." }, { status: 400 });
  }

  const parsed = joinChannelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid join details." }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { code: parsedCode.data },
    select: {
      id: true,
      code: true,
      status: true,
      allowGuestUploads: true,
    },
  });

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  if (channel.status === ChannelStatus.COMPLETED) {
    return NextResponse.json(
      { error: "This room is completed and no longer accepts members." },
      { status: 409 },
    );
  }

  const user = await getCurrentUser();
  if (user) {
    const existing = await prisma.channelMember.findUnique({
      where: {
        channelId_userId: {
          channelId: channel.id,
          userId: user.id,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ joined: true, memberId: existing.id });
    }

    if (!parsed.data.participation) {
      return NextResponse.json(
        { error: "Choose whether you'll compete as an Artist or judge as a Judge." },
        { status: 400 },
      );
    }

    try {
      const member = await prisma.$transaction(async (transaction) => {
        const created = await transaction.channelMember.create({
          data: {
            channelId: channel.id,
            userId: user.id,
            displayName: user.displayName ?? user.username,
            role: MemberRole.MEMBER,
            participation: parsed.data.participation,
          },
          select: { id: true },
        });

        await transaction.auditLog.create({
          data: {
            actorUserId: user.id,
            action: "member.join",
            entityType: "channel",
            entityId: channel.id,
            metadata: {
              memberId: created.id,
              identity: "user",
              participation: parsed.data.participation,
            },
          },
        });

        return created;
      });

      return NextResponse.json(
        { joined: true, memberId: member.id },
        { status: 201 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const racedMember = await prisma.channelMember.findUnique({
          where: {
            channelId_userId: {
              channelId: channel.id,
              userId: user.id,
            },
          },
          select: { id: true },
        });

        if (racedMember) {
          return NextResponse.json({
            joined: true,
            memberId: racedMember.id,
          });
        }
      }

      console.error("Registered channel join failed", error);
      return NextResponse.json(
        { error: "Unable to join the room right now." },
        { status: 500 },
      );
    }
  }

  if (!channel.allowGuestUploads) {
    return NextResponse.json(
      {
        error: "Sign in to join this room.",
        signInUrl: `/login?next=/c/${channel.code}`,
      },
      { status: 401 },
    );
  }

  const existingGuestToken = readGuestToken(
    request.cookies.get(GUEST_COOKIE_NAME)?.value,
  );
  const guestSession = existingGuestToken
    ? { guestToken: existingGuestToken, cookieValue: null }
    : createGuestSession();

  try {
    const existing = await prisma.channelMember.findUnique({
      where: {
        channelId_guestToken: {
          channelId: channel.id,
          guestToken: guestSession.guestToken,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ joined: true, memberId: existing.id });
    }

    if (!parsed.data.displayName) {
      return NextResponse.json(
        { error: "Choose a display name to join." },
        { status: 400 },
      );
    }

    if (!parsed.data.participation) {
      return NextResponse.json(
        { error: "Choose whether you'll compete as an Artist or judge as a Judge." },
        { status: 400 },
      );
    }

    const member = await prisma.$transaction(async (transaction) => {
      const created = await transaction.channelMember.create({
        data: {
          channelId: channel.id,
          guestToken: guestSession.guestToken,
          displayName: parsed.data.displayName!,
          role: MemberRole.MEMBER,
          participation: parsed.data.participation,
        },
        select: { id: true },
      });

      await transaction.auditLog.create({
        data: {
          action: "member.join",
          entityType: "channel",
          entityId: channel.id,
          metadata: {
            memberId: created.id,
            identity: "guest",
            participation: parsed.data.participation,
          },
        },
      });

      return created;
    });

    const response = NextResponse.json(
      { joined: true, memberId: member.id },
      { status: 201 },
    );

    if (guestSession.cookieValue) {
      response.cookies.set({
        name: GUEST_COOKIE_NAME,
        value: guestSession.cookieValue,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: GUEST_COOKIE_MAX_AGE,
      });
    }

    return response;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const member = await prisma.channelMember.findUnique({
        where: {
          channelId_guestToken: {
            channelId: channel.id,
            guestToken: guestSession.guestToken,
          },
        },
        select: { id: true },
      });

      if (member) {
        return NextResponse.json({ joined: true, memberId: member.id });
      }
    }

    console.error("Guest channel join failed", error);
    return NextResponse.json(
      { error: "Unable to join the room right now." },
      { status: 500 },
    );
  }
}
