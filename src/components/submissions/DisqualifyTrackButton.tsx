"use client";

import { LoaderCircle, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type DisqualifyTrackButtonProps = {
  channelId: string;
  submissionId: string;
  artistName: string;
  trackTitle: string;
};

export function DisqualifyTrackButton({
  channelId,
  submissionId,
  artistName,
  trackTitle,
}: DisqualifyTrackButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function disqualify() {
    setError("");

    // Browser confirm — disqualify removes the track from live standings,
    // drops the S3 media for uploaded files, and is irreversible from this UI.
    if (
      !window.confirm(
        `Disqualify "${artistName} — ${trackTitle}"? It will drop out of the room, votes, and active contests. This can't be undone here.`,
      )
    ) {
      return;
    }

    setPending(true);
    const response = await fetch(
      `/api/channels/${channelId}/submissions/${submissionId}/disqualify`,
      { method: "POST" },
    );
    setPending(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(payload.error ?? "Unable to disqualify this track right now.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => void disqualify()}
      >
        {pending ? (
          <LoaderCircle className="motion-safe:animate-spin" />
        ) : (
          <ShieldOff />
        )}
        Disqualify
      </Button>
      {error && (
        <p role="alert" className="text-xs text-magenta">
          {error}
        </p>
      )}
    </div>
  );
}
