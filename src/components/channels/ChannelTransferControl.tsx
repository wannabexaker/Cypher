"use client";

import { LoaderCircle, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

// H14: transfer the room to another REGISTERED member (no guests). The picker
// only shows members with a userId — guests are filtered server-side.
type TransferableMember = {
  id: string;
  displayName: string;
};

type ChannelTransferControlProps = {
  channelId: string;
  candidates: TransferableMember[];
};

export function ChannelTransferControl({
  channelId,
  candidates,
}: ChannelTransferControlProps) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [phase, setPhase] = useState<"idle" | "confirm" | "pending">("idle");
  const [error, setError] = useState("");

  const chosen = candidates.find((member) => member.id === selected);
  const busy = phase === "pending";

  if (candidates.length === 0) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        No registered members to transfer to yet. Hosts must be accounts —
        invite a teammate to sign up and join first.
      </p>
    );
  }

  async function submit() {
    if (!selected || busy) return;
    setError("");
    setPhase("pending");
    try {
      const response = await fetch(`/api/channels/${channelId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: selected }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to transfer this room.");
        setPhase("confirm");
        return;
      }
      router.refresh();
    } catch {
      setError("Unable to transfer this room.");
      setPhase("confirm");
    }
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
          New host
        </span>
        <select
          value={selected}
          onChange={(event) => {
            setSelected(event.target.value);
            setPhase("idle");
            setError("");
          }}
          disabled={busy}
          className="mt-2 block min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value="">Pick a member…</option>
          {candidates.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </select>
      </label>

      {phase === "idle" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!selected}
          onClick={() => setPhase("confirm")}
        >
          <UserCog />
          Transfer room
        </Button>
      )}

      {(phase === "confirm" || phase === "pending") && chosen && (
        <div className="rounded-lg border border-magenta/40 bg-magenta/5 p-4">
          <p className="text-sm leading-6 text-foreground">
            Transfer this room to{" "}
            <span className="font-bold">{chosen.displayName}</span>? You&apos;ll
            no longer be the host.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="gradient"
              size="sm"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? (
                <LoaderCircle className="motion-safe:animate-spin" />
              ) : (
                <UserCog />
              )}
              Confirm transfer
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setPhase("idle")}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      )}
    </div>
  );
}
