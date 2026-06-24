import { NextResponse } from "next/server";

import { createChannelWithUniqueCode } from "@/lib/channels";
import { getCurrentUser } from "@/lib/session";
import { createChannelSchema } from "@/lib/validation/channels";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid channel details." }, { status: 400 });
  }

  const parsed = createChannelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid channel details." }, { status: 400 });
  }

  try {
    const channel = await createChannelWithUniqueCode({
      host: user,
      input: parsed.data,
    });

    return NextResponse.json({ channel }, { status: 201 });
  } catch (error) {
    console.error("Channel creation failed", error);
    return NextResponse.json(
      { error: "Unable to create the channel right now." },
      { status: 500 },
    );
  }
}

