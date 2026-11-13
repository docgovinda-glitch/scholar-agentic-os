import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (B2). Run against a dev server on :3000:
 *   npm run dev   # in another terminal
 *   npm run test:e2e
 * In CI the e2e workflow starts the server. Signed-in specs need a local
 * Supabase and E2E_* env (see e2e/README.md) and skip themselves otherwise.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "artifacts/e2e-report" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM } } : {}),
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      testIgnore: /zz-sign-out\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } },
      dependencies: ["setup"],
    },
    // Signing out revokes every session of account A, including the saved one the
    // other signed-in specs share. With more than one worker, file order alone does
    // not keep it last, so it runs as its own project after all the others.
    {
      name: "sign-out",
      testMatch: /zz-sign-out\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } },
      dependencies: ["chromium"],
    },
  ],
  outputDir: "artifacts/e2e-results",
});
