import { ChannelStatus } from "@prisma/client";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Flag, Trophy } from "lucide-react";

import { ChampionBanner } from "@/components/channels/ChampionBanner";
import { ChannelStatusBadge } from "@/components/channels/ChannelStatusBadge";
import { JoinRoomPanel } from "@/components/channels/JoinRoomPanel";
import { buttonVariants } from "@/components/ui/button";
import { VoteControl } from "@/components/voting/VoteControl";
import { getBattleState } from "@/lib/battles";
import { GUEST_COOKIE_NAME, readGuestToken } from "@/lib/guest-session";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { channelCodeSchema } from "@/lib/validation/channels";
import { getVoteSplit } from "@/lib/votes";

export const metadata: Metadata = {
  title: "Battle bracket",
  description: "Single-elimination bracket for Cypher battles.",
};

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function BattleBracketPage({ params }: PageProps) {
  const { code: rawCode } = await params;
  const parsedCode = channelCodeSchema.safeParse(rawCode);
  if (!parsedCode.success) notFound();
  if (rawCode !== parsedCode.data) redirect(`/c/${parsedCode.data}/battle`);

  const [user, cookieStore] = await Promise.all([getCurrentUser(), cookies()]);
  const guestToken = readGuestToken(cookieStore.get(GUEST_COOKIE_NAME)?.value);

  const channel = await prisma.channel.findUnique({
    where: { code: parsedCode.data },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      championSubmissionId: true,
      completedAt: true,
      allowGuestUploads: true,
      allowGuestVotes: true,
    },
  });
  if (!channel) notFound();

  if (
    channel.status !== ChannelStatus.BATTLE &&
    channel.status !== ChannelStatus.COMPLETED
  ) {
    redirect(`/c/${channel.code}`);
  }

  const membership = user
    ? await prisma.channelMember.findUnique({
        where: {
          channelId_userId: {
            channelId: channel.id,
            userId: user.id,
          },
        },
        select: { id: true, participation: true },
      })
    : guestToken
      ? await prisma.channelMember.findUnique({
          where: {
            channelId_guestToken: {
              channelId: channel.id,
              guestToken,
            },
          },
          select: { id: true, participation: true },
        })
      : null;

  const battle = await getBattleState(
    channel.id,
    membership
      ? user
        ? { voterUserId: user.id }
        : guestToken
          ? { cookieToken: guestToken }
          : undefined
      : undefined,
  );

  const champion = channel.championSubmissionId
    ? await prisma.submission.findUnique({
        where: { id: channel.championSubmissionId },
        select: {
          artistName: true,
          trackTitle: true,
          winCount: true,
          lossCount: true,
        },
      })
    : null;

  const championSplit = champion ? getVoteSplit(champion) : null;
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || undefined;

  return (
    <main className="min-h-svh bg-background">
      <header className="border-b border-border bg-background/90">
        <nav className="section-shell flex min-h-18 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ChannelStatusBadge status={channel.status} />
            <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-border bg-elevated px-3 font-mono text-[0.6875rem] font-bold tracking-[0.12em] text-cyan uppercase">
              <Flag className="size-3.5" />
              Battle board
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/c/${channel.code}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Room view
            </Link>
            {user && (
              <Link
                href="/dashboard"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Dashboard
              </Link>
            )}
          </div>
        </nav>
      </header>

      <section className="section-shell py-10 sm:py-12">
        <h1 className="display-text text-[clamp(3rem,9vw,6rem)] leading-[0.88] text-foreground">
          {channel.name}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Each matchup is decided by W/L votes per track. Higher W ratio advances.
        </p>
      </section>

      {channel.status === ChannelStatus.COMPLETED && champion && championSplit && (
        <div className="section-shell pb-6">
          <ChampionBanner
            artistName={champion.artistName}
            trackTitle={champion.trackTitle}
            winPct={championSplit.winPct}
            total={championSplit.total}
            completedAt={channel.completedAt}
          />
        </div>
      )}

      <section className="section-shell grid gap-8 pb-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="overflow-x-auto pb-2">
          <div className="inline-grid min-w-full grid-flow-col gap-4">
            {battle.rounds.map((round) => (
              <section
                key={round.id}
                className="w-[22rem] rounded-xl border border-border bg-elevated p-4 shadow-panel"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-cyan uppercase">
                    Round {round.roundNumber}
                  </p>
                  <span className="font-mono text-[0.625rem] text-muted-foreground uppercase">
                    {round.status.replaceAll("_", " ")}
                  </span>
                </div>

                <div className="mt-4 space-y-4">
                  {round.matchups.map((matchup) => (
                    <article
                      key={matchup.id}
                      className="rounded-lg border border-border bg-background p-3"
                    >
                      <p className="font-mono text-[0.625rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                        Matchup
                      </p>

                      <div className="mt-2 space-y-4">
                        {[matchup.submissionA, matchup.submissionB]
                          .filter(
                            (entry): entry is { id: string; trackTitle: string } =>
                              Boolean(entry),
                          )
                          .map((entry) => {
                            const side =
                              entry.id === matchup.submissionA.id
                                ? matchup.sideA
                                : matchup.sideB;
                            if (!side) return null;

                            const isWinner = matchup.winnerSubmissionId === entry.id;
                            const ownChoice = battle.ownChoices[matchup.id]?.[entry.id];
                            const canVote =
                              Boolean(membership) &&
                              channel.status === ChannelStatus.BATTLE &&
                              round.status === "VOTING_OPEN" &&
                              matchup.status === "VOTING_OPEN";

                            return (
                              <div
                                key={entry.id}
                                className={`rounded-md border p-3 ${
                                  isWinner
                                    ? "border-lime/40 bg-lime/10"
                                    : "border-border bg-elevated"
                                }`}
                              >
                                <p className="text-sm font-bold text-foreground">
                                  {entry.trackTitle}
                                  {isWinner && (
                                    <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-lime/40 bg-lime/10 px-2 py-0.5 font-mono text-[0.625rem] font-bold tracking-[0.1em] text-lime uppercase">
                                      <Trophy className="size-3" />
                                      Winner
                                    </span>
                                  )}
                                </p>
                                <VoteControl
                                  code={channel.code}
                                  submissionId={entry.id}
                                  initialWinCount={side.winCount}
                                  initialLossCount={side.lossCount}
                                  initialChoice={ownChoice}
                                  canVote={canVote}
                                  disabledReason={
                                    membership
                                      ? "Voting is open only on the active round's matchups."
                                      : "Join the room to cast battle votes."
                                  }
                                  turnstileSiteKey={turnstileSiteKey}
                                  votePath={`/api/channels/${channel.code}/battles/votes`}
                                  extraPayload={{ matchupId: matchup.id }}
                                />
                              </div>
                            );
                          })}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <aside>
          <div className="rounded-xl border border-border bg-surface p-6">
            <p className="font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-magenta uppercase">
              Access
            </p>
            <h2 className="mt-2 text-xl font-bold text-foreground">Participation</h2>
            <div className="mt-4">
              <JoinRoomPanel
                code={channel.code}
                joined={Boolean(membership)}
                authenticated={Boolean(user)}
                allowGuestUploads={channel.allowGuestUploads}
                allowGuestVotes={channel.allowGuestVotes}
                completed={channel.status === ChannelStatus.COMPLETED}
                participation={membership?.participation ?? undefined}
              />
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
