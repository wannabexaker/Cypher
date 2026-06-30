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
  retries: process.env.CI ? 2 : 0,
  // Keep database-backed journeys serialized locally and in CI. This avoids
  // cold Next.js compilations competing for CPU and makes fixture cleanup
  // deterministic.
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
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
      name: "api",
      testMatch: /api\/.*\.spec\.ts/,
    },
    {
      name: "chromium",
      testMatch: /e2e\/[^/]+\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testMatch: /mobile\/.*\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
    },
  ],
});
