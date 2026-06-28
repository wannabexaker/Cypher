"use client";

import { LoaderCircle, Sparkles, Swords } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

// H21: single host entry point for starting a contest. Replaces the split
// `ContestStartControl` (leaderboard-only) + `ChannelBattleCreateControl`
// (battle-only) pair — same `POST /api/channels/[channel]/contests` payload,
// just one control with a mode toggle and a bracket size selector that only
// matters for BATTLE.

type Mode = "LEADERBOARD" | "BATTLE";

const BRACKET_SIZES = [2, 4, 8, 16] as const;
type BracketSize = (typeof BRACKET_SIZES)[number];

type Props = {
  channelId: string;
  status: string;
  approvedCount: number;
};

export function ContestStartUnifiedControl({
  channelId,
  status,
  approvedCount,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("LEADERBOARD");
  const [bracketSize, setBracketSize] = useState<BracketSize>(
    (BRACKET_SIZES.find((value) => value <= approvedCount) ?? 2) as BracketSize,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const isOpen = status === "OPEN";
  const battleSizeUnreachable = mode === "BATTLE" && bracketSize > approvedCount;
  const noApprovedTracks = approvedCount === 0;
  const canStart =
    isOpen && !pending && !noApprovedTracks && !battleSizeUnreachable;

  // If approvedCount changes (e.g. new approval) and the current bracket size
  // is out of range, clamp down to the largest reachable size so the host can
  // act without re-picking.
  useEffect(() => {
    if (mode !== "BATTLE") return;
    if (approvedCount <= 0) return;
    if (bracketSize <= approvedCount) return;
    const fallback =
      [...BRACKET_SIZES].reverse().find((value) => value <= approvedCount) ?? 2;
    setBracketSize(fallback as BracketSize);
  }, [approvedCount, bracketSize, mode]);

  async function startContest() {
    if (!canStart) return;
    setError("");
    setInfo("");
    setPending(true);

    try {
      const body =
        mode === "BATTLE"
          ? { mode, bracketSize }
          : { mode };
      const response = await fetch(`/api/channels/${channelId}/contests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "Unable to start a contest.");
        return;
      }

      setInfo(
        mode === "BATTLE"
          ? "Battle bracket created — voting is open."
          : "Leaderboard contest started — voting is open.",
      );
      router.refresh();
    } catch {
      setError("Unable to start a contest.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <fieldset>
        <legend className="font-mono text-[0.6875rem] font-bold tracking-[0.16em] text-muted-foreground uppercase">
          Mode
        </legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(
            [
              {
                value: "LEADERBOARD" as const,
                label: "Leaderboard",
                hint: "All approved tracks compete on W%.",
              },
              {
                value: "BATTLE" as const,
                label: "Battle bracket",
                hint: "Single-elimination from the top seeds.",
              },
            ]
          ).map((option) => {
            const selected = mode === option.value;
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border bg-background px-3 py-3 text-sm transition ${
                  selected
                    ? "border-primary-glow/60"
                    : "border-border hover:border-border/80"
                }`}
              >
                <span className="flex items-center gap-2 font-bold text-foreground">
                  <input
                    type="radio"
                    name="contest-mode"
                    value={option.value}
                    checked={selected}
                    disabled={!isOpen || pending}
                    onChange={() => setMode(option.value)}
                    className="size-4 accent-primary-glow"
                  />
                  {option.label}
                </span>
                <span className="ml-6 text-xs leading-5 text-muted-foreground">
                  {option.hint}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {mode === "BATTLE" && (
        <fieldset className="mt-5">
          <legend className="font-mono text-[0.6875rem] font-bold tracking-[0.16em] text-muted-foreground uppercase">
            Bracket size
          </legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {BRACKET_SIZES.map((value) => {
              const reachable = value <= approvedCount;
              const selected = bracketSize === value;
              return (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm transition ${
                    selected ? "border-cyan/60" : "border-border"
                  } ${reachable ? "" : "opacity-50"}`}
                >
                  <input
                    type="radio"
                    name="battle-bracket-size"
                    value={value}
                    checked={selected}
                    disabled={!isOpen || !reachable || pending}
                    onChange={() => setBracketSize(value)}
                    className="size-4 accent-cyan"
                  />
                  <span className="font-mono font-bold text-foreground">
                    {value}
                  </span>
                </label>
              );
            })}
          </div>
          {battleSizeUnreachable && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Approve at least {bracketSize} tracks to start this size.
            </p>
          )}
        </fieldset>
      )}

      <Button
        type="button"
        size="sm"
        className="mt-6 w-full"
        disabled={!canStart}
        onClick={() => void startContest()}
      >
        {pending ? (
          <LoaderCircle className="motion-safe:animate-spin" />
        ) : mode === "BATTLE" ? (
          <Swords aria-hidden="true" />
        ) : (
          <Sparkles aria-hidden="true" />
        )}
        {mode === "BATTLE" ? "Create battle bracket" : "Start leaderboard contest"}
      </Button>

      {!isOpen && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Contests can only start while the room is open.
        </p>
      )}

      {isOpen && noApprovedTracks && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Approve at least one track before starting a contest.
        </p>
      )}

      {info && <p className="mt-3 text-sm text-lime">{info}</p>}

      {error && (
        <p role="alert" className="mt-3 text-sm text-magenta">
          {error}
        </p>
      )}
    </div>
  );
}
