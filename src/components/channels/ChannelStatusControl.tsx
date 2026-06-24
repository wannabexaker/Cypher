"use client";

import { DoorOpen, LoaderCircle, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type ChannelStatusControlProps = {
  channelId: string;
  status: string;
};

export function ChannelStatusControl({
  channelId,
  status,
}: ChannelStatusControlProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const isOpen = status === "OPEN";

  async function handleToggle() {
    setError("");
    setPending(true);

    const response = await fetch(`/api/channels/${channelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: isOpen ? "DRAFT" : "OPEN",
      }),
    });

    const payload = (await response.json()) as { error?: string };
    setPending(false);

    if (!response.ok) {
      setError(payload.error ?? "Unable to change room status.");
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <Button
        type="button"
        variant={isOpen ? "outline" : "gradient"}
        size="lg"
        onClick={handleToggle}
        disabled={pending}
      >
        {pending ? (
          <LoaderCircle className="motion-safe:animate-spin" />
        ) : isOpen ? (
          <LockKeyhole />
        ) : (
          <DoorOpen />
        )}
        {isOpen ? "Close the room" : "Open the room"}
      </Button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-magenta">
          {error}
        </p>
      )}
    </div>
  );
}
