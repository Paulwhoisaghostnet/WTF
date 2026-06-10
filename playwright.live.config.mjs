import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.WTF_E2E_LIVE_BASE_URL ||
  process.env.E2E_BASE_URL ||
  `http://127.0.0.1:${process.env.PORT || "3000"}`;
const readyPath = process.env.WTF_E2E_READY_PATH || "/api/health";

const startServer = process.env.WTF_E2E_START_SERVER === "1";
const serverPort = new URL(baseURL).port || "3000";
const reuseServer = process.env.WTF_E2E_REUSE_SERVER !== "0";
const existingCors = process.env.CORS_ALLOWED_ORIGINS || "";
const corsOrigins = [existingCors, new URL(baseURL).origin].filter(Boolean).join(",");
const localDataRoot =
  process.env.WTF_E2E_DATA_ROOT ||
  `${process.cwd()}/.tmp/live-e2e-wtf-data`;
const forwardedTezosEnv = [
  "TEZOS_NETWORK",
  "VITE_TEZOS_NETWORK",
  "TZKT_API_URL",
  "SHADOWNET_TZKT_API_URL",
  "MARKETPLACE_CONTRACT_ADDRESS",
  "VITE_MARKETPLACE_CONTRACT_ADDRESS",
  "LEGACY_MARKETPLACE_CONTRACT_ADDRESS",
  "IN_APP_MARKET_CONTRACT_ADDRESS",
  "WTF_IN_APP_MARKET_CONTRACT_ADDRESS",
  "VITE_IN_APP_MARKET_CONTRACT_ADDRESS",
  "WTF_E2E_MARKETPLACE_V2_ADDRESS",
  "WTF_E2E_MARKETPLACE_WTF_FA2",
  "WTF_E2E_MARKETPLACE_SAMPLE_FA2",
  "WTF_TOKEN_CONTRACT",
  "WTF_TOKEN_ID",
  "VITE_WTF_TOKEN_CONTRACT",
  "VITE_WTF_TOKEN_ID",
].reduce((env, key) => {
  if (process.env[key]) env[key] = process.env[key];
  return env;
}, {});

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
        url: `${baseURL.replace(/\/+$/, "")}${readyPath.startsWith("/") ? readyPath : `/${readyPath}`}`,
        reuseExistingServer: reuseServer,
        timeout: 120_000,
        env: {
          PORT: serverPort,
          CORS_ALLOWED_ORIGINS: corsOrigins,
          WTF_E2E_RATE_LIMIT_BYPASS: "1",
          WTF_E2E_DISABLE_LOGIN_BACKFILL: "1",
          WTF_DATA_ROOT: process.env.WTF_DATA_ROOT || localDataRoot,
          UPLOAD_STAGING_DIR:
            process.env.UPLOAD_STAGING_DIR || `${localDataRoot}/uploads-staging`,
          MEDIA_HOT_CACHE_DIR:
            process.env.MEDIA_HOT_CACHE_DIR || `${localDataRoot}/tv-cache/users`,
          TMP_PROCESSING_DIR:
            process.env.TMP_PROCESSING_DIR || `${localDataRoot}/tmp-processing`,
          RAT_RACE_TZ2AT_MAX_REPLAY_PAGES:
            process.env.RAT_RACE_TZ2AT_MAX_REPLAY_PAGES || "1",
          ...forwardedTezosEnv,
        },
      }
    : undefined,
});
