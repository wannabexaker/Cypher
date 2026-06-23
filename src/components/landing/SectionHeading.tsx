import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  kicker: string;
  title: ReactNode;
  description?: string;
  className?: string;
  centered?: boolean;
};

export function SectionHeading({
  kicker,
  title,
  description,
  className,
  centered = false,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "max-w-3xl",
        centered && "mx-auto text-center",
        className,
      )}
    >
      <p className={cn("section-kicker", centered && "justify-center")}>{kicker}</p>
      <h2 className="display-text mt-4 text-[length:var(--type-section)] leading-[0.92] text-foreground">
        {title}
      </h2>
      {description && (
        <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          {description}
        </p>
      )}
    </div>
  );
}
