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

function isLocalHostname(hostname) {
  return [
    "localhost",
    "127.0.0.1",
    "::1",
    "0.0.0.0",
    "postgres",
    "db",
  ].includes(String(hostname || "").toLowerCase());
}

function hostnameFromDatabaseDescriptor(database) {
  if (!database || typeof database !== "object") return "";
  if (database.hostname) return String(database.hostname);
  if (database.host) return String(database.host).split(":")[0];
  return "";
}

function hostnameFromUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    return new URL(String(rawUrl)).hostname;
  } catch {
    return "";
  }
}

export function assertPuppetCredentialsMatchTarget(
  credentials,
  filePath,
  options = {}
) {
  const targetBaseUrl =
    options.targetBaseUrl ??
    process.env.WTF_E2E_LIVE_BASE_URL ??
    process.env.E2E_BASE_URL ??
    "";
  if (!targetBaseUrl) return;

  const allowLocalCredentialsOnRemote =
    options.allowLocalCredentialsOnRemote ??
    process.env.WTF_E2E_ALLOW_LOCAL_CREDENTIALS_ON_REMOTE === "1";
  if (allowLocalCredentialsOnRemote) return;

  const targetHostname = hostnameFromUrl(targetBaseUrl);
  if (!targetHostname) return;

  const credentialTargetHostname = hostnameFromUrl(
    credentials?.targetBaseUrl || credentials?.target?.baseUrl
  );
  if (
    credentialTargetHostname &&
    credentialTargetHostname === targetHostname &&
    !isLocalHostname(targetHostname)
  ) {
    return;
  }

  const credentialHostname = hostnameFromDatabaseDescriptor(credentials?.database);
  if (
    targetHostname &&
    !isLocalHostname(targetHostname) &&
    isLocalHostname(credentialHostname)
  ) {
    throw new Error(
      [
        `Refusing to use local puppet credentials from ${filePath} against ${targetBaseUrl}.`,
        `The credential file was generated for database host ${credentialHostname}, so live password logins would fail or test the wrong environment.`,
        "Export or seed production puppet credentials intentionally, set WTF_E2E_PUPPET_CREDENTIALS_PATH to that secret file, then rerun the live suite.",
        "For Hetzner access, first make scripts/wtf-ssh.sh --check pass in this Codex session.",
      ].join(" ")
    );
  }
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
  assertPuppetCredentialsMatchTarget(parsed, filePath);
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
    WTF_OPERATOR_SIGNER_DISBURSE_ASSETS: (
      process.env.WTF_OPERATOR_SIGNER_DISBURSE_ASSETS ||
      "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD:0"
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
