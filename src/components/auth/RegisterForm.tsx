"use client";

import {
  ArrowRight,
  AtSign,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { signIn } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const genericError = "We could not create an account with those details.";

export function RegisterForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleRegister(formData: FormData) {
    setError("");
    setPending(true);

    const credentials = {
      email: String(formData.get("email") ?? ""),
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      setError(genericError);
      setPending(false);
      return;
    }

    const result = await signIn("credentials", {
      email: credentials.email,
      password: credentials.password,
      redirect: false,
      redirectTo: "/dashboard",
    });

    if (!result.ok || result.error) {
      setError("Your account was created. Sign in to continue.");
      setPending(false);
      return;
    }

    window.location.assign(result.url ?? "/dashboard");
  }

  return (
    <>
      <div>
        <p className="font-mono text-[0.6875rem] font-bold tracking-[0.18em] text-magenta uppercase">
          Open a host account
        </p>
        <h2 className="mt-2 text-2xl font-bold text-foreground">
          Claim your room name
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Account setup is live. Channel creation arrives in H03.
        </p>
      </div>

      <form action={handleRegister} className="mt-7 space-y-5">
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
            htmlFor="username"
            className="mb-2 block text-sm font-bold text-foreground"
          >
            Username
          </label>
          <div className="relative">
            <AtSign
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              minLength={3}
              maxLength={20}
              pattern="[a-z0-9_]{3,20}"
              className="pl-11"
              placeholder="midnight_host"
              aria-describedby="username-help"
            />
          </div>
          <p id="username-help" className="mt-2 text-xs text-muted-foreground">
            3–20 lowercase letters, numbers, or underscores.
          </p>
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
              autoComplete="new-password"
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
          disabled={pending}
        >
          {pending ? (
            <LoaderCircle className="motion-safe:animate-spin" />
          ) : (
            <ArrowRight />
          )}
          Create host account
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-muted-foreground">
        Already registered?{" "}
        <a
          href="/login"
          className="inline-flex min-h-11 items-center font-bold text-primary-glow transition-colors hover:text-cyan"
        >
          Sign in
        </a>
      </p>
    </>
  );
}
