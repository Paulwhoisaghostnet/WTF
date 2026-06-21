import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const localSecretDir = path.join(root, ".tmp", "marketplace-shadownet-e2e");

const DEFAULT_MARKETPLACE_V2 = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const DEFAULT_IN_APP_MARKET = "KT1MdvE9hYFpQP7boybqSJ9XNfXjLUG6QZrC";
const DEFAULT_WTF_FA2 = "KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj";
const DEFAULT_SAMPLE_FA2 = "KT1RoZavK1g2suSAMinjZ2Dnto1efkRApR2V";
const SHADOWNET_RPC = "https://tezos-shadownet.octez.io/";
const SHADOWNET_TZKT = "https://api.shadownet.tzkt.io/v1";

function run(label, command, args, env) {
  console.log(`\n[marketplace-shadownet] ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    shell: false,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const requestedNetwork =
  process.env.WTF_E2E_PUPPET_NETWORK || process.env.TEZOS_NETWORK || "shadownet";

if (requestedNetwork === "mainnet") {
  throw new Error("Refusing to run the marketplace puppet confidence pass on mainnet.");
}
if (requestedNetwork !== "shadownet") {
  throw new Error(`This runner is Shadownet-only, got ${requestedNetwork}.`);
}

mkdirSync(localSecretDir, { recursive: true, mode: 0o700 });

const env = {
  ...process.env,
  TEZOS_NETWORK: "shadownet",
  VITE_TEZOS_NETWORK: "shadownet",
  TZKT_API_URL: process.env.TZKT_API_URL || SHADOWNET_TZKT,
  SHADOWNET_TZKT_API_URL: process.env.SHADOWNET_TZKT_API_URL || SHADOWNET_TZKT,
  MARKETPLACE_CONTRACT_ADDRESS:
    process.env.WTF_E2E_MARKETPLACE_V2_ADDRESS ||
    process.env.MARKETPLACE_CONTRACT_ADDRESS ||
    DEFAULT_MARKETPLACE_V2,
  VITE_MARKETPLACE_CONTRACT_ADDRESS:
    process.env.WTF_E2E_MARKETPLACE_V2_ADDRESS ||
    process.env.VITE_MARKETPLACE_CONTRACT_ADDRESS ||
    process.env.MARKETPLACE_CONTRACT_ADDRESS ||
    DEFAULT_MARKETPLACE_V2,
  LEGACY_MARKETPLACE_CONTRACT_ADDRESS:
    process.env.LEGACY_MARKETPLACE_CONTRACT_ADDRESS || "",
  BARTER_CONTRACT_ADDRESS: process.env.WTF_E2E_BARTER_CONTRACT_ADDRESS || "",
  VITE_BARTER_CONTRACT_ADDRESS:
    process.env.WTF_E2E_BARTER_CONTRACT_ADDRESS || "",
  IN_APP_MARKET_CONTRACT_ADDRESS:
    process.env.IN_APP_MARKET_CONTRACT_ADDRESS ||
    process.env.WTF_IN_APP_MARKET_CONTRACT_ADDRESS ||
    DEFAULT_IN_APP_MARKET,
  VITE_IN_APP_MARKET_CONTRACT_ADDRESS:
    process.env.VITE_IN_APP_MARKET_CONTRACT_ADDRESS ||
    process.env.IN_APP_MARKET_CONTRACT_ADDRESS ||
    DEFAULT_IN_APP_MARKET,
  WTF_E2E_MARKETPLACE_V2_ADDRESS:
    process.env.WTF_E2E_MARKETPLACE_V2_ADDRESS || DEFAULT_MARKETPLACE_V2,
  WTF_E2E_MARKETPLACE_WTF_FA2:
    process.env.WTF_E2E_MARKETPLACE_WTF_FA2 || DEFAULT_WTF_FA2,
  WTF_E2E_MARKETPLACE_SAMPLE_FA2:
    process.env.WTF_E2E_MARKETPLACE_SAMPLE_FA2 || DEFAULT_SAMPLE_FA2,
  WTF_TOKEN_CONTRACT:
    process.env.WTF_TOKEN_CONTRACT ||
    process.env.WTF_E2E_MARKETPLACE_WTF_FA2 ||
    DEFAULT_WTF_FA2,
  WTF_TOKEN_ID: process.env.WTF_TOKEN_ID || "0",
  VITE_WTF_TOKEN_CONTRACT:
    process.env.VITE_WTF_TOKEN_CONTRACT ||
    process.env.WTF_E2E_MARKETPLACE_WTF_FA2 ||
    DEFAULT_WTF_FA2,
  VITE_WTF_TOKEN_ID: process.env.VITE_WTF_TOKEN_ID || "0",
  WTF_E2E_PUPPET_NETWORK: "shadownet",
  WTF_OPERATOR_SIGNER_RPC: process.env.WTF_OPERATOR_SIGNER_RPC || SHADOWNET_RPC,
  WTF_PLATFORM_KEYRING_PATH:
    process.env.WTF_PLATFORM_KEYRING_PATH ||
    path.join(localSecretDir, "platform-wallet-keyring.json"),
  WTF_PLATFORM_KEYRING_MASTER_KEY_FILE:
    process.env.WTF_PLATFORM_KEYRING_MASTER_KEY_FILE ||
    path.join(localSecretDir, "platform-keyring-master.key"),
  WTF_E2E_PUPPET_CREDENTIALS_PATH:
    process.env.WTF_E2E_PUPPET_CREDENTIALS_PATH ||
    path.join(localSecretDir, "e2e-puppets.local.json"),
  WTF_E2E_ACTOR_FILTER: process.env.WTF_E2E_ACTOR_FILTER || "bert,ernie",
  WTF_E2E_START_SERVER: process.env.WTF_E2E_START_SERVER || "1",
  WTF_E2E_REUSE_SERVER: process.env.WTF_E2E_REUSE_SERVER || "0",
  WTF_E2E_READY_PATH: process.env.WTF_E2E_READY_PATH || "/api/auth/csrf-token",
  PORT: process.env.PORT || "3318",
};

run(
  "Seed isolated Shadownet puppet wallets",
  "npm",
  [
    "run",
    "test:e2e:puppets:seed",
    "--",
    "--network",
    "shadownet",
    "--rpc",
    SHADOWNET_RPC,
  ],
  env,
);

run(
  "Run local UI/API Shadownet Marketplace V2 puppet spec",
  "npx",
  [
    "playwright",
    "test",
    "--config=playwright.live.config.mjs",
    "tests/playwright/live/marketplace-shadownet.spec.mjs",
  ],
  env,
);
