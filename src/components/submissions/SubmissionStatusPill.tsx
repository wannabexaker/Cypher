import { cn } from "@/lib/utils";

export type SubmissionStatusValue = "PENDING" | "APPROVED" | "REJECTED";

const STATUS_STYLES: Record<
  SubmissionStatusValue,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pending review",
    className: "border-cyan/30 bg-cyan/10 text-cyan",
  },
  APPROVED: {
    label: "Approved",
    className: "border-lime/40 bg-lime/10 text-lime",
  },
  REJECTED: {
    label: "Rejected",
    className: "border-magenta/40 bg-magenta/10 text-magenta",
  },
};

export function SubmissionStatusPill({
  status,
  className,
}: {
  status: SubmissionStatusValue;
  className?: string;
}) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-2 rounded-full border px-3 font-mono text-[0.625rem] font-bold tracking-[0.14em] uppercase",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
