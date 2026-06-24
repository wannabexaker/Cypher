"use client";

import { Check, LoaderCircle, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { TrackPlayer } from "./TrackPlayer";

export type PendingSubmission = {
  id: string;
  artistName: string;
  trackTitle: string;
  description: string | null;
  sourceType: string;
  mediaAssetId: string | null;
  externalUrl: string | null;
  submitterName: string;
  createdAt: string;
};

function PendingCard({ submission }: { submission: PendingSubmission }) {
  const router = useRouter();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");

  async function review(decision: "APPROVE" | "REJECT") {
    setError("");
    setPending(decision === "APPROVE" ? "approve" : "reject");

    const response = await fetch(`/api/submissions/${submission.id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        rejectionReason:
          decision === "REJECT" ? reason.trim() || undefined : undefined,
      }),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setPending(null);
      setError(payload.error ?? "Unable to record your decision.");
      return;
    }

    router.refresh();
  }

  return (
    <li className="rounded-lg border border-border bg-background p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold text-foreground">
            {submission.artistName} — {submission.trackTitle}
          </p>
          <p className="mt-1 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <UserRound className="size-3.5" />
            {submission.submitterName}
          </p>
        </div>
        <span className="font-mono text-[0.625rem] font-bold tracking-[0.12em] text-cyan uppercase">
          {submission.sourceType}
        </span>
      </div>

      {submission.description && (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
          {submission.description}
        </p>
      )}

      <TrackPlayer
        sourceType={submission.sourceType}
        mediaAssetId={submission.mediaAssetId}
        externalUrl={submission.externalUrl}
        trackTitle={submission.trackTitle}
        artistName={submission.artistName}
      />

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="lime"
          size="sm"
          disabled={pending !== null}
          onClick={() => void review("APPROVE")}
        >
          {pending === "approve" ? (
            <LoaderCircle className="motion-safe:animate-spin" />
          ) : (
            <Check />
          )}
          Approve
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending !== null}
          onClick={() => setShowReject((value) => !value)}
        >
          <X />
          Reject
        </Button>
      </div>

      {showReject && (
        <div className="mt-4 grid gap-3">
          <label
            htmlFor={`reason-${submission.id}`}
            className="text-sm font-bold text-foreground"
          >
            Rejection reason (optional)
          </label>
          <Input
            id={`reason-${submission.id}`}
            maxLength={500}
            placeholder="Tell the artist why."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button
            type="button"
            variant="default"
            size="sm"
            className="w-fit"
            disabled={pending !== null}
            onClick={() => void review("REJECT")}
          >
            {pending === "reject" ? (
              <LoaderCircle className="motion-safe:animate-spin" />
            ) : (
              <X />
            )}
            Confirm rejection
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-magenta">
          {error}
        </p>
      )}
    </li>
  );
}

export function ModerationQueue({
  submissions,
}: {
  submissions: PendingSubmission[];
}) {
  if (submissions.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-background px-4 py-6 text-sm text-muted-foreground">
        No submissions are waiting for review.
      </p>
    );
  }

  return (
    <ul className="grid gap-4">
      {submissions.map((submission) => (
        <PendingCard key={submission.id} submission={submission} />
      ))}
    </ul>
  );
}
