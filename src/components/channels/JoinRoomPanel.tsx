"use client";

import { Check, Gavel, LoaderCircle, LogIn, Mic2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  readGuestDisplayName,
  storeGuestDisplayName,
} from "@/lib/guest-profile";
import { cn } from "@/lib/utils";

type Participation = "ARTIST" | "JUDGE";

type JoinRoomPanelProps = {
  code: string;
  joined: boolean;
  authenticated: boolean;
  allowGuestUploads: boolean;
  allowGuestVotes: boolean;
  completed: boolean;
  participation?: Participation | null;
};

const PARTICIPATION_OPTIONS: {
  value: Participation;
  label: string;
  hint: string;
  icon: typeof Mic2;
}[] = [
  { value: "ARTIST", label: "Artist", hint: "Submit a track", icon: Mic2 },
  { value: "JUDGE", label: "Judge", hint: "Vote, don't submit", icon: Gavel },
];

function ParticipationChoice({
  value,
  onChange,
  disabled,
}: {
  value: Participation | "";
  onChange: (next: Participation) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="mt-6" disabled={disabled}>
      <legend className="mb-2 block text-sm font-bold text-foreground">
        How are you taking part?
      </legend>
      <div className="grid grid-cols-2 gap-3">
        {PARTICIPATION_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex min-h-11 flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
                selected
                  ? "border-lime/60 bg-lime/10"
                  : "border-border bg-background hover:border-primary-glow/50",
              )}
            >
              <span
                className={cn(
                  "inline-flex items-center gap-2 font-bold",
                  selected ? "text-lime" : "text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {option.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {option.hint}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function JoinRoomPanel({
  code,
  joined,
  authenticated,
  allowGuestUploads,
  allowGuestVotes,
  completed,
  participation = null,
}: JoinRoomPanelProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [choice, setChoice] = useState<Participation | "">("");
  const [guestDisplayName, setGuestDisplayName] = useState("");

  useEffect(() => {
    if (!authenticated) {
      setGuestDisplayName(readGuestDisplayName() ?? "");
    }
  }, [authenticated]);

  async function join(displayName?: string) {
    if (!choice) {
      setError("Pick Artist or Judge to join.");
      return;
    }

    setError("");
    setPending(true);

    const response = await fetch(`/api/channels/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participation: choice,
        ...(displayName ? { displayName } : {}),
      }),
    });

    const payload = (await response.json()) as { error?: string };
    setPending(false);

    if (!response.ok) {
      setError(payload.error ?? "Unable to join the room.");
      return;
    }

    if (displayName) {
      storeGuestDisplayName(displayName);
    }

    router.refresh();
  }

  function handleGuestJoin(formData: FormData) {
    void join(String(formData.get("displayName") ?? ""));
  }

  if (joined) {
    const lane =
      participation === "ARTIST"
        ? "You're in as an Artist — drop your track below."
        : participation === "JUDGE"
          ? "You're judging this room — your W/L vote counts equally."
          : "You're running this room.";

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
        <p className="mt-3 leading-7 text-muted-foreground">{lane}</p>
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
        <ParticipationChoice
          value={choice}
          onChange={setChoice}
          disabled={pending}
        />
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

  if (!allowGuestUploads && !allowGuestVotes) {
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
        value={guestDisplayName}
        onChange={(event) => setGuestDisplayName(event.target.value)}
        aria-describedby="display-name-help"
      />
      <p id="display-name-help" className="mt-2 text-xs text-muted-foreground">
        Saved only on this device for your next room.
      </p>
      <ParticipationChoice
        value={choice}
        onChange={setChoice}
        disabled={pending}
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

