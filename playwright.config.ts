import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env.e2e")) {
  loadEnvFile(".env.e2e");
} else if (existsSync(".env")) {
  loadEnvFile(".env");
}

const port = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? "3100", 10);
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();
// Auth.js canonicalizes local callback URLs to localhost. Use that same origin
// so its host-only session cookie survives the post-login redirect.
const baseURL = externalBaseUrl || `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/support/global-setup.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // A cold Turbopack compile can overrun a slow dev host's first attempt; the
  // retry then runs against warm routes and passes. CI keeps 2 for infra noise.
  retries: process.env.CI ? 2 : 1,
  // Keep database-backed journeys serialized locally and in CI. This avoids
  // cold Next.js compilations competing for CPU and makes fixture cleanup
  // deterministic.
  workers: 1,
  // Generous budgets for dev-mode journeys: even after warmup, a slow host still
  // pays incremental Turbopack compiles + argon2 + DB round-trips per step. CI on
  // Linux is well under these; they only prevent false failures on slow dev hosts.
  timeout: 180_000,
  expect: { timeout: 45_000 },
  outputDir: ".artifacts/playwright",
  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: ".artifacts/playwright-report", open: "never" }]]
    : [["list"], ["html", { outputFolder: ".artifacts/playwright-report", open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `corepack pnpm exec next dev --turbopack --hostname 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          AUTH_URL: baseURL,
          NEXTAUTH_URL: baseURL,
          CRON_SECRET:
            process.env.CRON_SECRET || "local-e2e-cron-secret",
        },
      },
  projects: [
    {
      // Warms lazy-compiled dev routes once, up front, so the browser journeys
      // below don't each eat a cold Turbopack compile and time out.
      // See tests/support/warmup.setup.ts.
      name: "setup",
      testMatch: /support\/warmup\.setup\.ts$/,
    },
    {
      name: "api",
      testMatch: /api\/.*\.spec\.ts/,
    },
    {
      name: "chromium",
      testMatch: /e2e\/[^/]+\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testMatch: /mobile\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Pixel 5"] },
    },
  ],
});
