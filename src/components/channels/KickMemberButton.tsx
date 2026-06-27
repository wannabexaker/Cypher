"use client";

import { LoaderCircle, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type KickMemberButtonProps = {
  channelId: string;
  memberId: string;
  displayName: string;
};

export function KickMemberButton({
  channelId,
  memberId,
  displayName,
}: KickMemberButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function kick() {
    setError("");

    if (
      !window.confirm(
        `Remove ${displayName} from this room? Their past votes stay; their seat in the room is revoked.`,
      )
    ) {
      return;
    }

    setPending(true);
    const response = await fetch(
      `/api/channels/${channelId}/members/${memberId}`,
      { method: "DELETE" },
    );
    setPending(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(payload.error ?? "Unable to remove this member right now.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => void kick()}
      >
        {pending ? (
          <LoaderCircle className="motion-safe:animate-spin" />
        ) : (
          <UserX />
        )}
        Kick
      </Button>
      {error && (
        <p role="alert" className="text-xs text-magenta">
          {error}
        </p>
      )}
    </div>
  );
}
