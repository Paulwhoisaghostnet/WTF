import "dotenv/config";
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { eq, sql } from "drizzle-orm";
import { pool, db } from "../../../server/db";
import {
  casinoMemberships,
  consoleGames,
  inAppInventoryItems,
  userWallets,
  users,
} from "../../../shared/schema";
import {
  platformWalletNetworkSchema,
  platformWalletRoleSchema,
  type PlatformWalletNetwork,
  type PlatformWalletPublic,
} from "../../../shared/operator-signer";
import keyringModule from "../../../extensions/wtf-operator-signer/src/keyring";
import { ensureArcadePlayTicketItem, ARCADE_PLAY_TICKET_SKU } from "../../../server/features/arcade/payment";
import { CASINO_APP_PASS_SKU, CASINO_MEMBERSHIP_DURATION_MS, ensureCasinoAppPassItem } from "../../../server/features/casino/access";
import { getDemoCartridges } from "../../../server/features/console/manifest";
import { isConsoleStockCartridge } from "../../../server/features/console/surfaces";
import { PUPPET_ACTOR_COUNT, PUPPET_ACTORS, puppetEmail } from "./registry.mjs";
import { runLocalE2eDbPreparation } from "./prepare-local-db";
import type { SignerEnv } from "../../../extensions/wtf-operator-signer/src/env";

const { PlatformWalletKeyring } = keyringModule as any;

const scryptAsync = promisify(scryptCb);
const defaultSecretDir = join(homedir(), ".wtf-gameshow");
const defaultKeyringPath = join(defaultSecretDir, "platform-wallet-keyring.json");
const defaultMasterKeyFile = join(defaultSecretDir, "platform-keyring-master.key");
const defaultCredentialsPath = join(defaultSecretDir, "e2e-puppets.local.json");

type Flags = {
  _: string[];
  keyring?: string;
  masterKeyFile?: string;
  credentials?: string;
  network?: string;
  rpc?: string;
  "allow-nonlocal-db"?: boolean;
  "allow-production"?: boolean;
  "i-understand-admin-puppet"?: boolean;
  "rotate-passwords"?: boolean;
  "skip-db-prepare"?: boolean;
  "dry-run"?: boolean;
  json?: boolean;
  help?: boolean;
};

type ExistingCredential = {
  id: string;
  password?: string;
};

type SeededActor = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: string;
  password: string;
  userId: number;
  walletId: string;
  walletAddress: string;
  publicKey?: string;
  chainId?: string;
  did?: string;
};

const E2E_ARCADE_TICKET_GRANT = 250;
const E2E_CASINO_MEMBERSHIP_DAYS = Math.ceil(
  CASINO_MEMBERSHIP_DURATION_MS / (24 * 60 * 60 * 1000)
);
const E2E_DESKTOP_TEST_SKUS = [
  "pet-food",
  "pet-medicine",
  "pet-ball",
  "shoebox",
  "desktop-tiny-fan",
  "desktop-light-disco",
  "desktop-light-moon",
  "desktop-light-sun",
  "desktop-sticky-note-trap",
  "desktop-mop",
  "desktop-vacuum",
  "desktop-spraycan",
  "desktop-catapult",
  "desktop-ant-farm",
  "desktop-paper-shredder",
  "desktop-train-base-kit",
  "desktop-train-track-pack",
  "desktop-train-engine-pack",
  "desktop-train-car-pack",
  "desktop-portal-gun",
  "desktop-jukebox",
  "desktop-weather-station",
];

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
    if (
      key === "allow-nonlocal-db" ||
      key === "allow-production" ||
      key === "i-understand-admin-puppet" ||
      key === "rotate-passwords" ||
      key === "skip-db-prepare" ||
      key === "dry-run" ||
      key === "json" ||
      key === "help"
    ) {
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
    "  npm run test:e2e:puppets:seed",
    "  npm run test:e2e:puppets:seed -- --allow-nonlocal-db --i-understand-admin-puppet",
    "",
    "Creates or repairs 12 E2E puppet users and their testing wallets.",
    "Passwords are random, stored outside the repo by default, and never printed.",
    "",
    "Options:",
    "  --credentials <path>             Secret local puppet credential file",
    "  --keyring <path>                 Platform wallet keyring path",
    "  --master-key-file <path>         Platform keyring master key file",
    "  --network ghostnet|shadownet|mainnet|custom",
    "  --rpc <url>                      RPC used for wallet metadata",
    "  --rotate-passwords              Generate new puppet passwords",
    "  --skip-db-prepare               Do not apply local E2E schema catch-up migrations",
    "  --allow-nonlocal-db             Required for non-local DATABASE_URL",
    "  --i-understand-admin-puppet      Required with non-local DB because TheCount is admin",
    "  --allow-production              Required when NODE_ENV=production",
    "  --dry-run                       Print the plan without writing DB/keyring",
  ].join("\n");
}

