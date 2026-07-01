import { test as setup } from "@playwright/test";

// Dev-mode Next.js (Turbopack) compiles each route lazily on its FIRST request.
// On a slow host that first hit is pathological: ~40s for a heavy page and ~35s
// for the first API route (which must also compile the shared prisma/auth/lib
// graph). That blew per-test budgets and made the journeys flake.
//
// This setup project (a dependency of the chromium + mobile projects) pays the
// one-time cost up front for the HEAVY SHARED graphs:
//   - a handful of pages -> compiles the React/Tailwind/component-lib graph,
//   - a single API POST  -> compiles the server prisma/auth/lib graph.
// Once those are cached, every OTHER route (including dynamic ones the journeys
// hit) only compiles its own small handler (~5s), which fits the raised
// timeouts. `retries` in the config is the safety net for the rare cold miss.
//
// Best-effort: redirects / 401s / 404s still trigger compilation, which is the
// only goal — outcomes are intentionally ignored.
const PAGE_ROUTES = [
  "/",
  "/register",
  "/login",
  "/dashboard",
  "/dashboard/channels/new",
];

setup("warm up server routes", async ({ page }) => {
  setup.setTimeout(360_000);

  for (const route of PAGE_ROUTES) {
    try {
      await page.goto(route, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
    } catch {
      // Compilation was still triggered by the request; ignore the outcome.
    }
  }

  // One unauthenticated API hit compiles the shared server graph (returns 401,
  // but prisma/auth/lib are now warm for every API route the tests hit).
  try {
    await page.request.fetch("/api/channels", {
      method: "POST",
      data: {},
      timeout: 90_000,
      failOnStatusCode: false,
    });
  } catch {
    // 401 / errors are fine — the shared server modules compiled.
  }
});
