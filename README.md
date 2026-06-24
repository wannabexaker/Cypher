# Cypher

Next.js platform for online rap/trap competitions and battle rooms.

> Drop your bars. The crowd decides.

Current implementation:

- H01: landing page, motion system, mock live channels, and design tokens
- H02: PostgreSQL/Prisma wiring, host authentication, and gated dashboard shell

Channel creation, join codes, uploads, voting, and real battles remain intentionally out of scope until later handoffs.

## Requirements

- Node.js 22 LTS
- pnpm 10
- Docker with Compose

## Local development

Create your local environment file:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Generate `AUTH_SECRET` and replace the placeholder:

```bash
openssl rand -base64 33
```

Start PostgreSQL, apply the committed migration, and run the app:

```bash
docker compose up -d postgres
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The initial migration is:

```text
prisma/migrations/20260623225539_init
```

## Environment variables

```dotenv
DATABASE_URL="postgresql://cypher:cypher@localhost:5432/cypher?schema=public"
DIRECT_URL="postgresql://cypher:cypher@localhost:5432/cypher?schema=public"
AUTH_SECRET="generate-with: openssl rand -base64 33"
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
```

Google is registered as an Auth.js provider only when both Google variables are populated.

For Neon or Supabase production deployments:

- `DATABASE_URL`: pooled/serverless connection
- `DIRECT_URL`: unpooled direct connection for migrations
- `AUTH_SECRET`: a real production secret

Never commit a populated `.env`.

## Authentication flow

- Register a host account at `/register`
- Sign in at `/login`
- Successful authentication redirects to `/dashboard`
- `/dashboard` performs a server-side authorization check
- Credentials sessions use signed JWT cookies
- Passwords are stored only as Argon2id hashes
- Google OAuth is optional and uses the Prisma adapter
- Session data exposes `id`, `username`, and `role`

The dashboard intentionally contains a disabled channel-creation control. H03 implements the real channel workflow.

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

## Stack

- Next.js 15 App Router
- React 19
- TypeScript strict
- Tailwind CSS 4
- Framer Motion
- Auth.js v5 / NextAuth beta
- Prisma 6 + PostgreSQL 16
- Argon2id password hashing
- Zod validation
- pnpm

Prisma 6 is intentionally pinned because the canonical schema uses the Prisma 6 datasource format and the installed Auth.js Prisma adapter supports Prisma through v6.

## Design system

The H01 dark-neon token layer remains in `src/app/globals.css`.

Reusable primitives now include:

- `Button` variants via CVA
- `Input`
- auth shell and form components
- shared motion components
- responsive dashboard shell

All visible controls retain 44px minimum tap targets, focus states, and reduced-motion behavior.
