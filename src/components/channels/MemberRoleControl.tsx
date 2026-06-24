"use client";

import { LoaderCircle, ShieldCheck, ShieldMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type MemberRole = "HOST" | "MODERATOR" | "MEMBER";

type MemberRoleControlProps = {
  channelId: string;
  memberId: string;
  role: MemberRole;
};

export function MemberRoleControl({
  channelId,
  memberId,
  role,
}: MemberRoleControlProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const nextRole: MemberRole = role === "MODERATOR" ? "MEMBER" : "MODERATOR";
  const isPromote = nextRole === "MODERATOR";

  async function changeRole() {
    setError("");
    setPending(true);

    const response = await fetch(
      `/api/channels/${channelId}/members/${memberId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      },
    );

    setPending(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(payload.error ?? "Unable to update this member.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        type="button"
        variant={isPromote ? "outline" : "ghost"}
        size="sm"
        disabled={pending}
        onClick={() => void changeRole()}
      >
        {pending ? (
          <LoaderCircle className="motion-safe:animate-spin" />
        ) : isPromote ? (
          <ShieldCheck />
        ) : (
          <ShieldMinus />
        )}
        {isPromote ? "Make moderator" : "Remove moderator"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-magenta">
          {error}
        </p>
      )}
    </div>
  );
}
