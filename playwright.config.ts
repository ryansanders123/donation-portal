import { defineConfig } from "@playwright/test";

/**
 * Playwright E2E config for Pinnacle Donations.
 *
 * Notes:
 * - We only test chromium to keep CI fast (and local installs small).
 * - webServer boots `next dev` on port 3000 when no server is already running.
 * - reuseExistingServer: true lets a dev server that is already up be used
 *   (useful when iterating locally).
 * - Many of our flows require Google/Microsoft OAuth. Those specs use
 *   `test.skip()` until the OAuth providers are wired up in the Supabase
 *   dashboard for the preview/prod environments.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
