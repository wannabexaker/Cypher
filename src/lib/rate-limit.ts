import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { hashHmac } from "@/lib/hash";
import { getClientIp } from "@/lib/request";

const RATE_LIMIT_POLICIES = {
  "vote-ip": { tokens: 80, window: "1 m" },
  "vote-identity": { tokens: 30, window: "1 m" },
  "vote-fingerprint": { tokens: 40, window: "1 m" },
  "join-ip": { tokens: 30, window: "1 m" },
  "register-ip": { tokens: 5, window: "10 m" },
  "login-ip": { tokens: 15, window: "10 m" },
  "login-account": { tokens: 10, window: "10 m" },
  "upload-ip": { tokens: 12, window: "10 m" },
} as const satisfies Record<string, { tokens: number; window: Duration }>;

export type RateLimitScope = keyof typeof RATE_LIMIT_POLICIES;

type RateLimitEnvironment = {
  NODE_ENV?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
};

type LimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

type RateLimitOptions = {
  environment?: RateLimitEnvironment;
  execute?: () => Promise<LimitResult>;
  now?: number;
};

const limiters = new Map<string, Ratelimit>();
let redis: Redis | null = null;
let redisCredentials = "";

export class RateLimitExceededError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Rate limit exceeded.");
  }
}

export class RateLimitUnavailableError extends Error {
  constructor() {
    super("Rate limiting is unavailable.");
  }
}

export function getRateLimitConfiguration(
  environment: RateLimitEnvironment = process.env,
) {
  const url = environment.UPSTASH_REDIS_REST_URL?.trim() ?? "";
  const token = environment.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";

  return {
    configured: Boolean(url && token),
    production: environment.NODE_ENV === "production",
    url,
    token,
  };
}

function getLimiter(
  scope: RateLimitScope,
  configuration: ReturnType<typeof getRateLimitConfiguration>,
) {
  const credentials = `${configuration.url}\u0000${configuration.token}`;
  if (!redis || credentials !== redisCredentials) {
    redis = new Redis({
      url: configuration.url,
      token: configuration.token,
    });
    redisCredentials = credentials;
    limiters.clear();
  }

  const existing = limiters.get(scope);
  if (existing) return existing;

  const policy = RATE_LIMIT_POLICIES[scope];
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(policy.tokens, policy.window),
    prefix: `cypher:ratelimit:${scope}`,
    analytics: false,
    timeout: 0,
  });
  limiters.set(scope, limiter);
  return limiter;
}

export async function enforceRateLimit(
  scope: RateLimitScope,
  identifier: string,
  options: RateLimitOptions = {},
) {
  const environment = options.environment ?? process.env;
  const configuration = getRateLimitConfiguration(environment);

  if (!configuration.configured && !options.execute) {
    if (configuration.production) throw new RateLimitUnavailableError();
    return { enabled: false, remaining: null, reset: null } as const;
  }

  try {
    const result = options.execute
      ? await options.execute()
      : await getLimiter(scope, configuration).limit(identifier);

    if (!result.success) {
      const now = options.now ?? Date.now();
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((result.reset - now) / 1000),
      );
      throw new RateLimitExceededError(retryAfterSeconds);
    }

    return {
      enabled: true,
      remaining: result.remaining,
      reset: result.reset,
    } as const;
  } catch (error) {
    if (error instanceof RateLimitExceededError) throw error;
    if (configuration.production) throw new RateLimitUnavailableError();

    return { enabled: false, remaining: null, reset: null } as const;
  }
}

export function hashRateLimitIdentifier(value: string) {
  return hashHmac(`ratelimit:${value}`);
}

export async function enforceRequestRateLimit(
  scope: RateLimitScope,
  request: Pick<Request, "headers">,
) {
  const clientIp = getClientIp(request) ?? "unknown";
  return enforceRateLimit(scope, hashRateLimitIdentifier(clientIp));
}
