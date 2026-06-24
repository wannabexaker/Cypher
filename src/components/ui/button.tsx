import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button relative inline-flex min-h-11 shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-md border font-sans text-sm font-bold tracking-[-0.01em] transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-out select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:translate-y-0 disabled:border-border disabled:bg-surface disabled:bg-none disabled:text-muted-foreground disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground shadow-glow-primary hover:-translate-y-0.5 hover:bg-primary-glow hover:shadow-glow-magenta",
        gradient:
          "border-transparent bg-[image:var(--gradient-signature)] bg-[length:200%_200%] text-foreground shadow-glow-primary hover:-translate-y-0.5 hover:shadow-glow-magenta motion-safe:animate-gradient",
        outline:
          "border-border bg-elevated/70 text-foreground hover:-translate-y-0.5 hover:border-primary-glow hover:bg-surface",
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:bg-surface hover:text-foreground",
        lime: "border-lime bg-lime text-background hover:-translate-y-0.5 hover:shadow-glow-cyan",
        link: "min-h-0 border-transparent bg-transparent p-0 text-primary-glow underline-offset-4 hover:text-cyan hover:underline",
      },
      size: {
        default: "h-12 px-5",
        sm: "h-11 px-4 text-xs",
        lg: "h-14 rounded-lg px-7 text-base",
        xl: "h-16 rounded-lg px-8 text-lg",
        icon: "size-12 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
