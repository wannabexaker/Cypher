import { MemberRole } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";

import { canManageChannel } from "@/lib/channels";
import { findChannelMembership, resolveChannelIdentity } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { createDownloadUrl } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function noStore(payload: unknown, init?: ResponseInit) {
  const response = NextResponse.json(payload, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
      originalFilename: true,
      ownerUserId: true,
      submission: {
        select: {
          id: true,
          channelId: true,
          submitterMemberId: true,
          channel: { select: { hostId: true } },
        },
      },
    },
  });

  if (!asset) {
    return noStore({ error: "Media not found." }, { status: 404 });
  }

  const identity = await resolveChannelIdentity(request);
  const submission = asset.submission;

  let authorized = false;

  if (submission) {
    // H14: FILE playback locked to host/ADMIN, channel MODERATOR, or the
    // uploading member. The old "APPROVED → any member" rule is gone —
    // uploaded tracks may be unreleased, so the crowd cannot stream them.
    // Embeds (Spotify/SoundCloud) are public links served inline; they don't
    // hit this route at all, so this gate is FILE-only by construction.
    if (
      identity.user &&
      canManageChannel(identity.user, { hostId: submission.channel.hostId })
    ) {
      authorized = true;
    } else {
      const membership = await findChannelMembership(
        submission.channelId,
        identity,
      );
      if (membership) {
        authorized =
          membership.role === MemberRole.MODERATOR ||
          membership.id === submission.submitterMemberId;
      }
    }
  } else {
    // Unlinked asset (e.g. a pending upload): only its owner may preview it.
    authorized = Boolean(identity.user && asset.ownerUserId === identity.user.id);
  }

  if (!authorized) {
    return noStore({ error: "Not allowed." }, { status: 403 });
  }

  let url: string;
  try {
    url = await createDownloadUrl({
      key: asset.storageKey,
      contentType: asset.mimeType,
      filename: asset.originalFilename,
    });
  } catch (error) {
    console.error("Failed to presign media download", error);
    return noStore(
      { error: "Storage is not available right now." },
      { status: 500 },
    );
  }

  return noStore({ url });
}
