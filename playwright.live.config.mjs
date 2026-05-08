import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.WTF_E2E_LIVE_BASE_URL ||
  process.env.E2E_BASE_URL ||
  `http://127.0.0.1:${process.env.PORT || "3000"}`;

const startServer = process.env.WTF_E2E_START_SERVER === "1";
const serverPort = new URL(baseURL).port || "3000";
const reuseServer = process.env.WTF_E2E_REUSE_SERVER !== "0";
const existingCors = process.env.CORS_ALLOWED_ORIGINS || "";
const corsOrigins = [existingCors, new URL(baseURL).origin].filter(Boolean).join(",");

export default defineConfig({
  testDir: "./tests/playwright/live",
  testMatch: "**/*.spec.mjs",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: startServer
    ? {
        command: "npm run dev",
        url: `${baseURL.replace(/\/+$/, "")}/api/health`,
        reuseExistingServer: reuseServer,
        timeout: 120_000,
        env: {
          PORT: serverPort,
          CORS_ALLOWED_ORIGINS: corsOrigins,
          WTF_E2E_RATE_LIMIT_BYPASS: "1",
          WTF_E2E_DISABLE_LOGIN_BACKFILL: "1",
        },
      }
    : undefined,
});
