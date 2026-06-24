import { randomUUID } from "node:crypto";

import { PrismaAdapter } from "@auth/prisma-adapter";
import {
  Prisma,
  Role,
  type Session as PrismaSession,
  type User as PrismaUser,
} from "@prisma/client";
import type { Adapter, AdapterUser } from "next-auth/adapters";

import { prisma } from "@/lib/prisma";

type CypherAdapterUser = AdapterUser & {
  username: string;
  role: Role;
};

function toAdapterUser(user: PrismaUser): CypherAdapterUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    name: user.displayName ?? user.username,
    image: user.avatarUrl,
    username: user.username,
    role: user.role,
  };
}

function usernameBase(name: string | null | undefined, email: string) {
  const source = name?.trim() || email.split("@")[0] || "artist";
  const normalized = source
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);

  if (normalized.length >= 3) return normalized;
  return `user_${normalized || "artist"}`.slice(0, 20);
}

async function createOAuthUser(user: AdapterUser) {
  const email = user.email.toLowerCase();
  const base = usernameBase(user.name, email);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = attempt === 0 ? "" : `_${randomUUID().replaceAll("-", "").slice(0, 5)}`;
    const username = `${base.slice(0, 20 - suffix.length)}${suffix}`;

    try {
      const created = await prisma.user.create({
        data: {
          email,
          username,
          displayName: user.name,
          avatarUrl: user.image,
          emailVerified: user.emailVerified,
          role: Role.USER,
        },
      });

      return toAdapterUser(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to allocate a unique username for the OAuth account.");
}

function mapSessionAndUser(record: (PrismaSession & { user: PrismaUser }) | null) {
  if (!record) return null;
  const { user, ...session } = record;
  return {
    session,
    user: toAdapterUser(user),
  };
}

export function CypherPrismaAdapter(): Adapter {
  const baseAdapter = PrismaAdapter(prisma);

  return {
    ...baseAdapter,
    createUser: createOAuthUser,
    async getUser(id) {
      const user = await prisma.user.findUnique({ where: { id } });
      return user ? toAdapterUser(user) : null;
    },
    async getUserByEmail(email) {
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });
      return user ? toAdapterUser(user) : null;
    },
    async getUserByAccount(providerProviderAccountId) {
      const account = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: providerProviderAccountId,
        },
        include: { user: true },
      });
      return account ? toAdapterUser(account.user) : null;
    },
    async updateUser(user) {
      const data: Prisma.UserUpdateInput = {};

      if (user.email !== undefined) data.email = user.email.toLowerCase();
      if (user.emailVerified !== undefined) {
        data.emailVerified = user.emailVerified;
      }
      if (user.name !== undefined) data.displayName = user.name;
      if (user.image !== undefined) data.avatarUrl = user.image;

      const updated = await prisma.user.update({
        where: { id: user.id },
        data,
      });
      return toAdapterUser(updated);
    },
    async deleteUser(id) {
      const user = await prisma.user.delete({ where: { id } });
      return toAdapterUser(user);
    },
    async getSessionAndUser(sessionToken) {
      const record = await prisma.session.findUnique({
        where: { sessionToken },
        include: { user: true },
      });
      return mapSessionAndUser(record);
    },
  };
}
