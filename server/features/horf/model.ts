import { normalizeIpfsUri } from "@shared/ipfs-gateways";

export const HORF_SEASON_START = "2026-11-01T00:00:00.000Z";
export const HORF_SEASON_LABEL = "Neighvember 2026";

// Objkt's `tag` index is queried with this expression; the classifier below
// makes the final semantic decision so `neighbor`, `nightmare`, etc. do not count.
export const HORF_CANDIDATE_REGEX =
  "horse|horf|haha|neigh|pony|ponies|stallion|foal|equine|unicorn|pegasus|gallop|mustang|mare|colt|filly|equestrian|saddle|hoof|hooves|bridle|canter|donkey";

const TEZOS_WALLET_RE = /^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$/;
const TOKEN_CONTRACT_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
// Tezos documents this as a null address with no underlying account.
const TEZOS_BURN_ADDRESS = "tz1burnburnburnburnburnburnburjAYjjX";
// A keyword is a whole mint tag/word, one of the listed horse compounds, or
// that form with a four-digit year. Raw substrings would admit `shahabvfx`
// through `haha` and `horsepower` through `horse`.
const EXPLICIT_KEYWORD_RE = /(?:^|[^a-z0-9])(?:horse(?:[\s_-]*art|[\s_-]*trad(?:e|er(?:s)?|ing)|[\s_-]*of[\s_-]*july)?|haha|horf|neighvember)(?:[\s#_-]*\d{4})?(?=$|[^a-z0-9])/i;
const HORSE_TAG_WORDS = new Set([
  "pony", "ponies", "stallion", "stallions", "foal", "foals", "equine",
  "equines", "unicorn", "unicorns", "pegasus", "gallop", "galloping",
  "mustang", "mustangs", "mare", "mares", "colt", "colts", "filly",
  "fillies", "equestrian", "saddle", "saddles", "hoof", "hooves",
  "bridle", "canter", "cantering", "donkey", "donkeys", "neigh",
  "neighing", "neighs",
]);

export interface ObjktTag {
  name?: string | null;
  token_count?: number | null;
}

export interface ObjktToken {
  fa_contract?: string | null;
  token_id?: string | null;
  timestamp?: string | null;
  name?: string | null;
  description?: string | null;
  thumbnail_uri?: string | null;
  display_uri?: string | null;
  artifact_uri?: string | null;
  mime?: string | null;
  decimals?: number | null;
  tags?: Array<{ tag?: ObjktTag | null }> | null;
}

export interface ObjktTransferEvent {
  id?: number | null;
  ophash?: string | null;
  event_type?: string | null;
  marketplace_event_type?: string | null;
  marketplace_contract?: string | null;
  reverted?: boolean | null;
  timestamp?: string | null;
  creator_address?: string | null;
  recipient_address?: string | null;
  amount?: number | string | null;
  token?: ObjktToken | null;
}

export interface HorfTransfer {
  id: number;
  operationHash?: string | null;
  timestamp: string;
  from: string;
  to: string;
  amount: number;
  token: { contract: string; tokenId: string; name: string; image: string | null };
  /** Pool claims count as trades, but their deposit/credit rules settle the return. */
  settlement?: "stable" | "gift" | "market" | "objkt";
  stableMode?: 0 | 1 | 2;
}

export function isTezosWallet(value: unknown): value is string {
  return typeof value === "string" && TEZOS_WALLET_RE.test(value) && value !== TEZOS_BURN_ADDRESS;
}

function normalizedTag(value: unknown): string {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/^#+\s*/, "");
}

export function isHorseRelatedTag(name: unknown): boolean {
  const tag = normalizedTag(name);
  if (!tag) return false;
  if (EXPLICIT_KEYWORD_RE.test(tag)) return true;
  if (tag.includes("horse") && !tag.includes("horsepower")) return true;
  return tag.split(/[^a-z]+/).some((word) => HORSE_TAG_WORDS.has(word));
}

/** The listed mint keywords always qualify; extra horse family tags need >5 Objkt tokens. */
export function tokenQualifies(token: ObjktToken, approvedTags: ReadonlySet<string>): boolean {
  const text = `${token.name || ""} ${token.description || ""}`.normalize("NFKC");
  if (EXPLICIT_KEYWORD_RE.test(text)) return true;
  for (const item of token.tags || []) {
    const tag = normalizedTag(item?.tag?.name);
    if (!tag) continue;
    if (EXPLICIT_KEYWORD_RE.test(tag)) return true;
    if (approvedTags.has(tag) && isHorseRelatedTag(tag)) return true;
  }
  return false;
}

export function approvedHorseTags(tags: ObjktTag[]): string[] {
  return Array.from(new Set(tags
    .filter((tag) => Number(tag.token_count) > 5 && isHorseRelatedTag(tag.name))
    .map((tag) => normalizedTag(tag.name))
    .filter((tag) => !EXPLICIT_KEYWORD_RE.test(tag)))).sort();
}

function safeImage(uri: string | null | undefined): string | null {
  const raw = String(uri || "").trim();
  if (!raw) return null;
  const normalized = normalizeIpfsUri(raw);
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeHorfTransfer(
  event: ObjktTransferEvent,
  approvedTags: ReadonlySet<string>,
  seasonStart = HORF_SEASON_START,
  seasonEnd: string | null = null,
  excludedContract: string | null = null,
): HorfTransfer | null {
  if (event.event_type !== "transfer" || event.reverted !== false) return null;
  if (event.marketplace_event_type || event.marketplace_contract) return null;
  if (!isTezosWallet(event.creator_address) || !isTezosWallet(event.recipient_address)) return null;
  if (event.creator_address === event.recipient_address) return null;
  const token = event.token;
  if (!token || !tokenQualifies(token, approvedTags)) return null;
  // The HORSE reward currency is not itself a traded horse artwork.
  if (excludedContract && token.fa_contract === excludedContract) return null;
  if (token.decimals != null && token.decimals !== 0) return null;
  if (!TOKEN_CONTRACT_RE.test(String(token.fa_contract || ""))) return null;
  const timestamp = String(event.timestamp || "");
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time) || time < Date.parse(seasonStart)) return null;
  if (seasonEnd && time >= Date.parse(seasonEnd)) return null;
  const id = Number(event.id);
  const amount = Number(event.amount);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  const tokenId = String(token.token_id || "").trim();
  if (!tokenId) return null;
  return {
    id,
    operationHash: typeof event.ophash === "string" && /^o[0-9A-Za-z]{50}$/.test(event.ophash)
      ? event.ophash : null,
    timestamp: new Date(time).toISOString(),
    from: event.creator_address,
    to: event.recipient_address,
    amount,
    token: {
      contract: token.fa_contract!,
      tokenId,
      name: String(token.name || `Token #${tokenId}`).trim() || `Token #${tokenId}`,
      image: safeImage(token.thumbnail_uri || token.display_uri),
    },
  };
}

export interface HorfLeaderboardEntry {
  address: string;
  name: null;
  trades: number;
  received: number;
  sent: number;
}

export interface HorfCurrentUser extends HorfLeaderboardEntry {
  owedTo: Array<{ address: string; name: null; count: number }>;
  owedBy: Array<{ address: string; name: null; count: number }>;
  waitingHorses: Array<{
    id: number;
    timestamp: string;
    from: string;
    token: HorfTransfer["token"];
    amount: number;
  }>;
  recent: Array<{
    id: number;
    timestamp: string;
    direction: "in" | "out";
    counterparty: string;
    token: HorfTransfer["token"];
    amount: number;
    settlement?: "stable" | "gift" | "market" | "objkt";
    stableMode?: 0 | 1 | 2;
  }>;
}

export function summarizeSeason(transfers: HorfTransfer[], address: string | null): {
  leaderboard: HorfLeaderboardEntry[];
  currentUser: HorfCurrentUser | null;
} {
  const totals = new Map<string, { received: number; sent: number }>();
  const pair = new Map<string, {
    sendCredit: number;
    waiting: HorfCurrentUser["waitingHorses"];
  }>();
  const recent: HorfCurrentUser["recent"] = [];
  for (const transfer of [...transfers].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id - b.id)) {
    const sender = totals.get(transfer.from) || { received: 0, sent: 0 };
    sender.sent += transfer.amount;
    totals.set(transfer.from, sender);
    const recipient = totals.get(transfer.to) || { received: 0, sent: 0 };
    recipient.received += transfer.amount;
    totals.set(transfer.to, recipient);
    if (address === transfer.from || address === transfer.to) {
      const counterparty = address === transfer.from ? transfer.to : transfer.from;
      if (!transfer.settlement) {
        const account = pair.get(counterparty) || { sendCredit: 0, waiting: [] };
        if (address === transfer.from) {
          let units = transfer.amount;
          while (units > 0 && account.waiting.length) {
            const oldest = account.waiting[0]!;
            const used = Math.min(units, oldest.amount);
            units -= used;
            oldest.amount -= used;
            if (oldest.amount === 0) account.waiting.shift();
          }
          account.sendCredit += units;
        } else {
          const coveredByCredit = Math.min(transfer.amount, account.sendCredit);
          account.sendCredit -= coveredByCredit;
          const units = transfer.amount - coveredByCredit;
          if (units > 0) account.waiting.push({
            id: transfer.id,
            timestamp: transfer.timestamp,
            from: transfer.from,
            token: transfer.token,
            amount: units,
          });
        }
        pair.set(counterparty, account);
      }
      recent.push({
        id: transfer.id,
        timestamp: transfer.timestamp,
        direction: address === transfer.from ? "out" : "in",
        counterparty,
        token: transfer.token,
        amount: transfer.amount,
        ...(transfer.settlement ? { settlement: transfer.settlement } : {}),
        ...(transfer.stableMode !== undefined ? { stableMode: transfer.stableMode } : {}),
      });
    }
  }
  const leaderboard = Array.from(totals, ([wallet, counts]) => ({
    address: wallet,
    name: null,
    received: counts.received,
    sent: counts.sent,
    trades: counts.received + counts.sent,
  })).sort((a, b) => b.trades - a.trades || b.received - a.received || a.address.localeCompare(b.address));
  if (!address) return { leaderboard, currentUser: null };
  const own = totals.get(address) || { received: 0, sent: 0 };
  const owedTo: HorfCurrentUser["owedTo"] = [];
  const owedBy: HorfCurrentUser["owedBy"] = [];
  const waitingHorses: HorfCurrentUser["waitingHorses"] = [];
  for (const [counterparty, account] of pair) {
    const waitingCount = account.waiting.reduce((sum, receipt) => sum + receipt.amount, 0);
    if (waitingCount > 0) owedTo.push({ address: counterparty, name: null, count: waitingCount });
    if (account.sendCredit > 0) owedBy.push({ address: counterparty, name: null, count: account.sendCredit });
    waitingHorses.push(...account.waiting);
  }
  owedTo.sort((a, b) => b.count - a.count || a.address.localeCompare(b.address));
  owedBy.sort((a, b) => b.count - a.count || a.address.localeCompare(b.address));
  waitingHorses.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id - a.id);
  recent.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id - a.id);
  return {
    leaderboard,
    currentUser: {
      address,
      name: null,
      received: own.received,
      sent: own.sent,
      trades: own.received + own.sent,
      owedTo,
      owedBy,
      waitingHorses,
      recent,
    },
  };
}
