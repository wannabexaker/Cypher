import webpush, { type WebPushError } from "web-push";

import { prisma } from "@/lib/prisma";

// Payload delivered to the service worker. Kept free of PII beyond the room
// title/time so a leaked endpoint never exposes voter identity.
export type ChannelPushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

let vapidConfigured = false;

// Configure web-push once from server-only env. Returns false (and stays a
// no-op) whenever the private key is missing, so dev/build work without keys.
function ensureVapid(): boolean {
  if (vapidConfigured) {
    return true;
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

function isGoneStatus(error: unknown): boolean {
  const status = (error as WebPushError | undefined)?.statusCode;
  return status === 404 || status === 410;
}

// Best-effort fan-out of a push notification to every subscription on a room.
// Never throws into the caller: send failures are swallowed and dead endpoints
// (404/410) are pruned. A no-op when VAPID is not configured.
export async function sendChannelPush(
  channelId: string,
  payload: ChannelPushPayload,
): Promise<void> {
  if (!ensureVapid()) {
    return;
  }

  let subscriptions: Array<{
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;
  try {
    subscriptions = await prisma.pushSubscription.findMany({
      where: { channelId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
  } catch {
    return;
  }

  if (subscriptions.length === 0) {
    return;
  }

  const body = JSON.stringify(payload);
  const stale: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
        );
      } catch (error) {
        if (isGoneStatus(error)) {
          stale.push(subscription.id);
        }
      }
    }),
  );

  if (stale.length > 0) {
    try {
      await prisma.pushSubscription.deleteMany({ where: { id: { in: stale } } });
    } catch {
      // Pruning is best-effort; ignore failures.
    }
  }
}