function generatePassword(): string {
  return `wtf-e2e-${randomBytes(32).toString("base64url")}`;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

function databaseDescriptor(rawUrl: string) {
  const parsed = new URL(rawUrl);
  return {
    protocol: parsed.protocol,
    host: parsed.host,
    hostname: parsed.hostname,
    port: parsed.port || null,
    database: parsed.pathname.replace(/^\//, "") || null,
    sslmode: parsed.searchParams.get("sslmode"),
  };
}

function isLocalDatabase(rawUrl: string): boolean {
  const { hostname } = databaseDescriptor(rawUrl);
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname === "postgres" ||
    hostname === "db"
  );
}

function enforceSafety(flags: Flags) {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) throw new Error("Missing DATABASE_URL");
  if (process.env.NODE_ENV === "production" && !flags["allow-production"]) {
    throw new Error(
      "Refusing to seed puppets with NODE_ENV=production. Pass --allow-production only for an intentional staging/prod rehearsal."
    );
  }
  const local = isLocalDatabase(dbUrl);
  const includesAdmin = PUPPET_ACTORS.some((actor) => actor.role === "admin");
  if (!local && !flags["allow-nonlocal-db"]) {
    throw new Error(
      `Refusing to seed non-local database ${databaseDescriptor(dbUrl).host}. Pass --allow-nonlocal-db after confirming this is an approved test/staging database.`
    );
  }
  if (!local && includesAdmin && !flags["i-understand-admin-puppet"]) {
    throw new Error(
      "Refusing to create an admin puppet in a non-local database without --i-understand-admin-puppet."
    );
  }
}

function parseNetwork(flags: Flags): PlatformWalletNetwork {
  return platformWalletNetworkSchema.parse(
    flags.network ||
      process.env.WTF_E2E_PUPPET_NETWORK ||
      process.env.WTF_PLATFORM_WALLET_NETWORK ||
      "ghostnet"
  );
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
      return process.env.WTF_OPERATOR_SIGNER_RPC || "https://rpc.ghostnet.teztnets.com";
  }
}

async function readOrCreateMasterKey(filePath: string): Promise<string> {
  if ((process.env.WTF_PLATFORM_KEYRING_MASTER_KEY || "").trim()) {
    return process.env.WTF_PLATFORM_KEYRING_MASTER_KEY!.trim();
  }
  const resolvedFile =
    process.env.WTF_PLATFORM_KEYRING_MASTER_KEY_FILE || filePath;
  if (existsSync(resolvedFile)) {
    return (await readFile(resolvedFile, "utf8")).trim();
  }
  await mkdir(dirname(resolvedFile), { recursive: true, mode: 0o700 });
  const masterKey = randomBytes(48).toString("base64");
  await writeFile(resolvedFile, `${masterKey}\n`, { mode: 0o600 });
  await chmod(resolvedFile, 0o600);
  return masterKey;
}

