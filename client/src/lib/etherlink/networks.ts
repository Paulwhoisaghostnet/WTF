export type EtherlinkNetworkId = "mainnet" | "shadownet";

export interface EtherlinkNetworkConfig {
  id: EtherlinkNetworkId;
  name: string;
  chainId: number;
  chainIdHex: `0x${string}`;
  rpcUrl: string;
  explorerUrl: string;
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
    nativeCurrency: { name: "XTZ", symbol: "XTZ", decimals: 18 },
  },
  shadownet: {
    id: "shadownet",
    name: "Etherlink Shadownet Testnet",
    chainId: 127823,
    chainIdHex: "0x1f34f",
    rpcUrl: "https://node.shadownet.etherlink.com",
    explorerUrl: "https://shadownet.explorer.etherlink.com",
    nativeCurrency: { name: "XTZ", symbol: "XTZ", decimals: 18 },
  },
};

export function resolveEtherlinkNetwork(
  value?: string | number | null,
): EtherlinkNetworkConfig {
  const raw = String(
    value ??
      (typeof window !== "undefined"
        ? window.localStorage.getItem("wtf:etherlink-network")
        : null) ??
      import.meta.env.VITE_ETHERLINK_NETWORK ??
      "mainnet",
  )
    .trim()
    .toLowerCase();

  if (raw === "127823" || raw === "0x1f34f" || raw === "shadownet") {
    return ETHERLINK_NETWORKS.shadownet;
  }
  return ETHERLINK_NETWORKS.mainnet;
}

export function getEtherlinkNetwork(): EtherlinkNetworkConfig {
  return resolveEtherlinkNetwork();
}
