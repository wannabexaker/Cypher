"use client";

import { ArrowRight, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { signIn } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LoginFormProps = {
  googleEnabled: boolean;
};

const genericError = "We could not sign you in with those details.";

export function LoginForm({ googleEnabled }: LoginFormProps) {
  const [error, setError] = useState("");
  const [pendingProvider, setPendingProvider] = useState<
    "credentials" | "google" | null
  >(null);

  async function handleCredentials(formData: FormData) {
    setError("");
    setPendingProvider("credentials");

    const result = await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirect: false,
      redirectTo: "/dashboard",
    });

    if (!result.ok || result.error) {
      setError(genericError);
      setPendingProvider(null);
      return;
    }

    window.location.assign(result.url ?? "/dashboard");
  }

  async function handleGoogle() {
    setError("");
    setPendingProvider("google");
    await signIn("google", { redirectTo: "/dashboard" });
  }

  return (
    <>
      <div>
        <p className="font-mono text-[0.6875rem] font-bold tracking-[0.18em] text-cyan uppercase">
          Host access
        </p>
        <h2 className="mt-2 text-2xl font-bold text-foreground">Sign in to Cypher</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Return to your host workspace and keep the room ready.
        </p>
      </div>

      <form action={handleCredentials} className="mt-7 space-y-5">
        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-bold text-foreground"
          >
            Email
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              className="pl-11"
              placeholder="host@cypher.local"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-sm font-bold text-foreground"
          >
            Password
          </label>
          <div className="relative">
            <LockKeyhole
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              maxLength={128}
              className="pl-11"
              placeholder="At least 8 characters"
            />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-magenta/40 bg-magenta/10 px-4 py-3 text-sm text-foreground"
          >
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="gradient"
          size="lg"
          className="w-full"
          disabled={pendingProvider !== null}
        >
          {pendingProvider === "credentials" ? (
            <LoaderCircle className="motion-safe:animate-spin" />
          ) : (
            <ArrowRight />
          )}
          Sign in
        </Button>
      </form>

      {googleEnabled && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            OR
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            disabled={pendingProvider !== null}
            onClick={handleGoogle}
          >
            {pendingProvider === "google" ? (
              <LoaderCircle className="motion-safe:animate-spin" />
            ) : (
              <span
                className="flex size-5 items-center justify-center rounded-full border border-border font-mono text-xs font-bold"
                aria-hidden="true"
              >
                G
              </span>
            )}
            Continue with Google
          </Button>
        </>
      )}

      <p className="mt-7 text-center text-sm text-muted-foreground">
        New host?{" "}
        <a
          href="/register"
          className="inline-flex min-h-11 items-center font-bold text-primary-glow transition-colors hover:text-cyan"
        >
          Create your account
        </a>
      </p>
    </>
  );
}
