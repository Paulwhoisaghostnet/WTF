import {
  loadOctezConnect,
  loadTaquito,
  getRpcFallbackUrlsForNetwork,
  getRpcUrlForNetwork,
  getNetwork,
  getOctezWalletConnectOptions,
} from "./loaders";

type WalletProviderName = "octez.connect";

export interface WalletConnectionResult {
  address: string;
  providerName: WalletProviderName;
}

export interface ConnectWalletOptions {
  /**
   * Always clear cached connector state and show the wallet picker.
   * Required for auth flows on shared machines so a previous visitor's
   * legacy Beacon/WalletConnect or Octez session is never reused silently.
   */
  forcePermissions?: boolean;
  /**
   * Explicit chain lane for the wallet provider. Auth uses mainnet here;
   * Shadownet-capable apps can still pass their selected app network.
   */
  network?: string;
  rpcUrl?: string;
}

/**
 * Persisted session metadata so the UI can rehydrate the connected address
 * across page refreshes without forcing a fresh Octez Connect initialization
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
    if (parsed.providerName !== "octez.connect") {
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

type OctezNamedNetwork = "mainnet" | "ghostnet" | "shadownet";
const WALLET_CONNECT_TIMEOUT_MS = 35_000;
const WALLET_PERMISSION_TIMEOUT_MS = 30_000;
const WALLET_SIGN_TIMEOUT_MS = 30_000;
const AUTH_WALLET_NETWORK = "mainnet";
const OCTEZ_FEATURED_WALLETS = [
  "kukai",
  "temple",
  "umami",
];
const NAMED_WALLET_NETWORKS = new Set(["mainnet", "ghostnet", "shadownet"]);

interface WalletNetworkConfig {
  network: string;
  rpcUrl: string;
}

function octezPreferredNetwork(network: string): OctezNamedNetwork {
  if (network === "ghostnet") return "ghostnet";
  if (network === "shadownet") return "shadownet";
  return "mainnet";
}

function walletNetworkSpec(network: string, rpcUrl?: string) {
  const spec: { type: any; name?: string; rpcUrl?: string } = {
    type: octezPreferredNetwork(network) as any,
  };
  if (!NAMED_WALLET_NETWORKS.has(network) && rpcUrl) {
    spec.type = "custom";
    spec.name = network;
    spec.rpcUrl = rpcUrl;
  }
  return spec;
}

function resolveWalletConfig(options: { network?: string; rpcUrl?: string } = {}): WalletNetworkConfig {
  const network = options.network || getNetwork();
  return {
    network,
    rpcUrl: options.rpcUrl || getRpcUrlForNetwork(network),
  };
}

function resolveAuthWalletConfig(): WalletNetworkConfig {
  return {
    network: AUTH_WALLET_NETWORK,
    rpcUrl: getRpcUrlForNetwork(AUTH_WALLET_NETWORK),
  };
}

function sameWalletConfig(a: WalletNetworkConfig | null, b: WalletNetworkConfig): boolean {
  return !!a && a.network === b.network && a.rpcUrl === b.rpcUrl;
}

function normalizeRpcUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function uniqueRpcUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.filter((url) => {
    const normalized = normalizeRpcUrl(url);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function isRecoverableRpcError(err: unknown): boolean {
  const message = String((err as Error)?.message || (err as Error)?.name || err || "").toLowerCase();
  return /access-control|cors|failed to fetch|http request timeout|networkerror|rpc|timeout|503|502|504/.test(message);
}

async function withRpcAttemptTimeout<T>(task: Promise<T>, rpcUrl: string, timeoutMs?: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return task;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Tezos RPC attempt timed out after ${timeoutMs}ms at ${rpcUrl}`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
let currentAdapterConfig: WalletNetworkConfig | null = null;
let tezosToolkit: any = null;
let tezosToolkitConfig: WalletNetworkConfig | null = null;
let adapterInitPromise: Promise<WalletAdapter> | null = null;
let adapterInitConfig: WalletNetworkConfig | null = null;
let connectPromise:
  | Promise<WalletConnectionResult>
  | null = null;
let connectPromiseConfig: WalletNetworkConfig | null = null;

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
    const normalized = key?.toLowerCase() || "";
    if (
      key &&
      (key.startsWith("beacon:") ||
        key.startsWith("beacon-sdk:") ||
        key.startsWith("wc@") ||
        normalized.includes("walletconnect") ||
        normalized.includes("octez.connect"))
    ) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}

function deleteIndexedDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve();
      return;
    }
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function clearWalletIndexedDbState() {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return;
  const knownWalletDbs = ["beacon", "WALLET_CONNECT_V2_INDEXED_DB"];
  let dbNames = knownWalletDbs;
  try {
    const databases =
      typeof (indexedDB as any).databases === "function"
        ? await (indexedDB as any).databases()
        : [];
    const discovered = databases
      .map((db: { name?: string }) => db.name)
      .filter((name: string | undefined): name is string => !!name)
      .filter((name: string) => {
        const normalized = name.toLowerCase();
        return normalized.includes("beacon") || normalized.includes("wallet");
      });
    dbNames = Array.from(new Set([...knownWalletDbs, ...discovered]));
  } catch {
    // Some browsers do not expose indexedDB.databases(); known DB names still cover Beacon/WC.
  }
  await Promise.all(dbNames.map((name) => deleteIndexedDb(name)));
}

type WalletParamsWithLimits = {
  fee?: number | string;
  gasLimit?: number | string;
  storageLimit?: number | string;
  [key: string]: unknown;
};

type RpcOperationWithLimits = {
  fee?: string | number;
  gas_limit?: string | number;
  storage_limit?: string | number;
  [key: string]: unknown;
};

type SigningKind = "raw" | "micheline" | "operation";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function octezSigningTypeForWatermark(watermark?: Uint8Array): SigningKind {
  if (!watermark?.length) return "raw";
  if (watermark[0] === 3) return "operation";
  if (watermark[0] === 5) return "micheline";
  return "raw";
}

function octezPayloadWithWatermark(bytes: string, watermark?: Uint8Array): string {
  return watermark?.length ? `${bytesToHex(watermark)}${bytes}` : bytes;
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
  await clearWalletIndexedDbState();
  if (options?.clearPersistedSession !== false) {
    persistWalletSession(null);
  }
  currentAdapter = null;
  currentAdapterConfig = null;
  tezosToolkit = null;
  tezosToolkitConfig = null;
  adapterInitPromise = null;
  adapterInitConfig = null;
}

async function withWalletTimeout<T>(
  task: Promise<T>,
  message: string,
  timeoutMs = WALLET_PERMISSION_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

export class OctezConnectTaquitoWalletProvider {
  constructor(private readonly client: any) {}

  private async getRequiredAccount() {
    const account = await this.client.getActiveAccount();
    if (!account?.address) {
      throw new Error("Octez Connect needs wallet permissions before Tezos operations can be signed.");
    }
    return account;
  }

  async getPKH(): Promise<string> {
    const account = await this.getRequiredAccount();
    return account.address;
  }

  async getPK(): Promise<string> {
    const account = await this.getRequiredAccount();
    return account.publicKey || "";
  }

  private formatParameters<T extends WalletParamsWithLimits>(params: T): T {
    return {
      ...params,
      ...(params.fee !== undefined ? { fee: params.fee.toString() } : {}),
      ...(params.gasLimit !== undefined ? { gasLimit: params.gasLimit.toString() } : {}),
      ...(params.storageLimit !== undefined ? { storageLimit: params.storageLimit.toString() } : {}),
    };
  }

  private removeDefaultParams<T extends RpcOperationWithLimits>(
    params: WalletParamsWithLimits,
    operatedParams: T,
  ): T {
    const cleaned = { ...operatedParams };
    if (params.fee === undefined) delete cleaned.fee;
    if (params.gasLimit === undefined) delete cleaned.gas_limit;
    if (params.storageLimit === undefined) delete cleaned.storage_limit;
    return cleaned;
  }

  private async mapParams<T extends WalletParamsWithLimits>(
    params: () => Promise<T>,
    createOperation: (params: T) => Promise<RpcOperationWithLimits>,
  ) {
    const walletParams = await params();
    return this.removeDefaultParams(
      walletParams,
      await createOperation(this.formatParameters(walletParams)),
    );
  }

  async mapTransferParamsToWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createTransferOperation } = (await loadTaquito()) as any;
    return this.mapParams(params, createTransferOperation as any);
  }

  async mapTransferTicketParamsToWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createTransferTicketOperation } = (await loadTaquito()) as any;
    return this.mapParams(params, createTransferTicketOperation as any);
  }

  async mapOriginateParamsToWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createOriginationOperation } = (await loadTaquito()) as any;
    return this.mapParams(params, createOriginationOperation as any);
  }

  async mapDelegateParamsToWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createSetDelegateOperation } = (await loadTaquito()) as any;
    return this.mapParams(params, createSetDelegateOperation as any);
  }

  async mapIncreasePaidStorageWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createIncreasePaidStorageOperation } = (await loadTaquito()) as any;
    return this.mapParams(params, createIncreasePaidStorageOperation as any);
  }

  async mapRegisterGlobalConstantWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createRegisterGlobalConstantOperation } = (await loadTaquito()) as any;
    return this.mapParams(params, createRegisterGlobalConstantOperation as any);
  }

  async mapStakeParamsToWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createTransferOperation } = (await loadTaquito()) as any;
    return this.mapParams(params, createTransferOperation as any);
  }

  async mapUnstakeParamsToWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createTransferOperation } = (await loadTaquito()) as any;
    return this.mapParams(params, createTransferOperation as any);
  }

  async mapFinalizeUnstakeParamsToWalletParams(params: () => Promise<WalletParamsWithLimits>) {
    const { createTransferOperation } = (await loadTaquito()) as any;
    return this.mapParams(params, createTransferOperation as any);
  }

  async sendOperations(params: any[]): Promise<string> {
    await this.getRequiredAccount();
    const result = await this.client.requestOperation({ operationDetails: params });
    if (!result?.transactionHash) {
      throw new Error("Octez Connect did not return an operation hash.");
    }
    return result.transactionHash;
  }

  async sign(bytes: string, watermark?: Uint8Array): Promise<string> {
    await this.getRequiredAccount();
    const result = await this.client.requestSignPayload({
      signingType: octezSigningTypeForWatermark(watermark),
      payload: octezPayloadWithWatermark(bytes, watermark),
    });
    if (!result?.signature) {
      throw new Error("Octez Connect did not return a signature.");
    }
    return result.signature;
  }
}

class OctezConnectAdapter implements WalletAdapter {
  name: WalletProviderName = "octez.connect";
  private client: any = null;
  private taquitoWalletProvider: OctezConnectTaquitoWalletProvider | null = null;

  async init(network: string, rpcUrl: string) {
    const { DAppClient, BeaconEvent } = await loadOctezConnect();
    const preferredNetwork = octezPreferredNetwork(network);
    this.client = new (DAppClient as any)({
      name: "WTF OS",
      network: walletNetworkSpec(network, rpcUrl),
      preferredNetwork: preferredNetwork as any,
      enableMetrics: false,
      featuredWallets: OCTEZ_FEATURED_WALLETS,
      ...getOctezWalletConnectOptions(),
    });
    await this.client.subscribeToEvent(
      ((BeaconEvent as any)?.ACTIVE_ACCOUNT_SET ?? "ACTIVE_ACCOUNT_SET") as any,
      async () => {},
    );
  }

  private getTaquitoWalletProvider(): OctezConnectTaquitoWalletProvider {
    if (!this.client) {
      throw new Error("Octez Connect is not initialized.");
    }
    if (!this.taquitoWalletProvider) {
      this.taquitoWalletProvider = new OctezConnectTaquitoWalletProvider(this.client);
    }
    return this.taquitoWalletProvider;
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
    if (account) {
      return { address: account.address };
    }
    return null;
  }

  async clearActiveAccount() {
    await this.client.clearActiveAccount();
    if (typeof this.client.removeAllAccounts === "function") {
      await this.client.removeAllAccounts();
    }
    if (typeof this.client.removeAllPeers === "function") {
      await this.client.removeAllPeers();
    }
    this.taquitoWalletProvider = null;
  }

  async setAsTaquitoProvider(tezos: any) {
    tezos.setWalletProvider(this.getTaquitoWalletProvider());
  }
}

async function createAdapter(config: WalletNetworkConfig): Promise<WalletAdapter> {
  try {
    const octez = new OctezConnectAdapter();
    await octez.init(config.network, config.rpcUrl);
    const active = await octez.getActiveAccount();
    console.log(`[WTF] Wallet provider: octez.connect${active ? " (active session)" : ""}`);
    return octez;
  } catch (err) {
    console.warn("[WTF] octez.connect unavailable:", err);
  }

  throw new Error("Octez Connect is unavailable. Install or enable a supported Octez Connect wallet and retry.");
}

async function ensureAdapter(config = resolveWalletConfig()): Promise<WalletAdapter> {
  if (currentAdapter && sameWalletConfig(currentAdapterConfig, config)) return currentAdapter;
  if (adapterInitPromise && sameWalletConfig(adapterInitConfig, config)) return adapterInitPromise;

  if (currentAdapter && !sameWalletConfig(currentAdapterConfig, config)) {
    currentAdapter = null;
    currentAdapterConfig = null;
  }

  adapterInitConfig = config;
  adapterInitPromise = createAdapter(config)
    .then((adapter) => {
      currentAdapter = adapter;
      currentAdapterConfig = config;
      return adapter;
    })
    .finally(() => {
      adapterInitPromise = null;
      adapterInitConfig = null;
    });

  return adapterInitPromise;
}

export async function getTezos(options: { network?: string; rpcUrl?: string } = {}) {
  const config = resolveWalletConfig(options);
  if (tezosToolkit && sameWalletConfig(tezosToolkitConfig, config)) return tezosToolkit;
  const { TezosToolkit } = await loadTaquito();
  tezosToolkit = new TezosToolkit(config.rpcUrl);
  tezosToolkitConfig = config;
  if (currentAdapter && sameWalletConfig(currentAdapterConfig, config)) {
    await currentAdapter.setAsTaquitoProvider(tezosToolkit);
  }
  return tezosToolkit;
}

export async function withTezosRpcFallback<T>(
  task: (tezos: any, context: { network: string; rpcUrl: string; attempt: number }) => Promise<T>,
  options: { network?: string; rpcUrl?: string; attemptTimeoutMs?: number } = {},
): Promise<T> {
  const config = resolveWalletConfig(options);
  const fallbackUrls = options.rpcUrl ? [] : getRpcFallbackUrlsForNetwork(config.network);
  const candidates = uniqueRpcUrls([config.rpcUrl, ...fallbackUrls]);
  let lastError: unknown;

  for (let index = 0; index < candidates.length; index += 1) {
    const rpcUrl = candidates[index];
    try {
      const tezos = await getTezos({ network: config.network, rpcUrl });
      return await withRpcAttemptTimeout(
        task(tezos, { network: config.network, rpcUrl, attempt: index + 1 }),
        rpcUrl,
        options.attemptTimeoutMs,
      );
    } catch (err) {
      lastError = err;
      if (index >= candidates.length - 1 || !isRecoverableRpcError(err)) throw err;
      console.warn(`[WTF] Tezos RPC ${rpcUrl} failed; retrying with fallback ${candidates[index + 1]}`, err);
    }
  }

  throw lastError;
}

async function activateAdapterForSend(
  adapter: WalletAdapter,
  config: WalletNetworkConfig,
  expectedAddress?: string,
  forcePermissions = false,
): Promise<WalletConnectionResult> {
  const requestPermissions = () =>
    withWalletTimeout(
      adapter.requestPermissions(),
      `${adapter.name} did not finish opening a wallet prompt. Clear the wallet connection and try again, or choose another Tezos wallet.`,
    );
  const requestedAddress = forcePermissions
    ? await requestPermissions()
    : (await adapter.getActiveAccount())?.address ?? (await requestPermissions());
  const address = requestedAddress || (await adapter.getActiveAccount())?.address || "";

  if (!address) {
    throw new Error("Wallet connected, but no address is available");
  }

  await getTezos(config);
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
  const config = resolveWalletConfig();
  const adapter = await ensureAdapter(config);

  try {
    return await activateAdapterForSend(adapter, config, expectedAddress);
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
  const config = resolveWalletConfig(options);
  if (connectPromise && !forcePermissions && sameWalletConfig(connectPromiseConfig, config)) {
    return connectPromise;
  }

  const innerTask = (async () => {
    if (forcePermissions) {
      await resetWalletConnectorState();
    }

    const adapter = await ensureAdapter(config);

    try {
      if (forcePermissions) {
        // Auth and explicit reconnect flows must show Kukai/Temple/Umami picker.
        return await activateAdapterForSend(adapter, config, undefined, true);
      }
      // Reuse existing permission/session to avoid duplicate wallet proposals for sends.
      return await activateAdapterForSend(adapter, config);
    } catch (err) {
      if (forcePermissions) {
        await resetWalletConnectorState();
      }
      throw new WalletProviderPreflightError(adapter.name, err);
    }
  })();

  const task = withWalletTimeout(
    innerTask,
    "Wallet connection did not finish opening a provider. Clear the wallet connection and try again, or choose another Tezos wallet.",
    WALLET_CONNECT_TIMEOUT_MS,
  ).catch(async (err) => {
    if (forcePermissions) {
      await resetWalletConnectorState();
    }
    throw err;
  }).finally(() => {
    connectPromise = null;
    connectPromiseConfig = null;
  });

  connectPromise = task;
  connectPromiseConfig = config;
  return task;
}

export async function connectAuthWallet(): Promise<WalletConnectionResult> {
  const config = resolveAuthWalletConfig();
  return connectWallet({
    forcePermissions: true,
    network: config.network,
    rpcUrl: config.rpcUrl,
  });
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
  message: string,
  options: { network?: string; rpcUrl?: string } = {},
): Promise<{ signature: string; publicKey: string }> {
  const config = resolveWalletConfig(options);
  const adapter = await ensureAdapter(config);

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

  const octezAdapter = adapter as any;
  const result = await withWalletTimeout<{ signature: string }>(
    octezAdapter.client.requestSignPayload(payload),
    "Wallet signing did not finish. Clear the wallet connection and try again, or choose another Tezos wallet.",
    WALLET_SIGN_TIMEOUT_MS,
  );
  const account = await octezAdapter.client.getActiveAccount();
  return {
    signature: result.signature,
    publicKey: account?.publicKey || "",
  };
}

export async function signAuthPayload(
  message: string
): Promise<{ signature: string; publicKey: string }> {
  return signPayload(message, resolveAuthWalletConfig());
}
