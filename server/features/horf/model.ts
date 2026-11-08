import { normalizeIpfsUri } from "@shared/ipfs-gateways";
import { horfExcludedTransferReason, isHorfBlockedContract } from "./integrity";

export const HORF_SEASON_START = "2026-11-01T00:00:00.000Z";
export const HORF_SEASON_LABEL = "Neighvember 2026";

// Objkt's mint-tag index is queried with this expression; the classifier below
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
const AUTO_KEYWORD_RE = /(?:^|[^a-z0-9])(?:horse(?:[\s_-]*art|[\s_-]*trad(?:e|er(?:s)?|ing)|[\s_-]*of[\s_-]*july)?|horf|neighvember)(?:[\s#_-]*\d{4})?(?=$|[^a-z0-9])/i;
const HAHA_KEYWORD_RE = /(?:^|[^a-z0-9])haha(?:[\s#_-]*\d{4})?(?=$|[^a-z0-9])/i;
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
  creators?: Array<{ creator_address?: string | null; holder?: { alias?: string | null } | null } | null> | null;
  tags?: Array<{ tag?: ObjktTag | null }> | null;
}

/** Objkt credits a token creator; this is not an assertion about the mint operation signer. */
export function creditedObjktCreator(token: ObjktToken): { creatorAddress: string | null; creatorName: string | null } {
  const creator = token.creators?.find((entry) => isTezosWallet(entry?.creator_address));
  return {
    creatorAddress: creator?.creator_address ?? null,
    creatorName: typeof creator?.holder?.alias === "string" ? creator.holder.alias.trim() || null : null,
  };
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
  stableMode?: 0 | 1 | 2 | 3;
  /** The two V3 swap legs share one exchange for race and completed-trade counts. */
  exchangeKey?: string;
  /** Input leg may also appear as an Objkt wallet-to-wallet transfer. */
  roomInput?: boolean;
}

/** One wallet-to-wallet horse interaction, independent of edition quantity. */
export function horfInteractionKey(transfer: Pick<HorfTransfer, "id" | "operationHash" | "exchangeKey" | "from" | "to">): string {
  const source = transfer.exchangeKey
    ? `exchange:${transfer.exchangeKey}`
    : transfer.operationHash ? `operation:${transfer.operationHash}` : `event:${transfer.id}`;
  return `${source}\u0000${transfer.from}\u0000${transfer.to}`;
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
  if (AUTO_KEYWORD_RE.test(tag) || HAHA_KEYWORD_RE.test(tag)) return true;
  if (tag.includes("horse") && !tag.includes("horsepower")) return true;
  return tag.split(/[^a-z]+/).some((word) => HORSE_TAG_WORDS.has(word));
}

/** Mint tags are the only horse evidence. A lone HAHA tag needs Marshal review. */
export function horseTagEvidence(token: ObjktToken, approvedTags: ReadonlySet<string>): "horse" | "haha-review" | "none" {
  if (isHorfBlockedContract(token.fa_contract)) return "none";
  let hahaTag = false;
  for (const item of token.tags || []) {
    const tag = normalizedTag(item?.tag?.name);
    if (!tag) continue;
    if (AUTO_KEYWORD_RE.test(tag)) return "horse";
    if (HAHA_KEYWORD_RE.test(tag)) { hahaTag = true; continue; }
    if (approvedTags.has(tag) && isHorseRelatedTag(tag)) return "horse";
  }
  return hahaTag ? "haha-review" : "none";
}

/** HAHA-only mint tags require a durable token-specific Marshal approval. */
export function tokenQualifies(token: ObjktToken, approvedTags: ReadonlySet<string>, marshalApproved = false): boolean {
  const evidence = horseTagEvidence(token, approvedTags);
  return evidence === "horse" || (evidence === "haha-review" && marshalApproved);
}

export function approvedHorseTags(tags: ObjktTag[]): string[] {
  return Array.from(new Set(tags
    .filter((tag) => Number(tag.token_count) > 5 && isHorseRelatedTag(tag.name))
    .map((tag) => normalizedTag(tag.name))
    .filter((tag) => !AUTO_KEYWORD_RE.test(tag) && !HAHA_KEYWORD_RE.test(tag)))).sort();
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
  marshalApproved = false,
): HorfTransfer | null {
  if (event.event_type !== "transfer" || event.reverted !== false) return null;
  if (event.marketplace_event_type || event.marketplace_contract) return null;
  if (!isTezosWallet(event.creator_address) || !isTezosWallet(event.recipient_address)) return null;
  if (event.creator_address === event.recipient_address) return null;
  const token = event.token;
  if (!token || !tokenQualifies(token, approvedTags, marshalApproved)) return null;
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
  /** Outbound wallet-to-wallet horse interactions; edition quantity does not multiply rank. */
  trades: number;
  sentInteractions: number;
  receivedInteractions: number;
  /** Distinct wallet links in this season; all-time combines season links. */
  riderLinks: number;
  /** Horse editions matched by a return ride or verified settlement. */
  completedTrades: number;
  received: number;
  /** Explicitly confirmed horse gifts received through Horf. */
  giftHorsesReceived: number;
  /** Qualifying horse receipts without an explicit Horf gift marker. */
  tradeHorsesReceived: number;
  sent: number;
}

export interface HorfCurrentUser extends HorfLeaderboardEntry {
  /** Direct return rides matched by trader, plus settled paid or pool claims; gifts excluded. */
  completedTrades: number;
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
    stableMode?: 0 | 1 | 2 | 3;
    exchangeKey?: string;
    operationHash?: string;
    racePoints: number;
    horseReward: string;
    excludedReason?: string;
  }>;
}

export function summarizeSeason(transfers: HorfTransfer[], address: string | null): {
  leaderboard: HorfLeaderboardEntry[];
  currentUser: HorfCurrentUser | null;
} {
  type Counts = { received: number; giftHorsesReceived: number; tradeHorsesReceived: number; sent: number;
    trades: number; sentInteractions: number; receivedInteractions: number; riderLinks: number; completedTrades: number };
  const totals = new Map<string, Counts>();
  const countedSentInteractions = new Set<string>();
  const countedReceivedInteractions = new Set<string>();
  const completedExchanges = new Set<string>();
  const completedLeaderboardExchanges = new Set<string>();
  const completedSettlementEvents = new Set<string>();
  const riderConnections = new Map<string, Set<string>>();
  const reciprocalPairs = new Map<string, { first: string; second: string; firstToSecond: number; secondToFirst: number }>();
  let completedTrades = 0;
  const pair = new Map<string, {
    sendCredit: number;
    waiting: HorfCurrentUser["waitingHorses"];
  }>();
  const recent: HorfCurrentUser["recent"] = [];
  const countsFor = (wallet: string): Counts => {
    let counts = totals.get(wallet);
    if (!counts) {
      counts = { received: 0, giftHorsesReceived: 0, tradeHorsesReceived: 0, sent: 0,
        trades: 0, sentInteractions: 0, receivedInteractions: 0, riderLinks: 0, completedTrades: 0 };
      totals.set(wallet, counts);
    }
    return counts;
  };
  const addCompleted = (wallet: string, amount: number) => { countsFor(wallet).completedTrades += amount; };
  const connectRiders = (left: string, right: string) => {
    const leftLinks = riderConnections.get(left) || new Set<string>();
    const rightLinks = riderConnections.get(right) || new Set<string>();
    leftLinks.add(right);
    rightLinks.add(left);
    riderConnections.set(left, leftLinks);
    riderConnections.set(right, rightLinks);
  };
  for (const transfer of [...transfers].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id - b.id)) {
    if (isHorfBlockedContract(transfer.token.contract)) continue;
    const excludedReason = horfExcludedTransferReason(transfer.operationHash, transfer.to,
      transfer.token.contract, transfer.token.tokenId);
    if (excludedReason) {
      if (address === transfer.from || address === transfer.to) {
        recent.push({
          id: transfer.id,
          timestamp: transfer.timestamp,
          direction: address === transfer.from ? "out" : "in",
          counterparty: address === transfer.from ? transfer.to : transfer.from,
          token: transfer.token,
          amount: transfer.amount,
          ...(transfer.operationHash ? { operationHash: transfer.operationHash } : {}),
          racePoints: 0,
          horseReward: "0",
          excludedReason,
        });
      }
      continue;
    }
    const sender = countsFor(transfer.from);
    sender.sent += transfer.amount;
    const interactionKey = horfInteractionKey(transfer);
    const firstSenderInteraction = !countedSentInteractions.has(interactionKey);
    if (firstSenderInteraction) {
      sender.trades += 1;
      sender.sentInteractions += 1;
      countedSentInteractions.add(interactionKey);
    }
    const recipient = countsFor(transfer.to);
    recipient.received += transfer.amount;
    if (!countedReceivedInteractions.has(interactionKey)) {
      recipient.receivedInteractions += 1;
      countedReceivedInteractions.add(interactionKey);
    }
    if (transfer.settlement === "gift") recipient.giftHorsesReceived += transfer.amount;
    else recipient.tradeHorsesReceived += transfer.amount;
    connectRiders(transfer.from, transfer.to);

    if (!transfer.settlement) {
      const [first, second] = transfer.from.localeCompare(transfer.to) < 0
        ? [transfer.from, transfer.to] : [transfer.to, transfer.from];
      const pairKey = `${first}\u0000${second}`;
      const reciprocal = reciprocalPairs.get(pairKey) || { first, second, firstToSecond: 0, secondToFirst: 0 };
      if (transfer.from === first) reciprocal.firstToSecond += transfer.amount;
      else reciprocal.secondToFirst += transfer.amount;
      reciprocalPairs.set(pairKey, reciprocal);
    } else if (transfer.exchangeKey) {
      if (!completedLeaderboardExchanges.has(transfer.exchangeKey)) {
        addCompleted(transfer.from, 1);
        addCompleted(transfer.to, 1);
        completedLeaderboardExchanges.add(transfer.exchangeKey);
      }
    } else if (transfer.settlement === "market" || transfer.settlement === "objkt" ||
        (transfer.settlement === "stable" && (transfer.stableMode === 0 || transfer.stableMode === 2))) {
      const settlementKey = `${transfer.settlement}:${transfer.id}:${transfer.from}:${transfer.to}`;
      if (!completedSettlementEvents.has(settlementKey)) {
        addCompleted(transfer.from, 1);
        addCompleted(transfer.to, 1);
        completedSettlementEvents.add(settlementKey);
      }
    }
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
            completedTrades += used;
            if (oldest.amount === 0) account.waiting.shift();
          }
          account.sendCredit += units;
        } else {
          const coveredByCredit = Math.min(transfer.amount, account.sendCredit);
          account.sendCredit -= coveredByCredit;
          completedTrades += coveredByCredit;
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
      } else if (transfer.exchangeKey) {
        if (!completedExchanges.has(transfer.exchangeKey)) {
          completedTrades += 1;
          completedExchanges.add(transfer.exchangeKey);
        }
      } else if (transfer.settlement === "market" || transfer.settlement === "objkt" ||
          (transfer.settlement === "stable" && (transfer.stableMode === 0 || transfer.stableMode === 2))) {
        // A verified sale or credit-spending pool claim settles in one chain event.
        completedTrades += 1;
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
        ...(transfer.exchangeKey ? { exchangeKey: transfer.exchangeKey } : {}),
        ...(transfer.operationHash ? { operationHash: transfer.operationHash } : {}),
        racePoints: address === transfer.from && firstSenderInteraction ? 1 : 0,
        horseReward: address === transfer.from && firstSenderInteraction ? "10" : "0",
      });
    }
  }
  for (const reciprocal of reciprocalPairs.values()) {
    const matched = Math.min(reciprocal.firstToSecond, reciprocal.secondToFirst);
    if (matched > 0) {
      addCompleted(reciprocal.first, matched);
      addCompleted(reciprocal.second, matched);
    }
  }
  for (const [wallet, partners] of riderConnections) countsFor(wallet).riderLinks = partners.size;
  const leaderboard = Array.from(totals, ([wallet, counts]) => ({
    address: wallet,
    name: null,
    sentInteractions: counts.sentInteractions,
    receivedInteractions: counts.receivedInteractions,
    riderLinks: counts.riderLinks,
    completedTrades: counts.completedTrades,
    received: counts.received,
    giftHorsesReceived: counts.giftHorsesReceived,
    tradeHorsesReceived: counts.tradeHorsesReceived,
    sent: counts.sent,
    trades: counts.trades,
  })).sort((a, b) => b.trades - a.trades || b.received - a.received || a.address.localeCompare(b.address));
  if (!address) return { leaderboard, currentUser: null };
  const own = totals.get(address) || { received: 0, giftHorsesReceived: 0, tradeHorsesReceived: 0,
    sent: 0, trades: 0, sentInteractions: 0, receivedInteractions: 0, riderLinks: 0, completedTrades: 0 };
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
      completedTrades,
      sentInteractions: own.sentInteractions,
      receivedInteractions: own.receivedInteractions,
      riderLinks: own.riderLinks,
      received: own.received,
      giftHorsesReceived: own.giftHorsesReceived,
      tradeHorsesReceived: own.tradeHorsesReceived,
      sent: own.sent,
      trades: own.trades,
      owedTo,
      owedBy,
      waitingHorses,
      recent,
    },
  };
}