async function buildEnv(flags: Flags, network: PlatformWalletNetwork): Promise<SignerEnv> {
  const masterKeyFile = flags.masterKeyFile || defaultMasterKeyFile;
  const masterKey = await readOrCreateMasterKey(masterKeyFile);
  return {
    WTF_OPERATOR_SIGNER_RPC:
      flags.rpc || process.env.WTF_OPERATOR_SIGNER_RPC || rpcForNetwork(network),
    WTF_OPERATOR_SIGNER_SOCKET:
      process.env.WTF_OPERATOR_SIGNER_SOCKET || "/run/wtf/operator-signer.sock",
    WTF_OPERATOR_SIGNER_AUTH_TOKEN:
      process.env.WTF_OPERATOR_SIGNER_AUTH_TOKEN || "local-e2e-puppets",
    WTF_OPERATOR_SIGNER_SECRET: process.env.WTF_OPERATOR_SIGNER_SECRET || "",
    WTF_OPERATOR_SIGNER_DEFAULT_WALLET_ID:
      process.env.WTF_OPERATOR_SIGNER_DEFAULT_WALLET_ID || "wtf-os-root",
    WTF_PLATFORM_KEYRING_PATH:
      flags.keyring || process.env.WTF_PLATFORM_KEYRING_PATH || defaultKeyringPath,
    WTF_PLATFORM_KEYRING_MASTER_KEY: masterKey,
    WTF_PLATFORM_KEYRING_MASTER_KEY_FILE:
      process.env.WTF_PLATFORM_KEYRING_MASTER_KEY_FILE || masterKeyFile,
    WTF_PLATFORM_KEYRING_CREATE_ENABLED: 1,
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

async function readExistingCredentials(
  credentialsPath: string
): Promise<Map<string, ExistingCredential>> {
  if (!existsSync(credentialsPath)) return new Map();
  const parsed = JSON.parse(await readFile(credentialsPath, "utf8"));
  const map = new Map<string, ExistingCredential>();
  for (const actor of parsed?.actors ?? []) {
    if (actor?.id) map.set(actor.id, actor);
  }
  return map;
}

async function writeSecretJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, filePath);
  await chmod(filePath, 0o600);
}

async function createWalletIfMissing(
  keyring: PlatformWalletKeyring,
  input: {
    id: string;
    label: string;
    network: PlatformWalletNetwork;
  }
): Promise<PlatformWalletPublic> {
  const existing = (await keyring.listPublicWallets()).find(
    (wallet) => wallet.id === input.id
  );
  if (existing) return existing;
  return keyring.createWallet({
    id: input.id,
    label: input.label,
    role: platformWalletRoleSchema.parse("testing"),
    network: input.network,
  });
}

