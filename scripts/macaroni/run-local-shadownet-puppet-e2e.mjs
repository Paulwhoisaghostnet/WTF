import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const localSecretDir = path.join(root, ".tmp", "macaroni-shadownet-e2e");

const SHADOWNET_RPC = "https://rpc.shadownet.teztnets.com";
const SHADOWNET_TZKT = "https://api.shadownet.tzkt.io/v1";

function run(label, command, args, env) {
  console.log(`\n[macaroni-shadownet] ${label}`);
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
  throw new Error("Refusing to run the Macaroni puppet confidence pass on mainnet.");
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
  WTF_E2E_ACTOR_FILTER: process.env.WTF_E2E_ACTOR_FILTER || "cookiemonster",
  WTF_E2E_START_SERVER: process.env.WTF_E2E_START_SERVER || "1",
  WTF_E2E_REUSE_SERVER: process.env.WTF_E2E_REUSE_SERVER || "0",
  WTF_E2E_READY_PATH: process.env.WTF_E2E_READY_PATH || "/api/auth/csrf-token",
  PORT: process.env.PORT || "3321",
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
  "Run local Macaroni Shadownet puppet spec",
  "npx",
  [
    "playwright",
    "test",
    "--config=playwright.live.config.mjs",
    "tests/playwright/live/macaroni-shadownet.spec.mjs",
  ],
  env,
);
