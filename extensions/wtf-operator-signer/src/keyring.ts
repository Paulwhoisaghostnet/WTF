import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdir, readFile, rename, writeFile, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { InMemorySigner, generateSecretKey } from "@taquito/signer";
import type { SignerEnv } from "./env";
import type {
  PlatformWalletNetwork,
  PlatformWalletPublic,
  PlatformWalletRole,
} from "../../../shared/operator-signer";

const KEYRING_VERSION = 1;
const TEZOS_DERIVATION_PATH = "m/44'/1729'/0'/0'";
const AAD = Buffer.from("wtf-platform-wallet-keyring-v1");
const TEZOS_CHAIN_ID_BY_NETWORK: Partial<Record<PlatformWalletNetwork, string>> = {
  mainnet: "NetXdQprcVkpaWU",
  ghostnet: "NetXnHfVqm9iesp",
  shadownet: "NetXsqzbfFenSTS",
};

type StoredSecret = {
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
};

type StoredPlatformWallet = Omit<PlatformWalletPublic, "source"> & {
  source: "keyring";
  secret: StoredSecret;
};

type StoredKeyring = {
  version: typeof KEYRING_VERSION;
  salt: string;
  wallets: StoredPlatformWallet[];
};

export type PlatformWalletSigner = {
  wallet: PlatformWalletPublic;
  signer: InMemorySigner;
};

export class PlatformWalletKeyring {
  constructor(private readonly env: SignerEnv) {}

  isConfigured(): boolean {
    return this.env.WTF_PLATFORM_KEYRING_MASTER_KEY.trim().length >= 24;
  }

  canCreateWallets(): boolean {
    return this.isConfigured() && this.env.WTF_PLATFORM_KEYRING_CREATE_ENABLED === 1;
  }

  async listPublicWallets(): Promise<PlatformWalletPublic[]> {
    const wallets: PlatformWalletPublic[] = [];
    const legacy = await this.legacyWallet().catch(() => null);
    if (legacy) wallets.push(legacy);

    if (this.isConfigured()) {
      const store = await this.readStore();
      for (const wallet of store.wallets) {
        if (!wallets.some((existing) => existing.id === wallet.id)) {
          wallets.push(await this.toPublicWallet(wallet));
        }
      }
    }

    return wallets;
  }

  async createWallet(input: {
    id: string;
    label: string;
    role: PlatformWalletRole;
    network: PlatformWalletNetwork;
  }): Promise<PlatformWalletPublic> {
    if (!this.canCreateWallets()) {
      throw new Error("platform keyring is not configured for wallet creation");
    }

    const legacy = await this.legacyWallet().catch(() => null);
    if (legacy?.id === input.id) {
      throw new Error(`platform wallet id already exists: ${input.id}`);
    }

    const store = await this.readStore();
    if (store.wallets.some((wallet) => wallet.id === input.id)) {
      throw new Error(`platform wallet id already exists: ${input.id}`);
    }

    const secretKey = generateSecretKey(
      randomBytes(32),
      TEZOS_DERIVATION_PATH,
      "ed25519"
    );
    const signer = new InMemorySigner(secretKey);
    const address = await signer.publicKeyHash();
    const identity = await this.resolvePublicIdentity(address, input.network);
    const now = new Date().toISOString();
    const wallet: StoredPlatformWallet = {
      id: input.id,
      label: input.label,
      role: input.role,
      network: input.network,
      address,
      publicKey: await signer.publicKey(),
      ...identity,
      source: "keyring",
      createdAt: now,
      updatedAt: now,
      secret: this.encryptSecret(secretKey, store.salt),
    };

    store.wallets.push(wallet);
    await this.writeStore(store);
    return this.toPublicWallet(wallet);
  }

  async getSigner(walletId?: string): Promise<PlatformWalletSigner> {
    const id =
      walletId?.trim() ||
      this.env.WTF_OPERATOR_SIGNER_DEFAULT_WALLET_ID.trim() ||
      "operator";

    if (id === "operator" && this.env.WTF_OPERATOR_SIGNER_SECRET.trim()) {
      const signer = new InMemorySigner(this.env.WTF_OPERATOR_SIGNER_SECRET.trim());
      const wallet = await this.legacyWalletFromSigner(signer);
      return { wallet, signer };
    }

    if (!this.isConfigured()) {
      throw new Error(`platform keyring is locked; cannot load wallet ${id}`);
    }

    const store = await this.readStore();
    const wallet = store.wallets.find((candidate) => candidate.id === id);
    if (!wallet) {
      throw new Error(`platform wallet not found: ${id}`);
    }

    const secretKey = this.decryptSecret(wallet.secret, store.salt);
    return {
      wallet: await this.toPublicWallet(wallet),
      signer: new InMemorySigner(secretKey),
    };
  }

