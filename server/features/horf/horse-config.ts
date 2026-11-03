import { horfMainnetIndex } from "./mainnet-index";
import { isTezosWallet } from "./model";

export const HORF_HORSE_CHAIN_ID = "NetXdQprcVkpaWU";
export const HORF_HORSE_SOURCE_CONTRACT = "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD";
/** Confirmed Mainnet origination from wtf.tez, operation ooxwCZcJ72zsKbj8eZdqbGwxXhLyvi6Utk5QNxEWF8B8NtZ1SHa. */
export const HORF_HORSE_MAINNET_CONTRACT = "KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM";
export const HORF_HORSE_ORIGINATOR = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
// TzKT's immutable code hash for the exact $WTF contract cloned as $HORSE.
export const HORF_HORSE_CODE_HASH = 1454653741;
const CONTRACT_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

export interface HorfHorseConfig {
  status: "ready" | "unconfigured";
  network: "mainnet";
  chainId: typeof HORF_HORSE_CHAIN_ID;
  token: { contract: string; tokenId: "0"; decimals: 8; symbol: "HORSE" } | null;
  balanceRaw: string | null;
  asOf: string | null;
}

export interface HorseChainReader {
  getJson<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T>;
}

export interface HorfHorseActivity extends Omit<HorfHorseConfig, "balanceRaw"> {
  receivedRaw: string;
  sentRaw: string;
  awardedRaw: string;
}

export function horseContractAddress(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = String(env.HORF_HORSE_CONTRACT_ADDRESS === undefined
    ? HORF_HORSE_MAINNET_CONTRACT : env.HORF_HORSE_CONTRACT_ADDRESS).trim();
  if (!raw) return null;
  if (!CONTRACT_RE.test(raw)) throw new Error("Horf HORSE contract address is invalid");
  return raw;
}

function rawNat(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`Invalid ${label} in HORSE token index`);
  }
  return BigInt(value).toString();
}

