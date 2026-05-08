import "dotenv/config";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { TezosToolkit } from "@taquito/taquito";
import {
  platformWalletIdSchema,
  platformWalletNetworkSchema,
  platformWalletRoleSchema,
  tezosAddressSchema,
  type PlatformWalletNetwork,
  type PlatformWalletPublic,
  type PlatformWalletRole,
} from "../shared/operator-signer";
import keyringModule from "../extensions/wtf-operator-signer/src/keyring";
import type { SignerEnv } from "../extensions/wtf-operator-signer/src/env";

const { PlatformWalletKeyring } = keyringModule as typeof import("../extensions/wtf-operator-signer/src/keyring");

const defaultSecretDir = join(homedir(), ".wtf-gameshow");
const defaultKeyringPath = join(defaultSecretDir, "platform-wallet-keyring.json");
const defaultMasterKeyFile = join(defaultSecretDir, "platform-keyring-master.key");
const defaultManifestPath = join(defaultSecretDir, "platform-wallets-manifest.json");

type Flags = {
  _: string[];
  id?: string;
  label?: string;
  role?: string;
  network?: string;
  rpc?: string;
  keyring?: string;
  masterKeyFile?: string;
  manifest?: string;
  to?: string;
  mutez?: string;
  xtz?: string;
  confirmations?: string;
  json?: boolean;
  "no-manifest"?: boolean;
  "dry-run"?: boolean;
  help?: boolean;
};

type ListedWallet = PlatformWalletPublic & {
  purpose?: string;
};

type BalanceWallet = ListedWallet & {
  balanceMutez: string;
  balanceXtz: string;
};

function parseArgs(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      flags._.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey as keyof Flags;
    if (key === "json" || key === "no-manifest" || key === "dry-run" || key === "help") {
      flags[key] = true as never;
      continue;
    }
    const value = inlineValue ?? argv[++i];
    if (!value) throw new Error(`Missing value for --${rawKey}`);
    flags[key] = value as never;
  }
  return flags;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run platform-wallets -- init --network shadownet --rpc https://rpc.shadownet.teztnets.com",
    "  npm run platform-wallets -- create --id arcade-treasury --label \"Arcade Treasury\" --role arcade_treasury --network shadownet",
    "  npm run platform-wallets -- list",
    "  npm run platform-wallets -- balance --id arcade-treasury --network mainnet --rpc https://rpc.tzkt.io/mainnet",
    "  npm run platform-wallets -- send-xtz --id arcade-treasury --to tz1... --mutez 1000 --network mainnet --rpc https://rpc.tzkt.io/mainnet",
    "",
    "Secrets are stored outside the repo by default:",
    `  keyring: ${defaultKeyringPath}`,
    `  master key file: ${defaultMasterKeyFile}`,
    "",
    "Only public wallet metadata is written to the manifest.",
  ].join("\n");
}

function inferNetwork(rpcUrl: string): PlatformWalletNetwork {
  const lower = rpcUrl.toLowerCase();
  if (lower.includes("ghostnet")) return "ghostnet";
  if (lower.includes("shadownet")) return "shadownet";
  if (lower.includes("mainnet") || lower.includes("tzkt.io")) return "mainnet";
  return "custom";
}

function rpcForNetwork(network: PlatformWalletNetwork): string {
  switch (network) {
    case "ghostnet":
      return "https://rpc.ghostnet.teztnets.com";
    case "shadownet":
      return "https://rpc.shadownet.teztnets.com";
    case "mainnet":
      return "https://rpc.tzkt.io/mainnet";
    case "custom":
      return process.env.WTF_OPERATOR_SIGNER_RPC || "https://rpc.tzkt.io/mainnet";
  }
}

function parseNetwork(flags: Flags): PlatformWalletNetwork {
  const raw =
    flags.network ||
    process.env.WTF_PLATFORM_WALLET_NETWORK ||
    (process.env.WTF_OPERATOR_SIGNER_RPC
      ? inferNetwork(process.env.WTF_OPERATOR_SIGNER_RPC)
      : "mainnet");
  return platformWalletNetworkSchema.parse(raw);
}

function parseRole(raw: string | undefined): PlatformWalletRole {
  return platformWalletRoleSchema.parse(raw || "custom");
}

function parseConfirmations(raw: string | undefined): number {
  if (raw == null || raw === "") return 1;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10) {
    throw new Error("--confirmations must be an integer from 0 to 10");
  }
  return parsed;
}

