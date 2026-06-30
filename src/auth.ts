import { Role } from "@prisma/client";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { CypherPrismaAdapter } from "@/lib/auth-adapter";
import {
  DUMMY_PASSWORD_HASH,
  verifyPassword,
} from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  enforceRateLimit,
  enforceRequestRateLimit,
  hashRateLimitIdentifier,
} from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation/auth";

export const googleAuthEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials, request) {
      const parsed = loginSchema.safeParse(credentials);
      if (!parsed.success) return null;

      try {
        await Promise.all([
          enforceRequestRateLimit("login-ip", request),
          enforceRateLimit(
            "login-account",
            hashRateLimitIdentifier(parsed.data.email),
          ),
        ]);
      } catch {
        // Credentials auth intentionally returns one generic failure for bad
        // credentials, throttled attempts, and unavailable security controls.
        return null;
      }

      const user = await prisma.user.findUnique({
        where: { email: parsed.data.email },
      });

      if (!user?.passwordHash) {
        await verifyPassword(DUMMY_PASSWORD_HASH, parsed.data.password);
        return null;
      }

      const passwordMatches = await verifyPassword(
        user.passwordHash,
        parsed.data.password,
      );

      if (!passwordMatches || user.isBanned) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.displayName ?? user.username,
        image: user.avatarUrl,
        username: user.username,
        role: user.role,
      };
    },
  }),
];

if (googleAuthEnabled) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  );
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: CypherPrismaAdapter(),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;

      if (account?.provider === "credentials") {
        return true;
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: user.email.toLowerCase() },
        select: { isBanned: true },
      });

      return !existingUser?.isBanned;
    },
    async jwt({ token, user }) {
      if (user) {
        const databaseUser = await prisma.user.findFirst({
          where: {
            OR: [
              ...(user.id ? [{ id: user.id }] : []),
              ...(user.email ? [{ email: user.email.toLowerCase() }] : []),
            ],
          },
          select: {
            id: true,
            username: true,
            role: true,
          },
        });

        token.id = databaseUser?.id ?? user.id;
        token.username = databaseUser?.username ?? user.username;
        token.role = databaseUser?.role ?? user.role ?? Role.USER;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id =
          typeof token.id === "string" ? token.id : (token.sub ?? "");
        session.user.username =
          typeof token.username === "string"
            ? token.username
            : (session.user.name ?? "");
        session.user.role =
          token.role === Role.ADMIN ? Role.ADMIN : Role.USER;
      }
      return session;
    },
  },
});
