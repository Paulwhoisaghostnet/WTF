import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { userWallets, walletHoldings } from "@shared/schema";
import { getOwnedFa2TokensPage } from "../../tzkt";

export interface TezosOwnershipPredicateParams {
  userId: number;
  walletAddress?: string | null;
  contractAddress?: string | null;
  contractAddresses?: string[];
  tokenId?: string | number | null;
  tokenIds?: Array<string | number>;
  minimumQuantity?: string | number | null;
}

export interface TezosOwnershipResult {
  satisfied: boolean;
  walletAddress?: string | null;
  matchedTokens: Array<{
    walletAddress: string;
    contractAddress: string;
    tokenId: string;
    balance: string;
    source: "wallet_holdings" | "tzkt";
  }>;
  checkedWallets: string[];
}

type OwnershipMode =
  | "any_from_contract"
  | "specific_token_id"
  | "minimum_quantity"
  | "one_of_contracts"
  | "one_of_token_ids"
  | "all_token_ids";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function minimumQuantity(value: unknown): bigint {
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.max(1, Math.floor(value)));
  }
  if (typeof value === "string" && value.trim()) {
    try {
      return BigInt(value.trim());
    } catch {
      return 1n;
    }
  }
  return 1n;
}

function balanceAtLeast(balance: string, min: bigint): boolean {
  try {
    return BigInt(balance) >= min;
  } catch {
    const numeric = Number(balance);
    return Number.isFinite(numeric) && numeric >= Number(min);
  }
}

async function getLinkedWallets(userId: number, walletAddress?: string | null) {
  const where = walletAddress
    ? and(eq(userWallets.userId, userId), eq(userWallets.walletAddress, walletAddress))
    : eq(userWallets.userId, userId);

  return db
    .select({ walletAddress: userWallets.walletAddress })
    .from(userWallets)
    .where(where);
}

function normalizeParams(params: TezosOwnershipPredicateParams) {
  const contractAddresses = [
    ...(params.contractAddress ? [String(params.contractAddress)] : []),
    ...asStringArray(params.contractAddresses),
  ];
  const tokenIds = [
    ...(params.tokenId !== undefined && params.tokenId !== null
      ? [String(params.tokenId)]
      : []),
    ...asStringArray(params.tokenIds),
  ];
  return {
    contractAddresses: Array.from(new Set(contractAddresses.filter(Boolean))),
    tokenIds: Array.from(new Set(tokenIds.filter(Boolean))),
    minQuantity: minimumQuantity(params.minimumQuantity),
  };
}

function tokenMatches(
  mode: OwnershipMode,
  token: { contractAddress: string; tokenId: string; balance: string },
  params: ReturnType<typeof normalizeParams>
): boolean {
  const contractMatch =
    params.contractAddresses.length === 0 ||
    params.contractAddresses.includes(token.contractAddress);
  const tokenMatch =
    params.tokenIds.length === 0 || params.tokenIds.includes(token.tokenId);

  if (!balanceAtLeast(token.balance, params.minQuantity)) return false;

  switch (mode) {
    case "any_from_contract":
      return contractMatch;
    case "specific_token_id":
    case "minimum_quantity":
      return contractMatch && tokenMatch;
    case "one_of_contracts":
      return params.contractAddresses.includes(token.contractAddress);
    case "one_of_token_ids":
      return contractMatch && params.tokenIds.includes(token.tokenId);
    case "all_token_ids":
      return contractMatch && params.tokenIds.includes(token.tokenId);
    default:
      return false;
  }
}

