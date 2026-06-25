import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SubmissionStatus } from "@prisma/client";
import { ArrowLeft, Crown, ShieldCheck } from "lucide-react";

import { ChannelStatusBadge } from "@/components/channels/ChannelStatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { getBattleState } from "@/lib/battles";
import { canManageChannel } from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { compareWinRatio, getVoteSplit } from "@/lib/votes";

export const metadata: Metadata = {
  title: "Channel stats",
  description: "Host analytics and audit log for a channel.",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ audit?: string }>;
};

const AUDIT_PAGE_SIZE = 25;

function asPage(value?: string) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function compactPercent(value: number) {
  return `${Math.max(0, Math.min(100, value))}%`;
}

function summarizeMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return "-";
  try {
    const raw = JSON.stringify(metadata);
    return raw.length > 140 ? `${raw.slice(0, 140)}...` : raw;
  } catch {
    return "-";
  }
}

function formatHourBucket(date: Date) {
  const bucket = new Date(date);
  bucket.setMinutes(0, 0, 0);
  return bucket;
}

export default async function ChannelStatsPage({ params, searchParams }: PageProps) {
  const [user, { id: channelId }, query] = await Promise.all([
    getCurrentUser(),
    params,
    searchParams,
  ]);

  if (!user) redirect("/login");

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      hostId: true,
      completedAt: true,
      championSubmissionId: true,
    },
  });

  if (!channel || !canManageChannel(user, channel)) notFound();

  const auditPage = asPage(query.audit);

  const [
    roleGroups,
    participationGroups,
    submissionGroups,
    approvedTracks,
    qualifyingVoteGroups,
    qualifyingVoteEvents,
    qualifyingNetworks,
    champion,
    battleRoundCount,
    battleState,
    auditTotal,
    auditRows,
  ] = await Promise.all([
    prisma.channelMember.groupBy({
      by: ["role"],
      where: { channelId: channel.id },
      _count: { _all: true },
    }),
    prisma.channelMember.groupBy({
      by: ["participation"],
      where: { channelId: channel.id },
      _count: { _all: true },
    }),
    prisma.submission.groupBy({
      by: ["status"],
      where: { channelId: channel.id },
      _count: { _all: true },
    }),
    prisma.submission.findMany({
      where: { channelId: channel.id, status: SubmissionStatus.APPROVED },
      select: {
        id: true,
        artistName: true,
        trackTitle: true,
      },
    }),
    prisma.vote.groupBy({
      by: ["submissionId", "choice"],
      where: {
        channelId: channel.id,
        isValid: true,
        matchupId: null,
      },
      _count: { _all: true },
    }),
    prisma.vote.findMany({
      where: {
        channelId: channel.id,
        isValid: true,
        matchupId: null,
      },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.vote.groupBy({
      by: ["ipHash"],
      where: {
        channelId: channel.id,
        isValid: true,
        matchupId: null,
      },
      _count: { _all: true },
    }),
    channel.championSubmissionId
      ? prisma.submission.findUnique({
          where: { id: channel.championSubmissionId },
          select: { id: true, artistName: true, trackTitle: true },
        })
      : Promise.resolve(null),
    prisma.battleRound.count({ where: { channelId: channel.id } }),
    getBattleState(channel.id).catch(() => null),
    prisma.auditLog.count({
      where: {
        OR: [
          { entityId: channel.id },
          { metadata: { path: ["channelId"], equals: channel.id } },
        ],
      },
    }),
    prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: channel.id },
          { metadata: { path: ["channelId"], equals: channel.id } },
        ],
      },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (auditPage - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
  ]);

  const roleCounts = {
    HOST: roleGroups.find((entry) => entry.role === "HOST")?._count._all ?? 0,
    MODERATOR:
      roleGroups.find((entry) => entry.role === "MODERATOR")?._count._all ?? 0,
    MEMBER:
      roleGroups.find((entry) => entry.role === "MEMBER")?._count._all ?? 0,
  };

  const participationCounts = {
    ARTIST:
      participationGroups.find((entry) => entry.participation === "ARTIST")?._count
        ._all ?? 0,
    JUDGE:
      participationGroups.find((entry) => entry.participation === "JUDGE")?._count
        ._all ?? 0,
    UNASSIGNED:
      participationGroups.find((entry) => entry.participation === null)?._count._all ??
      0,
  };

  const submissionCounts = {
    PENDING:
      submissionGroups.find((entry) => entry.status === "PENDING")?._count._all ?? 0,
    APPROVED:
      submissionGroups.find((entry) => entry.status === "APPROVED")?._count._all ?? 0,
    REJECTED:
      submissionGroups.find((entry) => entry.status === "REJECTED")?._count._all ?? 0,
  };

  const qualifyingCountMap = new Map<
    string,
    { winCount: number; lossCount: number }
  >();
  for (const grouped of qualifyingVoteGroups) {
    const current = qualifyingCountMap.get(grouped.submissionId) ?? {
      winCount: 0,
      lossCount: 0,
    };
    if (grouped.choice === "WIN") {
      current.winCount = grouped._count._all;
    } else {
      current.lossCount = grouped._count._all;
    }
    qualifyingCountMap.set(grouped.submissionId, current);
  }

  const rankedTracks = approvedTracks
    .map((track) => {
      const counts = qualifyingCountMap.get(track.id) ?? {
        winCount: 0,
        lossCount: 0,
      };
      const split = getVoteSplit(counts);
      return {
        ...track,
        ...counts,
        total: split.total,
        winPct: split.winPct,
      };
    })
    .sort((a, b) => {
      const ratioOrder = compareWinRatio(b, a);
      if (ratioOrder !== 0) return ratioOrder;
      return b.total - a.total;
    });

  const qualifyingVoteTotal = rankedTracks.reduce((sum, track) => sum + track.total, 0);

  const hourBuckets = new Map<string, { at: Date; total: number }>();
  for (const event of qualifyingVoteEvents) {
    const hour = formatHourBucket(event.createdAt);
    const key = hour.toISOString();
    const bucket = hourBuckets.get(key) ?? { at: hour, total: 0 };
    bucket.total += 1;
    hourBuckets.set(key, bucket);
  }
  const voteTimeline = [...hourBuckets.values()].sort(
    (a, b) => a.at.getTime() - b.at.getTime(),
  );
  const maxBucket = voteTimeline.reduce((max, point) => Math.max(max, point.total), 0);

  const auditPages = Math.max(1, Math.ceil(auditTotal / AUDIT_PAGE_SIZE));
  const prevAuditPage = auditPage > 1 ? auditPage - 1 : null;
  const nextAuditPage = auditPage < auditPages ? auditPage + 1 : null;

  return (
    <div className="section-shell py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/dashboard/channels/${channel.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft />
          Back to room control
        </Link>
        <ChannelStatusBadge status={channel.status} />
      </div>

      <section className="mt-6 rounded-xl border border-border bg-elevated p-6 shadow-panel">
        <p className="section-kicker">Host analytics</p>
        <h1 className="display-text mt-3 text-[clamp(2.5rem,7vw,4.75rem)] leading-[0.9] text-foreground">
          {channel.name}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Channel code: <span className="font-mono text-foreground">{channel.code}</span>
        </p>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <article className="rounded-xl border border-border bg-elevated p-5 shadow-panel sm:p-6">
          <h2 className="text-xl font-bold text-foreground">Participation</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2" role="list" aria-label="Participation by role and seat type">
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="font-mono text-[0.625rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">Roles</p>
              <ul className="mt-3 space-y-2 text-sm text-foreground">
                <li className="flex justify-between"><span>Host</span><span className="font-mono">{roleCounts.HOST}</span></li>
                <li className="flex justify-between"><span>Moderator</span><span className="font-mono">{roleCounts.MODERATOR}</span></li>
                <li className="flex justify-between"><span>Member</span><span className="font-mono">{roleCounts.MEMBER}</span></li>
              </ul>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="font-mono text-[0.625rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">Seats</p>
              <ul className="mt-3 space-y-2 text-sm text-foreground">
                <li className="flex justify-between"><span>Artists</span><span className="font-mono">{participationCounts.ARTIST}</span></li>
                <li className="flex justify-between"><span>Judges</span><span className="font-mono">{participationCounts.JUDGE}</span></li>
                <li className="flex justify-between"><span>Unassigned</span><span className="font-mono">{participationCounts.UNASSIGNED}</span></li>
              </ul>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-border bg-elevated p-5 shadow-panel sm:p-6">
          <h2 className="text-xl font-bold text-foreground">Submissions</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="mt-2 font-mono text-2xl font-bold text-foreground">{submissionCounts.PENDING}</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">Approved</p>
              <p className="mt-2 font-mono text-2xl font-bold text-lime">{submissionCounts.APPROVED}</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">Rejected</p>
              <p className="mt-2 font-mono text-2xl font-bold text-magenta">{submissionCounts.REJECTED}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-elevated p-5 shadow-panel sm:p-6">
        <h2 className="text-xl font-bold text-foreground">Qualifying voting</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">Total qualifying votes</p>
            <p className="mt-2 font-mono text-2xl font-bold text-foreground">{qualifyingVoteTotal}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">Distinct hashed networks</p>
            <p className="mt-2 font-mono text-2xl font-bold text-foreground">{qualifyingNetworks.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">Approved tracks ranked</p>
            <p className="mt-2 font-mono text-2xl font-bold text-foreground">{rankedTracks.length}</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">Votes over time (hourly)</p>
          {voteTimeline.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No qualifying votes yet.</p>
          ) : (
            <ul className="mt-3 space-y-2" aria-label="Qualifying votes by hour">
              {voteTimeline.map((point) => (
                <li key={point.at.toISOString()} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("en", {
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                    }).format(point.at)}
                  </span>
                  <div className="h-2 overflow-hidden rounded-full border border-border bg-surface">
                    <div
                      className="h-full bg-cyan"
                      style={{ width: compactPercent(Math.round((point.total / Math.max(1, maxBucket)) * 100)) }}
                    />
                  </div>
                  <span className="font-mono text-xs text-foreground">{point.total}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <table className="w-full border-collapse bg-background text-left text-sm">
            <caption className="sr-only">Approved tracks ranked by qualifying win ratio</caption>
            <thead className="bg-surface">
              <tr>
                <th scope="col" className="px-3 py-2 font-mono text-[0.625rem] tracking-[0.12em] text-muted-foreground uppercase">Track</th>
                <th scope="col" className="px-3 py-2 font-mono text-[0.625rem] tracking-[0.12em] text-muted-foreground uppercase">W</th>
                <th scope="col" className="px-3 py-2 font-mono text-[0.625rem] tracking-[0.12em] text-muted-foreground uppercase">L</th>
                <th scope="col" className="px-3 py-2 font-mono text-[0.625rem] tracking-[0.12em] text-muted-foreground uppercase">Total</th>
                <th scope="col" className="px-3 py-2 font-mono text-[0.625rem] tracking-[0.12em] text-muted-foreground uppercase">W%</th>
              </tr>
            </thead>
            <tbody>
              {rankedTracks.map((track) => (
                <tr key={track.id} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 font-medium text-foreground">
                    {track.artistName} - {track.trackTitle}
                  </th>
                  <td className="px-3 py-2 font-mono text-lime">{track.winCount}</td>
                  <td className="px-3 py-2 font-mono text-magenta">{track.lossCount}</td>
                  <td className="px-3 py-2 font-mono">{track.total}</td>
                  <td className="px-3 py-2 font-mono">{track.winPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <article className="rounded-xl border border-border bg-elevated p-5 shadow-panel sm:p-6">
          <h2 className="text-xl font-bold text-foreground">Results</h2>
          {channel.status === "COMPLETED" && champion ? (
            <div className="mt-4 rounded-lg border border-lime/30 bg-lime/10 p-4">
              <p className="inline-flex items-center gap-2 font-mono text-[0.6875rem] font-bold tracking-[0.12em] text-lime uppercase">
                <Crown className="size-3.5" />
                Champion
              </p>
              <p className="mt-2 text-lg font-bold text-foreground">
                {champion.artistName} - {champion.trackTitle}
              </p>
              {channel.completedAt && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Completed {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(channel.completedAt)}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Champion and completion timestamp will appear once the room is completed.
            </p>
          )}
        </article>

        <article className="rounded-xl border border-border bg-elevated p-5 shadow-panel sm:p-6">
          <h2 className="text-xl font-bold text-foreground">Battle summary</h2>
          {battleRoundCount === 0 || !battleState ? (
            <p className="mt-4 text-sm text-muted-foreground">No battle rounds recorded for this room.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {battleState.rounds.map((round) => (
                <section key={round.id} className="rounded-lg border border-border bg-background p-3">
                  <p className="font-mono text-[0.625rem] font-bold tracking-[0.12em] text-cyan uppercase">
                    Round {round.roundNumber} ({round.status.replaceAll("_", " ")})
                  </p>
                  <ul className="mt-3 space-y-2">
                    {round.matchups.map((matchup) => (
                      <li key={matchup.id} className="rounded-md border border-border px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm text-foreground">
                            {matchup.submissionA.trackTitle} vs {matchup.submissionB?.trackTitle ?? "TBD"}
                          </p>
                          <span className="font-mono text-xs text-muted-foreground">
                            Winner: {matchup.winnerSubmissionId === matchup.submissionA.id
                              ? matchup.submissionA.trackTitle
                              : matchup.winnerSubmissionId === matchup.submissionB?.id
                                ? matchup.submissionB.trackTitle
                                : "-"}
                          </span>
                        </div>
                        <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                          <p className="text-muted-foreground">
                            A: W {matchup.sideA.winCount} / L {matchup.sideA.lossCount} ({matchup.sideA.winPct}%)
                          </p>
                          <p className="text-muted-foreground">
                            B: W {matchup.sideB?.winCount ?? 0} / L {matchup.sideB?.lossCount ?? 0} ({matchup.sideB?.winPct ?? 50}%)
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-elevated p-5 shadow-panel sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-foreground">Audit log</h2>
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Page {auditPage} of {auditPages}
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <table className="w-full border-collapse bg-background text-left text-sm">
            <caption className="sr-only">Channel audit events</caption>
            <thead className="bg-surface">
              <tr>
                <th scope="col" className="px-3 py-2 font-mono text-[0.625rem] tracking-[0.12em] text-muted-foreground uppercase">Time</th>
                <th scope="col" className="px-3 py-2 font-mono text-[0.625rem] tracking-[0.12em] text-muted-foreground uppercase">Action</th>
                <th scope="col" className="px-3 py-2 font-mono text-[0.625rem] tracking-[0.12em] text-muted-foreground uppercase">Actor</th>
                <th scope="col" className="px-3 py-2 font-mono text-[0.625rem] tracking-[0.12em] text-muted-foreground uppercase">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.length === 0 ? (
                <tr className="border-t border-border">
                  <td colSpan={4} className="px-3 py-4 text-sm text-muted-foreground">No audit rows for this channel scope yet.</td>
                </tr>
              ) : (
                auditRows.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(row.createdAt)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-foreground">{row.action}</td>
                    <td className="px-3 py-2 text-xs text-foreground">
                      {row.actor?.displayName ?? row.actor?.username ?? "system"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[0.6875rem] text-muted-foreground break-all">
                      {summarizeMetadata(row.metadata)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          {prevAuditPage ? (
            <Link
              href={`/dashboard/channels/${channel.id}/stats?audit=${prevAuditPage}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Previous
            </Link>
          ) : (
            <span />
          )}

          {nextAuditPage ? (
            <Link
              href={`/dashboard/channels/${channel.id}/stats?audit=${nextAuditPage}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Next
            </Link>
          ) : (
            <span />
          )}
        </div>
      </section>
    </div>
  );
}
