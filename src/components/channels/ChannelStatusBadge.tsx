import { ChannelStatus } from "@prisma/client";

import { cn } from "@/lib/utils";

type ChannelStatusBadgeProps = {
  status: ChannelStatus;
};

export function ChannelStatusBadge({ status }: ChannelStatusBadgeProps) {
  const active = status === ChannelStatus.OPEN;

  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-2 rounded-full border px-3 font-mono text-[0.6875rem] font-bold tracking-[0.12em] uppercase",
        active
          ? "border-lime/30 bg-lime/10 text-lime"
          : "border-border bg-surface text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          active ? "bg-lime shadow-glow-cyan" : "bg-muted-foreground",
        )}
      />
      {status.replaceAll("_", " ")}
    </span>
  );
}

