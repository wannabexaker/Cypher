"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

// H14: destructive delete. We require the host to type the exact channel name
// so a misclick can't nuke a live room.
type ChannelDeleteControlProps = {
  channelId: string;
  channelName: string;
};

export function ChannelDeleteControl({
  channelId,
  channelName,
}: ChannelDeleteControlProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "confirm" | "pending">("idle");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");

  const matches = typed.trim() === channelName;
  const busy = phase === "pending";

  async function submit() {
    if (!matches || busy) return;
    setError("");
    setPhase("pending");
    try {
      const response = await fetch(`/api/channels/${channelId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(payload.error ?? "Unable to delete this channel.");
        setPhase("confirm");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to delete this channel.");
      setPhase("confirm");
    }
  }

  if (phase === "idle") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setPhase("confirm")}
        className="border-magenta/40 text-magenta hover:bg-magenta/10"
      >
        <Trash2 />
        Delete competition
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-magenta/40 bg-magenta/5 p-4">
      <p className="text-sm leading-6 text-foreground">
        This will permanently delete the channel, every submission, every vote
        and every uploaded file. There is no undo.
      </p>
      <label className="block">
        <span className="font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
          Type the channel name to confirm
        </span>
        <input
          type="text"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          disabled={busy}
          placeholder={channelName}
          autoComplete="off"
          className="mt-2 block min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:border-magenta focus:outline-none"
        />
      </label>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="gradient"
          size="sm"
          disabled={!matches || busy}
          onClick={() => void submit()}
          className="bg-magenta hover:bg-magenta/90"
        >
          {busy ? (
            <LoaderCircle className="motion-safe:animate-spin" />
          ) : (
            <Trash2 />
          )}
          Delete permanently
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            setPhase("idle");
            setTyped("");
            setError("");
          }}
        >
          Cancel
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      )}
    </div>
  );
}
