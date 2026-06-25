"use client";

import { Bell, BellOff, BellRing } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type PushOptInProps = {
  // Channel code used for the push subscribe/unsubscribe API.
  code: string;
  // Mirror of NEXT_PUBLIC_VAPID_PUBLIC_KEY; required to subscribe.
  vapidPublicKey: string;
};

type Status =
  | "loading"
  | "unsupported"
  | "idle"
  | "working"
  | "subscribed"
  | "denied"
  | "error";

// Decode a base64url VAPID public key into the Uint8Array the PushManager wants.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function PushOptIn({ code, vapidPublicKey }: PushOptInProps) {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let active = true;

    if (!isSupported() || !vapidPublicKey) {
      setStatus("unsupported");
      return;
    }

    navigator.serviceWorker
      .getRegistration("/sw.js")
      .then((registration) => registration?.pushManager.getSubscription() ?? null)
      .then((subscription) => {
        if (!active) return;
        setStatus(subscription ? "subscribed" : "idle");
      })
      .catch(() => {
        if (active) setStatus("idle");
      });

    return () => {
      active = false;
    };
  }, [vapidPublicKey]);

  const subscribe = useCallback(async () => {
    setStatus("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      const json = subscription.toJSON();
      const response = await fetch(`/api/channels/${code}/push`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });

      if (!response.ok) {
        setStatus("error");
        return;
      }
      setStatus("subscribed");
    } catch {
      setStatus("error");
    }
  }, [code, vapidPublicKey]);

  const unsubscribe = useCallback(async () => {
    setStatus("working");
    try {
      const registration =
        await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        await fetch(`/api/channels/${code}/push`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }, [code]);

  if (status === "loading" || status === "unsupported") {
    return null;
  }

  const subscribed = status === "subscribed";
  const working = status === "working";

  return (
    <div className="rounded-xl border border-border bg-elevated p-6">
      <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-[0.16em] text-cyan uppercase">
        <Bell className="size-4" aria-hidden="true" />
        Notifications
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {subscribed
          ? "You'll get a push when the host opens or closes voting — even with this tab closed."
          : "Get a push when the host opens or closes voting, even with this tab closed."}
      </p>

      {status === "denied" && (
        <p className="mt-3 text-sm leading-6 text-magenta">
          Notifications are blocked in your browser settings. Re-enable them to
          subscribe.
        </p>
      )}
      {status === "error" && (
        <p className="mt-3 text-sm leading-6 text-magenta">
          Something went wrong. Try again.
        </p>
      )}

      <Button
        type="button"
        variant={subscribed ? "outline" : "default"}
        size="sm"
        className="mt-4"
        disabled={working || status === "denied"}
        onClick={subscribed ? unsubscribe : subscribe}
      >
        {subscribed ? (
          <>
            <BellOff className="size-4" aria-hidden="true" />
            Turn off notifications
          </>
        ) : (
          <>
            <BellRing className="size-4" aria-hidden="true" />
            {working ? "Working…" : "Get notified"}
          </>
        )}
      </Button>
    </div>
  );
}
