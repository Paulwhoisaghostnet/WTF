import { UpstreamClient, UpstreamError } from "../upstream";
import type { EtherlinkNetworkConfig } from "./config";

const clients = new Map<number, UpstreamClient>();

function getClient(network: EtherlinkNetworkConfig): UpstreamClient {
  const existing = clients.get(network.chainId);
  if (existing) return existing;

  const client = new UpstreamClient({
    label: `etherlink-${network.id}-blockscout`,
    baseUrl: network.apiV2Url,
    requestsPerSecond: 6,
    burst: 12,
    timeoutMs: 25_000,
    maxRetries: 4,
  });
  clients.set(network.chainId, client);
  return client;
}

export interface EtherlinkAddressInfo {
  hash: string;
  coin_balance?: string | null;
  has_tokens?: boolean;
}

export interface BlockscoutTokenBalanceRow {
  value?: string | number | null;
  token_id?: string | number | null;
  token?: Record<string, any> | null;
  token_instance?: Record<string, any> | null;
}

export interface BlockscoutTokenBalancesPage {
  items: BlockscoutTokenBalanceRow[];
  next_page_params?: Record<string, string | number | boolean | null> | null;
}

export async function getEtherlinkAddressInfo(
  network: EtherlinkNetworkConfig,
  address: string,
): Promise<EtherlinkAddressInfo | null> {
  try {
    return await getClient(network).getJson<EtherlinkAddressInfo>(
      `/addresses/${address}`,
    );
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 404) return null;
    throw err;
  }
}

export async function getEtherlinkTokenBalancesPage(
  network: EtherlinkNetworkConfig,
  address: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): Promise<BlockscoutTokenBalancesPage> {
  return await getClient(network).getJson<BlockscoutTokenBalancesPage>(
    `/addresses/${address}/tokens`,
    {
      type: "ERC-20,ERC-721,ERC-1155",
      ...params,
    },
  );
}
