import { Prisma, Role } from "@prisma/client";
import { NextResponse } from "next/server";

import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validation/auth";

export const runtime = "nodejs";

const genericError = {
  error: "Unable to create an account with those details.",
};

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(genericError, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(genericError, { status: 400 });
  }

  try {
    const passwordHash = await hashPassword(parsed.data.password);

    await prisma.user.create({
      data: {
        email: parsed.data.email,
        username: parsed.data.username,
        displayName: parsed.data.username,
        passwordHash,
        role: Role.USER,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(genericError, { status: 400 });
    }

    console.error("Registration failed", error);
    return NextResponse.json(genericError, { status: 500 });
  }
}
