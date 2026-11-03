import { horfMainnetIndex } from "../mainnet-index";
import { isTezosWallet } from "../model";
import type { ChainReader } from "./chain";

// TzKT's documented default page size is 100. Cursor paging has no total cap.
export const HORF_CLAIM_PAGE_SIZE = 100;

interface TzktEvent {
  id?: number;
  timestamp?: string;
  contract?: { address?: string };
  tag?: string | null;
  payload?: unknown;
}

export interface HorfStableClaim {
  id: number;
  timestamp: string;
  from: string;
  to: string;
  mode: 0 | 1 | 2;
  token: { contract: string; tokenId: string };
}

function nat(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim()
    : typeof value === "number" && Number.isSafeInteger(value) ? String(value)
    : "";
  if (!/^\d+$/.test(text)) throw new Error(`Invalid ${label} in Horf stable claim event`);
  return BigInt(text).toString();
}

export function buildHorfClaimEventParams(
  contractAddress: string,
  after: number,
  since: string,
  until: string | null,
) {
  return {
    contract: contractAddress,
    tag: "horse_claimed",
    "id.gt": after,
    "timestamp.ge": since,
    ...(until ? { "timestamp.lt": until } : {}),
    "sort.asc": "id",
    limit: HORF_CLAIM_PAGE_SIZE,
  };
}

export function normalizeHorfStableClaimEvent(
  row: TzktEvent,
  contractAddress: string,
  since: string,
  until: string | null,
): HorfStableClaim {
  const id = Number(row.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid TzKT Horf claim event ID");
  if (row.contract?.address !== contractAddress || row.tag !== "horse_claimed") {
    throw new Error("Unexpected TzKT Horf claim event source");
  }
  const time = Date.parse(String(row.timestamp || ""));
  if (!Number.isFinite(time) || time < Date.parse(since) || (until && time >= Date.parse(until))) {
    throw new Error("TzKT Horf claim event escaped its season window");
  }
  if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) {
    throw new Error("Invalid TzKT Horf claim payload");
  }
  const payload = row.payload as Record<string, unknown>;
  nat(payload.listing_id, "listing ID");
  const from = String(payload.owner || "");
  const to = String(payload.claimant || "");
  const contract = String(payload.token_contract || "");
  if (!isTezosWallet(from) || !isTezosWallet(to) || from === to ||
      !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(contract)) {
    throw new Error("Invalid wallet or FA2 contract in TzKT Horf claim event");
  }
  const mode = Number(nat(payload.mode, "stable mode"));
  if (mode !== 0 && mode !== 1 && mode !== 2) throw new Error("Unknown Horf stable mode in claim event");
  return {
    id,
    timestamp: new Date(time).toISOString(),
    from,
    to,
    mode,
    token: { contract, tokenId: nat(payload.token_id, "token ID") },
  };
}

export async function fetchHorfClaimEventPage(
  contractAddress: string,
  after: number,
  since: string,
  until: string | null,
  reader: ChainReader = horfMainnetIndex,
): Promise<HorfStableClaim[]> {
  const rows = await reader.getJson<TzktEvent[]>(
    "/contracts/events",
    buildHorfClaimEventParams(contractAddress, after, since, until),
  );
  if (!Array.isArray(rows)) throw new Error("TzKT Horf claim page was not an array");
  let cursor = after;
  return rows.map((row) => {
    const claim = normalizeHorfStableClaimEvent(row, contractAddress, since, until);
    if (claim.id <= cursor) throw new Error("TzKT Horf claim cursor did not advance");
    cursor = claim.id;
    return claim;
  });
}

export function isLastHorfClaimEventPage(page: readonly HorfStableClaim[]): boolean {
  return page.length < HORF_CLAIM_PAGE_SIZE;
}
