import { loadOctezConnect, loadBeaconWallet, loadTaquito, getRpcUrl, getNetwork } from "./loaders";

type WalletProviderName = "octez.connect" | "beacon";

export interface WalletConnectionResult {
  address: string;
  providerName: WalletProviderName;
}

export interface ConnectWalletOptions {
  /**
   * Always clear cached connector state and show the wallet picker.
   * Required for auth flows on shared machines so a previous visitor's
   * Beacon/Octez session is never reused silently.
   */
  forcePermissions?: boolean;
}

/**
 * Persisted session metadata so the UI can rehydrate the connected address
 * across page refreshes without forcing a fresh Beacon/Octez initialization
 * (which both pings the public RPC and tends to surface rate-limit warnings).
 *
 * Signatures are NEVER stored — only the public address + provider id.
 */
export const WALLET_SESSION_KEY = "wtf:wallet-session";
export const WALLET_SESSION_EVENT = "wtf:wallet-session-changed";

export interface PersistedWalletSession {
  address: string;
  providerName: WalletProviderName;
}

export function readPersistedWalletSession(): PersistedWalletSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WALLET_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedWalletSession>;
    if (!parsed?.address || typeof parsed.address !== "string") return null;
    if (parsed.providerName !== "octez.connect" && parsed.providerName !== "beacon") {
      return null;
    }
    return { address: parsed.address, providerName: parsed.providerName };
  } catch {
    return null;
  }
}

function persistWalletSession(session: PersistedWalletSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      window.localStorage.setItem(WALLET_SESSION_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(WALLET_SESSION_KEY);
    }
    window.dispatchEvent(new CustomEvent(WALLET_SESSION_EVENT));
  } catch {
    // localStorage may be unavailable (private browsing); fail silently.
  }
}

/** Beacon `NetworkType` string values (ecad / airgap Beacon, Taquito 14–24). */
type BeaconPreferredNetwork = "mainnet" | "ghostnet";
const OCTEZ_FEATURED_WALLETS = [
  "kukai",
  "temple",
  "umami",
];

function beaconPreferredNetwork(network: string): BeaconPreferredNetwork {
  return network === "ghostnet" ? "ghostnet" : "mainnet";
}

function walletNetworkSpec(network: string) {
  return { type: beaconPreferredNetwork(network) as any };
}

interface WalletAdapter {
  name: WalletProviderName;
  init(network: string, rpcUrl: string): Promise<void>;
  requestPermissions(): Promise<string>;
  getActiveAccount(): Promise<{ address: string } | null>;
  clearActiveAccount(): Promise<void>;
  setAsTaquitoProvider(tezos: any): Promise<void>;
}

let currentAdapter: WalletAdapter | null = null;
let tezosToolkit: any = null;
let adapterInitPromise: Promise<WalletAdapter> | null = null;
let connectPromise:
  | Promise<WalletConnectionResult>
  | null = null;

function sameWalletAddress(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

export class WalletAccountMismatchError extends Error {
  readonly code = "WALLET_ACCOUNT_MISMATCH";
  constructor(
    readonly expectedAddress: string,
    readonly actualAddress: string,
  ) {
    super(
      `Your active wallet is ${actualAddress}, but this operation was prepared for ${expectedAddress}. ` +
        "Reconnect that wallet or retry after the wallet display updates."
    );
  }
}

export class WalletProviderPreflightError extends Error {
  readonly code = "WALLET_PROVIDER_PREFLIGHT_FAILED";
  constructor(
    readonly providerName: WalletProviderName,
    cause: unknown,
  ) {
    super(
      `${providerName} could not prepare a signing session. Reconnect the wallet and retry. ` +
        `Original error: ${(cause as Error)?.message ?? String(cause)}`
    );
  }
}

function clearStaleBeaconState() {
  if (typeof window === "undefined") return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith("beacon:") || key.startsWith("beacon-sdk:"))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}

