const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileResponse = {
  success?: boolean;
};

type TurnstileEnvironment = {
  NODE_ENV?: string;
  TURNSTILE_SECRET_KEY?: string;
};

export function getTurnstileConfiguration(
  environment: TurnstileEnvironment = process.env,
) {
  const secret = environment.TURNSTILE_SECRET_KEY?.trim() ?? "";
  return {
    secret,
    required: environment.NODE_ENV === "production" || Boolean(secret),
  };
}

export async function verifyTurnstile({
  token,
  remoteIp,
  environment,
}: {
  token?: string;
  remoteIp?: string;
  environment?: TurnstileEnvironment;
}) {
  const configuration = getTurnstileConfiguration(environment);
  const { secret } = configuration;
  if (!secret) return !configuration.required;
  if (!token) return false;

  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;

    const payload = (await response.json()) as TurnstileResponse;
    return payload.success === true;
  } catch {
    return false;
  }
}
