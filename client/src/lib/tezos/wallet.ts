import { loadOctezConnect, loadBeaconWallet, loadTaquito, getRpcUrl, getNetwork } from "./loaders";

type WalletProviderName = "octez.connect" | "beacon";

/** Beacon `NetworkType` string values (ecad / airgap Beacon, Taquito 14–24). */
type BeaconPreferredNetwork = "mainnet" | "ghostnet";

function beaconPreferredNetwork(network: string): BeaconPreferredNetwork {
  return network === "ghostnet" ? "ghostnet" : "mainnet";
}

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
let adapterInitPromise: Promise<WalletAdapter> | null = null;
let connectPromise:
  | Promise<{ address: string; providerName: string }>
  | null = null;

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

async function preflightOctezExtensionHandshake(
  attempts = 2,
  timeoutMs = 600
): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const runAttempt = () =>
    new Promise<boolean>((resolve) => {
      let resolved = false;
      const onMessage = (event: MessageEvent) => {
        const data: any = event?.data;
        const sender = data?.sender;
        const isPong = data?.payload === "pong" && !!sender;
        if (isPong) {
          resolved = true;
          window.removeEventListener("message", onMessage);
          resolve(true);
        }
      };

      window.addEventListener("message", onMessage);
      window.postMessage(
        { target: "toExtension", payload: "ping" },
        window.location.origin
      );

      window.setTimeout(() => {
        if (resolved) return;
        window.removeEventListener("message", onMessage);
        resolve(false);
      }, timeoutMs);
    });

  for (let i = 0; i < attempts; i++) {
    const ok = await runAttempt();
    if (ok) return true;
  }
  return false;
}

class BeaconLegacyAdapter implements WalletAdapter {
  name: WalletProviderName = "beacon";
  private wallet: any = null;

  async init(network: string, _rpcUrl: string) {
    const { BeaconWallet } = await loadBeaconWallet();
    this.wallet = new BeaconWallet({
      name: "WTF Gameshow",
      // Cast: airgap vs ecad Beacon both use string enum values; TS types differ by major.
      preferredNetwork: beaconPreferredNetwork(network) as any,
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
    await this.wallet.disconnect();
  }

  setAsTaquitoProvider(tezos: any) {
    tezos.setWalletProvider(this.wallet);
  }
}

class OctezConnectAdapter implements WalletAdapter {
  name: WalletProviderName = "octez.connect";
  private client: any = null;
  private beaconWallet: any = null;

  async init(network: string, _rpcUrl: string) {
    const { DAppClient } = await loadOctezConnect();
    this.client = new (DAppClient as any)({
      name: "WTF Gameshow",
      preferredNetwork: beaconPreferredNetwork(network) as any,
    });

    const { BeaconWallet } = await loadBeaconWallet();
    this.beaconWallet = new BeaconWallet({
      name: "WTF Gameshow",
      preferredNetwork: beaconPreferredNetwork(network) as any,
    });
  }

  async requestPermissions(): Promise<string> {
    await preflightOctezExtensionHandshake();
    const perms = await this.client.requestPermissions();
    if (perms?.address) return perms.address;

    const active = await this.getActiveAccount();
    if (active?.address) return active.address;

    throw new Error("Wallet permissions granted but no active account address was returned");
  }

  async getActiveAccount() {
    const account = await this.client.getActiveAccount();
    return account ? { address: account.address } : null;
  }

  async clearActiveAccount() {
    await this.client.clearActiveAccount();
    try {
      await this.beaconWallet.clearActiveAccount();
    } catch {
      // Beacon may already be cleared via Octez client
    }
  }

  setAsTaquitoProvider(tezos: any) {
    tezos.setWalletProvider(this.beaconWallet);
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
  if (currentAdapter) return currentAdapter;
  if (adapterInitPromise) return adapterInitPromise;

  adapterInitPromise = createAdapter()
    .then((adapter) => {
      currentAdapter = adapter;
      return adapter;
    })
    .finally(() => {
      adapterInitPromise = null;
    });

  return adapterInitPromise;
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
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    let adapter = await ensureAdapter();
    let address = "";

    try {
      // Reuse existing permission/session to avoid spawning duplicate wallet proposals.
      const existing = await adapter.getActiveAccount();
      const requestedAddress =
        existing?.address ?? (await adapter.requestPermissions());
      address = requestedAddress || (await adapter.getActiveAccount())?.address || "";
    } catch (err) {
      // octez.connect can occasionally miss browser extension discovery in some
      // environments; retry immediately through Beacon without changing user flow.
      if (adapter.name !== "octez.connect") {
        throw err;
      }

      console.warn("[WTF] octez.connect permission flow failed, retrying via Beacon:", err);
      const fallback = new BeaconLegacyAdapter();
      await fallback.init(getNetwork(), getRpcUrl());
      currentAdapter = fallback;
      adapter = fallback;

      const existing = await adapter.getActiveAccount();
      const requestedAddress =
        existing?.address ?? (await adapter.requestPermissions());
      address = requestedAddress || (await adapter.getActiveAccount())?.address || "";
    }

    if (!address) {
      throw new Error("Wallet connected, but no address is available");
    }

    await getTezos();
    adapter.setAsTaquitoProvider(tezosToolkit);
    return { address, providerName: adapter.name };
  })().finally(() => {
    connectPromise = null;
  });

  return connectPromise;
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
