import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.HARNESS_PORT || 4173);

export default defineConfig({
  testDir: "./tests/playwright",
  testMatch: "**/*.spec.mjs",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node tests/playwright/harness.mjs",
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { HARNESS_PORT: String(PORT) },
  },
});
