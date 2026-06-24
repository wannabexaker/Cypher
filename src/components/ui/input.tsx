import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-md border border-border bg-background px-4 text-sm text-foreground shadow-panel transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary-glow focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-elevated disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
