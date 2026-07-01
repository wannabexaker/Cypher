import { Camera, Music2, Video } from "lucide-react";

const footerLinks = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Formats", href: "#modes" },
  { label: "Battles", href: "#battles" },
  { label: "Guide", href: "#guide" },
] as const;

const socialLinks = [
  { label: "Instagram", href: "#instagram", icon: Camera },
  { label: "YouTube", href: "#youtube", icon: Video },
  { label: "Music", href: "#music", icon: Music2 },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-border bg-elevated/50">
      <div className="section-shell flex flex-col gap-8 py-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <a
            href="#top"
            className="display-text inline-flex min-h-11 items-center text-3xl tracking-[0.04em]"
          >
            CYPHER<span className="text-magenta">.</span>
          </a>
          <p className="mt-2 text-sm text-muted-foreground">
            Drop your bars. The crowd decides.
          </p>
        </div>

        <div className="flex flex-col gap-5 sm:items-end">
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer navigation">
            {footerLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex gap-2">
            {socialLinks.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="flex size-11 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-[transform,border-color,color] hover:-translate-y-0.5 hover:border-primary/60 hover:text-foreground"
              >
                <Icon className="size-4" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="section-shell flex min-h-16 flex-col justify-center gap-1 py-3 font-mono text-[0.6875rem] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 CYPHER. ALL SIGNAL, NO NOISE.</span>
          <span>BUILT FOR THE NEXT ROUND.</span>
        </div>
      </div>
    </footer>
  );
}
