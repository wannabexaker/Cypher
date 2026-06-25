import { type NextRequest, NextResponse } from "next/server";

import {
  findChannelMembership,
  resolveChannelIdentity,
} from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { channelCodeSchema } from "@/lib/validation/channels";
import {
  pushSubscribeSchema,
  pushUnsubscribeSchema,
} from "@/lib/validation/push";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ channel: string }>;
};

async function parseJson(request: NextRequest): Promise<unknown> {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { channel: rawCode } = await context.params;
  const parsedCode = channelCodeSchema.safeParse(rawCode);
  if (!parsedCode.success) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  let body: unknown = {};
  try {
    body = await parseJson(request);
  } catch {
    return NextResponse.json(
      { error: "Invalid subscription." },
      { status: 400 },
    );
  }

  const parsed = pushSubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid subscription." },
      { status: 400 },
    );
  }

  const channel = await prisma.channel.findUnique({
    where: { code: parsedCode.data },
    select: { id: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  const identity = await resolveChannelIdentity(request);
  const membership = await findChannelMembership(channel.id, identity);
  if (!membership) {
    return NextResponse.json(
      { error: "Join the room before enabling notifications." },
      { status: 403 },
    );
  }

  const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null;
  const userId = identity.user?.id ?? null;
  const guestToken = identity.user ? null : identity.guestToken;

  await prisma.pushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    create: {
      channelId: channel.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userId,
      guestToken,
      userAgent,
    },
    update: {
      channelId: channel.id,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userId,
      guestToken,
      userAgent,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { channel: rawCode } = await context.params;
  const parsedCode = channelCodeSchema.safeParse(rawCode);
  if (!parsedCode.success) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  let body: unknown = {};
  try {
    body = await parseJson(request);
  } catch {
    return NextResponse.json(
      { error: "Invalid subscription." },
      { status: 400 },
    );
  }

  const parsed = pushUnsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid subscription." },
      { status: 400 },
    );
  }

  const channel = await prisma.channel.findUnique({
    where: { code: parsedCode.data },
    select: { id: true },
  });
  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  const identity = await resolveChannelIdentity(request);
  const membership = await findChannelMembership(channel.id, identity);
  if (!membership) {
    return NextResponse.json(
      { error: "Join the room before managing notifications." },
      { status: 403 },
    );
  }

  // Idempotent: scope the delete to this channel so an endpoint can only be
  // removed by a member of the room it was registered against.
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, channelId: channel.id },
  });

  return NextResponse.json({ ok: true });
}
