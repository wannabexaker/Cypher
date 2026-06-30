import { timingSafeEqual } from "node:crypto";

export function isCronAuthorized(
  request: Pick<Request, "headers">,
  secret = process.env.CRON_SECRET,
) {
  if (!secret) return false;

  const authorization = request.headers.get("authorization");
  if (!authorization) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