  private async legacyWallet(): Promise<PlatformWalletPublic | null> {
    const secret = this.env.WTF_OPERATOR_SIGNER_SECRET.trim();
    if (!secret) return null;
    return this.legacyWalletFromSigner(new InMemorySigner(secret));
  }

  private async legacyWalletFromSigner(
    signer: InMemorySigner
  ): Promise<PlatformWalletPublic> {
    const now = new Date().toISOString();
    const address = await signer.publicKeyHash();
    const network = inferNetwork(this.env.WTF_OPERATOR_SIGNER_RPC);
    const identity = await this.resolvePublicIdentity(address, network);
    return {
      id: "operator",
      label: "Legacy operator wallet",
      role: "operator",
      network,
      address,
      publicKey: await signer.publicKey(),
      ...identity,
      source: "legacy_env",
      createdAt: now,
      updatedAt: now,
    };
  }

  private async readStore(): Promise<StoredKeyring> {
    try {
      const parsed = JSON.parse(
        await readFile(this.env.WTF_PLATFORM_KEYRING_PATH, "utf8")
      ) as StoredKeyring;
      if (parsed.version !== KEYRING_VERSION || !Array.isArray(parsed.wallets)) {
        throw new Error("unsupported platform keyring format");
      }
      return parsed;
    } catch (err: any) {
      if (err?.code !== "ENOENT") throw err;
      return {
        version: KEYRING_VERSION,
        salt: randomBytes(16).toString("base64"),
        wallets: [],
      };
    }
  }

  private async writeStore(store: StoredKeyring): Promise<void> {
    await mkdir(dirname(this.env.WTF_PLATFORM_KEYRING_PATH), {
      recursive: true,
      mode: 0o700,
    });
    const tmp = `${this.env.WTF_PLATFORM_KEYRING_PATH}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, {
      mode: 0o600,
    });
    await chmod(tmp, 0o600);
    await rename(tmp, this.env.WTF_PLATFORM_KEYRING_PATH);
    await chmod(this.env.WTF_PLATFORM_KEYRING_PATH, 0o600);
  }

  private deriveKey(salt: string): Buffer {
    return scryptSync(
      this.env.WTF_PLATFORM_KEYRING_MASTER_KEY.trim(),
      Buffer.from(salt, "base64"),
      32,
      { N: 16384, r: 8, p: 1 }
    );
  }

  private encryptSecret(secretKey: string, salt: string): StoredSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.deriveKey(salt), iv);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([
      cipher.update(secretKey, "utf8"),
      cipher.final(),
    ]);
    return {
      alg: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
  }

  private decryptSecret(secret: StoredSecret, salt: string): string {
    if (secret.alg !== "aes-256-gcm") {
      throw new Error("unsupported platform keyring cipher");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.deriveKey(salt),
      Buffer.from(secret.iv, "base64")
    );
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(secret.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  private async resolvePublicIdentity(
    address: string,
    network: PlatformWalletNetwork
  ): Promise<Pick<PlatformWalletPublic, "chainId" | "did">> {
    const chainId = await this.resolveChainId(network);
    return chainId
      ? {
          chainId,
          did: `did:pkh:tezos:${chainId}:${address}`,
        }
      : {};
  }

  private async resolveChainId(
    network: PlatformWalletNetwork
  ): Promise<string | undefined> {
    const inferredNetwork = inferNetwork(this.env.WTF_OPERATOR_SIGNER_RPC);
    if (network === inferredNetwork || network === "custom") {
      const rpcChainId = await readRpcChainId(
        this.env.WTF_OPERATOR_SIGNER_RPC
      ).catch(() => undefined);
      if (rpcChainId) return rpcChainId;
    }
    return TEZOS_CHAIN_ID_BY_NETWORK[network];
  }

  private async toPublicWallet(
    wallet: StoredPlatformWallet
  ): Promise<PlatformWalletPublic> {
    return {
      ...publicWallet(wallet),
      ...(await this.resolvePublicIdentity(wallet.address, wallet.network)),
    };
  }
}

function publicWallet(wallet: StoredPlatformWallet): PlatformWalletPublic {
  const { secret: _secret, ...safeWallet } = wallet;
  return safeWallet;
}

function inferNetwork(rpcUrl: string): PlatformWalletNetwork {
  const lower = rpcUrl.toLowerCase();
  if (lower.includes("ghostnet")) return "ghostnet";
  if (lower.includes("shadownet")) return "shadownet";
  if (lower.includes("mainnet") || lower.includes("tzkt.io")) return "mainnet";
  return "custom";
}

async function readRpcChainId(rpcUrl: string): Promise<string> {
  const response = await fetch(
    `${rpcUrl.replace(/\/+$/, "")}/chains/main/chain_id`
  );
  if (!response.ok) {
    throw new Error(`chain id probe failed: HTTP ${response.status}`);
  }
  const text = (await response.text()).trim();
  try {
    return String(JSON.parse(text)).trim();
  } catch {
    return text.replace(/^"|"$/g, "");
  }
}