async function upsertPuppetUser(input: {
  username: string;
  email: string;
  displayName: string;
  role: string;
  password: string;
}) {
  const passwordHash = await hashPassword(input.password);
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.username, input.username))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(users)
      .set({
        email: input.email,
        displayName: input.displayName,
        role: input.role as never,
        passwordHash,
        tempPasswordHash: null,
        tempPasswordExpiresAt: null,
        welcomedToWtfOs: true,
        welcomedToWtfOsAt: existing.welcomedToWtfOsAt ?? new Date(),
        gmWelcomeUtcDay: new Date().toISOString().slice(0, 10),
        gmWelcomeLastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(users)
    .values({
      username: input.username,
      email: input.email,
      displayName: input.displayName,
      role: input.role as never,
      passwordHash,
      welcomedToWtfOs: true,
      welcomedToWtfOsAt: new Date(),
      gmWelcomeUtcDay: new Date().toISOString().slice(0, 10),
      gmWelcomeLastSeenAt: new Date(),
    })
    .returning();
  return created;
}

async function linkWallet(input: {
  userId: number;
  walletAddress: string;
  isPrimary: boolean;
}) {
  const [existingWallet] = await db
    .select()
    .from(userWallets)
    .where(eq(userWallets.walletAddress, input.walletAddress))
    .limit(1);

  if (existingWallet && existingWallet.userId !== input.userId) {
    throw new Error(
      `Wallet ${input.walletAddress} is already linked to user ${existingWallet.userId}`
    );
  }

  await db
    .update(userWallets)
    .set({ isPrimary: false })
    .where(eq(userWallets.userId, input.userId));

  if (existingWallet) {
    const [updated] = await db
      .update(userWallets)
      .set({ isPrimary: input.isPrimary })
      .where(eq(userWallets.id, existingWallet.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(userWallets)
    .values({
      userId: input.userId,
      walletAddress: input.walletAddress,
      isPrimary: input.isPrimary,
    })
    .returning();
  return created;
}

async function grantInventoryItem(input: {
  userId: number;
  sku: string;
  quantity: number;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date();
  await db
    .insert(inAppInventoryItems)
    .values({
      userId: input.userId,
      sku: input.sku,
      quantity: input.quantity,
      metadata: {
        source: "e2e-puppet-seed",
        temporary: true,
        ...input.metadata,
      },
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [inAppInventoryItems.userId, inAppInventoryItems.sku],
      set: {
        quantity: sql`GREATEST(${inAppInventoryItems.quantity}, ${input.quantity})`,
        metadata: {
          source: "e2e-puppet-seed",
          temporary: true,
          ...input.metadata,
        },
        updatedAt: now,
      },
    });
}

async function grantTemporaryPuppetEntitlements(actor: SeededActor) {
  await ensureArcadePlayTicketItem();
  await ensureCasinoAppPassItem();

  await grantInventoryItem({
    userId: actor.userId,
    sku: ARCADE_PLAY_TICKET_SKU,
    quantity: E2E_ARCADE_TICKET_GRANT,
    metadata: { purpose: "arcade-catalog-playback" },
  });
  await grantInventoryItem({
    userId: actor.userId,
    sku: CASINO_APP_PASS_SKU,
    quantity: 1,
    metadata: { purpose: "casino-access" },
  });
  for (const sku of E2E_DESKTOP_TEST_SKUS) {
    await grantInventoryItem({
      userId: actor.userId,
      sku,
      quantity: 5,
      metadata: { purpose: "desktop-item-interaction" },
    });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + CASINO_MEMBERSHIP_DURATION_MS);
  const opHash = `e2e-puppet-casino-${actor.userId}`;
  await db
    .insert(casinoMemberships)
    .values({
      userId: actor.userId,
      walletAddress: actor.walletAddress,
      purchaseRef: `e2e:casino:${actor.id}`,
      opHash,
      contractAddress: "KT1E2ePuppetCasino1111111111111111111",
      treasuryAddress: actor.walletAddress,
      feeMutez: 1,
      status: "active",
      startsAt: now,
      expiresAt,
      raw: {
        source: "e2e-puppet-seed",
        temporary: true,
        durationDays: E2E_CASINO_MEMBERSHIP_DAYS,
      },
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: casinoMemberships.opHash,
      set: {
        userId: actor.userId,
        walletAddress: actor.walletAddress,
        status: "active",
        startsAt: now,
        expiresAt,
        updatedAt: now,
        raw: {
          source: "e2e-puppet-seed",
          temporary: true,
          refreshedAt: now.toISOString(),
        },
      },
    });
}

async function seedInstalledConsoleGameRows() {
  const now = new Date();
  const cartridges = getDemoCartridges().filter(isConsoleStockCartridge);
  for (const cart of cartridges) {
    await db
      .insert(consoleGames)
      .values({
        slug: cart.slug,
        title: cart.title,
        description: cart.description || "",
        category: cart.category || "console",
        embedPath: cart.artifactUri,
        coverUri: cart.thumbnailUri ?? null,
        sourceUrl: cart.sourceUrl ?? null,
        verificationMode: "parent_postmessage",
        weirdVariantOf: null,
        hmacSecret: null,
        status: "active",
        isPublic: true,
        sdkVersion: "wtf-console-v1",
        storageMode: cart.artifactUri.includes("/games/installed/")
          ? "installed-static"
          : "static",
        active: true,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: consoleGames.slug,
        set: {
          title: cart.title,
          description: cart.description || "",
          category: cart.category || "console",
          embedPath: cart.artifactUri,
          coverUri: cart.thumbnailUri ?? null,
          sourceUrl: cart.sourceUrl ?? null,
          status: "active",
          isPublic: true,
          active: true,
          updatedAt: now,
        },
      });
  }
  return cartridges.length;
}

function publicSummary(actor: SeededActor) {
  const { password: _password, ...safe } = actor;
  return safe;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help || flags._[0] === "help") {
    console.log(usage());
    return;
  }

  if (PUPPET_ACTOR_COUNT !== 12) {
    throw new Error(`Expected 12 puppet actors, found ${PUPPET_ACTOR_COUNT}`);
  }

  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) throw new Error("Missing DATABASE_URL");
  const network = parseNetwork(flags);
  const credentialsPath =
    flags.credentials ||
    process.env.WTF_E2E_PUPPET_CREDENTIALS_PATH ||
    defaultCredentialsPath;

  if (flags["dry-run"]) {
    const plan = {
      ok: true,
      dryRun: true,
      database: databaseDescriptor(dbUrl),
      keyringPath:
        flags.keyring || process.env.WTF_PLATFORM_KEYRING_PATH || defaultKeyringPath,
      credentialsPath,
      network,
      rpc: flags.rpc || process.env.WTF_OPERATOR_SIGNER_RPC || rpcForNetwork(network),
      actors: PUPPET_ACTORS.map((actor) => ({
        ...actor,
        email: puppetEmail(actor),
      })),
    };
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  enforceSafety(flags);
  if (!flags["skip-db-prepare"]) {
    await runLocalE2eDbPreparation({
      allowNonlocalDb: Boolean(flags["allow-nonlocal-db"]),
      allowProduction: Boolean(flags["allow-production"]),
    });
  }
  const env = await buildEnv(flags, network);
  const existingCredentials = await readExistingCredentials(credentialsPath);
  const keyring = new PlatformWalletKeyring(env);
  const seeded: SeededActor[] = [];
  const consoleSeedCount = await seedInstalledConsoleGameRows();

  for (const actor of PUPPET_ACTORS) {
    const wallet = await createWalletIfMissing(keyring, {
      id: actor.walletId,
      label: `${actor.displayName} E2E Puppet`,
      network,
    });
    const password =
      !flags["rotate-passwords"] && existingCredentials.get(actor.id)?.password
        ? existingCredentials.get(actor.id)!.password!
        : generatePassword();
    const user = await upsertPuppetUser({
      username: actor.username,
      email: puppetEmail(actor),
      displayName: actor.displayName,
      role: actor.role,
      password,
    });
    await linkWallet({
      userId: user.id,
      walletAddress: wallet.address,
      isPrimary: true,
    });
    const seededActor = {
      id: actor.id,
      username: actor.username,
      displayName: actor.displayName,
      email: puppetEmail(actor),
      role: actor.role,
      password,
      userId: user.id,
      walletId: actor.walletId,
      walletAddress: wallet.address,
      publicKey: wallet.publicKey,
      chainId: wallet.chainId,
      did: wallet.did,
    };
    await grantTemporaryPuppetEntitlements(seededActor);
    seeded.push(seededActor);
  }

  const credentialFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    database: databaseDescriptor(dbUrl),
    keyringPath: env.WTF_PLATFORM_KEYRING_PATH,
    rpcUrl: env.WTF_OPERATOR_SIGNER_RPC,
    note:
      "Local secret for WTF E2E puppet actors. Contains login passwords but no wallet private keys.",
    actors: seeded,
  };
  await writeSecretJson(credentialsPath, credentialFile);

  const result = {
    ok: true,
    actors: seeded.map(publicSummary),
    temporaryGrants: {
      arcadeTicketsPerActor: E2E_ARCADE_TICKET_GRANT,
      casinoAppPass: true,
      casinoMembershipDays: E2E_CASINO_MEMBERSHIP_DAYS,
      desktopSkuCount: E2E_DESKTOP_TEST_SKUS.length,
      consoleStockGamesSeeded: consoleSeedCount,
    },
    credentialsPath,
    keyringPath: env.WTF_PLATFORM_KEYRING_PATH,
    rpcUrl: env.WTF_OPERATOR_SIGNER_RPC,
    database: databaseDescriptor(dbUrl),
  };
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
