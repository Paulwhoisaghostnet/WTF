import { getAddress, isAddress } from "viem";

export type EtherlinkNetworkId = "mainnet" | "shadownet";

export interface EtherlinkNetworkConfig {
  id: EtherlinkNetworkId;
  name: string;
  chainId: number;
  chainIdHex: `0x${string}`;
  rpcUrl: string;
  explorerUrl: string;
  apiV2Url: string;
  nativeCurrency: {
    name: string;
    symbol: "XTZ";
    decimals: 18;
  };
}

export const ETHERLINK_NETWORKS: Record<
  EtherlinkNetworkId,
  EtherlinkNetworkConfig
> = {
  mainnet: {
    id: "mainnet",
    name: "Etherlink Mainnet",
    chainId: 42793,
    chainIdHex: "0xa729",
    rpcUrl: "https://node.mainnet.etherlink.com",
    explorerUrl: "https://explorer.etherlink.com",
    apiV2Url: "https://explorer.etherlink.com/api/v2",
    nativeCurrency: { name: "XTZ", symbol: "XTZ", decimals: 18 },
  },
  shadownet: {
    id: "shadownet",
    name: "Etherlink Shadownet Testnet",
    chainId: 127823,
    chainIdHex: "0x1f34f",
    rpcUrl: "https://node.shadownet.etherlink.com",
    explorerUrl: "https://shadownet.explorer.etherlink.com",
    apiV2Url: "https://shadownet.explorer.etherlink.com/api/v2",
    nativeCurrency: { name: "XTZ", symbol: "XTZ", decimals: 18 },
  },
};

export function resolveEtherlinkNetwork(
  value?: string | number | null,
): EtherlinkNetworkConfig {
  const raw = String(
    value ??
      process.env.ETHERLINK_NETWORK ??
      process.env.VITE_ETHERLINK_NETWORK ??
      "mainnet",
  )
    .trim()
    .toLowerCase();

  if (raw === "127823" || raw === "0x1f34f" || raw === "shadownet") {
    return ETHERLINK_NETWORKS.shadownet;
  }
  if (raw === "42793" || raw === "0xa729" || raw === "mainnet") {
    return ETHERLINK_NETWORKS.mainnet;
  }
  return ETHERLINK_NETWORKS.mainnet;
}

export function resolveEtherlinkNetworkByChainId(
  chainId: number,
): EtherlinkNetworkConfig | null {
  return (
    Object.values(ETHERLINK_NETWORKS).find((network) => network.chainId === chainId) ??
    null
  );
}

export function normalizeEvmAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!isAddress(trimmed)) return null;
  return getAddress(trimmed);
}

export function etherlinkExplorerAddressUrl(
  chainId: number,
  address: string,
): string | null {
  const network = resolveEtherlinkNetworkByChainId(chainId);
  if (!network) return null;
  return `${network.explorerUrl}/address/${address}`;
}

export function etherlinkExplorerTokenUrl(
  chainId: number,
  tokenContract: string,
  tokenId?: string | null,
): string | null {
  const network = resolveEtherlinkNetworkByChainId(chainId);
  if (!network) return null;
  const base = `${network.explorerUrl}/token/${tokenContract}`;
  return tokenId && tokenId !== "0" ? `${base}/instance/${tokenId}` : base;
}
