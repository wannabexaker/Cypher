"use client";

import { motion, useReducedMotion } from "framer-motion";
import { EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getVoteSplit } from "@/lib/votes";

type VoteChoice = "WIN" | "LOSS";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: "dark";
      size: "flexible";
      appearance: "interaction-only";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type VoteControlProps = {
  code: string;
  submissionId: string;
  initialWinCount: number;
  initialLossCount: number;
  initialChoice?: VoteChoice;
  canVote: boolean;
  disabledReason?: string;
  turnstileSiteKey?: string;
  showCounts?: boolean;
  countsHiddenLabel?: string;
  votePath?: string;
  extraPayload?: Record<string, string>;
};

type VoteResponse = {
  error?: string;
  winCount?: number;
  lossCount?: number;
  yourChoice?: VoteChoice;
};

export function VoteControl({
  code,
  submissionId,
  initialWinCount,
  initialLossCount,
  initialChoice,
  canVote,
  disabledReason,
  turnstileSiteKey,
  showCounts = true,
  countsHiddenLabel,
  votePath,
  extraPayload,
}: VoteControlProps) {
  const reduceMotion = useReducedMotion();
  const [winCount, setWinCount] = useState(initialWinCount);
  const [lossCount, setLossCount] = useState(initialLossCount);
  const [choice, setChoice] = useState<VoteChoice | undefined>(initialChoice);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetRef = useRef<string | null>(null);

  const { total, winPct, lossPct } = getVoteSplit({ winCount, lossCount });
  const needsTurnstile = Boolean(turnstileSiteKey);

  function renderTurnstile() {
    if (
      !turnstileSiteKey ||
      !window.turnstile ||
      !turnstileContainerRef.current ||
      turnstileWidgetRef.current
    ) {
      return;
    }

    turnstileWidgetRef.current = window.turnstile.render(
      turnstileContainerRef.current,
      {
        sitekey: turnstileSiteKey,
        theme: "dark",
        size: "flexible",
        appearance: "interaction-only",
        callback: setTurnstileToken,
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => {
          setTurnstileToken("");
          setMessage("Anti-bot verification failed. Try again.");
        },
      },
    );
  }

  useEffect(
    () => () => {
      if (turnstileWidgetRef.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetRef.current);
      }
    },
    [],
  );

  async function cast(nextChoice: VoteChoice) {
    if (
      !canVote ||
      pending ||
      choice === nextChoice ||
      (needsTurnstile && !turnstileToken)
    ) {
      return;
    }

    setPending(true);
    setMessage("");

    try {
      const response = await fetch(votePath ?? `/api/channels/${code}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          choice: nextChoice,
          ...(extraPayload ?? {}),
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      const payload = (await response.json()) as VoteResponse;

      if (
        !response.ok ||
        payload.winCount === undefined ||
        payload.lossCount === undefined ||
        !payload.yourChoice
      ) {
        setMessage(payload.error ?? "Unable to record your vote.");
        return;
      }

      setWinCount(payload.winCount);
      setLossCount(payload.lossCount);
      setChoice(payload.yourChoice);
      setMessage(
        choice && choice !== payload.yourChoice
          ? `Vote flipped to ${payload.yourChoice === "WIN" ? "W" : "L"}.`
          : "Vote locked.",
      );
    } catch {
      setMessage("Unable to record your vote.");
    } finally {
      setPending(false);
      if (turnstileWidgetRef.current && window.turnstile) {
        window.turnstile.reset(turnstileWidgetRef.current);
        setTurnstileToken("");
      }
    }
  }

  return (
    <section className="mt-4 border-t border-border pt-4" aria-label="Track voting">
      {showCounts ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
              Crowd verdict
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {total} {total === 1 ? "vote" : "votes"}
            </p>
          </div>

          <div
            className="mt-3 overflow-hidden rounded-full border border-border bg-surface"
            role="img"
            aria-label={`${winPct}% win, ${lossPct}% loss`}
          >
            <div className="flex h-3">
              <motion.div
                className={cn(
                  "h-full bg-lime",
                  total === 0 && "bg-muted-foreground",
                )}
                initial={false}
                animate={{ width: `${winPct}%` }}
                transition={
                  reduceMotion ? { duration: 0 } : { duration: 0.3, ease: "easeOut" }
                }
              />
              <motion.div
                className={cn("h-full bg-magenta", total === 0 && "bg-border")}
                initial={false}
                animate={{ width: `${lossPct}%` }}
                transition={
                  reduceMotion ? { duration: 0 } : { duration: 0.3, ease: "easeOut" }
                }
              />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between font-mono text-xs font-bold">
            <span className={total === 0 ? "text-muted-foreground" : "text-lime"}>
              W {winPct}%
            </span>
            <span className={total === 0 ? "text-muted-foreground" : "text-magenta"}>
              L {lossPct}%
            </span>
          </div>
        </>
      ) : (
        countsHiddenLabel && (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <EyeOff className="size-3.5 text-cyan" aria-hidden="true" />
            {countsHiddenLabel}
          </p>
        )
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant={choice === "WIN" ? "lime" : "outline"}
          aria-pressed={choice === "WIN"}
          disabled={
            !canVote ||
            pending ||
            choice === "WIN" ||
            (needsTurnstile && !turnstileToken)
          }
          onClick={() => void cast("WIN")}
        >
          {pending ? <LoaderCircle className="motion-safe:animate-spin" /> : "W"}
          Win
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-pressed={choice === "LOSS"}
          className={cn(
            choice === "LOSS" &&
              "border-magenta bg-magenta/15 text-magenta shadow-glow-magenta",
          )}
          disabled={
            !canVote ||
            pending ||
            choice === "LOSS" ||
            (needsTurnstile && !turnstileToken)
          }
          onClick={() => void cast("LOSS")}
        >
          {pending ? <LoaderCircle className="motion-safe:animate-spin" /> : "L"}
          Loss
        </Button>
      </div>

      {turnstileSiteKey && canVote && (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
            onReady={renderTurnstile}
          />
          <div ref={turnstileContainerRef} className="mt-4 min-h-16" />
          <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-cyan" aria-hidden="true" />
            {turnstileToken
              ? "Anti-bot check ready."
              : "Complete the anti-bot check to vote."}
          </p>
        </>
      )}

      {!canVote && disabledReason && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {disabledReason}
        </p>
      )}
      <p
        aria-live="polite"
        className={cn(
          "mt-3 min-h-5 text-sm",
          message.includes("Unable") ||
            message.includes("failed") ||
            message.includes("Too many")
            ? "text-magenta"
            : "text-cyan",
        )}
      >
        {message}
      </p>
    </section>
  );
}