function parseSendMutez(flags: Flags): bigint {
  if (flags.mutez && flags.xtz) {
    throw new Error("Use either --mutez or --xtz, not both");
  }
  if (flags.mutez) {
    if (!/^\d+$/.test(flags.mutez)) {
      throw new Error("--mutez must be a non-negative integer string");
    }
    const value = BigInt(flags.mutez);
    if (value <= 0n) throw new Error("--mutez must be greater than 0");
    return value;
  }
  if (flags.xtz) {
    if (!/^\d+(\.\d{1,6})?$/.test(flags.xtz)) {
      throw new Error("--xtz must be a positive decimal with up to 6 places");
    }
    const [whole, frac = ""] = flags.xtz.split(".");
    const value =
      BigInt(whole) * 1_000_000n +
      BigInt(frac.padEnd(6, "0").slice(0, 6) || "0");
    if (value <= 0n) throw new Error("--xtz must be greater than 0");
    return value;
  }
  throw new Error("Missing amount: pass --mutez or --xtz");
}

function mutezToXtz(mutez: string | bigint): string {
  const value = typeof mutez === "bigint" ? mutez : BigInt(mutez);
  const whole = value / 1_000_000n;
  const frac = (value % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

function balanceToString(balance: unknown): string {
  if (
    balance &&
    typeof balance === "object" &&
    "toFixed" in balance &&
    typeof balance.toFixed === "function"
  ) {
    return balance.toFixed(0);
  }
  return String(balance);
}

async function readOrCreateMasterKey(filePath: string): Promise<string> {
  if ((process.env.WTF_PLATFORM_KEYRING_MASTER_KEY || "").trim()) {
    return process.env.WTF_PLATFORM_KEYRING_MASTER_KEY!.trim();
  }

  const envFile = (process.env.WTF_PLATFORM_KEYRING_MASTER_KEY_FILE || "").trim();
  const resolvedFile = envFile || filePath;
  if (existsSync(resolvedFile)) {
    return (await readFile(resolvedFile, "utf8")).trim();
  }

  await mkdir(dirname(resolvedFile), { recursive: true, mode: 0o700 });
  const masterKey = randomBytes(48).toString("base64");
  await writeFile(resolvedFile, `${masterKey}\n`, { mode: 0o600 });
  await chmod(resolvedFile, 0o600);
  return masterKey;
}

async function buildEnv(
  flags: Flags,
  opts: { createEnabled: boolean }
): Promise<SignerEnv> {
  const network = parseNetwork(flags);
  const rpc = flags.rpc || process.env.WTF_OPERATOR_SIGNER_RPC || rpcForNetwork(network);
  const masterKeyFile = flags.masterKeyFile || defaultMasterKeyFile;
  const masterKey = await readOrCreateMasterKey(masterKeyFile);

  return {
    WTF_OPERATOR_SIGNER_RPC: rpc,
    WTF_OPERATOR_SIGNER_SOCKET:
      process.env.WTF_OPERATOR_SIGNER_SOCKET || "/run/wtf/operator-signer.sock",
    WTF_OPERATOR_SIGNER_AUTH_TOKEN:
      process.env.WTF_OPERATOR_SIGNER_AUTH_TOKEN || "local-platform-wallet-tool",
    WTF_OPERATOR_SIGNER_SECRET: process.env.WTF_OPERATOR_SIGNER_SECRET || "",
    WTF_OPERATOR_SIGNER_DEFAULT_WALLET_ID:
      process.env.WTF_OPERATOR_SIGNER_DEFAULT_WALLET_ID || "wtf-os-root",
    WTF_PLATFORM_KEYRING_PATH:
      flags.keyring || process.env.WTF_PLATFORM_KEYRING_PATH || defaultKeyringPath,
    WTF_PLATFORM_KEYRING_MASTER_KEY: masterKey,
    WTF_PLATFORM_KEYRING_MASTER_KEY_FILE:
      process.env.WTF_PLATFORM_KEYRING_MASTER_KEY_FILE || masterKeyFile,
    WTF_PLATFORM_KEYRING_CREATE_ENABLED: opts.createEnabled ? 1 : 0,
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

function purposeFor(wallet: PlatformWalletPublic): string {
  switch (wallet.role) {
    case "platform_root":
      return "Root identity for WTF OS platform custody and future contract administration.";
    case "arcade_treasury":
      return "Arcade credit treasury wallet for play-card loads, creator credit earnings, and refunds/redemptions.";
    case "domain_controller":
      return "WTF.tez domain controller wallet for parent-domain ownership, official subdomain issuance, and WTF web/domain administration.";
    case "reward_disburser":
      return "Reward payout wallet for user earnings and challenge disbursements.";
    case "buyback_operator":
      return "Buyback operations wallet for allowlisted buyback contracts.";
    case "contract_admin":
      return "Contract administration wallet for allowlisted maintenance actions.";
    case "operator":
      return "Legacy/default operator signer wallet.";
    case "testing":
      return "Test-only platform wallet.";
    case "custom":
      return "Custom platform wallet.";
  }
}

async function writeManifest(
  flags: Flags,
  env: SignerEnv,
  wallets: PlatformWalletPublic[]
): Promise<void> {
  if (flags["no-manifest"]) return;
  const manifestPath = flags.manifest || defaultManifestPath;
  const body = {
    generatedAt: new Date().toISOString(),
    keyringPath: env.WTF_PLATFORM_KEYRING_PATH,
    rpcUrl: env.WTF_OPERATOR_SIGNER_RPC,
    note: "Public metadata only. No private keys or master key material are stored here.",
    wallets: wallets.map((wallet): ListedWallet => ({
      ...wallet,
      purpose: purposeFor(wallet),
    })),
  };
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(body, null, 2)}\n`, {
    mode: 0o644,
  });
}

function printWallets(
  flags: Flags,
  wallets: PlatformWalletPublic[],
  extra: Record<string, unknown> = {}
): void {
  if (flags.json) {
    console.log(JSON.stringify({ ...extra, wallets }, null, 2));
    return;
  }

  if (Object.keys(extra).length > 0) {
    for (const [key, value] of Object.entries(extra)) {
      console.log(`${key}: ${String(value)}`);
    }
  }
  for (const wallet of wallets) {
    console.log("");
    console.log(`${wallet.label} (${wallet.id})`);
    console.log(`  role: ${wallet.role}`);
    console.log(`  network: ${wallet.network}`);
    console.log(`  address: ${wallet.address}`);
    if (wallet.chainId) console.log(`  chainId: ${wallet.chainId}`);
    if (wallet.did) console.log(`  did: ${wallet.did}`);
    console.log(`  purpose: ${purposeFor(wallet)}`);
  }
}

function printBalances(
  flags: Flags,
  wallets: BalanceWallet[],
  extra: Record<string, unknown> = {}
): void {
  if (flags.json) {
    console.log(JSON.stringify({ ...extra, wallets }, null, 2));
    return;
  }
  if (Object.keys(extra).length > 0) {
    for (const [key, value] of Object.entries(extra)) {
      console.log(`${key}: ${String(value)}`);
    }
  }
  for (const wallet of wallets) {
    console.log("");
    console.log(`${wallet.label} (${wallet.id})`);
    console.log(`  address: ${wallet.address}`);
    console.log(`  network: ${wallet.network}`);
    if (wallet.chainId) console.log(`  chainId: ${wallet.chainId}`);
    console.log(`  balanceMutez: ${wallet.balanceMutez}`);
    console.log(`  balanceXtz: ${wallet.balanceXtz}`);
  }
}

async function getWalletOrThrow(
  keyring: PlatformWalletKeyring,
  id: string
): Promise<PlatformWalletPublic> {
  const wallets = await keyring.listPublicWallets();
  const wallet = wallets.find((candidate) => candidate.id === id);
  if (!wallet) throw new Error(`platform wallet not found: ${id}`);
  return wallet;
}

async function assertChain(
  tz: TezosToolkit,
  wallet: PlatformWalletPublic
): Promise<string> {
  const chainId = await tz.rpc.getChainId();
  if (wallet.chainId && wallet.chainId !== chainId) {
    throw new Error(
      `RPC chain mismatch for ${wallet.id}: wallet metadata says ${wallet.chainId}, RPC is ${chainId}`
    );
  }
  return chainId;
}

async function readWalletBalance(
  tz: TezosToolkit,
  wallet: PlatformWalletPublic
): Promise<BalanceWallet> {
  const balanceMutez = balanceToString(await tz.tz.getBalance(wallet.address));
  return {
    ...wallet,
    purpose: purposeFor(wallet),
    balanceMutez,
    balanceXtz: mutezToXtz(balanceMutez),
  };
}

async function createIfMissing(
  keyring: PlatformWalletKeyring,
  input: {
    id: string;
    label: string;
    role: PlatformWalletRole;
    network: PlatformWalletNetwork;
  }
): Promise<PlatformWalletPublic> {
  const existing = (await keyring.listPublicWallets()).find(
    (wallet) => wallet.id === input.id
  );
  if (existing) return existing;
  return keyring.createWallet(input);
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));
  const command = flags._[0] || "list";
  if (flags.help || command === "help") {
    console.log(usage());
    return;
  }

  const createEnabled = command === "create" || command === "init";
  const env = await buildEnv(flags, { createEnabled });
  const keyring = new PlatformWalletKeyring(env);
  const network = parseNetwork(flags);

  if (command === "list") {
    const wallets = await keyring.listPublicWallets();
    await writeManifest(flags, env, wallets);
    printWallets(flags, wallets, {
      keyringPath: env.WTF_PLATFORM_KEYRING_PATH,
      manifest: flags["no-manifest"] ? "not written" : flags.manifest || defaultManifestPath,
    });
    return;
  }

  if (command === "balance") {
    const tz = new TezosToolkit(env.WTF_OPERATOR_SIGNER_RPC);
    const wallets = flags.id
      ? [await getWalletOrThrow(keyring, platformWalletIdSchema.parse(flags.id))]
      : await keyring.listPublicWallets();
    const chainId = await tz.rpc.getChainId();
    const balances = await Promise.all(
      wallets.map(async (wallet) => {
        if (wallet.chainId && wallet.chainId !== chainId) {
          throw new Error(
            `RPC chain mismatch for ${wallet.id}: wallet metadata says ${wallet.chainId}, RPC is ${chainId}`
          );
        }
        return readWalletBalance(tz, wallet);
      })
    );
    printBalances(flags, balances, {
      rpcUrl: env.WTF_OPERATOR_SIGNER_RPC,
      chainId,
    });
    return;
  }

  if (command === "send-xtz") {
    const id = platformWalletIdSchema.parse(flags.id);
    const to = tezosAddressSchema.parse(flags.to);
    const mutez = parseSendMutez(flags);
    if (mutez > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("--mutez is too large for Taquito's transfer amount");
    }
    const confirmations = parseConfirmations(flags.confirmations);
    const { wallet, signer } = await keyring.getSigner(id);
    const tz = new TezosToolkit(env.WTF_OPERATOR_SIGNER_RPC);
    tz.setProvider({ signer });
    const chainId = await assertChain(tz, wallet);
    const before = await readWalletBalance(tz, wallet);
    if (flags["dry-run"]) {
      printBalances(flags, [before], {
        dryRun: true,
        rpcUrl: env.WTF_OPERATOR_SIGNER_RPC,
        chainId,
        from: wallet.address,
        to,
        amountMutez: mutez.toString(),
        amountXtz: mutezToXtz(mutez),
      });
      return;
    }

    const op = await tz.contract.transfer({
      to,
      amount: Number(mutez),
      mutez: true,
    });
    if (confirmations > 0) {
      await op.confirmation(confirmations);
    }
    const after = await readWalletBalance(tz, wallet).catch(() => null);
    const result = {
      ok: true,
      rpcUrl: env.WTF_OPERATOR_SIGNER_RPC,
      chainId,
      fromWalletId: wallet.id,
      from: wallet.address,
      to,
      amountMutez: mutez.toString(),
      amountXtz: mutezToXtz(mutez),
      opHash: op.hash,
      confirmations,
      before,
      after,
    };
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`opHash: ${op.hash}`);
      console.log(`from: ${wallet.address}`);
      console.log(`to: ${to}`);
      console.log(`amountMutez: ${mutez.toString()}`);
      console.log(`amountXtz: ${mutezToXtz(mutez)}`);
      console.log(`confirmations: ${confirmations}`);
      if (after) {
        console.log(`postBalanceMutez: ${after.balanceMutez}`);
        console.log(`postBalanceXtz: ${after.balanceXtz}`);
      }
    }
    return;
  }

  if (command === "create") {
    const id = platformWalletIdSchema.parse(flags.id);
    const label = (flags.label || id).trim();
    const role = parseRole(flags.role);
    const wallet = await createIfMissing(keyring, {
      id,
      label,
      role,
      network,
    });
    const wallets = await keyring.listPublicWallets();
    await writeManifest(flags, env, wallets);
    printWallets(flags, [wallet], {
      keyringPath: env.WTF_PLATFORM_KEYRING_PATH,
      manifest: flags["no-manifest"] ? "not written" : flags.manifest || defaultManifestPath,
    });
    return;
  }

  if (command === "init") {
    const created = [
      await createIfMissing(keyring, {
        id: "wtf-os-root",
        label: "WTF OS Root",
        role: "platform_root",
        network,
      }),
      await createIfMissing(keyring, {
        id: "arcade-treasury",
        label: "Arcade Treasury",
        role: "arcade_treasury",
        network,
      }),
    ];
    const wallets = await keyring.listPublicWallets();
    await writeManifest(flags, env, wallets);
    printWallets(flags, created, {
      keyringPath: env.WTF_PLATFORM_KEYRING_PATH,
      manifest: flags["no-manifest"] ? "not written" : flags.manifest || defaultManifestPath,
    });
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
