import type { Metadata } from "next";
import Link from "next/link";
import {
  Crown,
  LayoutDashboard,
  Plus,
  Radio,
  Settings,
  UserRound,
} from "lucide-react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Host dashboard",
  description: "Manage your Cypher host workspace.",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const displayName = user.displayName ?? user.username;

  return (
    <main id="main-content" className="min-h-svh bg-background">
      <div className="grid min-h-svh lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-elevated/70 p-5 lg:flex lg:flex-col">
          <Link
            href="/"
            className="display-text inline-flex min-h-11 items-center text-2xl tracking-[0.04em]"
          >
            CYPHER<span className="text-magenta">.</span>
          </Link>

          <nav className="mt-10 space-y-2" aria-label="Dashboard navigation">
            <Link
              href="/dashboard"
              className="flex min-h-12 items-center gap-3 rounded-md border border-primary/40 bg-primary/15 px-4 text-sm font-bold text-foreground"
              aria-current="page"
            >
              <LayoutDashboard className="size-4 text-primary-glow" />
              Dashboard
            </Link>
            <span className="flex min-h-12 items-center gap-3 rounded-md px-4 text-sm font-bold text-muted-foreground">
              <Radio className="size-4" />
              Channels
              <span className="ml-auto font-mono text-[0.625rem] text-cyan">H03</span>
            </span>
            <span className="flex min-h-12 items-center gap-3 rounded-md px-4 text-sm font-bold text-muted-foreground">
              <Settings className="size-4" />
              Settings
              <span className="ml-auto font-mono text-[0.625rem] text-muted-foreground">
                LATER
              </span>
            </span>
          </nav>

          <div className="mt-auto rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full border border-primary/40 bg-primary/15 font-mono text-sm font-bold text-primary-glow">
                {user.username.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">
                  {displayName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  @{user.username}
                </p>
              </div>
            </div>
            <SignOutButton className="mt-4 w-full" compact />
          </div>
        </aside>

        <div className="min-w-0">
          <header className="flex min-h-18 items-center justify-between gap-4 border-b border-border bg-background/90 px-4 sm:px-8">
            <Link
              href="/"
              className="display-text inline-flex min-h-11 items-center text-2xl tracking-[0.04em] lg:hidden"
            >
              CYPHER<span className="text-magenta">.</span>
            </Link>
            <div className="hidden lg:block">
              <p className="font-mono text-[0.6875rem] font-bold tracking-[0.16em] text-cyan uppercase">
                Host workspace
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="hidden min-h-11 items-center px-3 text-sm font-bold text-muted-foreground hover:text-foreground sm:inline-flex"
              >
                View landing
              </Link>
              <SignOutButton className="lg:hidden" compact />
            </div>
          </header>

          <div className="section-shell py-8 sm:py-12">
            <section className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <p className="section-kicker">Dashboard online</p>
                <h1 className="display-text mt-4 text-[clamp(3.25rem,8vw,6rem)] leading-[0.9] text-foreground">
                  Welcome, <span className="text-gradient">{displayName}</span>
                </h1>
                <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
                  Your host account is ready. Room creation and join codes arrive
                  in H03.
                </p>
              </div>
              <div className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-lime/30 bg-lime/10 px-4 font-mono text-xs font-bold text-lime uppercase">
                <span className="size-2 rounded-full bg-lime shadow-glow-cyan" />
                Authenticated
              </div>
            </section>

            <section className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                { label: "Channels", value: "0" },
                { label: "Tracks", value: "0" },
                { label: "Crowd votes", value: "0" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-border bg-elevated p-5"
                >
                  <p className="font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                  <p className="display-text mt-3 text-4xl text-foreground">
                    {stat.value}
                  </p>
                </div>
              ))}
            </section>

            <section className="gradient-border noise-panel mt-6 flex min-h-[22rem] flex-col items-center justify-center rounded-xl border border-transparent p-6 text-center shadow-panel sm:p-10">
              <span className="flex size-16 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-primary-glow shadow-glow-primary">
                <Crown className="size-7" aria-hidden="true" />
              </span>
              <p className="mt-6 font-mono text-[0.6875rem] font-bold tracking-[0.18em] text-magenta uppercase">
                The stage is empty
              </p>
              <h2 className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">
                No channels yet — create your first room
              </h2>
              <p className="mt-3 max-w-lg leading-7 text-muted-foreground">
                Channel setup, join codes, and member roles are deliberately held
                for H03.
              </p>
              <Button
                type="button"
                variant="gradient"
                size="lg"
                className="mt-7"
                disabled
                aria-describedby="channel-coming-soon"
              >
                <Plus />
                Create a channel
              </Button>
              <p
                id="channel-coming-soon"
                className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground"
              >
                <UserRound className="size-3.5" aria-hidden="true" />
                Available in the next implementation handoff
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
