"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CopyButtonProps = {
  value: string;
  label?: string;
  className?: string;
};

export function CopyButton({
  value,
  label = "Copy",
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const copyValue =
      value.startsWith("/") && typeof window !== "undefined"
        ? `${window.location.origin}${value}`
        : value;

    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("min-w-24", className)}
      onClick={handleCopy}
      aria-label={`${label}: ${value}`}
    >
      {copied ? <Check className="text-lime" /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}
