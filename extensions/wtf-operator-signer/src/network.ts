import type { PlatformWalletNetwork } from "../../../shared/operator-signer";

export const TEZOS_CHAIN_ID_BY_NETWORK: Partial<Record<PlatformWalletNetwork, string>> = {
  mainnet: "NetXdQprcVkpaWU",
  ghostnet: "NetXnHfVqm9iesp",
  shadownet: "NetXsqzbfFenSTS",
};

export const TEZOS_RPC_PRIMARY_BY_NETWORK: Partial<Record<PlatformWalletNetwork, string>> = {
  mainnet: "https://tezos-mainnet.octez.io/",
  ghostnet: "https://rpc.ghostnet.teztnets.com",
  shadownet: "https://tezos-shadownet.octez.io/",
};

export const TEZOS_RPC_FALLBACKS_BY_NETWORK: Partial<Record<PlatformWalletNetwork, string[]>> = {
  mainnet: ["https://tcinfra.net/rpc/tezos/mainnet"],
  ghostnet: [],
  shadownet: ["https://tcinfra.net/rpc/tezos/shadownet"],
};

export const DEFAULT_RPC_PROBE_TIMEOUT_MS = 10_000;

function normalizeRpcUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function rpcProbeCandidates(
  network: PlatformWalletNetwork,
  selectedRpcUrl: string,
): string[] {
  const selected = normalizeRpcUrl(selectedRpcUrl);
  const primary = TEZOS_RPC_PRIMARY_BY_NETWORK[network];
  const candidates = [selected];
  if (primary && normalizeRpcUrl(primary) === selected) {
    candidates.push(...(TEZOS_RPC_FALLBACKS_BY_NETWORK[network] ?? []));
  }
  return [...new Set(candidates.map(normalizeRpcUrl).filter(Boolean))];
}

function parseChainId(raw: string): string {
  const text = raw.trim();
  try {
    return String(JSON.parse(text)).trim();
  } catch {
    return text.replace(/^"|"$/g, "");
  }
}

export async function probeRpcChainId(options: {
  network: PlatformWalletNetwork;
  rpcUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ chainId: string; rpcUrl: string }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_RPC_PROBE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const expectedChainId = TEZOS_CHAIN_ID_BY_NETWORK[options.network];
  const failures: string[] = [];

  for (const rpcUrl of rpcProbeCandidates(options.network, options.rpcUrl)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${rpcUrl}/chains/main/chain_id`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const chainId = parseChainId(await response.text());
      if (!chainId) throw new Error("empty chain id");
      if (expectedChainId && chainId !== expectedChainId) {
        throw new Error(`expected ${expectedChainId}, got ${chainId}`);
      }
      return { chainId, rpcUrl };
    } catch (error) {
      const reason = controller.signal.aborted
        ? `timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
      failures.push(`${rpcUrl}: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`Tezos RPC chain-id probe failed (${failures.join("; ")})`);
}