async function findLocalMatches(
  userId: number,
  wallets: string[],
  mode: OwnershipMode,
  params: ReturnType<typeof normalizeParams>
): Promise<TezosOwnershipResult["matchedTokens"]> {
  const conditions = [
    eq(walletHoldings.userId, userId),
    sql`${walletHoldings.balance}::numeric > 0`,
  ];
  if (wallets.length === 1) {
    conditions.push(eq(walletHoldings.walletAddress, wallets[0]!));
  }

  const rows = await db
    .select({
      walletAddress: walletHoldings.walletAddress,
      tokenContract: walletHoldings.tokenContract,
      tokenId: walletHoldings.tokenId,
      balance: walletHoldings.balance,
    })
    .from(walletHoldings)
    .where(and(...conditions));

  return rows
    .filter((row) =>
      tokenMatches(
        mode,
        {
          contractAddress: row.tokenContract,
          tokenId: row.tokenId,
          balance: row.balance,
        },
        params
      )
    )
    .map((row) => ({
      walletAddress: row.walletAddress,
      contractAddress: row.tokenContract,
      tokenId: row.tokenId,
      balance: row.balance,
      source: "wallet_holdings" as const,
    }));
}

async function findTzktMatches(
  wallets: string[],
  mode: OwnershipMode,
  params: ReturnType<typeof normalizeParams>
): Promise<TezosOwnershipResult["matchedTokens"]> {
  const matches: TezosOwnershipResult["matchedTokens"] = [];
  for (const walletAddress of wallets) {
    let offset = 0;
    for (let page = 0; page < 10; page += 1) {
      const pageResult = await getOwnedFa2TokensPage(walletAddress, 500, offset);
      for (const token of pageResult.items) {
        const contractAddress = token.contract;
        if (
          tokenMatches(
            mode,
            {
              contractAddress,
              tokenId: token.tokenId,
              balance: token.balance,
            },
            params
          )
        ) {
          matches.push({
            walletAddress,
            contractAddress,
            tokenId: token.tokenId,
            balance: token.balance,
            source: "tzkt",
          });
        }
      }
      if (!pageResult.hasMore) break;
      offset = pageResult.nextOffset;
    }
  }
  return matches;
}

function allRequiredTokenIdsSatisfied(
  matches: TezosOwnershipResult["matchedTokens"],
  params: ReturnType<typeof normalizeParams>
): boolean {
  if (params.tokenIds.length === 0) return matches.length > 0;
  const found = new Set(matches.map((token) => token.tokenId));
  return params.tokenIds.every((tokenId) => found.has(tokenId));
}

export async function verifyTezosOwnership(
  mode: OwnershipMode,
  rawParams: TezosOwnershipPredicateParams
): Promise<TezosOwnershipResult> {
  const walletRows = await getLinkedWallets(rawParams.userId, rawParams.walletAddress);
  const checkedWallets = walletRows.map((row) => row.walletAddress);
  if (checkedWallets.length === 0) {
    return { satisfied: false, matchedTokens: [], checkedWallets };
  }

  const params = normalizeParams(rawParams);
  let localMatches: TezosOwnershipResult["matchedTokens"] = [];
  try {
    localMatches = await findLocalMatches(
      rawParams.userId,
      checkedWallets,
      mode,
      params
    );
  } catch (err) {
    console.warn(
      "[challenge-automation] wallet_holdings ownership lookup failed; falling back to TzKT",
      err
    );
  }
  const localSatisfied =
    mode === "all_token_ids"
      ? allRequiredTokenIdsSatisfied(localMatches, params)
      : localMatches.length > 0;
  if (localSatisfied) {
    return {
      satisfied: true,
      walletAddress: localMatches[0]?.walletAddress ?? checkedWallets[0],
      matchedTokens: localMatches,
      checkedWallets,
    };
  }

  const tzktMatches = await findTzktMatches(checkedWallets, mode, params);
  const tzktSatisfied =
    mode === "all_token_ids"
      ? allRequiredTokenIdsSatisfied(tzktMatches, params)
      : tzktMatches.length > 0;

  return {
    satisfied: tzktSatisfied,
    walletAddress: tzktMatches[0]?.walletAddress ?? checkedWallets[0],
    matchedTokens: [...localMatches, ...tzktMatches],
    checkedWallets,
  };
}
