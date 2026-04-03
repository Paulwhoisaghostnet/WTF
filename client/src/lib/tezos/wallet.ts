import { loadOctezConnect, loadBeaconWallet, loadTaquito, getRpcUrl, getNetwork } from "./loaders";

type WalletProviderName = "octez.connect" | "beacon";

interface WalletAdapter {
  name: WalletProviderName;
  init(network: string, rpcUrl: string): Promise<void>;
  requestPermissions(): Promise<string>;
  getActiveAccount(): Promise<{ address: string } | null>;
  clearActiveAccount(): Promise<void>;
  setAsTaquitoProvider(tezos: any): void;
}

let currentAdapter: WalletAdapter | null = null;
let tezosToolkit: any = null;
let beaconStateCleared = false;

function clearStaleBeaconState() {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith("beacon:") || key.startsWith("beacon-sdk:"))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}

class OctezConnectAdapter implements WalletAdapter {
  name: WalletProviderName = "octez.connect";
  private client: any = null;
  private beaconWallet: any = null;

  async init(network: string, _rpcUrl: string) {
    const { DAppClient } = await loadOctezConnect();
    this.client = new (DAppClient as any)({
      name: "WTF Gameshow",
      preferredNetwork: network,
    });

    try {
      const { BeaconWallet } = await loadBeaconWallet();
      this.beaconWallet = new BeaconWallet({
        name: "WTF Gameshow",
        preferredNetwork: network as any,
      });
    } catch {
      // beacon wallet optional for taquito provider
    }
  }

  async requestPermissions(): Promise<string> {
    const perms = await this.client.requestPermissions();
    return perms.address;
  }

  async getActiveAccount() {
    const account = await this.client.getActiveAccount();
    return account ? { address: account.address } : null;
  }

  async clearActiveAccount() {
    await this.client.clearActiveAccount();
  }

  setAsTaquitoProvider(tezos: any) {
    if (this.beaconWallet) {
      tezos.setWalletProvider(this.beaconWallet);
    }
  }
}

class BeaconLegacyAdapter implements WalletAdapter {
  name: WalletProviderName = "beacon";
  private wallet: any = null;

  async init(network: string, _rpcUrl: string) {
    const { BeaconWallet } = await loadBeaconWallet();
    this.wallet = new BeaconWallet({
      name: "WTF Gameshow",
      preferredNetwork: network as any,
    });
  }

  async requestPermissions(): Promise<string> {
    await this.wallet.requestPermissions();
    const account = await this.wallet.getPKH();
    return account;
  }

  async getActiveAccount() {
    const account = await this.wallet.client.getActiveAccount();
    return account ? { address: account.address } : null;
  }

  async clearActiveAccount() {
    await this.wallet.clearActiveAccount();
  }

  setAsTaquitoProvider(tezos: any) {
    tezos.setWalletProvider(this.wallet);
  }
}

async function createAdapter(): Promise<WalletAdapter> {
  const network = getNetwork();
  const rpcUrl = getRpcUrl();

  if (!beaconStateCleared) {
    clearStaleBeaconState();
    beaconStateCleared = true;
  }

  const octez = new OctezConnectAdapter();
  try {
    await octez.init(network, rpcUrl);
    console.log("[WTF] Wallet provider: octez.connect");
    return octez;
  } catch (err) {
    console.warn("[WTF] octez.connect unavailable:", err);
  }

  const beacon = new BeaconLegacyAdapter();
  await beacon.init(network, rpcUrl);
  console.log("[WTF] Wallet provider: Beacon (fallback)");
  return beacon;
}

async function ensureAdapter(): Promise<WalletAdapter> {
  if (!currentAdapter) {
    currentAdapter = await createAdapter();
  }
  return currentAdapter;
}

export async function getTezos() {
  if (tezosToolkit) return tezosToolkit;
  const { TezosToolkit } = await loadTaquito();
  tezosToolkit = new TezosToolkit(getRpcUrl());
  if (currentAdapter) {
    currentAdapter.setAsTaquitoProvider(tezosToolkit);
  }
  return tezosToolkit;
}

export async function connectWallet(): Promise<{
  address: string;
  providerName: string;
}> {
  const adapter = await ensureAdapter();
  await adapter.clearActiveAccount();
  const address = await adapter.requestPermissions();
  await getTezos();
  adapter.setAsTaquitoProvider(tezosToolkit);
  return { address, providerName: adapter.name };
}

export async function disconnectWallet() {
  if (currentAdapter) {
    await currentAdapter.clearActiveAccount();
  }
  currentAdapter = null;
  tezosToolkit = null;
}

export async function getActiveAccount(): Promise<{
  address: string;
  providerName: string;
} | null> {
  try {
    const adapter = await ensureAdapter();
    const account = await adapter.getActiveAccount();
    if (account) {
      return { address: account.address, providerName: adapter.name };
    }
  } catch {
    // no active account
  }
  return null;
}
