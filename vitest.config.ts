import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    root,
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/lib/channel-code.ts",
        "src/lib/cron.ts",
        "src/lib/embeds.ts",
        "src/lib/guest-profile.ts",
        "src/lib/malware-scan.ts",
        "src/lib/rate-limit.ts",
        "src/lib/request.ts",
        "src/lib/turnstile.ts",
        "src/lib/votes.ts",
        "src/lib/validation/*.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
});
