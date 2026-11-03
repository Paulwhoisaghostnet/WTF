import { setTimeout as wait } from "node:timers/promises";
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

export class PinnedRpcChainMismatch extends Error {}

/** Resolve the contract through a same-chain RPC before any transaction is
 * prepared. Only the configured primary and its project fallback are tried.
 */
export async function preparePinnedWtfIapRpc<T>(options: {
  network: PlatformWalletNetwork;
  rpcUrl: string;
  expectedChainId: string;
  connect: (rpcUrl: string) => {
    getChainId: () => Promise<string>;
    prepare: () => Promise<T>;
  };
}): Promise<{ rpcUrl: string; value: T }> {
  let lastError: unknown;
  for (const rpcUrl of rpcProbeCandidates(options.network, options.rpcUrl)) {
    try {
      const connection = options.connect(rpcUrl);
      const chainId = await connection.getChainId();
      if (chainId !== options.expectedChainId) {
        throw new PinnedRpcChainMismatch(
          `WTFIAP RPC ${rpcUrl} returned ${chainId}, expected ${options.expectedChainId}`);
      }
      return { rpcUrl, value: await connection.prepare() };
    } catch (error) {
      if (error instanceof PinnedRpcChainMismatch) throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error("No configured WTFIAP RPC is available");
}

type WtfIapReadRpc = {
  getChainId: () => Promise<string>;
  getBlockHeader: (options: { block: string }) => Promise<{ level: number | string }>;
  getConstants: (options: { block: string }) => Promise<{ max_operations_time_to_live?: number | string }>;
  getBlockHash: (options: { block: string }) => Promise<string>;
  getBlock: (options: { block: string }) => Promise<{
    hash: string;
    operations: Array<Array<{ hash: string }>>;
  }>;
};

/** Read only: scan from the signed branch until inclusion or the protocol's
 * operation TTL expires. The same signed hash is never injected here.
 */
export async function awaitPinnedWtfIapInclusion(options: {
  network: PlatformWalletNetwork;
  rpcUrl: string;
  expectedChainId: string;
  operationHash: string;
  branchHash: string;
  connect: (rpcUrl: string) => WtfIapReadRpc;
  signal?: AbortSignal;
  waitForNextHead?: () => Promise<void>;
}): Promise<"included" | "expired"> {
  const candidates = rpcProbeCandidates(options.network, options.rpcUrl);
  type Cursor = { branchLevel: number; horizon: number; lastLevel: number; lastHash: string };
  const cursors = new Map<string, Cursor>();
  let activeRpcUrl: string | undefined;
  for (;;) {
    if (options.signal?.aborted) throw options.signal.reason;
    let scannedExpired = false;
    let scannedBeforeExpiry = false;
    for (const rpcUrl of candidates) {
      try {
        const rpc = options.connect(rpcUrl);
        const chainId = await rpc.getChainId();
        if (chainId !== options.expectedChainId) {
          throw new PinnedRpcChainMismatch(
            `WTFIAP confirmation RPC ${rpcUrl} returned ${chainId}, expected ${options.expectedChainId}`);
        }
        const [branch, constants, head] = await Promise.all([
          rpc.getBlockHeader({ block: options.branchHash }),
          rpc.getConstants({ block: options.branchHash }),
          rpc.getBlockHeader({ block: "head" }),
        ]);
        const branchLevel = Number(branch.level);
        const headLevel = Number(head.level);
        const ttl = Number(constants.max_operations_time_to_live);
        if (![branchLevel, headLevel, ttl].every(Number.isSafeInteger) || ttl <= 0 ||
            headLevel < branchLevel) throw new Error("Invalid WTFIAP confirmation horizon");
        const horizon = branchLevel + ttl;
        const lastPossibleLevel = Math.min(headLevel, horizon);
        const expired = headLevel > horizon;
        let cursor = activeRpcUrl === rpcUrl ? cursors.get(rpcUrl) : undefined;
        if (cursor && (cursor.branchLevel !== branchLevel || cursor.horizon !== horizon ||
            cursor.lastLevel > lastPossibleLevel ||
            await rpc.getBlockHash({ block: String(cursor.lastLevel) }) !== cursor.lastHash)) {
          cursors.delete(rpcUrl);
          cursor = undefined;
        }
        // Normal heads need only new blocks after a stable last-block hash.
        // Expiry always gets an exhaustive scan, even on a steady endpoint.
        const startLevel = expired ? branchLevel + 1 : (cursor?.lastLevel ?? branchLevel) + 1;
        let lastHash = cursor?.lastHash;
        for (let level = startLevel; level <= lastPossibleLevel; level++) {
          if (options.signal?.aborted) throw options.signal.reason;
          const block = await rpc.getBlock({ block: String(level) });
          if (!block.hash) throw new Error("WTFIAP confirmation block hash missing");
          if (block.operations.some(pass => pass.some(operation =>
            operation.hash === options.operationHash))) {
            if (await rpc.getBlockHash({ block: String(level) }) === block.hash) return "included";
            throw new Error("WTFIAP confirmation fork changed during scan");
          }
          lastHash = block.hash;
        }
        if (lastPossibleLevel > branchLevel) {
          if (await rpc.getBlockHash({ block: String(lastPossibleLevel) }) !== lastHash)
            throw new Error("WTFIAP confirmation fork changed during scan");
          cursors.set(rpcUrl, { branchLevel, horizon,
            lastLevel: lastPossibleLevel, lastHash: lastHash! });
        }
        activeRpcUrl = rpcUrl;
        if (expired) scannedExpired = true;
        else { scannedBeforeExpiry = true; break; }
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason;
        // A wrong-chain or unavailable reader cannot confirm inclusion. Try the
        // next configured endpoint, and keep the wallet lane held if all fail.
      }
    }
    if (scannedExpired && !scannedBeforeExpiry) return "expired";
    await (options.waitForNextHead?.() ?? wait(DEFAULT_RPC_PROBE_TIMEOUT_MS,
      undefined, { signal: options.signal }));
  }
}
