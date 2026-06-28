import { notFound, redirect } from "next/navigation";

import { getLatestBattleContest } from "@/lib/contests";
import { prisma } from "@/lib/prisma";
import { channelCodeSchema } from "@/lib/validation/channels";

type PageProps = {
  params: Promise<{ code: string }>;
};

// H20b: the legacy battle page is now a thin redirect into the per-contest
// view. With concurrent BATTLE contests, the "single battle per channel"
// abstraction no longer holds — we land on the most-recent battle contest
// (active first, then newest completed) and fall back to the room.
export default async function BattleBracketPage({ params }: PageProps) {
  const { code: rawCode } = await params;
  const parsedCode = channelCodeSchema.safeParse(rawCode);
  if (!parsedCode.success) notFound();
  if (rawCode !== parsedCode.data) redirect(`/c/${parsedCode.data}/battle`);

  const channel = await prisma.channel.findUnique({
    where: { code: parsedCode.data },
    select: { id: true, code: true },
  });
  if (!channel) notFound();

  const contest = await getLatestBattleContest(prisma, channel.id);
  if (contest) {
    redirect(`/c/${channel.code}/contest/${contest.id}`);
  }
  redirect(`/c/${channel.code}`);
}

export const dynamic = "force-dynamic";
