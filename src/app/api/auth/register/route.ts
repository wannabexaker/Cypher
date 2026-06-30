import { Prisma, Role } from "@prisma/client";
import { NextResponse } from "next/server";

import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  enforceRequestRateLimit,
  RateLimitExceededError,
  RateLimitUnavailableError,
} from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { verifyTurnstile } from "@/lib/turnstile";
import { registerSchema } from "@/lib/validation/auth";

export const runtime = "nodejs";

const genericError = {
  error: "Unable to create an account with those details.",
};

export async function POST(request: Request) {
  try {
    await enforceRequestRateLimit("register-ip", request);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(genericError, {
        status: 429,
        headers: { "Retry-After": String(error.retryAfterSeconds) },
      });
    }
    if (error instanceof RateLimitUnavailableError) {
      return NextResponse.json(genericError, { status: 503 });
    }
    throw error;
  }

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

  if (
    !(await verifyTurnstile({
      token: parsed.data.turnstileToken,
      remoteIp: getClientIp(request) ?? undefined,
    }))
  ) {
    return NextResponse.json(genericError, { status: 403 });
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
