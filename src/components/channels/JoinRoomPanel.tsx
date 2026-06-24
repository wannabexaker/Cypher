"use client";

import { Check, LoaderCircle, LogIn, Mic2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type JoinRoomPanelProps = {
  code: string;
  joined: boolean;
  authenticated: boolean;
  allowGuestUploads: boolean;
  completed: boolean;
};

export function JoinRoomPanel({
  code,
  joined,
  authenticated,
  allowGuestUploads,
  completed,
}: JoinRoomPanelProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function join(displayName?: string) {
    setError("");
    setPending(true);

    const response = await fetch(`/api/channels/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(displayName ? { displayName } : {}),
    });

    const payload = (await response.json()) as { error?: string };
    setPending(false);

    if (!response.ok) {
      setError(payload.error ?? "Unable to join the room.");
      return;
    }

    router.refresh();
  }

  function handleGuestJoin(formData: FormData) {
    void join(String(formData.get("displayName") ?? ""));
  }

  if (joined) {
    return (
      <div className="rounded-xl border border-lime/30 bg-lime/10 p-6">
        <span className="flex size-12 items-center justify-center rounded-full bg-lime text-background">
          <Check aria-hidden="true" />
        </span>
        <p className="mt-5 font-mono text-xs font-bold tracking-[0.16em] text-lime uppercase">
          You&apos;re in
        </p>
        <h2 className="mt-2 text-2xl font-bold text-foreground">
          Your place in the room is locked.
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Drop your track — coming in H04.
        </p>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="rounded-xl border border-border bg-elevated p-6">
        <p className="font-mono text-xs font-bold tracking-[0.16em] text-magenta uppercase">
          Room completed
        </p>
        <p className="mt-3 leading-7 text-muted-foreground">
          This cypher has ended and no longer accepts new members.
        </p>
      </div>
    );
  }

  if (authenticated) {
    return (
      <div className="rounded-xl border border-border bg-elevated p-6">
        <Mic2 className="size-7 text-primary-glow" aria-hidden="true" />
        <h2 className="mt-5 text-2xl font-bold text-foreground">
          Step into the room
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Join with your Cypher account. Re-entering is idempotent.
        </p>
        <Button
          type="button"
          variant="gradient"
          size="lg"
          className="mt-6 w-full"
          disabled={pending}
          onClick={() => void join()}
        >
          {pending ? (
            <LoaderCircle className="motion-safe:animate-spin" />
          ) : (
            <Mic2 />
          )}
          Join channel
        </Button>
        {error && (
          <p role="alert" className="mt-3 text-sm text-magenta">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (!allowGuestUploads) {
    const next = encodeURIComponent(`/c/${code}`);

    return (
      <div className="rounded-xl border border-border bg-elevated p-6">
        <LogIn className="size-7 text-cyan" aria-hidden="true" />
        <h2 className="mt-5 text-2xl font-bold text-foreground">
          Account required
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          This host accepts registered members only.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a
            href={`/login?next=${next}`}
            className={buttonVariants({ variant: "gradient", size: "lg" })}
          >
            Sign in
          </a>
          <a
            href={`/register?next=${next}`}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Register
          </a>
        </div>
      </div>
    );
  }

  return (
    <form
      action={handleGuestJoin}
      className="rounded-xl border border-border bg-elevated p-6"
    >
      <Mic2 className="size-7 text-magenta" aria-hidden="true" />
      <h2 className="mt-5 text-2xl font-bold text-foreground">
        Join as a guest
      </h2>
      <p className="mt-3 leading-7 text-muted-foreground">
        Pick the display name the host and room will see.
      </p>
      <label
        htmlFor="displayName"
        className="mt-6 mb-2 block text-sm font-bold text-foreground"
      >
        Display name
      </label>
      <Input
        id="displayName"
        name="displayName"
        required
        minLength={2}
        maxLength={30}
        placeholder="Night Shift"
      />
      <Button
        type="submit"
        variant="gradient"
        size="lg"
        className="mt-4 w-full"
        disabled={pending}
      >
        {pending ? (
          <LoaderCircle className="motion-safe:animate-spin" />
        ) : (
          <Mic2 />
        )}
        Join room
      </Button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-magenta">
          {error}
        </p>
      )}
    </form>
  );
}

