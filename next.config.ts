import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const turnstileOrigin = "https://challenges.cloudflare.com";

function storageOrigin(): string {
  const endpoint = process.env.S3_ENDPOINT;
  if (!endpoint) return "";
  try {
    return new URL(endpoint).origin;
  } catch {
    return "";
  }
}

function contentSecurityPolicy(): string {
  const storage = storageOrigin();

  const scriptSrc = ["'self'", "'unsafe-inline'", turnstileOrigin];
  if (isDev) scriptSrc.push("'unsafe-eval'");

  const connectSrc = ["'self'"];
  if (storage) connectSrc.push(storage);
  if (isDev) connectSrc.push("ws:", "wss:");

  const mediaSrc = ["'self'", "blob:"];
  if (storage) mediaSrc.push(storage);

  const imgSrc = ["'self'", "data:", "blob:"];
  if (storage) imgSrc.push(storage);

  const directives = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `script-src ${scriptSrc.join(" ")}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${imgSrc.join(" ")}`,
    `media-src ${mediaSrc.join(" ")}`,
    `connect-src ${connectSrc.join(" ")}`,
    `font-src 'self' data:`,
    `frame-src https://open.spotify.com https://w.soundcloud.com ${turnstileOrigin}`,
  ];

  return directives.join("; ");
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy(),
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