async function resetWalletConnectorState(options?: { clearPersistedSession?: boolean }) {
  if (currentAdapter) {
    try {
      await currentAdapter.clearActiveAccount();
    } catch {
      // Best-effort — stale sessions may already be invalid.
    }
  }
  clearStaleBeaconState();
  if (options?.clearPersistedSession !== false) {
    persistWalletSession(null);
  }
  currentAdapter = null;
  tezosToolkit = null;
  adapterInitPromise = null;
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
  private network: BeaconPreferredNetwork = "mainnet";

  async init(network: string, _rpcUrl: string) {
    const { BeaconWallet } = await loadBeaconWallet();
    this.network = beaconPreferredNetwork(network);
    this.wallet = new BeaconWallet({
      name: "WTF OS",
      network: walletNetworkSpec(network),
      enableMetrics: false,
      // Cast: airgap vs ecad Beacon both use string enum values; TS types differ by major.
      preferredNetwork: this.network as any,
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

  async setAsTaquitoProvider(tezos: any) {
    tezos.setWalletProvider(this.wallet);
  }
}

class OctezConnectAdapter implements WalletAdapter {
  name: WalletProviderName = "octez.connect";
  private client: any = null;
  private _beaconWallet: any = null;
  private _beaconNetwork: string = "mainnet";

  async init(network: string, _rpcUrl: string) {
    this._beaconNetwork = network;
    const { DAppClient } = await loadOctezConnect();
    const preferredNetwork = beaconPreferredNetwork(network);
    this.client = new (DAppClient as any)({
      name: "WTF OS",
      network: walletNetworkSpec(network),
      preferredNetwork: preferredNetwork as any,
      enableMetrics: false,
      featuredWallets: OCTEZ_FEATURED_WALLETS,
    });
  }

  private async ensureBeaconWallet(): Promise<any> {
    if (this._beaconWallet) return this._beaconWallet;
    const { BeaconWallet } = await loadBeaconWallet();
    this._beaconWallet = new BeaconWallet({
      name: "WTF OS",
      preferredNetwork: beaconPreferredNetwork(this._beaconNetwork) as any,
    });
    try {
      await this._beaconWallet.client.subscribeToEvent(
        "ACTIVE_ACCOUNT_SET",
        async () => {},
      );
    } catch { /* v3/v4 differences */ }
    return this._beaconWallet;
  }

  async requestPermissions(): Promise<string> {
    await preflightOctezExtensionHandshake();
    const perms = await this.client.requestPermissions();

    await this.syncAccountToBeaconWallet();

    if (perms?.address) return perms.address;

    const active = await this.getActiveAccount();
    if (active?.address) return active.address;

    throw new Error("Wallet permissions granted but no active account address was returned");
  }

  private async syncAccountToBeaconWallet() {
    try {
      const account = await this.client.getActiveAccount();
      if (account) {
        const bw = await this.ensureBeaconWallet();
        await bw.client.setActiveAccount(account);
      }
    } catch (err) {
      console.warn("[WTF] Failed to sync octez account to BeaconWallet:", err);
    }
  }

  async getActiveAccount() {
    const account = await this.client.getActiveAccount();
    if (account) {
      await this.syncAccountToBeaconWallet();
      return { address: account.address };
    }
    return null;
  }

  async clearActiveAccount() {
    await this.client.clearActiveAccount();
    if (this._beaconWallet) {
      try {
        await this._beaconWallet.clearActiveAccount();
      } catch { /* may already be cleared via Octez client */ }
    }
  }

  async setAsTaquitoProvider(tezos: any) {
    const wallet = await this.ensureBeaconWallet();
    tezos.setWalletProvider(wallet);
  }
}

async function createAdapter(): Promise<WalletAdapter> {
  const network = getNetwork();
  const rpcUrl = getRpcUrl();

  try {
    const octez = new OctezConnectAdapter();
    await octez.init(network, rpcUrl);
    const active = await octez.getActiveAccount();
    console.log(`[WTF] Wallet provider: octez.connect${active ? " (active session)" : ""}`);
    return octez;
  } catch (err) {
    console.warn("[WTF] octez.connect unavailable:", err);
  }

  try {
    const beacon = new BeaconLegacyAdapter();
    await beacon.init(network, rpcUrl);
    const active = await beacon.getActiveAccount();
    console.log(`[WTF] Wallet provider: Beacon${active ? " (active session)" : " (fallback)"}`);
    return beacon;
  } catch (err) {
    console.warn("[WTF] Beacon unavailable:", err);
  }

  throw new Error("No wallet provider available");
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
    await currentAdapter.setAsTaquitoProvider(tezosToolkit);
  }
  return tezosToolkit;
}

async function activateAdapterForSend(
  adapter: WalletAdapter,
  expectedAddress?: string,
  forcePermissions = false,
): Promise<WalletConnectionResult> {
  const requestedAddress = forcePermissions
    ? await adapter.requestPermissions()
    : (await adapter.getActiveAccount())?.address ?? (await adapter.requestPermissions());
  const address = requestedAddress || (await adapter.getActiveAccount())?.address || "";

  if (!address) {
    throw new Error("Wallet connected, but no address is available");
  }

  await getTezos();
  await adapter.setAsTaquitoProvider(tezosToolkit);
  persistWalletSession({ address, providerName: adapter.name });

  if (expectedAddress && !sameWalletAddress(address, expectedAddress)) {
    throw new WalletAccountMismatchError(expectedAddress, address);
  }

  return { address, providerName: adapter.name };
}

export async function ensureWalletProviderForSend(
  expectedAddress?: string,
): Promise<WalletConnectionResult> {
  const adapter = await ensureAdapter();

  try {
    return await activateAdapterForSend(adapter, expectedAddress);
  } catch (err) {
    if (err instanceof WalletAccountMismatchError) {
      throw err;
    }
    throw new WalletProviderPreflightError(adapter.name, err);
  }
}

export async function connectWallet(
  options: ConnectWalletOptions = {},
): Promise<WalletConnectionResult> {
  const { forcePermissions = false } = options;
  if (connectPromise && !forcePermissions) return connectPromise;

  const task = (async () => {
    if (forcePermissions) {
      await resetWalletConnectorState();
    }

    const adapter = await ensureAdapter();

    try {
      if (forcePermissions) {
        // Auth and explicit reconnect flows must show Kukai/Temple/Umami picker.
        return await activateAdapterForSend(adapter, undefined, true);
      }
      // Reuse existing permission/session to avoid duplicate wallet proposals for sends.
      return await activateAdapterForSend(adapter);
    } catch (err) {
      throw new WalletProviderPreflightError(adapter.name, err);
    }
  })().finally(() => {
    connectPromise = null;
  });

  connectPromise = task;
  return task;
}

export async function disconnectWallet() {
  await resetWalletConnectorState();
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

export async function signPayload(
  message: string
): Promise<{ signature: string; publicKey: string }> {
  const adapter = await ensureAdapter();

  const payloadBytes = new TextEncoder().encode(message);
  const hex = Array.from(payloadBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Canonical Michelson PACK for `string s`:
  //   05 (expression tag)
  //   01 (string tag)
  //   <4-byte BE byte-length of utf-8 bytes>
  //   <utf-8 bytes>
  // Previous versions used hex-char count by mistake, which yielded a
  // malformed blob.  Wallets signed what we passed verbatim so the bug
  // was invisible end-to-end, but the resulting signatures could only
  // be re-verified by replaying the same malformed packing.  The server
  // tolerates the legacy variant for one release cycle (M-5).
  const byteLen = payloadBytes.length;
  const payload = {
    signingType: "micheline" as const,
    payload:
      "0501" + byteLen.toString(16).padStart(8, "0") + hex,
  };

  if (adapter.name === "octez.connect") {
    const octezAdapter = adapter as any;
    const result = await octezAdapter.client.requestSignPayload(payload);
    const account = await octezAdapter.client.getActiveAccount();
    return {
      signature: result.signature,
      publicKey: account?.publicKey || "",
    };
  }

  const beaconAdapter = adapter as any;
  const result = await beaconAdapter.wallet.client.requestSignPayload(payload);
  const account = await beaconAdapter.wallet.client.getActiveAccount();
  return {
    signature: result.signature,
    publicKey: account?.publicKey || "",
  };
}
