"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LogOut, Menu, Radio, UserRound, X } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Formats", href: "#modes" },
  { label: "Battles", href: "#battles" },
  { label: "Guide", href: "#guide" },
] as const;

type NavbarProps = {
  user: {
    username: string;
  } | null;
};

export function Navbar({ user }: NavbarProps) {
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const createChannelHref = user ? "/dashboard" : "/register";

  async function handleSignOut() {
    setSigningOut(true);
    await signOut({ redirectTo: "/" });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/90">
      <nav
        className="section-shell flex min-h-18 items-center justify-between gap-4"
        aria-label="Main navigation"
      >
        <a
          href="#top"
          className="display-text group inline-flex min-h-11 items-center text-2xl tracking-[0.04em]"
          aria-label="Cypher home"
        >
          CYPHER
          <motion.span
            className="ml-1.5 size-2 rounded-full bg-magenta shadow-glow-magenta"
            animate={
              reduceMotion
                ? undefined
                : { scale: [1, 1.55, 1], opacity: [0.65, 1, 0.65] }
            }
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden="true"
          />
        </a>

        <div className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <a
            href="/join"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Radio />
            Enter code
          </a>
          {user ? (
            <>
              <a
                href="/dashboard"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <UserRound />
                @{user.username}
              </a>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={signingOut}
                onClick={handleSignOut}
              >
                <LogOut />
                {signingOut ? "Signing out…" : "Sign out"}
              </Button>
            </>
          ) : (
            <a
              href="/login"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Sign in
            </a>
          )}
          <a
            href={createChannelHref}
            className={buttonVariants({ variant: "gradient", size: "sm" })}
          >
            {user ? "Dashboard" : "Create a channel"}
          </a>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="sm:hidden"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X /> : <Menu />}
        </Button>
      </nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="mobile-navigation"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-border bg-elevated sm:hidden"
          >
            <div className="section-shell flex flex-col gap-2 py-4">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "default" }),
                    "justify-start",
                  )}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <a
                href="/join"
                className={buttonVariants({ variant: "outline", size: "default" })}
                onClick={() => setMenuOpen(false)}
              >
                Enter code
              </a>
              {user ? (
                <>
                  <a
                    href="/dashboard"
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "default" }),
                      "justify-start",
                    )}
                    onClick={() => setMenuOpen(false)}
                  >
                    <UserRound />
                    @{user.username}
                  </a>
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    className="justify-start"
                    disabled={signingOut}
                    onClick={handleSignOut}
                  >
                    <LogOut />
                    {signingOut ? "Signing out…" : "Sign out"}
                  </Button>
                </>
              ) : (
                <a
                  href="/login"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "default" }),
                    "justify-start",
                  )}
                  onClick={() => setMenuOpen(false)}
                >
                  Sign in
                </a>
              )}
              <a
                href={createChannelHref}
                className={buttonVariants({ variant: "gradient", size: "default" })}
                onClick={() => setMenuOpen(false)}
              >
                {user ? "Open dashboard" : "Create a channel"}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
