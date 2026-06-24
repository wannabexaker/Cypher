import { createHmac } from "node:crypto";

function getHashSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for security hashes.");
  }
  return secret;
}

export function hashHmac(value: string) {
  return createHmac("sha256", getHashSecret()).update(value).digest("hex");
}
