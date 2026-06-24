import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const GUEST_COOKIE_NAME = "cypher_guest";
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function getSigningSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required to sign guest sessions.");
  }
  return secret;
}

function signGuestToken(token: string) {
  return createHmac("sha256", getSigningSecret())
    .update(token)
    .digest("base64url");
}

export function createGuestSession() {
  const guestToken = randomBytes(24).toString("base64url");
  return {
    guestToken,
    cookieValue: `${guestToken}.${signGuestToken(guestToken)}`,
  };
}

export function readGuestToken(cookieValue: string | undefined) {
  if (!cookieValue) return null;

  const [guestToken, signature, ...rest] = cookieValue.split(".");
  if (!guestToken || !signature || rest.length > 0) return null;

  const expectedSignature = signGuestToken(guestToken);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    return null;
  }

  return guestToken;
}

