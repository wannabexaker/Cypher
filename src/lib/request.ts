import { isIP } from "node:net";

type RequestWithHeaders = Pick<Request, "headers">;

type RequestEnvironment = Readonly<Record<string, string | undefined>>;

function firstValidIp(value: string | null) {
  for (const candidate of value?.split(",") ?? []) {
    const normalized = candidate.trim();
    if (isIP(normalized)) return normalized;
  }
  return null;
}

export function getClientIp(
  request: RequestWithHeaders,
  environment: RequestEnvironment = process.env,
) {
  if (environment.VERCEL === "1") {
    return (
      firstValidIp(request.headers.get("x-vercel-forwarded-for")) ??
      firstValidIp(request.headers.get("x-forwarded-for"))
    );
  }

  const cloudflareIp = firstValidIp(
    request.headers.get("cf-connecting-ip"),
  );
  if (cloudflareIp) return cloudflareIp;

  const firstForwarded = firstValidIp(request.headers.get("x-forwarded-for"));
  if (firstForwarded) return firstForwarded;

  return firstValidIp(request.headers.get("x-real-ip"));
}
