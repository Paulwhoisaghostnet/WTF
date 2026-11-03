import { normalizeIpfsUri } from "@shared/ipfs-gateways";
import { objkt } from "../../lib/upstream";
import { type OwnedFa2Token } from "../../tzkt";
import { horseContractAddress } from "./horse-config";
import { approvedHorseTags, tokenQualifies, type ObjktToken } from "./model";

export const HORF_TRADER_TOKEN_QUERY = `query HorfTraderTokens($where: token_bool_exp!) {
  token(where: $where) {
    fa_contract token_id timestamp name description decimals thumbnail_uri display_uri
    tags { tag { name token_count } }
  }
}`;

export interface HorfTraderHorse {
  contract: string;
  tokenId: string;
  balance: string;
  mintedAt: string | null;
  name: string;
  description: string | null;
  image: string | null;
  creatorAddress: string | null;
}

type TokenKey = { contract: string; tokenId: string };

function key(value: TokenKey): string {
  return `${value.contract}/${value.tokenId}`;
}

function safeImage(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(normalizeIpfsUri(value));
    return url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

/** One Objkt query hydrates the current TzKT balance page with authoritative tags. */
export async function loadTraderObjktTokens(tokens: TokenKey[]): Promise<ObjktToken[]> {
  if (!tokens.length) return [];
  const response = await objkt.postJson<{
    data?: { token?: ObjktToken[] };
    errors?: Array<{ message?: string }>;
  }>("", {
    query: HORF_TRADER_TOKEN_QUERY,
    variables: { where: { _or: tokens.map((token) => ({
      fa_contract: { _eq: token.contract }, token_id: { _eq: token.tokenId },
    })) } },
  });
  if (response.errors?.length || !Array.isArray(response.data?.token)) {
    throw new Error("Objkt could not check trader horse tags");
  }
  return response.data.token;
}

/** Apply the same mint metadata and whole-edition test used for Horf trading. */
export function qualifyingTraderHorses(owned: OwnedFa2Token[], indexed: ObjktToken[]): HorfTraderHorse[] {
  const byKey = new Map<string, ObjktToken>();
  for (const token of indexed) {
    if (typeof token.fa_contract === "string" && typeof token.token_id === "string") {
      byKey.set(key({ contract: token.fa_contract, tokenId: token.token_id }), token);
    }
  }
  const rewardContract = horseContractAddress();
  return owned.flatMap((balance) => {
    if (balance.contract === rewardContract || !/^\d+$/.test(balance.balance) || BigInt(balance.balance) <= 0n) return [];
    const token = byKey.get(key(balance));
    if (!token || (token.decimals != null && token.decimals !== 0)) return [];
    const tags = (token.tags || []).map((item) => item.tag || {});
    if (!tokenQualifies(token, new Set(approvedHorseTags(tags)))) return [];
    return [{
      contract: balance.contract,
      tokenId: balance.tokenId,
      balance: balance.balance,
      mintedAt: typeof token.timestamp === "string" && Number.isFinite(Date.parse(token.timestamp))
        ? new Date(token.timestamp).toISOString() : null,
      name: String(token.name || balance.name || `Token #${balance.tokenId}`).trim() || `Token #${balance.tokenId}`,
      description: typeof token.description === "string" ? token.description : null,
      image: safeImage(token.thumbnail_uri || token.display_uri),
      creatorAddress: balance.creatorAddress || null,
    }];
  });
}

export function traderTokenKey(value: TokenKey): string { return key(value); }
export function traderTokenImage(value: ObjktToken): string | null { return safeImage(value.thumbnail_uri || value.display_uri); }