export async function getHorfHorseConfig(
  address: string | null,
  reader: HorseChainReader = horfMainnetIndex,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HorfHorseConfig> {
  const contract = horseContractAddress(env);
  const empty: HorfHorseConfig = {
    status: "unconfigured", network: "mainnet", chainId: HORF_HORSE_CHAIN_ID,
    token: null, balanceRaw: null, asOf: null,
  };
  if (!contract) return empty;
  if (address !== null && !isTezosWallet(address)) throw new Error("Invalid HORSE balance wallet");
  const [head, indexedContract, tokens] = await Promise.all([
    reader.getJson<{ chainId?: string; timestamp?: string }>("/head"),
    reader.getJson<{ codeHash?: number; creator?: { address?: string } }>(`/contracts/${contract}`),
    reader.getJson<Array<{ contract?: { address?: string }; tokenId?: string; standard?: string; metadata?: Record<string, unknown> }>>(
      "/tokens", { contract, tokenId: "0", limit: 1 },
    ),
  ]);
  if (head.chainId !== HORF_HORSE_CHAIN_ID || indexedContract.codeHash !== HORF_HORSE_CODE_HASH ||
      indexedContract.creator?.address !== HORF_HORSE_ORIGINATOR) {
    throw new Error("HORSE token is not the expected wtf.tez Mainnet clone");
  }
  const token = tokens[0];
  if (!token || token.contract?.address !== contract || String(token.tokenId) !== "0" ||
      token.standard !== "fa2" || String(token.metadata?.symbol || "") !== "HORSE" ||
      Number(token.metadata?.decimals) !== 8) {
    throw new Error("HORSE token metadata is not verified yet");
  }
  let balanceRaw: string | null = null;
  if (address) {
    const balances = await reader.getJson<Array<{ account?: { address?: string }; token?: { contract?: { address?: string }; tokenId?: string }; balance?: string }>>(
      "/tokens/balances", { account: address, "token.contract": contract, "token.tokenId": "0", limit: 1 },
    );
    if (!Array.isArray(balances)) throw new Error("HORSE balance index was not an array");
    const balance = balances[0];
    if (balance && (balance.account?.address !== address || balance.token?.contract?.address !== contract ||
        String(balance.token?.tokenId) !== "0")) throw new Error("HORSE balance index did not filter by wallet");
    balanceRaw = balance ? rawNat(balance.balance, "balance") : "0";
  }
  return {
    status: "ready", network: "mainnet", chainId: HORF_HORSE_CHAIN_ID,
    token: { contract, tokenId: "0", decimals: 8, symbol: "HORSE" },
    balanceRaw, asOf: head.timestamp || null,
  };
}

interface TzktHorseTransfer {
  id?: number;
  token?: { contract?: { address?: string }; tokenId?: string };
  from?: { address?: string } | null;
  to?: { address?: string } | null;
  amount?: string;
}

let activityCacheHead: string | null = null;
const activityCache = new Map<string, Promise<{ incoming: { total: bigint; awarded: bigint }; outgoing: { total: bigint; awarded: bigint } }>>();

async function readHorseTransfers(
  contract: string,
  address: string,
  direction: "from" | "to",
  reader: HorseChainReader,
): Promise<{ total: bigint; awarded: bigint }> {
  let cursor = 0;
  let total = 0n;
  let awarded = 0n;
  // TzKT documents 100 as its default page size; cursor paging has no total cap.
  const pageSize = 100;
  while (true) {
    const rows = await reader.getJson<TzktHorseTransfer[]>("/tokens/transfers", {
      "token.contract": contract,
      "token.tokenId": "0",
      [direction]: address,
      "id.gt": cursor,
      "sort.asc": "id",
      limit: pageSize,
    });
    if (!Array.isArray(rows)) throw new Error("HORSE transfer index returned an invalid page");
    for (const row of rows) {
      const id = Number(row.id);
      if (!Number.isSafeInteger(id) || id <= cursor ||
          row.token?.contract?.address !== contract || String(row.token?.tokenId) !== "0" ||
          row[direction]?.address !== address) {
        throw new Error("HORSE transfer index did not follow its cursor or token filter");
      }
      cursor = id;
      // A wallet moving HORSE to itself creates no new participation receipt.
      if (row.from?.address === row.to?.address) continue;
      const amount = BigInt(rawNat(row.amount, "transfer amount"));
      total += amount;
      if (direction === "to" && row.from?.address === HORF_HORSE_ORIGINATOR &&
          address !== HORF_HORSE_ORIGINATOR) awarded += amount;
    }
    if (rows.length < pageSize) return { total, awarded };
  }
}

/** Cumulative receipts remain visible after a trader spends or gives HORSE onward. */
export async function getHorfHorseActivity(
  address: string,
  reader: HorseChainReader = horfMainnetIndex,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HorfHorseActivity> {
  if (!isTezosWallet(address)) throw new Error("Invalid HORSE activity wallet");
  const config = await getHorfHorseConfig(null, reader, env);
  if (!config.token) {
    return { status: "unconfigured", network: "mainnet", chainId: HORF_HORSE_CHAIN_ID,
      token: null, receivedRaw: "0", sentRaw: "0", awardedRaw: "0", asOf: null };
  }
  const load = () => Promise.all([
    readHorseTransfers(config.token!.contract, address, "to", reader),
    readHorseTransfers(config.token!.contract, address, "from", reader),
  ]).then(([incoming, outgoing]) => ({ incoming, outgoing }));
  let totals: Awaited<ReturnType<typeof load>>;
  if (reader === horfMainnetIndex && env === process.env && config.asOf) {
    if (activityCacheHead !== config.asOf) {
      activityCacheHead = config.asOf;
      activityCache.clear();
    }
    const key = `${config.token.contract}/${address}`;
    let pending = activityCache.get(key);
    if (!pending) {
      pending = load();
      activityCache.set(key, pending);
      pending.catch(() => { if (activityCache.get(key) === pending) activityCache.delete(key); });
    }
    totals = await pending;
  } else {
    totals = await load();
  }
  const { incoming, outgoing } = totals;
  return {
    status: "ready", network: "mainnet", chainId: HORF_HORSE_CHAIN_ID,
    token: config.token, receivedRaw: incoming.total.toString(),
    sentRaw: outgoing.total.toString(), awardedRaw: incoming.awarded.toString(),
    asOf: config.asOf,
  };
}
