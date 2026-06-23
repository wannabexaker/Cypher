"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Menu, Radio, X } from "lucide-react";
import { useState } from "react";

import { CodeTyper } from "@/components/motion/CodeTyper";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Explore", href: "#live-channels" },
  { label: "Battles", href: "#battles" },
] as const;

export function Navbar() {
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);

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
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={codeOpen}
              aria-controls="nav-code-panel"
              onClick={() => setCodeOpen((open) => !open)}
            >
              <Radio />
              Enter code
            </Button>
            <AnimatePresence>
              {codeOpen && (
                <motion.div
                  id="nav-code-panel"
                  initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 top-[calc(100%+0.75rem)] w-72 rounded-lg border border-border bg-elevated p-4 shadow-panel"
                >
                  <p className="font-mono text-[0.6875rem] font-bold tracking-[0.16em] text-cyan uppercase">
                    Try a demo code
                  </p>
                  <CodeTyper className="mt-3 w-full" />
                  <a
                    href="#join-demo"
                    className={cn(
                      buttonVariants({ variant: "gradient", size: "sm" }),
                      "mt-3 w-full",
                    )}
                    onClick={() => setCodeOpen(false)}
                  >
                    Open channel
                    <ArrowRight />
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <a
            href="#start"
            className={buttonVariants({ variant: "gradient", size: "sm" })}
          >
            Create a channel
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
                href="#join-demo"
                className={buttonVariants({ variant: "outline", size: "default" })}
                onClick={() => setMenuOpen(false)}
              >
                Enter code
              </a>
              <a
                href="#start"
                className={buttonVariants({ variant: "gradient", size: "default" })}
                onClick={() => setMenuOpen(false)}
              >
                Create a channel
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
