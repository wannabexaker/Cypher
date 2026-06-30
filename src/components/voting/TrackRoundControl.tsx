"use client";

import { ChannelMember, VoteChoice } from "@prisma/client";
import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  Play,
  Square,
  Check,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { VotingCountdown } from "@/components/voting/VotingCountdown";

type TrackRoundControlProps = {
  submissionId: string;
  channelId: string;
  membership: ChannelMember | null;
  rounds: Array<{
    id: string;
    index: number;
    status: string;
    durationSeconds: number | null;
    openedAt: Date;
    closesAt: Date | null;
    closedAt: Date | null;
  }>;
  roundResultMode: string;
};

type VoterInfo = {
  id: string;
  voterName: string;
  choice: VoteChoice;
  timestamp: Date;
};

export function TrackRoundControl({
  submissionId,
  channelId,
  membership,
  rounds,
  roundResultMode,
}: TrackRoundControlProps) {
  const isHost = membership?.role === "HOST" || membership?.role === "MODERATOR";
  const [isLoading, setIsLoading] = useState(false);
  const [voters, setVoters] = useState<VoterInfo[]>([]);
  const [showVoters, setShowVoters] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(30);
  const DURATIONS = [30, 60, 120, 300];

  const openRound = rounds.find((r) => r.status === "VOTING_OPEN");
  const closedRounds = rounds.filter((r) => r.status === "CLOSED");
  const maxRoundsReached = rounds.length >= 5;

  const fetchVoters = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/channels/${channelId}/submissions/${submissionId}/votes`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setVoters(data.voters || []);
    } catch (error) {
      console.error("Failed to fetch voters:", error);
    }
  }, [channelId, submissionId]);

  useEffect(() => {
    if (showVoters) {
      fetchVoters();
    }
  }, [showVoters, fetchVoters]);

  const handleOpenRound = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/channels/${channelId}/submissions/${submissionId}/rounds`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            durationSeconds: selectedDuration,
          }),
        },
      );
      if (res.ok) {
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to open round:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseRound = async () => {
    if (!openRound) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/channels/${channelId}/submissions/${submissionId}/rounds/${openRound.id}/close`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      if (res.ok) {
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to close round:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdvanceMode = async (mode: "MERGE" | "SELECTED") => {
    setIsLoading(true);
    try {
      const body =
        mode === "SELECTED"
          ? {
              mode: "SELECTED",
              roundId: closedRounds[closedRounds.length - 1]?.id,
            }
          : { mode: "MERGE" };

      const res = await fetch(
        `/api/channels/${channelId}/submissions/${submissionId}/advance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (res.ok) {
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to advance round:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-4 space-y-3">
      {/* Open Round Status and Countdown */}
      {openRound ? (
        <div className="rounded-lg border border-cyan/30 bg-cyan/5 p-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 font-mono text-xs font-bold text-cyan uppercase">
              <Clock className="size-3.5" />
              Round {openRound.index} — Voting Open
            </span>
            {isHost && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCloseRound}
                disabled={isLoading}
              >
                <Square className="mr-1 size-3" />
                Close
              </Button>
            )}
          </div>
          {openRound.closesAt && (
            <div className="mt-2">
              <VotingCountdown closesAt={openRound.closesAt.toISOString()} />
            </div>
          )}
        </div>
      ) : (
        isHost &&
        !maxRoundsReached && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDurationPicker(!showDurationPicker)}
              disabled={isLoading}
              className="gap-2 w-full"
            >
              <Play className="size-3.5" />
              Open Round {rounds.length + 1}
            </Button>

            {showDurationPicker && (
              <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-background/50 p-2">
                {DURATIONS.map((duration) => (
                  <Button
                    key={duration}
                    size="sm"
                    variant={selectedDuration === duration ? "default" : "outline"}
                    onClick={() => {
                      setSelectedDuration(duration);
                      handleOpenRound();
                      setShowDurationPicker(false);
                    }}
                    disabled={isLoading}
                    className="text-xs"
                  >
                    {duration}s
                  </Button>
                ))}
              </div>
            )}
          </>
        )
      )}

      {/* Closed Rounds History */}
      {closedRounds.length > 0 && (
        <div className="space-y-1">
          {closedRounds.map((round) => (
            <div
              key={round.id}
              className="flex items-center justify-between rounded-lg border border-border bg-background/50 p-2.5"
            >
              <span className="font-mono text-xs font-bold text-muted-foreground">
                Round {round.index} — Closed
              </span>
              {isHost && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleAdvanceMode("SELECTED")}
                  disabled={isLoading || roundResultMode === "SELECTED"}
                  className="h-6 px-2 text-xs"
                >
                  Use this
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Result Mode and Who Voted */}
      {closedRounds.length > 0 && isHost && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-border/50 bg-background/30 p-3">
          {/* Merge Mode */}
          <Button
            size="sm"
            variant={roundResultMode === "MERGE" ? "default" : "outline"}
            onClick={() => handleAdvanceMode("MERGE")}
            disabled={isLoading}
            className="gap-2 text-xs"
          >
            <Check className="size-3" />
            Merge All
          </Button>

          {/* Who Voted Panel */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowVoters(!showVoters)}
            className="gap-2 text-xs"
          >
            <Users className="size-3" />
            Voters ({voters.length})
          </Button>
        </div>
      )}

      {/* Voters List */}
      {showVoters && voters.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background/50 p-3">
          <div className="space-y-1">
            {voters.map((voter) => (
              <div
                key={voter.id}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-muted-foreground">{voter.voterName}</span>
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[0.65rem] font-bold ${
                    voter.choice === "WIN"
                      ? "bg-lime/20 text-lime"
                      : "bg-red/20 text-red"
                  }`}
                >
                  {voter.choice}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
