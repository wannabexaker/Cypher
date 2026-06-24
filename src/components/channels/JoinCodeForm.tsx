"use client";

import { ArrowRight, Radio } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeChannelCode } from "@/lib/channel-code";

export function JoinCodeForm() {
  const router = useRouter();
  const [error, setError] = useState("");

  function handleSubmit(formData: FormData) {
    const code = normalizeChannelCode(String(formData.get("code") ?? ""));
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
      setError("Enter a valid 6-character room code.");
      return;
    }

    router.push(`/c/${code}`);
  }

  return (
    <form action={handleSubmit} className="mt-8">
      <label
        htmlFor="code"
        className="mb-2 block font-mono text-xs font-bold tracking-[0.16em] text-cyan uppercase"
      >
        Room code
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Radio
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-primary-glow"
            aria-hidden="true"
          />
          <Input
            id="code"
            name="code"
            autoComplete="off"
            autoCapitalize="characters"
            required
            maxLength={10}
            className="h-14 pl-11 font-mono text-lg tracking-[0.24em] uppercase"
            placeholder="7K2P9X"
            aria-describedby={error ? "code-error" : "code-help"}
          />
        </div>
        <Button type="submit" variant="gradient" size="lg">
          Enter room
          <ArrowRight />
        </Button>
      </div>
      <p
        id={error ? "code-error" : "code-help"}
        role={error ? "alert" : undefined}
        className={error ? "mt-3 text-sm text-magenta" : "mt-3 text-sm text-muted-foreground"}
      >
        {error || "Spaces and dashes are removed automatically."}
      </p>
    </form>
  );
}
