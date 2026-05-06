import { getEtherlinkNetwork } from "./networks";
import type { EtherlinkNetworkConfig } from "./networks";

export type EtherlinkWalletPreference = "temple" | "metamask";

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  isTemple?: boolean;
  providers?: Eip1193Provider[];
};

interface Eip6963ProviderDetail {
  info: {
    uuid?: string;
    name?: string;
    icon?: string;
    rdns?: string;
  };
  provider: Eip1193Provider;
}

interface DiscoveredProvider {
  provider: Eip1193Provider;
  key: EtherlinkWalletPreference | "injected";
  name: string;
  rdns?: string;
}

export const ETHERLINK_SESSION_KEY = "wtf:etherlink-wallet-session";
export const ETHERLINK_SESSION_EVENT = "wtf:etherlink-wallet-session-changed";

export interface PersistedEtherlinkWalletSession {
  address: string;
  chainId: number;
  network: string;
  providerKey: EtherlinkWalletPreference | "injected";
  providerName: string;
  connectedAt: string;
}

let activeProvider: DiscoveredProvider | null = null;
let connectPromise: Promise<{
  address: string;
  chainId: number;
  network: string;
  providerKey: EtherlinkWalletPreference | "injected";
  providerName: string;
}> | null = null;

function isEvmAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeAddress(value: unknown): string {
  if (!isEvmAddress(value)) throw new Error("Wallet did not return an EVM address");
  return `0x${value.slice(2)}`;
}

function providerIdentity(
  provider: Eip1193Provider,
  detail?: Partial<Eip6963ProviderDetail["info"]>,
): DiscoveredProvider {
  const name = detail?.name || (provider.isMetaMask ? "MetaMask" : "Injected EVM Wallet");
  const rdns = detail?.rdns || "";
  const hay = `${name} ${rdns}`.toLowerCase();
  if (provider.isTemple || hay.includes("temple") || hay.includes("madfish")) {
    return { provider, key: "temple", name: name || "Temple Wallet", rdns };
  }
  if (provider.isMetaMask || hay.includes("metamask")) {
    return { provider, key: "metamask", name: name || "MetaMask", rdns };
  }
  return { provider, key: "injected", name, rdns };
}

async function discoverProviders(): Promise<DiscoveredProvider[]> {
  if (typeof window === "undefined") return [];

  const found = new Map<Eip1193Provider, DiscoveredProvider>();
  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
    if (!detail?.provider) return;
    found.set(detail.provider, providerIdentity(detail.provider, detail.info));
  };

  window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => window.setTimeout(resolve, 250));
  window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);

  const injected = (window as any).ethereum as Eip1193Provider | undefined;
  if (Array.isArray(injected?.providers)) {
    for (const provider of injected.providers) {
      if (!found.has(provider)) found.set(provider, providerIdentity(provider));
    }
  } else if (injected && !found.has(injected)) {
    found.set(injected, providerIdentity(injected));
  }

  return [...found.values()];
}

function pickProvider(
  providers: DiscoveredProvider[],
  preference: EtherlinkWalletPreference,
): DiscoveredProvider {
  const exact = providers.find((provider) => provider.key === preference);
  if (exact) return exact;
  if (preference === "temple") {
    const metamask = providers.find((provider) => provider.key === "metamask");
    if (metamask) return metamask;
  }
  const injected = providers[0];
  if (injected) return injected;
  throw new Error("No EVM wallet provider found. Install Temple or MetaMask and retry.");
}

function persistEtherlinkSession(session: PersistedEtherlinkWalletSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      window.localStorage.setItem(ETHERLINK_SESSION_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(ETHERLINK_SESSION_KEY);
    }
    window.dispatchEvent(new CustomEvent(ETHERLINK_SESSION_EVENT));
  } catch {
    // localStorage may be unavailable.
  }
}

export function readPersistedEtherlinkSession(): PersistedEtherlinkWalletSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ETHERLINK_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedEtherlinkWalletSession>;
    if (!isEvmAddress(parsed.address)) return null;
    const parsedChainId = parsed.chainId;
    if (!Number.isInteger(parsedChainId)) return null;
    return {
      address: normalizeAddress(parsed.address),
      chainId: parsedChainId as number,
      network: String(parsed.network || "mainnet"),
      providerKey:
        parsed.providerKey === "temple" || parsed.providerKey === "metamask"
          ? parsed.providerKey
          : "injected",
      providerName: String(parsed.providerName || "Injected EVM Wallet"),
      connectedAt: String(parsed.connectedAt || new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

async function ensureEtherlinkChain(
  provider: Eip1193Provider,
  network: EtherlinkNetworkConfig,
) {
  const current = await provider
    .request({ method: "eth_chainId" })
    .catch(() => null);
  if (String(current).toLowerCase() === network.chainIdHex.toLowerCase()) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: network.chainIdHex }],
    });
  } catch (err: any) {
    if (err?.code !== 4902 && err?.data?.originalError?.code !== 4902) {
      throw err;
    }
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: network.chainIdHex,
          chainName: network.name,
          nativeCurrency: network.nativeCurrency,
          rpcUrls: [network.rpcUrl],
          blockExplorerUrls: [network.explorerUrl],
        },
      ],
    });
  }
}

export async function connectEtherlinkWallet(
  preference: EtherlinkWalletPreference = "temple",
) {
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const network = getEtherlinkNetwork();
    const provider = pickProvider(await discoverProviders(), preference);
    activeProvider = provider;

    await ensureEtherlinkChain(provider.provider, network);
    const accounts = (await provider.provider.request({
      method: "eth_requestAccounts",
    })) as unknown[];
    const address = normalizeAddress(accounts?.[0]);

    const chainIdHex = await provider.provider.request({ method: "eth_chainId" });
    const chainId = Number.parseInt(String(chainIdHex), 16);
    if (chainId !== network.chainId) {
      throw new Error(`Wallet is on chain ${chainId}; expected ${network.chainId}`);
    }

    const session: PersistedEtherlinkWalletSession = {
      address,
      chainId,
      network: network.id,
      providerKey: provider.key,
      providerName: provider.name,
      connectedAt: new Date().toISOString(),
    };
    persistEtherlinkSession(session);
    return session;
  })().finally(() => {
    connectPromise = null;
  });

  return connectPromise;
}

export async function signEtherlinkMessage(
  message: string,
  address: string,
): Promise<string> {
  const session = readPersistedEtherlinkSession();
  const preference =
    session?.providerKey === "temple" || session?.providerKey === "metamask"
      ? session.providerKey
      : "temple";
  const provider = activeProvider ?? pickProvider(await discoverProviders(), preference);
  activeProvider = provider;

  const signature = await provider.provider.request({
    method: "personal_sign",
    params: [message, normalizeAddress(address)],
  });
  if (typeof signature !== "string") {
    throw new Error("Wallet did not return a signature");
  }
  return signature;
}

export async function disconnectEtherlinkWallet() {
  try {
    if (activeProvider) {
      await activeProvider.provider
        .request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        })
        .catch(() => undefined);
    }
  } finally {
    activeProvider = null;
    persistEtherlinkSession(null);
  }
}
