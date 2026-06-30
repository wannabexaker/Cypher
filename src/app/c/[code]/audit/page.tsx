import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ScrollText } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  fetchChannelAuditPage,
  parseAuditPageParam,
  summarizeAuditMetadata,
} from "@/lib/audit";
import { canModerateChannel } from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { channelCodeSchema } from "@/lib/validation/channels";

export const metadata: Metadata = {
  title: "Room audit log",
  description: "Moderation timeline for a Cypher room.",
};

type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ audit?: string }>;
};

export default async function ChannelAuditPage({
  params,
  searchParams,
}: PageProps) {
  const [{ code }, query, user] = await Promise.all([
    params,
    searchParams,
    getCurrentUser(),
  ]);

  if (!user) {
    redirect(`/login?next=/c/${code}/audit`);
  }

  const parsedCode = channelCodeSchema.safeParse(code.toUpperCase());
  if (!parsedCode.success) notFound();

  const channel = await prisma.channel.findUnique({
    where: { code: parsedCode.data },
    select: { id: true, code: true, name: true, hostId: true },
  });

  if (!channel) notFound();

  // Mod-gated: HOST + channel MODERATOR + platform ADMIN. Plain members and
  // signed-out viewers don't see the audit timeline.
  if (!(await canModerateChannel(user, channel))) {
    notFound();
  }

  const page = parseAuditPageParam(query.audit);
  const { entries, total, pageSize, totalPages } = await fetchChannelAuditPage(
    channel.id,
    page,
  );

  return (
    <main className="container mx-auto max-w-4xl px-4 py-10">
      <Link
        href={`/c/${channel.code}`}
        className={`${buttonVariants({ variant: "ghost", size: "sm" })} -ml-2 mb-6`}
      >
        <ArrowLeft />
        Back to room
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.16em] text-cyan uppercase">
            Audit log
          </p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">
            {channel.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every moderation action for this room — submissions, contests,
            votes, members.
          </p>
        </div>
        <span className="font-mono text-sm text-muted-foreground">
          {total} entr{total === 1 ? "y" : "ies"}
        </span>
      </header>

      <section className="mt-6 rounded-xl border border-border bg-elevated p-5 shadow-panel sm:p-7">
        <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-[0.16em] text-cyan uppercase">
          <ScrollText className="size-4" />
          Recent activity
        </div>

        {entries.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            No moderation actions yet.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="py-2 pr-4 font-mono font-bold">When</th>
                  <th className="py-2 pr-4 font-mono font-bold">Action</th>
                  <th className="py-2 pr-4 font-mono font-bold">Actor</th>
                  <th className="py-2 pr-4 font-mono font-bold">Entity</th>
                  <th className="py-2 font-mono font-bold">Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-border/60 last:border-b-0"
                  >
                    <td className="py-3 pr-4 align-top font-mono text-xs text-muted-foreground">
                      {entry.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="py-3 pr-4 align-top font-mono text-xs text-foreground">
                      {entry.action}
                    </td>
                    <td className="py-3 pr-4 align-top text-sm text-foreground">
                      {entry.actor?.displayName ?? entry.actor?.username ?? "—"}
                    </td>
                    <td className="py-3 pr-4 align-top font-mono text-xs text-muted-foreground">
                      {entry.entityType}/{entry.entityId.slice(0, 8)}
                    </td>
                    <td className="py-3 align-top text-xs text-muted-foreground">
                      <code className="break-all">
                        {summarizeAuditMetadata(entry.metadata)}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-mono">
                  Page {page} of {totalPages} · {pageSize} per page
                </span>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link
                      href={`/c/${channel.code}/audit?audit=${page - 1}`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      Previous
                    </Link>
                  )}
                  {page < totalPages && (
                    <Link
                      href={`/c/${channel.code}/audit?audit=${page + 1}`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      Next
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
