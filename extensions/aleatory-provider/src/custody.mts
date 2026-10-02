import { randomBytes } from "node:crypto";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import * as keyringImport from "../../wtf-operator-signer/src/keyring.ts";
import type { SignerEnv } from "../../wtf-operator-signer/src/env.ts";
import { required, type ProviderConfig } from "./config.mts";

const keyringModule = ((keyringImport as any).default ?? keyringImport) as typeof keyringImport;
const { PlatformWalletKeyring } = keyringModule;

type WalletOptions = {
  keyringPath: string;
  masterKeyFile: string;
  walletId: string;
  network: "mainnet" | "shadownet";
  rpcUrl: string;
  create?: boolean;
  exclusive?: boolean;
  allowGroupRead?: boolean;
};

async function privateFile(path: string, allowGroupRead = false) {
  const info = await stat(path);
  const permissions = info.mode & 0o777;
  const establishedGroupRead = allowGroupRead && permissions === 0o640;
  if (!info.isFile() || ((permissions & 0o077) !== 0 && !establishedGroupRead)) {
    throw new Error(`Custody file must be private (0600)${allowGroupRead ? " or operator group-readable (0640)" : ""}: ${path}`);
  }
}

export async function loadWallet(options: WalletOptions) {
  for (const path of [options.keyringPath, options.masterKeyFile]) {
    if (!isAbsolute(path)) throw new Error("Custody paths must be absolute and outside the source checkout");
  }
  if (options.create) {
    await mkdir(dirname(options.masterKeyFile), { recursive: true, mode: 0o700 });
    try {
      await writeFile(options.masterKeyFile, `${randomBytes(48).toString("base64")}\n`, { mode: 0o600, flag: "wx" });
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  await privateFile(options.masterKeyFile, options.allowGroupRead);
  const masterKey = (await readFile(options.masterKeyFile, "utf8")).trim();
  const env = {
    WTF_PLATFORM_KEYRING_PATH: options.keyringPath,
    WTF_PLATFORM_KEYRING_MASTER_KEY: masterKey,
    WTF_PLATFORM_KEYRING_CREATE_ENABLED: options.create ? 1 : 0,
    WTF_OPERATOR_SIGNER_RPC: options.rpcUrl,
    WTF_OPERATOR_SIGNER_SECRET: "",
  } as SignerEnv;
  const keyring = new PlatformWalletKeyring(env);
  let wallets = await keyring.listPublicWallets();
  if (options.exclusive && wallets.some((wallet) => wallet.id !== options.walletId)) {
    throw new Error("Render service keyring contains another wallet; refusing broad custody access");
  }
  if (!wallets.some((wallet) => wallet.id === options.walletId)) {
    if (!options.create) throw new Error(`Wallet missing: ${options.walletId}`);
    await keyring.createWallet({ id: options.walletId, label: "wtfOS Aleatory Render Agent", role: "custom", network: options.network });
    wallets = await keyring.listPublicWallets();
  }
  await privateFile(options.keyringPath, options.allowGroupRead);
  const result = await keyring.getSigner(options.walletId);
  const expected = options.network === "mainnet" ? "NetXdQprcVkpaWU" : "NetXsqzbfFenSTS";
  if (result.wallet.network !== options.network || result.wallet.chainId !== expected) throw new Error("Wallet network mismatch");
  if (await result.signer.publicKeyHash() !== result.wallet.address) throw new Error("Wallet signer identity mismatch");
  return result;
}

export async function agentWallet(config: ProviderConfig, options: { create?: boolean } = {}) {
  const result = await loadWallet({
    keyringPath: required(process.env, "WTF_ALEATORY_AGENT_KEYRING"),
    masterKeyFile: required(process.env, "WTF_ALEATORY_AGENT_MASTER_KEY_FILE"),
    walletId: required(process.env, "WTF_ALEATORY_AGENT_WALLET_ID"),
    network: config.network,
    rpcUrl: config.rpcUrl,
    create: options.create,
    exclusive: true,
  });
  if (config.agentAddress && result.wallet.address !== config.agentAddress) throw new Error("Configured agent address differs from custody wallet");
  if (result.wallet.address === config.operatorAddress) throw new Error("Render agent and provider operator must be separate");
  return result;
}

export async function operatorWallet(config: ProviderConfig) {
  const result = await loadWallet({
    keyringPath: required(process.env, "WTF_ALEATORY_OPERATOR_KEYRING"),
    masterKeyFile: required(process.env, "WTF_ALEATORY_OPERATOR_MASTER_KEY_FILE"),
    walletId: required(process.env, "WTF_ALEATORY_OPERATOR_WALLET_ID"),
    network: config.network,
    rpcUrl: config.rpcUrl,
    // Reuse the established root:wtf-signer custody without copying keys or
    // changing its permissions. The dedicated agent never receives this opt-in.
    allowGroupRead: true,
  });
  if (result.wallet.address !== config.operatorAddress) throw new Error("Configured operator differs from custody wallet");
  return result;
}
