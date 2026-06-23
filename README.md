# Cypher

Motion-rich landing page and reusable design system for an online rap/trap competition platform.

> Drop your bars. The crowd decides.

H01 is intentionally frontend-only. Channel creation, join-code handling, uploads, voting, auth, APIs, and Prisma integration are reserved for later handoffs.

## Run locally

Requirements:

- Node.js 22 LTS
- pnpm 10

```bash
corepack enable
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Production verification:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm start
```

## Stack

- Next.js 15 App Router
- React 19
- TypeScript strict
- Tailwind CSS 4
- shadcn/ui conventions
- Framer Motion
- lucide-react
- `next/font/google` with Anton, Geist, and Geist Mono

## Design tokens

Defined in `src/app/globals.css` and mapped into Tailwind:

- Surfaces: `--bg-base`, `--bg-elevated`, `--surface`, `--border`
- Text: `--text`, `--text-muted`
- Brand: `--primary`, `--primary-glow`, `--accent-magenta`, `--accent-cyan`, `--accent-lime`, `--gold`
- Gradients: `--gradient-signature`, `--gradient-surface`, `--gradient-fade`
- Radius scale: `--radius-token-sm` through `--radius-token-xl`
- Elevation: primary, magenta, cyan, and panel shadow tokens
- Motion: fast/medium/slow durations, marquee, pulse, and gradient timing
- Type scale: hero, section, and final-CTA responsive tokens
- Layout: shared container and section-spacing tokens

## Component map

Landing:

- `Navbar`
- `Hero`
- `HowItWorks`
- `LiveChannels`
- `BattleTeaser`
- `GenresMarquee`
- `FinalCta`
- `Footer`
- `SectionHeading`

Motion:

- `AuroraBackground`
- `Reveal`
- `WaveformBars`
- `MagneticButton`
- `CodeTyper`
- `Marquee`

UI:

- `Button` and reusable `buttonVariants` via CVA

Data and assets:

- Typed mock content in `src/lib/mock.ts`
- Optimized generated channel covers in `public/images/channels`

## Quality checks

- Static prerendered `/`
- Responsive checks at 360×800 and 1440×1000
- No horizontal overflow
- Visible tap targets are at least 44px
- Reduced-motion mode disables active animations and shows static fallbacks
- Lighthouse desktop: 100 Performance / 100 Accessibility / 100 Best Practices / 100 SEO
