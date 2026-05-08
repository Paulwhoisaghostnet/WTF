import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_PUPPET_CREDENTIALS_PATH = join(
  homedir(),
  ".wtf-gameshow",
  "e2e-puppets.local.json"
);

export const DEFAULT_KEYRING_PATH = join(
  homedir(),
  ".wtf-gameshow",
  "platform-wallet-keyring.json"
);

export const DEFAULT_MASTER_KEY_FILE = join(
  homedir(),
  ".wtf-gameshow",
  "platform-keyring-master.key"
);

export function puppetCredentialsPath() {
  return (
    process.env.WTF_E2E_PUPPET_CREDENTIALS_PATH ||
    process.env.E2E_PUPPET_CREDENTIALS_PATH ||
    DEFAULT_PUPPET_CREDENTIALS_PATH
  );
}

export async function readPuppetCredentials() {
  const filePath = puppetCredentialsPath();
  if (!existsSync(filePath)) {
    throw new Error(
      `Missing puppet credentials at ${filePath}. Run npm run test:e2e:puppets:seed first.`
    );
  }
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  if (parsed?.version !== 1 || !Array.isArray(parsed?.actors)) {
    throw new Error(`Unsupported puppet credentials file: ${filePath}`);
  }
  return parsed;
}

export function actorById(credentials, id) {
  const actor = credentials.actors.find((entry) => entry.id === id);
  if (!actor) throw new Error(`Puppet actor not found in credentials: ${id}`);
  return actor;
}

export function actorByRole(credentials, role) {
  return credentials.actors.find((entry) => entry.role === role) ?? credentials.actors[0];
}

export async function buildPuppetKeyringEnv() {
  const masterKey =
    (process.env.WTF_PLATFORM_KEYRING_MASTER_KEY || "").trim() ||
    (await readFile(
      process.env.WTF_PLATFORM_KEYRING_MASTER_KEY_FILE || DEFAULT_MASTER_KEY_FILE,
      "utf8"
    ).then((value) => value.trim()));

  return {
    WTF_OPERATOR_SIGNER_RPC:
      process.env.WTF_OPERATOR_SIGNER_RPC || "https://rpc.ghostnet.teztnets.com",
    WTF_OPERATOR_SIGNER_SOCKET:
      process.env.WTF_OPERATOR_SIGNER_SOCKET || "/run/wtf/operator-signer.sock",
    WTF_OPERATOR_SIGNER_AUTH_TOKEN:
      process.env.WTF_OPERATOR_SIGNER_AUTH_TOKEN || "local-e2e-puppets",
    WTF_OPERATOR_SIGNER_SECRET: process.env.WTF_OPERATOR_SIGNER_SECRET || "",
    WTF_OPERATOR_SIGNER_DEFAULT_WALLET_ID:
      process.env.WTF_OPERATOR_SIGNER_DEFAULT_WALLET_ID || "wtf-os-root",
    WTF_PLATFORM_KEYRING_PATH:
      process.env.WTF_PLATFORM_KEYRING_PATH || DEFAULT_KEYRING_PATH,
    WTF_PLATFORM_KEYRING_MASTER_KEY: masterKey,
    WTF_PLATFORM_KEYRING_MASTER_KEY_FILE:
      process.env.WTF_PLATFORM_KEYRING_MASTER_KEY_FILE || DEFAULT_MASTER_KEY_FILE,
    WTF_PLATFORM_KEYRING_CREATE_ENABLED: 0,
    WTF_OPERATOR_SIGNER_CONTRACT_ALLOWLIST: (
      process.env.WTF_OPERATOR_SIGNER_CONTRACT_ALLOWLIST || ""
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    WTF_OPERATOR_SIGNER_MAX_XTZ_MUTEZ: Number(
      process.env.WTF_OPERATOR_SIGNER_MAX_XTZ_MUTEZ || 100_000_000
    ),
    WTF_OPERATOR_SIGNER_MAX_RECIPIENTS: Number(
      process.env.WTF_OPERATOR_SIGNER_MAX_RECIPIENTS || 200
    ),
    WTF_OPERATOR_SIGNER_ALLOW_CUSTOM: Number(
      process.env.WTF_OPERATOR_SIGNER_ALLOW_CUSTOM || 0
    ),
    WTF_OPERATOR_SIGNER_AUDIT_LOG:
      process.env.WTF_OPERATOR_SIGNER_AUDIT_LOG ||
      "/var/log/wtf/operator-signer.log",
  };
}

export function packedUtf8StringBody(message) {
  const msgHex = Buffer.from(message, "utf8").toString("hex");
  return `01${Buffer.byteLength(message, "utf8").toString(16).padStart(8, "0")}${msgHex}`;
}
