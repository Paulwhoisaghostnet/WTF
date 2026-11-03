import { normalizeIpfsUri } from "@shared/ipfs-gateways";
import { objkt } from "../../../lib/upstream";
import { approvedHorseTags, tokenQualifies, type ObjktToken } from "../model";
import { HORF_MAINNET_BLOCK_MS } from "../mainnet";

export const HORF_STABLE_TOKEN_QUERY = `query HorfStableToken($contract: String!, $tokenId: String!) {
  token(where: { fa_contract: { _eq: $contract }, token_id: { _eq: $tokenId } }, limit: 1) {
    fa_contract
    token_id
    name
    description
    decimals
    thumbnail_uri
    display_uri
    tags { tag { name token_count } }
  }
}`;

interface GraphqlEnvelope {
  data?: { token?: ObjktToken[] };
  errors?: Array<{ message?: string }>;
}

export class HorseTokenNotFoundError extends Error {}
export class HorseTokenIneligibleError extends Error {}

export type TokenLoader = (contract: string, tokenId: string) => Promise<ObjktToken | null>;

export const loadObjktToken: TokenLoader = async (contract, tokenId) => {
  const response = await objkt.postJson<GraphqlEnvelope>("", {
    query: HORF_STABLE_TOKEN_QUERY,
    variables: { contract, tokenId },
  });
  if (response.errors?.length || !Array.isArray(response.data?.token)) {
    throw new Error("Objkt could not validate this horse token");
  }
  return response.data.token[0] ?? null;
};

const publicEligibilityCache = new Map<string, { expiresAt: number; value: Promise<Awaited<ReturnType<typeof inspectHorseToken>>> }>();
/** Repeated public previews share Objkt work for one Mainnet block interval. */
export function inspectHorseTokenCached(contract: string, tokenId: string) {
  const now = Date.now();
  for (const [key, entry] of publicEligibilityCache) {
    if (entry.expiresAt <= now) publicEligibilityCache.delete(key);
  }
  const key = `${contract}/${tokenId}`;
  const cached = publicEligibilityCache.get(key);
  if (cached) return cached.value;
  const value = inspectHorseToken(contract, tokenId);
  publicEligibilityCache.set(key, { expiresAt: now + HORF_MAINNET_BLOCK_MS, value });
  value.catch(() => { if (publicEligibilityCache.get(key)?.value === value) publicEligibilityCache.delete(key); });
  return value;
}

function safeImage(uri: string | null | undefined): string | null {
  const raw = String(uri || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(normalizeIpfsUri(raw));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Fresh Objkt metadata and tag counts are checked for every permit request. */
export async function inspectHorseToken(
  contract: string,
  tokenId: string,
  loadToken: TokenLoader = loadObjktToken,
) {
  const token = await loadToken(contract, tokenId);
  if (!token || token.fa_contract !== contract || token.token_id !== tokenId) {
    throw new HorseTokenNotFoundError("Token was not found in Objkt's Tezos mainnet index");
  }
  if (token.decimals != null && token.decimals !== 0) {
    throw new HorseTokenIneligibleError("Horse stable deposits require whole-token FA2 editions");
  }
  const tags = (token.tags || []).map((item) => item.tag || {});
  const approved = new Set(approvedHorseTags(tags));
  if (!tokenQualifies(token, approved)) {
    throw new HorseTokenIneligibleError("This token has no qualifying horse mint keyword or Objkt tag group");
  }
  return {
    contract,
    tokenId,
    name: String(token.name || `Token #${tokenId}`).trim() || `Token #${tokenId}`,
    image: safeImage(token.thumbnail_uri || token.display_uri),
  };
}
