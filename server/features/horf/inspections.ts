import { horfMainnetIndex } from "./mainnet-index";
import { loadObjktToken, inspectHorseToken, HorseTokenIneligibleError, HorseTokenNotFoundError, type TokenLoader } from "./stables/eligibility";
import { readHorfFa2Identity, type HorfFa2Identity } from "./stables/custody";
import { HORF_MAINNET_CHAIN_ID } from "./stables/config";
import { isTezosWallet } from "./model";

export class HorfTokenNotOwnedError extends Error {}

export interface HorfInspectionEvidence {
  objktMetadata: Record<string, unknown>;
  chainEvidence: Record<string, unknown>;
}

export interface InspectionSources {
  readIndex: typeof horfMainnetIndex.getJson;
  loadToken: TokenLoader;
  readIdentity: (contract: string) => Promise<HorfFa2Identity>;
}

const defaultSources: InspectionSources = {
  readIndex: horfMainnetIndex.getJson.bind(horfMainnetIndex), loadToken: loadObjktToken, readIdentity: readHorfFa2Identity,
};

/** Fresh TzKT balance, bypassing the portfolio cache used for public browsing. */
export async function assertCurrentOwner(
  address: string, contract: string, tokenId: string,
  readIndex: typeof horfMainnetIndex.getJson = horfMainnetIndex.getJson.bind(horfMainnetIndex),
): Promise<string> {
  if (!isTezosWallet(address)) throw new HorfTokenNotOwnedError("A verified Tezos wallet is required");
  const [head, balances] = await Promise.all([
    readIndex<{ chainId?: string }>("/head"),
    readIndex<Array<{ account?: { address?: string }; token?: { contract?: { address?: string }; tokenId?: string }; balance?: string }>>(
      "/tokens/balances", { account: address, "token.contract": contract, "token.tokenId": tokenId, "balance.gt": 0, limit: 1 },
    ),
  ]);
  if (head.chainId !== HORF_MAINNET_CHAIN_ID || !Array.isArray(balances)) {
    throw new Error("Tezos Mainnet ownership index is unavailable");
  }
  const row = balances[0];
  if (!row || row.account?.address !== address || row.token?.contract?.address !== contract ||
      String(row.token?.tokenId) !== tokenId || typeof row.balance !== "string" ||
      !/^\d+$/.test(row.balance) || BigInt(row.balance) <= 0n) {
    throw new HorfTokenNotOwnedError("This wallet does not currently hold the horse token on Tezos Mainnet");
  }
  return BigInt(row.balance).toString();
}

/** Evidence for human judgment, not a proof of honest FA2 transfer semantics. */
export async function loadInspectionEvidence(
  address: string | null, contract: string, tokenId: string,
  sources: InspectionSources = defaultSources,
): Promise<HorfInspectionEvidence> {
  const [balance, rawToken, identity, transfers] = await Promise.all([
    address ? assertCurrentOwner(address, contract, tokenId, sources.readIndex) : Promise.resolve(null),
    sources.loadToken(contract, tokenId),
    sources.readIdentity(contract),
    // TzKT's documented default page is 100. This is a recent evidence sample,
    // never a custody attestation or a complete transfer history.
    sources.readIndex<Array<{ id?: number; token?: { contract?: { address?: string }; tokenId?: string }; from?: { address?: string }; to?: { address?: string }; amount?: string; timestamp?: string; transactionId?: number }>>(
      "/tokens/transfers", { "token.contract": contract, "token.tokenId": tokenId, "sort.desc": "id", limit: 100 },
    ),
  ]);
  if (!rawToken) throw new HorseTokenNotFoundError("Token was not found in Objkt's Tezos mainnet index");
  const eligible = await inspectHorseToken(contract, tokenId, async () => rawToken);
  if (!Array.isArray(transfers)) throw new Error("Mainnet FA2 transfer evidence is unavailable");
  const sample = transfers.map((row) => {
    if (row.token?.contract?.address !== contract || String(row.token?.tokenId) !== tokenId ||
        !Number.isSafeInteger(row.id) || !row.timestamp) {
      throw new Error("FA2 transfer evidence did not match the inspected token");
    }
    return { id: row.id, transactionId: row.transactionId ?? null, from: row.from?.address ?? null,
      to: row.to?.address ?? null, amount: row.amount ?? null, timestamp: row.timestamp };
  });
  return {
    objktMetadata: {
      source: "Objkt Tezos Mainnet GraphQL", checkedAt: new Date().toISOString(),
      name: eligible.name, description: rawToken.description ?? null, image: eligible.image,
      decimals: rawToken.decimals ?? null,
      tags: (rawToken.tags || []).map((row) => ({ name: row.tag?.name ?? null, tokenCount: row.tag?.token_count ?? null })),
    },
    chainEvidence: {
      source: "Tezos Mainnet TzKT and RPC", checkedAt: new Date().toISOString(),
      ownerAddress: address, ownerBalance: balance, identity,
      recentTransfers: sample,
      note: address
        ? "Indexed holdings and transfer rows inform human review; they do not prove that an FA2 implementation transfers custody honestly."
        : "Marshal-initiated Open Range review has no owner submission or owner-balance claim. Indexed transfer rows inform human review; they do not prove that an FA2 implementation transfers custody honestly.",
    },
  };
}

export { HorseTokenIneligibleError, HorseTokenNotFoundError };
