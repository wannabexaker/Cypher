import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full resize-y rounded-md border border-border bg-background px-4 py-3 text-sm leading-6 text-foreground shadow-panel transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary-glow focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-elevated disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

