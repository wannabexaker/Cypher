import type { ReactNode } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Radio,
  Settings,
} from "lucide-react";

import { SignOutButton } from "@/components/auth/SignOutButton";

type DashboardShellProps = {
  children: ReactNode;
  user: {
    username: string;
    displayName: string | null;
  };
};

export function DashboardShell({ children, user }: DashboardShellProps) {
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
            >
              <LayoutDashboard className="size-4 text-primary-glow" />
              Dashboard
            </Link>
            <Link
              href="/dashboard/channels/new"
              className="flex min-h-12 items-center gap-3 rounded-md px-4 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            >
              <Radio className="size-4" />
              New channel
            </Link>
            <span className="flex min-h-12 items-center gap-3 rounded-md px-4 text-sm font-bold text-muted-foreground">
              <Settings className="size-4" />
              Settings
              <span className="ml-auto font-mono text-[0.625rem]">LATER</span>
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
            <p className="hidden font-mono text-[0.6875rem] font-bold tracking-[0.16em] text-cyan uppercase lg:block">
              Host workspace
            </p>
            <div className="flex items-center gap-2">
              <Link
                href="/join"
                className="hidden min-h-11 items-center px-3 text-sm font-bold text-muted-foreground hover:text-foreground sm:inline-flex"
              >
                Enter code
              </Link>
              <SignOutButton className="lg:hidden" compact />
            </div>
          </header>
          {children}
        </div>
      </div>
    </main>
  );
}

