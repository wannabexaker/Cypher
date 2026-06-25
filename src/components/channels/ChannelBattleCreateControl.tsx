"use client";

import { LoaderCircle, Swords } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type ChannelBattleCreateControlProps = {
  channelId: string;
  status: string;
  approvedCount: number;
};

const OPTIONS = [2, 4, 8, 16] as const;

export function ChannelBattleCreateControl({
  channelId,
  status,
  approvedCount,
}: ChannelBattleCreateControlProps) {
  const router = useRouter();
  const [k, setK] = useState<number>(
    OPTIONS.find((value) => value <= approvedCount) ?? 2,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const isOpen = status === "OPEN";

  async function createBattle() {
    if (pending) return;
    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/channels/${channelId}/battles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Unable to create the battle bracket.");
        return;
      }

      router.refresh();
    } catch {
      setError("Unable to create the battle bracket.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-4">
        {OPTIONS.map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm has-checked:border-cyan/50"
          >
            <input
              type="radio"
              name="battle-k"
              value={value}
              checked={k === value}
              disabled={!isOpen || value > approvedCount || pending}
              onChange={() => setK(value)}
              className="size-4 accent-cyan"
            />
            <span className="font-mono font-bold text-foreground">{value}</span>
          </label>
        ))}
      </div>

      <Button
        type="button"
        size="sm"
        className="mt-4 w-full"
        disabled={!isOpen || pending || k > approvedCount}
        onClick={() => void createBattle()}
      >
        {pending ? (
          <LoaderCircle className="motion-safe:animate-spin" />
        ) : (
          <Swords aria-hidden="true" />
        )}
        Create battle bracket
      </Button>

      {!isOpen && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Battle brackets can only start while the room is open.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-magenta">
          {error}
        </p>
      )}
    </div>
  );
}
