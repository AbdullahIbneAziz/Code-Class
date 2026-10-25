import { defineConfig, devices } from "@playwright/test";
import { loadTestEnv } from "./tests/env";

// Loads .env.test.local (refuses the live project). A BASE_URL run needs ALLOW_LIVE_DB=1.
loadTestEnv();

// Dedicated port so a developer's own `npm run dev` (live env, port 3000) is never reused.
const PORT = 3100;

const baseURL = process.env.BASE_URL;

export default defineConfig({
  workers: 1,
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: baseURL || `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: baseURL
    ? undefined
    : {
        command: `npx next dev -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
          DATABASE_URL: process.env.DATABASE_URL ?? "",
          NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN: process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN ?? "",
        },
        timeout: 120_000,
      },
});
