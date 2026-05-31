import { createHash } from "node:crypto";

export type Tz2atAtprotoHostKey =
  | "main"
  | "wallets"
  | "contracts"
  | "marketplaces"
  | "currencies"
  | "platforms"
  | "chains"
  | "relay";

export type Tz2atAtprotoHost = {
  key: Tz2atAtprotoHostKey;
  label: string;
  service: string;
  role: string;
};

export type Tz2atRepoRef = {
  did: string;
  rev: string | null;
  head: string | null;
  active: boolean;
};

export type Tz2atRecordSource =
  | "main-relay"
  | "category-pds"
  | "replay-mainnet"
  | "replay-shadownet"
  | "replay-etherlink"
  | "cex-entity-repo";

export type Tz2atRepoRecord = {
  host: Tz2atAtprotoHostKey;
  repo: string;
  collection: string;
  uri: string;
  cid: string | null;
  value: Record<string, unknown>;
  /** Where this row was loaded from (relay head, replay chunk, entity repo, etc.). */
  source?: Tz2atRecordSource;
  /** Human-readable origin (PDS host key, CEX label, replay network). */
  sourceLabel?: string;
};

export type Tz2atCexAddress = {
  address: string;
  label: string;
  source?: string;
};

export type Tz2atEcosystemAnalytics = {
  generatedAt: string;
  mode: "atproto-pds-repo-analytics";
  query: {
    limitPerCollection: number;
    sampleReposPerHost: number;
    cexAddressCount: number;
    windowHours: number;
    since: string;
    until: string;
    hydrateCex: boolean;
    marketNetwork: string;
    filters: Tz2atAnalyticsFilters;
  };
  marketHealth: Tz2atMarketHealthSnapshot;
  etherlinkBridge: Tz2atEtherlinkBridgeSnapshot;
  hosts: Array<{
    key: Tz2atAtprotoHostKey;
    label: string;
    service: string;
    role: string;
    ok: boolean;
    serviceDid: string | null;
    repoCount: number;
    activeRepoCount: number;
    sampledRepoCount: number;
    collections: string[];
    error: string | null;
  }>;
  overview: {
    totalRepos: number;
    activeRepos: number;
    scannedRecords: number;
    matchedRecords: number;
    collectionCounts: Array<NamedCount>;
    networkCounts: Array<NamedCount>;
    latestTimestamp: string | null;
    latestBlockLevel: number | null;
  };
  segments: {
    byHost: SegmentAnalytics[];
    byNetwork: SegmentAnalytics[];
    byCollection: SegmentAnalytics[];
    addressRoles: Array<NamedCount>;
  };
  intelligence: {
    cards: Tz2atInsightCard[];
    lanes: Tz2atEcosystemLane[];
    valueFlows: Tz2atValueFlow[];
    routes: Tz2atRouteFlow[];
    valueAdders: EntityAnalytics[];
    valueExtractors: EntityAnalytics[];
  };
  usage: {
    topAddresses: AddressAnalytics[];
    topContracts: EntityAnalytics[];
    topMarketplaces: EntityAnalytics[];
    topTokens: EntityAnalytics[];
    topObjktGroups: EntityAnalytics[];
  };
  liquidity: {
    totalXtzFlowMutez: string;
    marketplaceVolumeMutez: string;
    topXtzSenders: EntityAnalytics[];
    topXtzReceivers: EntityAnalytics[];
    topNetXtzIn: EntityAnalytics[];
    topNetXtzOut: EntityAnalytics[];
    topMarketplaceBuyers: EntityAnalytics[];
    topMarketplaceSellers: EntityAnalytics[];
    topMarketplaceVolume: EntityAnalytics[];
  };
  cexFlow: {
    configured: boolean;
    addressBook: Tz2atCexAddress[];
    totalWithdrawnFromCexMutez: string;
    totalDepositedToCexMutez: string;
    topBuyersFromCex: EntityAnalytics[];
    topSellersToCex: EntityAnalytics[];
    unclassifiedCandidates: EntityAnalytics[];
    flows: Array<{
      direction: "from_cex" | "to_cex";
      cex: string;
      counterparty: string;
      amountMutez: string;
      operationHash: string | null;
      timestamp: string | null;
      network: string | null;
    }>;
  };
  records: {
    sample: Tz2atRepoRecord[];
    errors: Array<{ host: Tz2atAtprotoHostKey; collection?: string; repo?: string; error: string }>;
  };
};

export type NamedCount = {
  name: string;
  count: number;
};

export type SegmentAnalytics = NamedCount & {
  amountMutez: string;
  latestTimestamp: string | null;
  latestBlockLevel: number | null;
};

export type Tz2atInsightCard = {
  id: string;
  tone: "good" | "watch" | "risk" | "info";
  title: string;
  value: string;
  detail: string;
  entityId?: string | null;
  amountMutez?: string;
  timestamp?: string | null;
};

export type Tz2atEcosystemLane = SegmentAnalytics & {
  lane: string;
  label: string;
  shareOfMatchedRecords: number;
  topCollection: string | null;
};

export type Tz2atValueFlow = {
  kind: "xtz_flow" | "transaction" | "marketplace_collect" | "marketplace_bid" | "marketplace_swap";
  label: string;
  from: string | null;
  to: string | null;
  amountMutez: string;
  collection: string;
  host: Tz2atAtprotoHostKey;
  repo: string;
  uri: string;
  operationHash: string | null;
  network: string | null;
  timestamp: string | null;
  blockLevel: number | null;
};

export type Tz2atMarketHealthSnapshot = {
  windowHours: number;
  since: string;
  until: string;
  network: string;
  /** XTZ moving from known CEX custody into non-exchange Tezos wallets. */
  capitalEnteredFromCexMutez: string;
  /** XTZ moving from non-exchange wallets into known CEX custody. */
  capitalExitedToCexMutez: string;
  /** Net Tezos-native XTZ moved between non-CEX wallets inside the window. */
  internalNetFlowMutez: string;
  /** Gross Tezos-native transfer volume (transaction_amount flows) in the window. */
  grossTransferVolumeMutez: string;
  marketplaceVolumeMutez: string;
  flowRecordCount: number;
  topInflowRoutes: Tz2atRouteFlow[];
  topOutflowRoutes: Tz2atRouteFlow[];
  userFlow: {
    topReceiversFromCex: EntityAnalytics[];
    topSendersToCex: EntityAnalytics[];
    topRetailSenders: EntityAnalytics[];
    topRetailReceivers: EntityAnalytics[];
    topRetailRoutes: Tz2atRouteFlow[];
  };
  marketFlow: {
    topBuyers: EntityAnalytics[];
    topSellers: EntityAnalytics[];
    topVenues: EntityAnalytics[];
    topRoutes: Tz2atRouteFlow[];
  };
  sources: {
    mainRelayRecords: number;
    replayRecords: number;
    replayMainnetRecords: number;
    replayEtherlinkRecords: number;
    cexEntityRepoRecords: number;
    dedupedRecords: number;
    windowMatchedRecords: number;
    recordSources: Partial<Record<Tz2atRecordSource, number>>;
  };
  hydration: {
    requested: boolean;
    wallets: number;
    queued: number;
    failed: number;
    maxPagesPerWallet: number;
  };
};

export type Tz2atBridgeFlowDirection =
  | "l1_to_etherlink"
  | "etherlink_to_l1"
  | "etherlink_internal"
  | "tezos_bridge_corridor";

export type Tz2atBridgeFlowSample = {
  direction: Tz2atBridgeFlowDirection;
  network: string | null;
  from: string | null;
  to: string | null;
  amountRaw: string;
  entrypoint: string | null;
  operationHash: string | null;
  timestamp: string | null;
  collection: string;
  source: Tz2atRecordSource;
  sourceLabel: string | null;
};

export type Tz2atEtherlinkBridgeSnapshot = {
  windowHours: number;
  since: string;
  until: string;
  /** Etherlink `credit` flows (rollup deposit accounting — L1 → Etherlink). */
  l1ToEtherlinkVolumeRaw: string;
  /** Etherlink `debit` flows (rollup withdrawal — Etherlink → L1). */
  etherlinkToL1VolumeRaw: string;
  /** Etherlink-native transfers without explicit bridge entrypoint. */
  etherlinkInternalVolumeRaw: string;
  /** Tezos L1 flows with bridge/rollup/etherlink signals in record payload. */
  tezosBridgeCorridorVolumeMutez: string;
  etherlinkFlowRecordCount: number;
  tezosBridgeTaggedCount: number;
  topL1ToEtherlinkRoutes: Tz2atRouteFlow[];
  topEtherlinkToL1Routes: Tz2atRouteFlow[];
  topEtherlinkInternalRoutes: Tz2atRouteFlow[];
  flows: Tz2atBridgeFlowSample[];
  sources: {
    replayEtherlinkRecords: number;
    replayMainnetRecords: number;
    etherlinkRecordsInWindow: number;
    tezosBridgeTaggedRecords: number;
    byRecordSource: Partial<Record<Tz2atRecordSource, number>>;
  };
  readout: string;
};

export type Tz2atRouteFlow = {
  route: string;
  from: string;
  to: string;
  via: string | null;
  collection: string;
  network: string | null;
  count: number;
  amountMutez: string;
  latestTimestamp: string | null;
};

export type EntityAnalytics = {
  id: string;
  label?: string | null;
  count: number;
  amountMutez?: string;
  netMutez?: string;
  collections: string[];
  networks: string[];
  latestTimestamp: string | null;
};

export type AddressAnalytics = EntityAnalytics & {
  roles: string[];
  xtzInMutez: string;
  xtzOutMutez: string;
  marketplaceBuyMutez: string;
  marketplaceSellMutez: string;
};

type Tz2atListReposResponse = {
  cursor?: string;
  repos?: Array<{
    did?: string;
    rev?: string;
    head?: string;
    active?: boolean;
  }>;
};

type Tz2atDescribeServerResponse = {
  did?: string;
};

type Tz2atDescribeRepoResponse = {
  collections?: string[];
};

type Tz2atListRecordsResponse = {
  cursor?: string;
  records?: Array<{
    uri?: string;
    cid?: string;
    value?: Record<string, unknown>;
  }>;
};

type EntityAccumulator = {
  id: string;
  label?: string | null;
  count: number;
  amountMutez: bigint;
  netMutez: bigint;
  collections: Set<string>;
  networks: Set<string>;
  latestTimestamp: string | null;
};

type RouteAccumulator = {
  route: string;
  from: string;
  to: string;
  via: string | null;
  collection: string;
  network: string | null;
  count: number;
  amountMutez: bigint;
  latestTimestamp: string | null;
};

type AddressAccumulator = EntityAccumulator & {
  roles: Set<string>;
  xtzInMutez: bigint;
  xtzOutMutez: bigint;
  marketplaceBuyMutez: bigint;
  marketplaceSellMutez: bigint;
};

type HostInventory = {
  host: Tz2atAtprotoHost;
  ok: boolean;
  serviceDid: string | null;
  repos: Tz2atRepoRef[];
  collections: Set<string>;
  error: string | null;
};

type BuildOptions = {
  limitPerCollection?: number;
  sampleReposPerHost?: number;
  cexAddresses?: Tz2atCexAddress[];
  filters?: Tz2atAnalyticsFilters;
  fetchJson?: typeof defaultFetchJson;
  flowDeepMaxPages?: number;
  flowDeepTezosTarget?: number;
  cexWalletNetworks?: string[];
  cexWalletMaxPages?: number;
  windowHours?: number;
  hydrateCex?: boolean;
  marketNetwork?: string;
  tz2atRelayBaseUrl?: string;
};

export type Tz2atAnalyticsFilters = {
  host?: Tz2atAtprotoHostKey | "all";
  network?: string;
  collection?: string;
  address?: string;
  contract?: string;
  marketplace?: string;
  token?: string;
  q?: string;
  minAmountMutez?: string;
  fromLevel?: number;
  toLevel?: number;
};

const DEFAULT_LIMIT_PER_COLLECTION = 40;
const DEFAULT_SAMPLE_REPOS_PER_HOST = 8;

// The canonical "main" relay repo interleaves high-volume Etherlink (18-decimal,
// 0x-prefixed) flow records with the Tezos L1 (`mainnet`) flows that actually
// touch the Tezos-only CEX custody book. Reading a single recency-ordered page
// returns an Etherlink-dominated head, so the Tezos flows carrying exchange
// addresses are never sampled. Page deeper through these liquidity collections
// until we have collected enough Tezos-native flow records to classify CEX
// inflow/outflow, bounded by a hard page cap.
const FLOW_DEEP_COLLECTIONS = new Set<string>(["xyz.tz2at.transaction", "xyz.tz2at.xtz.flow"]);
const FLOW_DEEP_PAGE_LIMIT = 100;
const DEFAULT_FLOW_DEEP_MAX_PAGES = 8;
const DEFAULT_FLOW_DEEP_TEZOS_TARGET = 150;

// The tz2at spine already shards every event into per-entity repos keyed by a
// deterministic handle (`store.tz2at.*` collections inside each entity's own
// repo). For CEX custody analysis we therefore do not have to mine the
// Etherlink-dominated main relay firehose hoping to catch exchange flows: each
// CEX wallet/contract address resolves to its own repo whose `xtz.flow` records
// are, by construction, exactly the flows where that address is `from` or `to`.
// We read those repos directly. Entity repos store raw events under the
// `store.tz2at.*` prefix (only profiles are mirrored as `xyz.tz2at.*`), so the
// analyzer must treat the two prefixes as equivalent.
const STORE_COLLECTION_PREFIX = "store.tz2at.";
const CANONICAL_COLLECTION_PREFIX = "xyz.tz2at.";
const CEX_WALLET_FLOW_COLLECTION = "store.tz2at.xtz.flow";
const DEFAULT_CEX_WALLET_NETWORKS = ["mainnet"];
const DEFAULT_CEX_WALLET_MAX_PAGES = 3;
const NOUN_SLUG_MAX_FRONT_LENGTH = 18;

export const TZ2AT_MARKET_HEALTH_WINDOW_HOURS = [24, 48, 72, 96, 168] as const;
export const DEFAULT_MARKET_HEALTH_WINDOW_HOURS = 72;
export const MAX_MARKET_HEALTH_WINDOW_HOURS = 168;
const TEZOS_BLOCKS_PER_HOUR_ESTIMATE = 600;
const REPLAY_CHUNK_BLOCKS = 500;
const REPLAY_PAGE_CONCURRENCY = 4;
const HYDRATION_WALLET_CONCURRENCY = 4;

export const TZ2AT_ATPROTO_HOSTS: Tz2atAtprotoHost[] = [
  { key: "main", label: "Main relay repo", service: "https://tz2at.store", role: "canonical mixed event stream" },
  { key: "wallets", label: "Wallet repos", service: "https://wallets.tz2at.store", role: "wallet identity and wallet edge repos" },
  { key: "contracts", label: "Contract repos", service: "https://contracts.tz2at.store", role: "contract identity and contract activity repos" },
  { key: "marketplaces", label: "Marketplace repos", service: "https://marketplaces.tz2at.store", role: "marketplace identity repos" },
  { key: "currencies", label: "Currency repos", service: "https://currencies.tz2at.store", role: "currency identity repos" },
  { key: "platforms", label: "Platform repos", service: "https://platforms.tz2at.store", role: "platform-scoped activity repos" },
  { key: "chains", label: "Chain repos", service: "https://chains.tz2at.store", role: "chain-scoped activity repos" },
  { key: "relay", label: "Relay surface", service: "https://relay.tz2at.store", role: "sync relay inventory" },
];

const PRIMARY_COLLECTIONS = [
  "xyz.tz2at.block",
  "xyz.tz2at.transaction",
  "xyz.tz2at.xtz.flow",
  "xyz.tz2at.contract.call",
  "xyz.tz2at.account.activity",
  "xyz.tz2at.raw.observation",
  "xyz.tz2at.bigmap.update",
  "xyz.tz2at.internal.operation",
  "xyz.tz2at.fa2.transfer",
  "xyz.tz2at.fa2.operatorUpdate",
  "xyz.tz2at.marketplace.swap",
  "xyz.tz2at.marketplace.collect",
  "xyz.tz2at.marketplace.bid",
  "xyz.tz2at.objkt.group",
  "xyz.tz2at.edge.tokenObjktGroup",
];

const HOST_PROFILE_COLLECTIONS: Partial<Record<Tz2atAtprotoHostKey, string[]>> = {
  wallets: ["xyz.tz2at.wallet.profile", "xyz.tz2at.edge.walletContract"],
  contracts: ["xyz.tz2at.contract.profile", "xyz.tz2at.transaction", "xyz.tz2at.contract.call", "xyz.tz2at.xtz.flow", "xyz.tz2at.account.activity"],
  marketplaces: ["xyz.tz2at.marketplace.profile"],
  platforms: ["xyz.tz2at.platform.profile", "xyz.tz2at.transaction", "xyz.tz2at.contract.call", "xyz.tz2at.raw.observation"],
  chains: ["xyz.tz2at.chain.profile", "xyz.tz2at.transaction", "xyz.tz2at.contract.call", "xyz.tz2at.raw.observation"],
};

export const DEFAULT_TZ2AT_CEX_ADDRESS_BOOK: Tz2atCexAddress[] = [
  { label: "Coinbase Delegator aDvT", address: "tz1gNjyzyT8L6WgNS4AdNMppsSFw76J4aDvT", source: "tzkt-alias-2026-05-28" },
  { label: "Coinbase Baker", address: "tz1irJKkXS2DBWkU1NnmFQx1c1L7pbGg4yhk", source: "tzkt-alias-2026-05-28" },
  { label: "Binance Delegator 2", address: "tz1Q3jvYU9knekDYJfyvj3GjUy6898MNjvb2", source: "tzkt-alias-2026-05-28" },
  { label: "Bybit Hot Wallet", address: "tz1PpZctTPYj3GjY1B9wtWJh4hgd3XMo1t3R", source: "tzkt-alias-2026-05-28" },
  { label: "Kraken Baker", address: "tz1RCFbB9GpALpsZtu6J58sb74dm8qe6XBzv", source: "tzkt-alias-2026-05-28" },
  { label: "Binance Baker", address: "tz1S8MNvuFEUsWgjHvi3AxibRBf388NhT1q2", source: "tzkt-alias-2026-05-28" },
  { label: "Gate.io Baker", address: "tz1NpWrAyDL9k2Lmnyxcgr9xuJakbBxdq7FB", source: "tzkt-alias-2026-05-28" },
  { label: "Coinbase Delegator rSgD", address: "tz1Vs2z88hHRnFLss81M7dXHnbwhZNMDrSgD", source: "tzkt-alias-2026-05-28" },
  { label: "Coinbase Delegator RQVgJ", address: "tz1LnHsA2wpn7guf8b7xzX2i5zNKRQoRQVgJ", source: "tzkt-alias-2026-05-28" },
  { label: "Coinbase Delegator oiTV", address: "tz1e4N6UZzrjoxKbsJoLnxuBy6DfZu4voiTV", source: "tzkt-alias-2026-05-28" },
  { label: "Binance", address: "tz2WDATNYnp7FdsmuZDYSidioZqeoLNZqXvE", source: "tzkt-alias-2026-05-28" },
  { label: "Gemini hot", address: "tz2FqBRA1yPQLo4JXfMCT1dFWbFpFE4Tq3bm", source: "tzkt-alias-2026-05-28" },
  { label: "Crypto.com 1", address: "tz1azZRMCfzLRjbuJFZkTRv9mDTgaEYZxYfD", source: "tzkt-alias-2026-05-28" },
  { label: "Coinbase 1", address: "tz1NcoDFXMAfB26mpBhVrdSHmppyTeccT6Fi", source: "tzkt-alias-2026-05-28" },
  { label: "Bitfinex Staking", address: "tz1abR1YHzPy8jb2VrZxW7YTLFR21MfUSBfu", source: "tzkt-alias-2026-05-28" },
  { label: "Binance 3", address: "tz2HuFb9Pk2xBLEr7qawQ9JxU7xyNQix82CD", source: "tzkt-alias-2026-05-28" },
  { label: "Bitfinex", address: "tz1KtGwriE7VuLwT3LwuvU9Nv4wAxP7XZ57d", source: "tzkt-alias-2026-05-28" },
  { label: "Coinbase Delegator 46", address: "tz1L3jSdzBaSLVHgmaD12xLPRGKZkawXYdtA", source: "tzkt-alias-2026-05-28" },
  { label: "Crypto.com Withdrawal", address: "tz1Pm31zkj5tryYwhuqE7hhzYnULzrA5g5cf", source: "tzkt-alias-2026-05-28" },
  { label: "Gate.io", address: "tz1hjem5Rpf4KAVbwMLJet75TDb8HjAKnTYk", source: "tzkt-alias-2026-05-28" },
  { label: "Kucoin 2", address: "tz1csYsqZ6Bp3PFuuPvd1kSdtw7zNM2TWhbQ", source: "tzkt-alias-2026-05-28" },
  { label: "Coinbase 4", address: "tz1MXjdb684ByEP5qUn5J7EMub7Sr8eBziDe", source: "tzkt-alias-2026-05-28" },
  { label: "Kucoin", address: "tz1Q7RpsRvbozbY5zuhv5AaXuoqeXrcFAtgF", source: "tzkt-alias-2026-05-28" },
  { label: "Huobi", address: "tz1MHDcPPMZsK9mPA8XwUSw5kNqoJG3pXJ2f", source: "tzkt-alias-2026-05-28" },
  { label: "MEXC", address: "tz1fWQgef75HrhvpcmPr4VKKhe3SDLGGKjts", source: "tzkt-alias-2026-05-28" },
  { label: "Crypto.com 2", address: "tz1RM5vXeUmastvs1H7pJrs7fe21rMHyKYN9", source: "tzkt-alias-2026-05-28" },
  { label: "Coinbase Initiator", address: "tz1Mzpyj3Ebut8oJ38uvzm9eaZQtSTryC3Kx", source: "tzkt-alias-2026-05-28" },
  { label: "Coinbase Delegator q2p8", address: "KT1SkhF8v4GQc2KJQrxvaGSEtwDmd6yNq2p8", source: "tzkt-alias-2026-05-28" },
  { label: "Coinbase 3", address: "tz1bDhCGNZLQw1QXgf6MCzo6EtAVSGkqEB11", source: "tzkt-alias-2026-05-28" },
  { label: "Gate.io Delegator", address: "tz1RRVLD5LEu8iaoTMGc5L1NiyiEGuSUtAwX", source: "tzkt-alias-2026-05-28" },
];

export function parseTz2atCexAddressBook(raw: string | undefined | null): Tz2atCexAddress[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry): Tz2atCexAddress | null => {
          if (typeof entry === "string") return { address: entry.trim(), label: entry.trim(), source: "operator" };
          if (isRecord(entry) && typeof entry.address === "string") {
            return {
              address: entry.address.trim(),
              label: typeof entry.label === "string" ? entry.label.trim() || entry.address.trim() : entry.address.trim(),
              source: typeof entry.source === "string" ? entry.source.trim() || "operator" : "operator",
            };
          }
          return null;
        })
        .filter((entry): entry is Tz2atCexAddress => Boolean(entry?.address));
    }
  } catch {
    // Fall through to comma-separated parsing.
  }

  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [labelPart, addressPart] = part.includes("=") ? part.split("=", 2) : ["", part];
      const address = (addressPart || labelPart).trim();
      const label = labelPart && addressPart ? labelPart.trim() : address;
      return { address, label, source: "operator" };
    });
}

export function mergeTz2atCexAddressBooks(...books: Tz2atCexAddress[][]): Tz2atCexAddress[] {
  const merged = new Map<string, Tz2atCexAddress>();
  for (const book of books) {
    for (const entry of book) {
      if (!entry.address.trim()) continue;
      merged.set(normalizeAddress(entry.address), {
        address: entry.address.trim(),
        label: entry.label.trim() || entry.address.trim(),
        source: entry.source?.trim() || "operator",
      });
    }
  }
  return [...merged.values()];
}

export function buildTz2atCexAddressBook(input: {
  query?: string | null;
  envBook?: string | null;
  envAddresses?: string | null;
  disableDefault?: boolean;
} = {}): Tz2atCexAddress[] {
  return mergeTz2atCexAddressBooks(
    input.disableDefault ? [] : DEFAULT_TZ2AT_CEX_ADDRESS_BOOK,
    parseTz2atCexAddressBook(input.envBook),
    parseTz2atCexAddressBook(input.envAddresses),
    parseTz2atCexAddressBook(input.query)
  );
}

export async function buildTz2atEcosystemAnalytics(options: BuildOptions = {}): Promise<Tz2atEcosystemAnalytics> {
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  const limitPerCollection = clampInteger(options.limitPerCollection, 1, 100, DEFAULT_LIMIT_PER_COLLECTION);
  const sampleReposPerHost = clampInteger(options.sampleReposPerHost, 1, 25, DEFAULT_SAMPLE_REPOS_PER_HOST);
  const cexAddresses = normalizeCexAddressBook(options.cexAddresses ?? []);
  const filters = normalizeAnalyticsFilters(options.filters ?? {});
  const errors: Tz2atEcosystemAnalytics["records"]["errors"] = [];

  const windowHours = normalizeMarketWindowHours(options.windowHours);
  const untilMs = Date.now();
  const sinceMs = untilMs - windowHours * 60 * 60 * 1000;
  const since = new Date(sinceMs).toISOString();
  const until = new Date(untilMs).toISOString();
  const marketNetwork = (options.marketNetwork ?? filters.network ?? "mainnet").trim() || "mainnet";
  const hydrateCex = options.hydrateCex !== false;

  const flowDeepMaxPages = clampInteger(options.flowDeepMaxPages, 1, 25, DEFAULT_FLOW_DEEP_MAX_PAGES);
  const flowDeepTezosTarget = clampInteger(options.flowDeepTezosTarget, 0, 5000, DEFAULT_FLOW_DEEP_TEZOS_TARGET);
  const cexWalletNetworks = normalizeNetworkList(options.cexWalletNetworks, DEFAULT_CEX_WALLET_NETWORKS);
  const cexWalletMaxPages = clampInteger(
    options.cexWalletMaxPages,
    1,
    15,
    cexWalletPagesForWindow(windowHours)
  );
  const relayBaseUrl = (options.tz2atRelayBaseUrl ?? tz2atRelayBaseUrl()).replace(/\/+$/, "");

  const hydration = hydrateCex
    ? await requestCexWalletHydration(cexAddresses, windowHours, relayBaseUrl, fetchJson)
    : { requested: false, wallets: 0, queued: 0, failed: 0, maxPagesPerWallet: 0 };

  const inventories = await Promise.all(TZ2AT_ATPROTO_HOSTS.map((host) => loadHostInventory(host, fetchJson, errors)));
  // Three complementary sources: main/category PDS repos (cross-cutting),
  // tz2at replay for the requested block window (time-bounded spine history),
  // and per-CEX entity repos (pre-filtered custody flows).
  const [mainStreamRecords, replayMainnetRecords, replayEtherlinkRecords, cexWalletRecords] = await Promise.all([
    loadAnalyticsRecords(
      inventories,
      { fetchJson, limitPerCollection, sampleReposPerHost, flowDeepMaxPages, flowDeepTezosTarget },
      errors
    ),
    loadReplayWindowRecords(windowHours, marketNetwork, relayBaseUrl, fetchJson, errors),
    loadReplayWindowRecords(windowHours, "etherlink-mainnet", relayBaseUrl, fetchJson, errors),
    loadCexWalletFlowRecords(cexAddresses, { networks: cexWalletNetworks, maxPages: cexWalletMaxPages }, fetchJson, errors),
  ]);
  const dedupedRecords = dedupeRecords([
    ...mainStreamRecords,
    ...replayMainnetRecords,
    ...replayEtherlinkRecords,
    ...cexWalletRecords,
  ]);
  const windowRecords = dedupedRecords.filter((record) => recordInTimeWindow(record, sinceMs, untilMs));
  const filteredRecords = windowRecords.filter((record) => recordMatchesAnalyticsFilters(record, filters));
  const records = filteredRecords.filter((record) => recordMatchesNetwork(record, marketNetwork));
  const analysis = analyzeRecords(records, cexAddresses);
  const marketHealth = buildMarketHealthSnapshot({
    windowHours,
    since,
    until,
    network: marketNetwork,
    records,
    analysis,
    cexAddresses,
    sources: {
      mainRelayRecords: mainStreamRecords.length,
      replayRecords: replayMainnetRecords.length + replayEtherlinkRecords.length,
      replayMainnetRecords: replayMainnetRecords.length,
      replayEtherlinkRecords: replayEtherlinkRecords.length,
      cexEntityRepoRecords: cexWalletRecords.length,
      dedupedRecords: dedupedRecords.length,
      windowMatchedRecords: windowRecords.length,
      recordSources: countRecordSources(records),
    },
    hydration,
  });
  const etherlinkBridge = buildEtherlinkBridgeSnapshot({
    windowHours,
    since,
    until,
    records: windowRecords,
    replayMainnetCount: replayMainnetRecords.length,
    replayEtherlinkCount: replayEtherlinkRecords.length,
  });
  const intelligence = buildEcosystemIntelligence(records, analysis, {
    activeRepos: inventories.reduce((sum, inventory) => sum + inventory.repos.filter((repo) => repo.active).length, 0),
    scannedRecords: windowRecords.length,
    matchedRecords: records.length,
    cexConfigured: cexAddresses.length > 0,
    sourceErrorCount: errors.length,
  });

  return {
    generatedAt: new Date().toISOString(),
    mode: "atproto-pds-repo-analytics",
    query: {
      limitPerCollection,
      sampleReposPerHost,
      cexAddressCount: cexAddresses.length,
      windowHours,
      since,
      until,
      hydrateCex,
      marketNetwork,
      filters,
    },
    marketHealth,
    etherlinkBridge,
    hosts: inventories.map((inventory) => ({
      key: inventory.host.key,
      label: inventory.host.label,
      service: inventory.host.service,
      role: inventory.host.role,
      ok: inventory.ok,
      serviceDid: inventory.serviceDid,
      repoCount: inventory.repos.length,
      activeRepoCount: inventory.repos.filter((repo) => repo.active).length,
      sampledRepoCount: Math.min(sampleReposPerHost, inventory.repos.length),
      collections: [...inventory.collections].sort(),
      error: inventory.error,
    })),
    overview: {
      totalRepos: inventories.reduce((sum, inventory) => sum + inventory.repos.length, 0),
      activeRepos: inventories.reduce((sum, inventory) => sum + inventory.repos.filter((repo) => repo.active).length, 0),
      scannedRecords: windowRecords.length,
      matchedRecords: records.length,
      collectionCounts: sortedCounts(countBy(records, (record) => record.collection)),
      networkCounts: sortedCounts(countBy(records, (record) => readString(record.value, ["network", "chain"]) ?? "unknown")),
      latestTimestamp: analysis.latestTimestamp,
      latestBlockLevel: analysis.latestBlockLevel,
    },
    segments: {
      byHost: segmentRecords(records, (record) => record.host),
      byNetwork: segmentRecords(records, (record) => readString(record.value, ["network", "chain"]) ?? "unknown"),
      byCollection: segmentRecords(records, (record) => record.collection),
      addressRoles: sortedCounts(countBy([...analysis.addresses.values()].flatMap((address) => [...address.roles]), (role) => role)),
    },
    intelligence,
    usage: {
      topAddresses: topAddressAnalytics(analysis.addresses, 16),
      topContracts: topEntityAnalytics(analysis.contracts, 12),
      topMarketplaces: topEntityAnalytics(analysis.marketplaces, 12),
      topTokens: topEntityAnalytics(analysis.tokens, 12),
      topObjktGroups: topEntityAnalytics(analysis.groups, 8),
    },
    liquidity: {
      totalXtzFlowMutez: analysis.totalXtzFlowMutez.toString(),
      marketplaceVolumeMutez: analysis.marketplaceVolumeMutez.toString(),
      topXtzSenders: topEntityAnalytics(analysis.xtzSenders, 10, "amount"),
      topXtzReceivers: topEntityAnalytics(analysis.xtzReceivers, 10, "amount"),
      topNetXtzIn: topEntityAnalytics(analysis.netXtz, 10, "net-positive"),
      topNetXtzOut: topEntityAnalytics(analysis.netXtz, 10, "net-negative"),
      topMarketplaceBuyers: topEntityAnalytics(analysis.marketplaceBuyers, 10, "amount"),
      topMarketplaceSellers: topEntityAnalytics(analysis.marketplaceSellers, 10, "amount"),
      topMarketplaceVolume: topEntityAnalytics(analysis.marketplaces, 10, "amount"),
    },
    cexFlow: {
      configured: cexAddresses.length > 0,
      addressBook: cexAddresses,
      totalWithdrawnFromCexMutez: analysis.totalWithdrawnFromCexMutez.toString(),
      totalDepositedToCexMutez: analysis.totalDepositedToCexMutez.toString(),
      topBuyersFromCex: topEntityAnalytics(analysis.cexBuyers, 10, "amount"),
      topSellersToCex: topEntityAnalytics(analysis.cexSellers, 10, "amount"),
      unclassifiedCandidates: topUnclassifiedCustodyCandidates(analysis, cexAddresses, 12),
      flows: analysis.cexFlows.slice(0, 40),
    },
    records: {
      sample: records.slice(0, 30),
      errors,
    },
  };
}

async function loadHostInventory(
  host: Tz2atAtprotoHost,
  fetchJson: typeof defaultFetchJson,
  errors: Tz2atEcosystemAnalytics["records"]["errors"]
): Promise<HostInventory> {
  const collections = new Set<string>();
  try {
    const [describe, repos] = await Promise.all([
      fetchJson<Tz2atDescribeServerResponse>(xrpc(host.service, "com.atproto.server.describeServer")),
      listRepos(host, fetchJson),
    ]);
    return {
      host,
      ok: true,
      serviceDid: typeof describe.did === "string" ? describe.did : null,
      repos,
      collections,
      error: null,
    };
  } catch (err) {
    const message = errorMessage(err);
    errors.push({ host: host.key, error: message });
    return { host, ok: false, serviceDid: null, repos: [], collections, error: message };
  }
}

async function listRepos(host: Tz2atAtprotoHost, fetchJson: typeof defaultFetchJson): Promise<Tz2atRepoRef[]> {
  const repos: Tz2atRepoRef[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    pages += 1;
    const url = new URL(xrpc(host.service, "com.atproto.sync.listRepos"));
    url.searchParams.set("limit", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetchJson<Tz2atListReposResponse>(url.toString());
    for (const repo of response.repos ?? []) {
      if (!repo.did) continue;
      repos.push({
        did: repo.did,
        rev: repo.rev ?? null,
        head: repo.head ?? null,
        active: repo.active !== false,
      });
    }
    cursor = response.cursor;
  } while (cursor && pages < 20);
  return repos;
}

async function loadAnalyticsRecords(
  inventories: HostInventory[],
  options: {
    fetchJson: typeof defaultFetchJson;
    limitPerCollection: number;
    sampleReposPerHost: number;
    flowDeepMaxPages: number;
    flowDeepTezosTarget: number;
  },
  errors: Tz2atEcosystemAnalytics["records"]["errors"]
): Promise<Tz2atRepoRecord[]> {
  const records: Tz2atRepoRecord[] = [];
  const tasks: Array<Promise<void>> = [];

  for (const inventory of inventories) {
    if (!inventory.ok || inventory.repos.length === 0 || inventory.host.key === "relay" || inventory.host.key === "currencies") continue;
    const activeRepos = inventory.repos.filter((repo) => repo.active);
    const repoSample = inventory.host.key === "main" ? activeRepos.slice(0, 1) : activeRepos.slice(0, options.sampleReposPerHost);
    for (const repo of repoSample) {
      tasks.push(
        describeRepoCollections(inventory, repo, options.fetchJson, errors).then(async (collections) => {
          const wanted = collectionsForHost(inventory.host.key, collections);
          await Promise.all(
            wanted.map(async (collection) => {
              try {
                const deepFlow = inventory.host.key === "main" && FLOW_DEEP_COLLECTIONS.has(collection);
                const found = deepFlow
                  ? await listFlowRecordsDeep(
                      inventory.host,
                      repo.did,
                      collection,
                      { maxPages: options.flowDeepMaxPages, tezosTarget: options.flowDeepTezosTarget },
                      options.fetchJson
                    )
                  : await listRecords(inventory.host, repo.did, collection, options.limitPerCollection, options.fetchJson);
                if (found.length > 0) inventory.collections.add(collection);
                const source: Tz2atRecordSource = inventory.host.key === "main" ? "main-relay" : "category-pds";
                const sourceLabel = inventory.host.key === "main" ? "tz2at.store" : `${inventory.host.key}.tz2at.store`;
                records.push(...found.map((record) => withRecordSource(record, source, sourceLabel)));
              } catch (err) {
                errors.push({ host: inventory.host.key, repo: repo.did, collection, error: errorMessage(err) });
              }
            })
          );
        })
      );
    }
  }

  await Promise.all(tasks);
  records.sort((a, b) => {
    const aTime = Date.parse(readString(a.value, ["timestamp", "createdAt", "indexedAt"]) ?? "");
    const bTime = Date.parse(readString(b.value, ["timestamp", "createdAt", "indexedAt"]) ?? "");
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
  return records;
}

async function describeRepoCollections(
  inventory: HostInventory,
  repo: Tz2atRepoRef,
  fetchJson: typeof defaultFetchJson,
  errors: Tz2atEcosystemAnalytics["records"]["errors"]
): Promise<string[]> {
  try {
    const url = new URL(xrpc(inventory.host.service, "com.atproto.repo.describeRepo"));
    url.searchParams.set("repo", repo.did);
    const response = await fetchJson<Tz2atDescribeRepoResponse>(url.toString());
    const collections = (response.collections ?? []).filter((collection): collection is string => typeof collection === "string");
    collections.forEach((collection) => inventory.collections.add(collection));
    return collections;
  } catch (err) {
    errors.push({ host: inventory.host.key, repo: repo.did, error: errorMessage(err) });
    return [];
  }
}

function collectionsForHost(host: Tz2atAtprotoHostKey, described: string[]): string[] {
  const describedSet = new Set(described);
  const desired = host === "main" ? PRIMARY_COLLECTIONS : HOST_PROFILE_COLLECTIONS[host] ?? [];
  const narrowed = desired.filter((collection) => describedSet.size === 0 || describedSet.has(collection));
  return narrowed.length ? narrowed : desired;
}

async function listRecordsPage(
  host: Tz2atAtprotoHost,
  repo: string,
  collection: string,
  limit: number,
  cursor: string | null,
  fetchJson: typeof defaultFetchJson
): Promise<{ records: Tz2atRepoRecord[]; cursor: string | null }> {
  const url = new URL(xrpc(host.service, "com.atproto.repo.listRecords"));
  url.searchParams.set("repo", repo);
  url.searchParams.set("collection", collection);
  url.searchParams.set("limit", String(limit));
  if (cursor) url.searchParams.set("cursor", cursor);
  const response = await fetchJson<Tz2atListRecordsResponse>(url.toString());
  const records = (response.records ?? [])
    .filter((record) => isRecord(record.value) && typeof record.uri === "string")
    .map((record) => ({
      host: host.key,
      repo,
      collection,
      uri: record.uri as string,
      cid: typeof record.cid === "string" ? record.cid : null,
      value: record.value as Record<string, unknown>,
    }));
  return { records, cursor: typeof response.cursor === "string" && response.cursor ? response.cursor : null };
}

async function listRecords(
  host: Tz2atAtprotoHost,
  repo: string,
  collection: string,
  limit: number,
  fetchJson: typeof defaultFetchJson
): Promise<Tz2atRepoRecord[]> {
  const { records } = await listRecordsPage(host, repo, collection, limit, null, fetchJson);
  return records;
}

// Page through a high-volume liquidity collection until we have gathered enough
// Tezos-native flow records to feed the Tezos-only CEX classifier, or we exhaust
// the page budget / cursor. This keeps Etherlink-dominated recency heads from
// starving the Tezos `mainnet` flows that actually reference exchange custody
// wallets. All fetched records (Etherlink + Tezos) are retained for the wider
// ecosystem view; the Tezos target only governs how deep we page.
async function listFlowRecordsDeep(
  host: Tz2atAtprotoHost,
  repo: string,
  collection: string,
  options: { maxPages: number; tezosTarget: number },
  fetchJson: typeof defaultFetchJson
): Promise<Tz2atRepoRecord[]> {
  const maxPages = clampInteger(options.maxPages, 1, 25, DEFAULT_FLOW_DEEP_MAX_PAGES);
  const tezosTarget = clampInteger(options.tezosTarget, 0, 5000, DEFAULT_FLOW_DEEP_TEZOS_TARGET);
  const collected: Tz2atRepoRecord[] = [];
  let cursor: string | null = null;
  let tezosNative = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await listRecordsPage(host, repo, collection, FLOW_DEEP_PAGE_LIMIT, cursor, fetchJson);
    collected.push(...result.records);
    for (const record of result.records) {
      if (recordIsTezosNative(record.value)) tezosNative += 1;
    }
    cursor = result.cursor;
    if (!cursor || result.records.length === 0) break;
    if (tezosNative >= tezosTarget) break;
  }
  return collected;
}

function isEtherlinkNetwork(network: string | null | undefined): boolean {
  return Boolean(network && network.trim().toLowerCase().startsWith("etherlink"));
}

/** Etherlink stores native amounts in 18-decimal wei; Tezos L1 uses 6-decimal mutez. */
const ETHERLINK_WEI_PER_MUTEZ = 1_000_000_000_000n;

/** Convert a record's raw amount to 6-decimal mutez for cross-network sums and rankings. */
export function normalizeToComparableMutez(raw: bigint, network: string | null | undefined): bigint {
  if (raw <= 0n) return 0n;
  if (isEtherlinkNetwork(network)) return raw / ETHERLINK_WEI_PER_MUTEZ;
  return raw;
}

function readComparableAmount(value: Record<string, unknown>): bigint {
  return normalizeToComparableMutez(readAnyMutez(value), readString(value, ["network", "chain"]));
}

function addressLooksTezos(address: string | null | undefined): boolean {
  if (!address) return false;
  const lower = address.trim().toLowerCase();
  return lower.startsWith("tz") || lower.startsWith("kt");
}

function recordIsTezosNative(value: Record<string, unknown>): boolean {
  const network = readString(value, ["network", "chain"]);
  if (network) return !isEtherlinkNetwork(network);
  for (const key of ["from", "to", "source", "destination"]) {
    const address = readString(value, [key]);
    if (!address) continue;
    if (addressLooksTezos(address)) return true;
    if (address.trim().toLowerCase().startsWith("0x")) return false;
  }
  return false;
}

// Resolve each configured CEX address to its own tz2at entity repo and read that
// repo's `xtz.flow` records directly. Because the spine routes a flow into an
// entity repo only when that entity is a participant, every record we read here
// is a genuine inflow/outflow for a known exchange wallet — no firehose mining,
// no Etherlink noise, and complete within the bounded recent window.
async function loadCexWalletFlowRecords(
  cexAddresses: Tz2atCexAddress[],
  options: { networks: string[]; maxPages: number },
  fetchJson: typeof defaultFetchJson,
  errors: Tz2atEcosystemAnalytics["records"]["errors"]
): Promise<Tz2atRepoRecord[]> {
  if (cexAddresses.length === 0) return [];
  const hostByCategory = new Map<NounCategory, Tz2atAtprotoHost>();
  for (const host of TZ2AT_ATPROTO_HOSTS) {
    if (host.key === "wallets") hostByCategory.set("wallets", host);
    if (host.key === "contracts") hostByCategory.set("contracts", host);
  }
  const maxPages = clampInteger(options.maxPages, 1, 15, DEFAULT_CEX_WALLET_MAX_PAGES);
  const collected: Tz2atRepoRecord[] = [];
  const tasks: Array<Promise<void>> = [];

  for (const entry of cexAddresses) {
    const category = cexEntityCategory(entry.address);
    if (!category) continue;
    const host = hostByCategory.get(category);
    if (!host) continue;
    for (const network of options.networks) {
      tasks.push(
        (async () => {
          const handle = tz2atNounHandle(category, network, entry.address);
          const did = await resolveNounDid(host.service, handle, fetchJson);
          if (!did) return;
          let cursor: string | null = null;
          for (let page = 0; page < maxPages; page += 1) {
            try {
              const result = await listRecordsPage(host, did, CEX_WALLET_FLOW_COLLECTION, FLOW_DEEP_PAGE_LIMIT, cursor, fetchJson);
              for (const record of result.records) {
                // Only real value transfers identify custody movement; fees,
                // burns, and rewards are not deposits/withdrawals.
                if (readString(record.value, ["flowKind"]) !== "transaction_amount") continue;
                collected.push(
                  withRecordSource(
                    { ...record, collection: normalizeCollectionName(record.collection) },
                    "cex-entity-repo",
                    `${entry.label}@${network}`
                  )
                );
              }
              cursor = result.cursor;
              if (!cursor || result.records.length === 0) break;
            } catch (err) {
              errors.push({ host: host.key, repo: did, collection: CEX_WALLET_FLOW_COLLECTION, error: errorMessage(err) });
              break;
            }
          }
        })()
      );
    }
  }

  await Promise.all(tasks);
  return collected;
}

async function resolveNounDid(
  service: string,
  handle: string,
  fetchJson: typeof defaultFetchJson
): Promise<string | null> {
  try {
    const url = new URL(xrpc(service, "com.atproto.identity.resolveHandle"));
    url.searchParams.set("handle", handle);
    const response = await fetchJson<{ did?: string }>(url.toString());
    return typeof response.did === "string" && response.did.startsWith("did:") ? response.did : null;
  } catch {
    return null;
  }
}

type NounCategory = "wallets" | "contracts";

function cexEntityCategory(address: string): NounCategory | null {
  const lower = address.trim().toLowerCase();
  if (lower.startsWith("tz")) return "wallets";
  if (lower.startsWith("kt")) return "contracts";
  return null;
}

// Mirrors TZAT `nounSlug`/`nounRef`: the entity repo handle is a deterministic
// function of (network, category, canonicalId=address), so a known CEX address
// resolves to its repo handle without enumerating the 10k+ repos per host.
function tz2atNounHandle(category: NounCategory, network: string, canonicalId: string): string {
  return `${tz2atNounSlug(category, network, canonicalId)}.${category}.tz2at.store`;
}

function tz2atNounSlug(category: NounCategory, network: string, canonicalId: string): string {
  const prefix = `${tz2atNetworkCode(network)}-${tz2atCategoryCode(category)}-`;
  const id = tz2atSafeSlug(canonicalId);
  const available = NOUN_SLUG_MAX_FRONT_LENGTH - prefix.length;
  if (id.length <= available) return `${prefix}${id}`;
  const digest = createHash("sha256").update(`${network}:${category}:${canonicalId}`).digest("hex").slice(0, 12);
  const headLength = Math.max(1, available - digest.length - 1);
  return `${prefix}${id.slice(0, headLength)}-${digest}`;
}

function tz2atSafeSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  if (slug.length <= 63) return slug || "entity";
  const hash = createHash("sha256").update(slug).digest("base64url").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 10);
  return `${slug.slice(0, 52).replace(/-+$/g, "")}-${hash}`.slice(0, 63);
}

function tz2atCategoryCode(category: NounCategory): string {
  return category === "wallets" ? "w" : "c";
}

function tz2atNetworkCode(network: string): string {
  switch (network) {
    case "mainnet":
      return "m";
    case "shadownet":
      return "s";
    case "etherlink":
    case "etherlink-mainnet":
      return "e";
    case "jstz":
    case "jstz-testnet":
      return "j";
    default:
      return tz2atSafeSlug(network).slice(0, 3) || "n";
  }
}

function normalizeCollectionName(name: string | null | undefined): string {
  if (!name) return "";
  return name.startsWith(STORE_COLLECTION_PREFIX)
    ? `${CANONICAL_COLLECTION_PREFIX}${name.slice(STORE_COLLECTION_PREFIX.length)}`
    : name;
}

function normalizeNetworkList(networks: string[] | undefined, fallback: string[]): string[] {
  if (!Array.isArray(networks)) return fallback;
  const cleaned = networks.map((network) => network.trim()).filter((network) => network.length > 0);
  return cleaned.length ? Array.from(new Set(cleaned)) : fallback;
}

// Collapse the same canonical event when it appears in more than one repo (e.g.
// the main relay mirror plus both participants' entity repos) so merged sources
// never double count. Keyed by normalized type + operation hash + event index.
function dedupeRecords(records: Tz2atRepoRecord[]): Tz2atRepoRecord[] {
  const seen = new Set<string>();
  const out: Tz2atRepoRecord[] = [];
  for (const record of records) {
    const key = recordIdentityKey(record);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(record);
  }
  return out;
}

function recordIdentityKey(record: Tz2atRepoRecord): string {
  const value = record.value;
  const type = normalizeCollectionName(readString(value, ["$type"]) ?? record.collection);
  const operationHash = readString(value, ["operationHash", "opHash", "hash"]);
  if (operationHash) {
    const eventIndex = readString(value, ["eventIndex"]) ?? "";
    return `${type}|${operationHash}|${eventIndex}`;
  }
  return `uri:${record.uri}`;
}

export function normalizeMarketWindowHours(value: number | undefined): number {
  const hours = clampInteger(value, 1, MAX_MARKET_HEALTH_WINDOW_HOURS, DEFAULT_MARKET_HEALTH_WINDOW_HOURS);
  const allowed = TZ2AT_MARKET_HEALTH_WINDOW_HOURS as readonly number[];
  if (allowed.includes(hours)) return hours;
  return allowed.reduce((best, candidate) => (Math.abs(candidate - hours) < Math.abs(best - hours) ? candidate : best));
}

function cexWalletPagesForWindow(windowHours: number): number {
  return Math.min(15, Math.max(3, Math.ceil(windowHours / 24) * 4));
}

function hydrationPagesForWindow(windowHours: number): number {
  return Math.min(40, Math.max(5, Math.ceil(windowHours / 12)));
}

function tz2atRelayBaseUrl(): string {
  return (process.env.TZ2AT_API_BASE_URL || "https://tz2at.xyz").replace(/\/+$/, "");
}

function recordTimestampMs(record: Tz2atRepoRecord): number | null {
  const raw = readString(record.value, ["timestamp", "createdAt", "indexedAt"]);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function recordInTimeWindow(record: Tz2atRepoRecord, sinceMs: number, untilMs: number): boolean {
  const timestampMs = recordTimestampMs(record);
  if (timestampMs === null) return true;
  return timestampMs >= sinceMs && timestampMs <= untilMs;
}

function recordMatchesNetwork(record: Tz2atRepoRecord, network: string): boolean {
  const value = record.value;
  const recordNetwork = readString(value, ["network", "chain"]);
  if (!recordNetwork) return addressLooksTezos(readString(value, ["from", "source"]) ?? "") || addressLooksTezos(readString(value, ["to", "destination"]) ?? "");
  return recordNetwork.trim().toLowerCase() === network.trim().toLowerCase();
}

async function requestCexWalletHydration(
  cexAddresses: Tz2atCexAddress[],
  windowHours: number,
  relayBaseUrl: string,
  fetchJson: typeof defaultFetchJson
): Promise<Tz2atMarketHealthSnapshot["hydration"]> {
  const wallets = cexAddresses.filter((entry) => cexEntityCategory(entry.address) === "wallets");
  const maxPagesPerWallet = hydrationPagesForWindow(windowHours);
  if (wallets.length === 0) {
    return { requested: false, wallets: 0, queued: 0, failed: 0, maxPagesPerWallet };
  }

  let queued = 0;
  let failed = 0;
  for (let index = 0; index < wallets.length; index += HYDRATION_WALLET_CONCURRENCY) {
    const batch = wallets.slice(index, index + HYDRATION_WALLET_CONCURRENCY);
    await Promise.all(
      batch.map(async (entry) => {
        try {
          const response = await fetch(`${relayBaseUrl}/hydrate/wallet/async`, {
            method: "POST",
            headers: { accept: "application/json", "content-type": "application/json" },
            body: JSON.stringify({ walletAddress: entry.address, maxPages: maxPagesPerWallet }),
            signal: AbortSignal.timeout(12_000),
          });
          if (!response.ok) {
            failed += 1;
            return;
          }
          const payload = (await response.json()) as { ok?: boolean; jobId?: string };
          if (payload.ok === false) {
            failed += 1;
            return;
          }
          queued += 1;
        } catch {
          failed += 1;
        }
      })
    );
  }

  return { requested: true, wallets: wallets.length, queued, failed, maxPagesPerWallet };
}

type Tz2atReplayHealth = {
  ok?: boolean;
  rollingIndexer?: {
    lastLevel?: number | string;
    headLevel?: number | string;
    headLagBlocks?: number | string;
    ageMs?: number | string;
    maxStaleMs?: number | string;
    maxHeadLagBlocks?: number | string;
    ok?: boolean;
    state?: string;
  };
};

function withRecordSource(record: Tz2atRepoRecord, source: Tz2atRecordSource, sourceLabel?: string): Tz2atRepoRecord {
  return { ...record, source, sourceLabel: sourceLabel ?? record.sourceLabel };
}

function replaySourceForNetwork(network: string): Tz2atRecordSource {
  const normalized = network.trim().toLowerCase();
  if (normalized.startsWith("etherlink")) return "replay-etherlink";
  if (normalized === "shadownet") return "replay-shadownet";
  return "replay-mainnet";
}

function isReplayNetwork(network: string): boolean {
  const normalized = network.trim().toLowerCase();
  return normalized.startsWith("mainnet") || normalized === "shadownet" || normalized.startsWith("etherlink");
}

function countRecordSources(records: Tz2atRepoRecord[]): Partial<Record<Tz2atRecordSource, number>> {
  const counts: Partial<Record<Tz2atRecordSource, number>> = {};
  for (const record of records) {
    if (!record.source) continue;
    counts[record.source] = (counts[record.source] ?? 0) + 1;
  }
  return counts;
}

async function loadReplayWindowRecords(
  windowHours: number,
  network: string,
  relayBaseUrl: string,
  fetchJson: typeof defaultFetchJson,
  errors: Tz2atEcosystemAnalytics["records"]["errors"]
): Promise<Tz2atRepoRecord[]> {
  if (!isReplayNetwork(network)) {
    return [];
  }
  const replaySource = replaySourceForNetwork(network);
  try {
    const health = await fetchJson<Tz2atReplayHealth>(`${relayBaseUrl}/health`);
    const headLevel = Math.floor(Number(health.rollingIndexer?.lastLevel ?? health.rollingIndexer?.headLevel ?? 0));
    if (!headLevel || replayHealthIsStale(health)) return [];

    const replayBlocks = Math.min(
      MAX_MARKET_HEALTH_WINDOW_HOURS * TEZOS_BLOCKS_PER_HOUR_ESTIMATE,
      Math.ceil(windowHours * TEZOS_BLOCKS_PER_HOUR_ESTIMATE)
    );
    const fromLevel = Math.max(0, headLevel - replayBlocks);
    const ranges: Array<{ fromLevel: number; toLevel: number }> = [];
    for (let toLevel = headLevel; toLevel > fromLevel; toLevel -= REPLAY_CHUNK_BLOCKS) {
      ranges.push({ fromLevel: Math.max(fromLevel, toLevel - REPLAY_CHUNK_BLOCKS + 1), toLevel });
    }

    const collected: Tz2atRepoRecord[] = [];
    for (let index = 0; index < ranges.length; index += REPLAY_PAGE_CONCURRENCY) {
      const batch = ranges.slice(index, index + REPLAY_PAGE_CONCURRENCY);
      const pages = await Promise.all(
        batch.map(async (range) => {
          const url = new URL(`${relayBaseUrl}/replay`);
          url.searchParams.set("fromLevel", String(range.fromLevel));
          url.searchParams.set("toLevel", String(range.toLevel));
          url.searchParams.set("network", network);
          return fetchJson<Array<{ event?: Record<string, unknown> }>>(url.toString());
        })
      );
      for (const page of pages) {
        for (const item of page ?? []) {
          const event = item?.event;
          if (!isRecord(event)) continue;
          const record = replayEventToRecord(event, replaySource, network);
          if (record) collected.push(record);
        }
      }
    }
    return collected;
  } catch (err) {
    errors.push({ host: "main", error: `replay window: ${errorMessage(err)}` });
    return [];
  }
}

function replayHealthIsStale(health: Tz2atReplayHealth): boolean {
  const rolling = health.rollingIndexer;
  if (!rolling) return false;
  if (rolling.ok === false || health.ok === false) return true;
  const headLag = Number(rolling.headLagBlocks);
  const maxLag = Number(rolling.maxHeadLagBlocks);
  if (Number.isFinite(headLag) && Number.isFinite(maxLag) && headLag > maxLag) return true;
  const ageMs = Number(rolling.ageMs);
  const maxStaleMs = Number(rolling.maxStaleMs);
  if (Number.isFinite(ageMs) && Number.isFinite(maxStaleMs) && ageMs > maxStaleMs) return true;
  return false;
}

function replayEventToRecord(
  event: Record<string, unknown>,
  source: Tz2atRecordSource,
  network: string
): Tz2atRepoRecord | null {
  const type = readString(event, ["$type"]);
  if (!type || !type.includes("tz2at")) return null;
  const collection = normalizeCollectionName(type);
  if (
    collection !== "xyz.tz2at.xtz.flow" &&
    collection !== "xyz.tz2at.transaction" &&
    collection !== "xyz.tz2at.marketplace.collect" &&
    collection !== "xyz.tz2at.marketplace.swap" &&
    collection !== "xyz.tz2at.marketplace.bid" &&
    collection !== "xyz.tz2at.fa2.transfer"
  ) {
    return null;
  }
  const operationHash = readString(event, ["operationHash", "opHash", "hash"]) ?? "unknown";
  const eventIndex = readString(event, ["eventIndex"]) ?? "0";
  return {
    host: "main",
    repo: "tz2at-replay",
    collection,
    uri: `replay://${operationHash}/${eventIndex}`,
    cid: null,
    value: event,
    source,
    sourceLabel: `tz2at-replay/${network.trim() || "unknown"}`,
  };
}

function buildMarketHealthSnapshot(input: {
  windowHours: number;
  since: string;
  until: string;
  network: string;
  records: Tz2atRepoRecord[];
  analysis: ReturnType<typeof analyzeRecords>;
  cexAddresses: Tz2atCexAddress[];
  sources: Tz2atMarketHealthSnapshot["sources"];
  hydration: Tz2atMarketHealthSnapshot["hydration"];
}): Tz2atMarketHealthSnapshot {
  const cexKeys = new Set(input.cexAddresses.map((entry) => normalizeAddress(entry.address)));
  const networkRecords = input.records.filter((record) => recordMatchesNetwork(record, input.network));
  const flowRecords = networkRecords.filter((record) => {
    const collection = normalizeCollectionName(readString(record.value, ["$type"]) ?? record.collection);
    if (collection !== "xyz.tz2at.xtz.flow") return false;
    return readString(record.value, ["flowKind"]) === "transaction_amount";
  });

  let internalNet = 0n;
  let grossVolume = 0n;
  const inRoutes = new Map<string, RouteAccumulator>();
  const outRoutes = new Map<string, RouteAccumulator>();

  for (const record of flowRecords) {
    const value = record.value;
    const amount = readMutez(value, ["amountMutez"]);
    if (amount <= 0n) continue;
    grossVolume += amount;
    const from = readString(value, ["from"]);
    const to = readString(value, ["to"]);
    const fromCex = from ? cexKeys.has(normalizeAddress(from)) : false;
    const toCex = to ? cexKeys.has(normalizeAddress(to)) : false;
    if (!fromCex && !toCex && from && to) {
      internalNet += amount;
      addRoute(inRoutes, from, to, null, record, amount);
      addRoute(outRoutes, from, to, null, record, amount);
    }
    if (fromCex && to) addRoute(inRoutes, from, to, null, record, amount);
    if (toCex && from) addRoute(outRoutes, from, to, null, record, amount);
  }

  const retailRoutes = filterRetailRoutes(input.analysis.routes, cexKeys);

  return {
    windowHours: input.windowHours,
    since: input.since,
    until: input.until,
    network: input.network,
    capitalEnteredFromCexMutez: input.analysis.totalWithdrawnFromCexMutez.toString(),
    capitalExitedToCexMutez: input.analysis.totalDepositedToCexMutez.toString(),
    internalNetFlowMutez: internalNet.toString(),
    grossTransferVolumeMutez: grossVolume.toString(),
    marketplaceVolumeMutez: input.analysis.marketplaceVolumeMutez.toString(),
    flowRecordCount: flowRecords.length,
    topInflowRoutes: topRouteFlows(inRoutes, 8),
    topOutflowRoutes: topRouteFlows(outRoutes, 8),
    userFlow: {
      topReceiversFromCex: topEntityAnalytics(input.analysis.cexBuyers, 8, "amount"),
      topSendersToCex: topEntityAnalytics(input.analysis.cexSellers, 8, "amount"),
      topRetailSenders: topEntityAnalytics(input.analysis.xtzSenders, 8, "amount"),
      topRetailReceivers: topEntityAnalytics(input.analysis.xtzReceivers, 8, "amount"),
      topRetailRoutes: topRouteFlows(retailRoutes, 8),
    },
    marketFlow: {
      topBuyers: topEntityAnalytics(input.analysis.marketplaceBuyers, 8, "amount"),
      topSellers: topEntityAnalytics(input.analysis.marketplaceSellers, 8, "amount"),
      topVenues: topEntityAnalytics(input.analysis.marketplaces, 8, "amount"),
      topRoutes: topMarketplaceRoutes(input.analysis.routes, 8),
    },
    sources: input.sources,
    hydration: input.hydration,
  };
}

const BRIDGE_FLOW_COLLECTIONS = new Set(["xyz.tz2at.xtz.flow", "xyz.tz2at.transaction"]);

function recordMentionsBridge(record: Tz2atRepoRecord): boolean {
  const haystack = JSON.stringify(record.value).toLowerCase();
  return (
    haystack.includes("bridge") ||
    haystack.includes("rollup") ||
    haystack.includes("etherlink") ||
    haystack.includes("wrap")
  );
}

function classifyBridgeDirection(record: Tz2atRepoRecord): Tz2atBridgeFlowDirection | null {
  const collection = normalizeCollectionName(readString(record.value, ["$type"]) ?? record.collection);
  if (!BRIDGE_FLOW_COLLECTIONS.has(collection)) return null;
  const network = readString(record.value, ["network", "chain"]);
  const entrypoint = readString(record.value, ["entrypoint"])?.toLowerCase() ?? null;

  if (isEtherlinkNetwork(network)) {
    if (entrypoint === "credit") return "l1_to_etherlink";
    if (entrypoint === "debit") return "etherlink_to_l1";
    return "etherlink_internal";
  }

  if (network === "mainnet" || network === "shadownet") {
    if (recordMentionsBridge(record)) return "tezos_bridge_corridor";
  }
  return null;
}

function buildEtherlinkBridgeSnapshot(input: {
  windowHours: number;
  since: string;
  until: string;
  records: Tz2atRepoRecord[];
  replayMainnetCount: number;
  replayEtherlinkCount: number;
}): Tz2atEtherlinkBridgeSnapshot {
  let l1ToEtherlink = 0n;
  let etherlinkToL1 = 0n;
  let etherlinkInternal = 0n;
  let tezosBridgeCorridor = 0n;
  let etherlinkFlowCount = 0;
  let tezosBridgeTagged = 0;
  let etherlinkRecordsInWindow = 0;

  const l1ToRoutes = new Map<string, RouteAccumulator>();
  const elToL1Routes = new Map<string, RouteAccumulator>();
  const internalRoutes = new Map<string, RouteAccumulator>();
  const flows: Tz2atBridgeFlowSample[] = [];
  const byRecordSource: Partial<Record<Tz2atRecordSource, number>> = {};

  for (const record of input.records) {
    if (record.source) byRecordSource[record.source] = (byRecordSource[record.source] ?? 0) + 1;
    const network = readString(record.value, ["network", "chain"]);
    if (isEtherlinkNetwork(network)) etherlinkRecordsInWindow += 1;

    const direction = classifyBridgeDirection(record);
    if (!direction) continue;

    const amount = readAnyMutez(record.value);
    if (amount <= 0n) continue;

    const from = readString(record.value, ["from", "source"]);
    const to = readString(record.value, ["to", "destination"]);
    const entrypoint = readString(record.value, ["entrypoint"]);
    const operationHash = readString(record.value, ["operationHash", "opHash", "hash"]);
    const timestamp = readString(record.value, ["timestamp", "createdAt", "indexedAt"]);

    if (direction === "l1_to_etherlink") {
      l1ToEtherlink += amount;
      etherlinkFlowCount += 1;
      addRoute(l1ToRoutes, from, to, null, record, amount);
    } else if (direction === "etherlink_to_l1") {
      etherlinkToL1 += amount;
      etherlinkFlowCount += 1;
      addRoute(elToL1Routes, from, to, null, record, amount);
    } else if (direction === "etherlink_internal") {
      etherlinkInternal += amount;
      etherlinkFlowCount += 1;
      addRoute(internalRoutes, from, to, null, record, amount);
    } else if (direction === "tezos_bridge_corridor") {
      tezosBridgeCorridor += amount;
      tezosBridgeTagged += 1;
    }

    if (flows.length < 48) {
      flows.push({
        direction,
        network,
        from,
        to,
        amountRaw: amount.toString(),
        entrypoint,
        operationHash,
        timestamp,
        collection: record.collection,
        source: record.source ?? "main-relay",
        sourceLabel: record.sourceLabel ?? null,
      });
    }
  }

  const readout =
    etherlinkFlowCount === 0 && tezosBridgeTagged === 0
      ? `No mainnet↔Etherlink bridge-classified flows in the last ${input.windowHours}h window. Etherlink replay contributed ${input.replayEtherlinkCount.toLocaleString()} rows; widen the window or run CEX hydration on Tezos repos separately.`
      : `In the last ${input.windowHours}h, classified Etherlink credit (L1→L2) volume is ${l1ToEtherlink.toString()} base units, debit (L2→L1) is ${etherlinkToL1.toString()}, and internal Etherlink transfers are ${etherlinkInternal.toString()}. Tezos L1 rows tagged with bridge/rollup/etherlink text sum to ${tezosBridgeCorridor.toString()} mutez.`;

  return {
    windowHours: input.windowHours,
    since: input.since,
    until: input.until,
    l1ToEtherlinkVolumeRaw: l1ToEtherlink.toString(),
    etherlinkToL1VolumeRaw: etherlinkToL1.toString(),
    etherlinkInternalVolumeRaw: etherlinkInternal.toString(),
    tezosBridgeCorridorVolumeMutez: tezosBridgeCorridor.toString(),
    etherlinkFlowRecordCount: etherlinkFlowCount,
    tezosBridgeTaggedCount: tezosBridgeTagged,
    topL1ToEtherlinkRoutes: topRouteFlows(l1ToRoutes, 8),
    topEtherlinkToL1Routes: topRouteFlows(elToL1Routes, 8),
    topEtherlinkInternalRoutes: topRouteFlows(internalRoutes, 8),
    flows,
    sources: {
      replayEtherlinkRecords: input.replayEtherlinkCount,
      replayMainnetRecords: input.replayMainnetCount,
      etherlinkRecordsInWindow,
      tezosBridgeTaggedRecords: tezosBridgeTagged,
      byRecordSource,
    },
    readout,
  };
}

function filterRetailRoutes(routes: Map<string, RouteAccumulator>, cexKeys: Set<string>): Map<string, RouteAccumulator> {
  const retail = new Map<string, RouteAccumulator>();
  for (const [key, route] of routes) {
    if (cexKeys.has(normalizeAddress(route.from)) || cexKeys.has(normalizeAddress(route.to))) continue;
    retail.set(key, route);
  }
  return retail;
}

function topMarketplaceRoutes(routes: Map<string, RouteAccumulator>, limit: number): Tz2atRouteFlow[] {
  const marketplace = new Map<string, RouteAccumulator>();
  for (const [key, route] of routes) {
    if (!route.collection.includes("marketplace")) continue;
    marketplace.set(key, route);
  }
  return topRouteFlows(marketplace, limit);
}

function analyzeRecords(records: Tz2atRepoRecord[], cexAddresses: Tz2atCexAddress[]) {
  const addresses = new Map<string, AddressAccumulator>();
  const contracts = new Map<string, EntityAccumulator>();
  const marketplaces = new Map<string, EntityAccumulator>();
  const tokens = new Map<string, EntityAccumulator>();
  const groups = new Map<string, EntityAccumulator>();
  const xtzSenders = new Map<string, EntityAccumulator>();
  const xtzReceivers = new Map<string, EntityAccumulator>();
  const netXtz = new Map<string, EntityAccumulator>();
  const marketplaceBuyers = new Map<string, EntityAccumulator>();
  const marketplaceSellers = new Map<string, EntityAccumulator>();
  const cexBuyers = new Map<string, EntityAccumulator>();
  const cexSellers = new Map<string, EntityAccumulator>();
  const routes = new Map<string, RouteAccumulator>();
  const cexMap = new Map(cexAddresses.map((entry) => [normalizeAddress(entry.address), entry]));
  const cexFlows: Tz2atEcosystemAnalytics["cexFlow"]["flows"] = [];
  let totalXtzFlowMutez = 0n;
  let marketplaceVolumeMutez = 0n;
  let totalWithdrawnFromCexMutez = 0n;
  let totalDepositedToCexMutez = 0n;
  let latestTimestamp: string | null = null;
  let latestBlockLevel: number | null = null;

  for (const record of records) {
    const value = record.value;
    const collection = normalizeCollectionName(readString(value, ["$type"]) ?? record.collection);
    const network = readString(value, ["network", "chain"]);
    const timestamp = readString(value, ["timestamp", "createdAt", "indexedAt"]);
    latestTimestamp = maxTimestamp(latestTimestamp, timestamp);
    latestBlockLevel = maxNumber(latestBlockLevel, readNumber(value, ["blockLevel", "level"]));

    for (const address of subjectAddresses(value)) {
      touchAddress(addresses, address, record, "subject", 0n);
    }

    if (collection === "xyz.tz2at.account.activity") {
      const address = readString(value, ["address"]);
      if (address) {
        const acc = touchAddress(addresses, address, record, "activity", 0n);
        for (const role of readStringArray(value, "roles")) acc.roles.add(role);
      }
    }

    if (collection === "xyz.tz2at.transaction") {
      const nativeAmount = readMutez(value, ["amountMutez"]);
      const comparableAmount = readComparableAmount(value);
      const source = readString(value, ["source"]);
      const destination = readString(value, ["destination"]);
      if (source) {
        touchAddress(addresses, source, record, "transaction_source", nativeAmount).xtzOutMutez += nativeAmount;
        addAmount(xtzSenders, source, record, comparableAmount);
        addNet(netXtz, source, record, -comparableAmount);
      }
      if (destination) {
        touchAddress(addresses, destination, record, "transaction_destination", nativeAmount).xtzInMutez += nativeAmount;
        addAmount(xtzReceivers, destination, record, comparableAmount);
        addNet(netXtz, destination, record, comparableAmount);
      }
      addRoute(routes, source, destination, null, record, nativeAmount);
      totalXtzFlowMutez += comparableAmount;
    }

    if (collection === "xyz.tz2at.xtz.flow") {
      const nativeAmount = readMutez(value, ["amountMutez"]);
      const comparableAmount = readComparableAmount(value);
      const from = readString(value, ["from"]);
      const to = readString(value, ["to"]);
      if (from) {
        touchAddress(addresses, from, record, "xtz_out", nativeAmount).xtzOutMutez += nativeAmount;
        addAmount(xtzSenders, from, record, comparableAmount);
        addNet(netXtz, from, record, -comparableAmount);
      }
      if (to) {
        touchAddress(addresses, to, record, "xtz_in", nativeAmount).xtzInMutez += nativeAmount;
        addAmount(xtzReceivers, to, record, comparableAmount);
        addNet(netXtz, to, record, comparableAmount);
      }
      addRoute(routes, from, to, null, record, nativeAmount);
      totalXtzFlowMutez += comparableAmount;
      const fromCex = from ? cexMap.get(normalizeAddress(from)) : undefined;
      const toCex = to ? cexMap.get(normalizeAddress(to)) : undefined;
      if (fromCex && to) {
        totalWithdrawnFromCexMutez += nativeAmount;
        addAmount(cexBuyers, to, record, comparableAmount);
        cexFlows.push(buildCexFlow("from_cex", fromCex.label, to, nativeAmount, value, network, timestamp));
      }
      if (toCex && from) {
        totalDepositedToCexMutez += nativeAmount;
        addAmount(cexSellers, from, record, comparableAmount);
        cexFlows.push(buildCexFlow("to_cex", toCex.label, from, nativeAmount, value, network, timestamp));
      }
    }

    const contract = readString(value, ["contract", "tokenContract", "faContract"]);
    if (contract) addCount(contracts, contract, record);
    const marketplace = readString(value, ["marketplace", "marketplaceRef"]);
    if (marketplace) addCount(marketplaces, marketplace, record);
    const tokenRef = readString(value, ["tokenRef"]) ?? tokenKey(value);
    if (tokenRef) addCount(tokens, tokenRef, record);
    const groupRef = readString(value, ["groupRef"]);
    if (groupRef) addCount(groups, groupRef, record, readString(value, ["name"]));

    if (collection === "xyz.tz2at.marketplace.collect") {
      const nativeAmount = readMutez(value, ["priceMutez", "amountMutez"]);
      const comparableAmount = readComparableAmount(value);
      const buyer = readString(value, ["buyer"]);
      const seller = readString(value, ["seller"]);
      if (buyer) {
        touchAddress(addresses, buyer, record, "marketplace_buyer", nativeAmount).marketplaceBuyMutez += nativeAmount;
        addAmount(marketplaceBuyers, buyer, record, comparableAmount);
      }
      if (seller) {
        touchAddress(addresses, seller, record, "marketplace_seller", nativeAmount).marketplaceSellMutez += nativeAmount;
        addAmount(marketplaceSellers, seller, record, comparableAmount);
      }
      if (marketplace) addAmount(marketplaces, marketplace, record, comparableAmount);
      addRoute(routes, buyer, seller, marketplace, record, nativeAmount);
      marketplaceVolumeMutez += comparableAmount;
    }

    if (collection === "xyz.tz2at.marketplace.swap" || collection === "xyz.tz2at.marketplace.bid") {
      const nativeAmount = readMutez(value, ["priceMutez", "amountMutez"]);
      const comparableAmount = readComparableAmount(value);
      const actor = readString(value, ["creator", "bidder", "buyer", "seller"]);
      if (actor) addAmount(collection === "xyz.tz2at.marketplace.bid" ? marketplaceBuyers : marketplaceSellers, actor, record, comparableAmount);
      if (marketplace) addAmount(marketplaces, marketplace, record, comparableAmount);
      addRoute(routes, actor, marketplace, marketplace, record, nativeAmount);
      marketplaceVolumeMutez += comparableAmount;
    }
  }

  return {
    addresses,
    contracts,
    marketplaces,
    tokens,
    groups,
    xtzSenders,
    xtzReceivers,
    netXtz,
    marketplaceBuyers,
    marketplaceSellers,
    cexBuyers,
    cexSellers,
    routes,
    cexFlows,
    totalXtzFlowMutez,
    marketplaceVolumeMutez,
    totalWithdrawnFromCexMutez,
    totalDepositedToCexMutez,
    latestTimestamp,
    latestBlockLevel,
  };
}

function touchAddress(
  map: Map<string, AddressAccumulator>,
  address: string,
  record: Tz2atRepoRecord,
  role: string,
  amount: bigint
): AddressAccumulator {
  const acc = getAddressAccumulator(map, address);
  touchAccumulator(acc, record, amount);
  acc.roles.add(role);
  return acc;
}

function getAddressAccumulator(map: Map<string, AddressAccumulator>, address: string): AddressAccumulator {
  const key = normalizeAddress(address);
  const existing = map.get(key);
  if (existing) return existing;
  const created: AddressAccumulator = {
    id: address,
    count: 0,
    amountMutez: 0n,
    netMutez: 0n,
    collections: new Set(),
    networks: new Set(),
    latestTimestamp: null,
    roles: new Set(),
    xtzInMutez: 0n,
    xtzOutMutez: 0n,
    marketplaceBuyMutez: 0n,
    marketplaceSellMutez: 0n,
  };
  map.set(key, created);
  return created;
}

function addCount(map: Map<string, EntityAccumulator>, id: string, record: Tz2atRepoRecord, label?: string | null) {
  touchAccumulator(getEntityAccumulator(map, id, label), record, 0n);
}

function addAmount(map: Map<string, EntityAccumulator>, id: string, record: Tz2atRepoRecord, amount: bigint) {
  touchAccumulator(getEntityAccumulator(map, id), record, amount);
}

function addNet(map: Map<string, EntityAccumulator>, id: string, record: Tz2atRepoRecord, amount: bigint) {
  const acc = getEntityAccumulator(map, id);
  touchAccumulator(acc, record, 0n);
  acc.netMutez += amount;
}

function addRoute(
  routes: Map<string, RouteAccumulator>,
  from: string | null | undefined,
  to: string | null | undefined,
  via: string | null | undefined,
  record: Tz2atRepoRecord,
  amount: bigint
) {
  if (!from || !to || amount <= 0n) return;
  const network = readString(record.value, ["network", "chain"]);
  const routeVia = via && normalizeAddress(via) !== normalizeAddress(to) ? `${compactEntity(via)} -> ` : "";
  const route = `${compactEntity(from)} -> ${routeVia}${compactEntity(to)}`;
  const key = [record.collection, normalizeAddress(from), normalizeAddress(to), via ? normalizeAddress(via) : "", network ?? ""].join("|");
  const existing = routes.get(key) ?? {
    route,
    from,
    to,
    via: via ?? null,
    collection: record.collection,
    network,
    count: 0,
    amountMutez: 0n,
    latestTimestamp: null,
  };
  existing.count += 1;
  existing.amountMutez += amount;
  existing.latestTimestamp = maxTimestamp(existing.latestTimestamp, readString(record.value, ["timestamp", "createdAt", "indexedAt"]));
  routes.set(key, existing);
}

function getEntityAccumulator(map: Map<string, EntityAccumulator>, id: string, label?: string | null): EntityAccumulator {
  const key = normalizeAddress(id);
  const existing = map.get(key);
  if (existing) {
    if (label && !existing.label) existing.label = label;
    return existing;
  }
  const created: EntityAccumulator = {
    id,
    label,
    count: 0,
    amountMutez: 0n,
    netMutez: 0n,
    collections: new Set(),
    networks: new Set(),
    latestTimestamp: null,
  };
  map.set(key, created);
  return created;
}

function touchAccumulator(acc: EntityAccumulator, record: Tz2atRepoRecord, amount: bigint) {
  acc.count += 1;
  acc.amountMutez += amount;
  acc.collections.add(record.collection);
  const network = readString(record.value, ["network", "chain"]);
  if (network) acc.networks.add(network);
  acc.latestTimestamp = maxTimestamp(acc.latestTimestamp, readString(record.value, ["timestamp", "createdAt", "indexedAt"]));
}

function topEntityAnalytics(map: Map<string, EntityAccumulator>, limit: number, mode: "count" | "amount" | "net-positive" | "net-negative" = "count"): EntityAnalytics[] {
  return [...map.values()]
    .sort((a, b) => {
      if (mode === "amount") return compareBigIntDesc(a.amountMutez, b.amountMutez) || b.count - a.count;
      if (mode === "net-positive") return compareBigIntDesc(a.netMutez, b.netMutez) || b.count - a.count;
      if (mode === "net-negative") return compareBigIntAsc(a.netMutez, b.netMutez) || b.count - a.count;
      return b.count - a.count || compareBigIntDesc(a.amountMutez, b.amountMutez);
    })
    .filter((acc) => (mode === "net-positive" ? acc.netMutez > 0n : mode === "net-negative" ? acc.netMutez < 0n : acc.count > 0))
    .slice(0, limit)
    .map(entityAnalytics);
}

function topAddressAnalytics(map: Map<string, AddressAccumulator>, limit: number): AddressAnalytics[] {
  return [...map.values()]
    .sort((a, b) => b.count - a.count || compareBigIntDesc(a.xtzInMutez + a.marketplaceSellMutez, b.xtzInMutez + b.marketplaceSellMutez))
    .slice(0, limit)
    .map((acc) => ({
      ...entityAnalytics(acc),
      roles: [...acc.roles].sort(),
      xtzInMutez: acc.xtzInMutez.toString(),
      xtzOutMutez: acc.xtzOutMutez.toString(),
      marketplaceBuyMutez: acc.marketplaceBuyMutez.toString(),
      marketplaceSellMutez: acc.marketplaceSellMutez.toString(),
    }));
}

function entityAnalytics(acc: EntityAccumulator): EntityAnalytics {
  return {
    id: acc.id,
    label: acc.label,
    count: acc.count,
    amountMutez: acc.amountMutez.toString(),
    netMutez: acc.netMutez.toString(),
    collections: [...acc.collections].sort(),
    networks: [...acc.networks].sort(),
    latestTimestamp: acc.latestTimestamp,
  };
}

function topUnclassifiedCustodyCandidates(
  analysis: ReturnType<typeof analyzeRecords>,
  cexAddresses: Tz2atCexAddress[],
  limit: number
): EntityAnalytics[] {
  const cexKeys = new Set(cexAddresses.map((entry) => normalizeAddress(entry.address)));
  // The custody book is Tezos-only, so candidate "looks like an exchange wallet"
  // suggestions must stay Tezos-native. Pre-filter the accumulators before
  // ranking so Etherlink (0x, 18-decimal) high-volume addresses cannot starve
  // the Tezos custody candidates out of the top slice.
  const tezosSenders = filterAccumulatorByAddress(analysis.xtzSenders, addressLooksTezos);
  const tezosReceivers = filterAccumulatorByAddress(analysis.xtzReceivers, addressLooksTezos);
  return mergeAccumulatorSources([tezosSenders, tezosReceivers], limit * 3)
    .filter((entry) => !cexKeys.has(normalizeAddress(entry.id)))
    .filter((entry) => Number(entry.count) > 1 || BigInt(entry.amountMutez ?? "0") > 0n)
    .slice(0, limit);
}

function filterAccumulatorByAddress(
  source: Map<string, EntityAccumulator>,
  predicate: (address: string) => boolean
): Map<string, EntityAccumulator> {
  const next = new Map<string, EntityAccumulator>();
  for (const [key, acc] of source) {
    if (predicate(acc.id)) next.set(key, acc);
  }
  return next;
}

function topRouteFlows(routes: Map<string, RouteAccumulator>, limit: number): Tz2atRouteFlow[] {
  return [...routes.values()]
    .sort(
      (a, b) =>
        compareBigIntDesc(
          normalizeToComparableMutez(a.amountMutez, a.network),
          normalizeToComparableMutez(b.amountMutez, b.network)
        ) || b.count - a.count
    )
    .slice(0, limit)
    .map((route) => ({
      route: route.route,
      from: route.from,
      to: route.to,
      via: route.via,
      collection: route.collection,
      network: route.network,
      count: route.count,
      amountMutez: route.amountMutez.toString(),
      latestTimestamp: route.latestTimestamp,
    }));
}

function buildEcosystemIntelligence(
  records: Tz2atRepoRecord[],
  analysis: ReturnType<typeof analyzeRecords>,
  context: { activeRepos: number; scannedRecords: number; matchedRecords: number; cexConfigured: boolean; sourceErrorCount: number }
): Tz2atEcosystemAnalytics["intelligence"] {
  const valueFlows = extractValueFlows(records).slice(0, 30);
  const routes = topRouteFlows(analysis.routes, 24);
  const lanes = buildLaneAnalytics(records, context.matchedRecords);
  const valueAdders = mergeAccumulatorSources([analysis.cexBuyers, analysis.marketplaceBuyers, analysis.xtzReceivers], 12);
  const valueExtractors = mergeAccumulatorSources([analysis.cexSellers, analysis.marketplaceSellers, analysis.xtzSenders], 12);
  const cards: Tz2atInsightCard[] = [];
  const latestAgeMs = analysis.latestTimestamp ? Date.now() - Date.parse(analysis.latestTimestamp) : null;
  const freshnessTone = latestAgeMs === null || latestAgeMs > 60 * 60 * 1000 ? "risk" : latestAgeMs > 10 * 60 * 1000 ? "watch" : "good";

  cards.push({
    id: "freshness",
    tone: freshnessTone,
    title: "Freshness",
    value: analysis.latestTimestamp ? `${Math.max(0, Math.round((latestAgeMs ?? 0) / 1000))}s old` : "no timestamp",
    detail: analysis.latestBlockLevel ? `Latest matched level ${analysis.latestBlockLevel}` : "No matched block level in this slice",
    timestamp: analysis.latestTimestamp,
  });

  cards.push({
    id: "coverage",
    tone: context.matchedRecords > 0 ? "info" : "watch",
    title: "Coverage",
    value: `${context.matchedRecords}/${context.scannedRecords}`,
    detail: `${context.activeRepos.toLocaleString()} active repos observed before filters`,
  });

  const topLane = lanes[0];
  cards.push({
    id: "dominant-lane",
    tone: topLane ? "info" : "watch",
    title: "Dominant Lane",
    value: topLane ? topLane.label : "none",
    detail: topLane ? `${topLane.count} records, ${Math.round(topLane.shareOfMatchedRecords * 100)}% of this slice` : "No matched records to classify",
    amountMutez: topLane?.amountMutez,
    timestamp: topLane?.latestTimestamp,
  });

  const largestFlow = valueFlows[0];
  cards.push({
    id: "largest-flow",
    tone: largestFlow ? "good" : "watch",
    title: "Largest Value Flow",
    value: largestFlow ? largestFlow.amountMutez : "0",
    detail: largestFlow ? `${largestFlow.label}: ${compactEntity(largestFlow.from)} -> ${compactEntity(largestFlow.to)}` : "No value-bearing flow in this slice",
    entityId: largestFlow?.to ?? largestFlow?.from,
    amountMutez: largestFlow?.amountMutez,
    timestamp: largestFlow?.timestamp,
  });

  const topRoute = routes[0];
  cards.push({
    id: "top-route",
    tone: topRoute ? "info" : "watch",
    title: "Top Route",
    value: topRoute ? topRoute.route : "none",
    detail: topRoute ? `${topRoute.count} records through ${topRoute.collection}` : "No repeated value routes in this slice",
    amountMutez: topRoute?.amountMutez,
    timestamp: topRoute?.latestTimestamp,
  });

  cards.push({
    id: "cex-classifier",
    tone: context.cexConfigured ? "info" : "watch",
    title: "CEX Classifier",
    value: context.cexConfigured ? "configured" : "unconfigured",
    detail: context.cexConfigured
      ? `${analysis.cexFlows.length} exchange-classified flows in this slice`
      : "Set a CEX address book to identify users buying from or selling to exchange custody wallets",
  });

  if (context.sourceErrorCount > 0) {
    cards.push({
      id: "source-errors",
      tone: "watch",
      title: "Source Diagnostics",
      value: String(context.sourceErrorCount),
      detail: "Some AT Protocol hosts or collections reported errors; the partial result remains visible",
    });
  }

  return { cards, lanes, valueFlows, routes, valueAdders, valueExtractors };
}

function buildLaneAnalytics(records: Tz2atRepoRecord[], matchedRecords: number): Tz2atEcosystemLane[] {
  const laneCollections = new Map<string, Map<string, number>>();
  const segments = segmentRecords(records, (record) => laneForCollection(record.collection));
  for (const record of records) {
    const lane = laneForCollection(record.collection);
    const collectionCounts = laneCollections.get(lane) ?? new Map<string, number>();
    collectionCounts.set(record.collection, (collectionCounts.get(record.collection) ?? 0) + 1);
    laneCollections.set(lane, collectionCounts);
  }
  return segments.map((segment) => {
    const topCollection = sortedCounts(laneCollections.get(segment.name) ?? new Map())[0]?.name ?? null;
    return {
      ...segment,
      lane: segment.name,
      label: laneLabel(segment.name),
      shareOfMatchedRecords: matchedRecords > 0 ? segment.count / matchedRecords : 0,
      topCollection,
    };
  });
}

function laneForCollection(collection: string): string {
  if (collection.includes("marketplace")) return "marketplace";
  if (collection === "xyz.tz2at.xtz.flow" || collection === "xyz.tz2at.transaction") return "liquidity";
  if (collection.includes("contract") || collection.includes("bigmap") || collection.includes("internal.operation")) return "contracts";
  if (collection.includes("fa2") || collection.includes("objkt") || collection.includes("token")) return "tokens";
  if (collection.includes("wallet") || collection.includes("account") || collection.includes("identity")) return "identity";
  if (collection.includes("block") || collection.includes("chain") || collection.includes("raw.observation")) return "chain";
  return "other";
}

function laneLabel(lane: string): string {
  const labels: Record<string, string> = {
    marketplace: "Marketplace",
    liquidity: "Liquidity",
    contracts: "Contracts",
    tokens: "Tokens",
    identity: "Identity",
    chain: "Chain",
    other: "Other",
  };
  return labels[lane] ?? lane;
}

function extractValueFlows(records: Tz2atRepoRecord[]): Tz2atValueFlow[] {
  return records
    .map((record): Tz2atValueFlow | null => {
      const value = record.value;
      const collection = normalizeCollectionName(readString(value, ["$type"]) ?? record.collection);
      const network = readString(value, ["network", "chain"]);
      const timestamp = readString(value, ["timestamp", "createdAt", "indexedAt"]);
      const blockLevel = readNumber(value, ["blockLevel", "level"]);
      const operationHash = readString(value, ["operationHash", "opHash", "hash"]);
      if (collection === "xyz.tz2at.xtz.flow") {
        return buildValueFlow("xtz_flow", "XTZ flow", record, readString(value, ["from"]), readString(value, ["to"]), readMutez(value, ["amountMutez"]), operationHash, network, timestamp, blockLevel);
      }
      if (collection === "xyz.tz2at.transaction") {
        return buildValueFlow("transaction", "Transaction", record, readString(value, ["source"]), readString(value, ["destination"]), readMutez(value, ["amountMutez"]), operationHash, network, timestamp, blockLevel);
      }
      if (collection === "xyz.tz2at.marketplace.collect") {
        return buildValueFlow("marketplace_collect", "Marketplace collect", record, readString(value, ["buyer"]), readString(value, ["seller"]), readMutez(value, ["priceMutez", "amountMutez"]), operationHash, network, timestamp, blockLevel);
      }
      if (collection === "xyz.tz2at.marketplace.bid") {
        return buildValueFlow("marketplace_bid", "Marketplace bid", record, readString(value, ["bidder", "buyer"]), readString(value, ["seller", "marketplace"]), readMutez(value, ["priceMutez", "amountMutez"]), operationHash, network, timestamp, blockLevel);
      }
      if (collection === "xyz.tz2at.marketplace.swap") {
        return buildValueFlow("marketplace_swap", "Marketplace swap", record, readString(value, ["creator", "seller"]), readString(value, ["marketplace"]), readMutez(value, ["priceMutez", "amountMutez"]), operationHash, network, timestamp, blockLevel);
      }
      return null;
    })
    .filter((flow): flow is Tz2atValueFlow => Boolean(flow && BigInt(flow.amountMutez) > 0n))
    .sort((a, b) =>
      compareBigIntDesc(
        normalizeToComparableMutez(BigInt(a.amountMutez), a.network),
        normalizeToComparableMutez(BigInt(b.amountMutez), b.network)
      )
    );
}

function buildValueFlow(
  kind: Tz2atValueFlow["kind"],
  label: string,
  record: Tz2atRepoRecord,
  from: string | null,
  to: string | null,
  amount: bigint,
  operationHash: string | null,
  network: string | null,
  timestamp: string | null,
  blockLevel: number | null
): Tz2atValueFlow {
  return {
    kind,
    label,
    from,
    to,
    amountMutez: amount.toString(),
    collection: record.collection,
    host: record.host,
    repo: record.repo,
    uri: record.uri,
    operationHash,
    network,
    timestamp,
    blockLevel,
  };
}

function mergeAccumulatorSources(sources: Array<Map<string, EntityAccumulator>>, limit: number): EntityAnalytics[] {
  const merged = new Map<string, EntityAccumulator>();
  for (const source of sources) {
    for (const acc of source.values()) {
      const key = normalizeAddress(acc.id);
      const target = merged.get(key) ?? {
        id: acc.id,
        label: acc.label,
        count: 0,
        amountMutez: 0n,
        netMutez: 0n,
        collections: new Set<string>(),
        networks: new Set<string>(),
        latestTimestamp: null,
      };
      target.count += acc.count;
      target.amountMutez += acc.amountMutez;
      target.netMutez += acc.netMutez;
      for (const collection of acc.collections) target.collections.add(collection);
      for (const network of acc.networks) target.networks.add(network);
      target.latestTimestamp = maxTimestamp(target.latestTimestamp, acc.latestTimestamp);
      merged.set(key, target);
    }
  }
  return topEntityAnalytics(merged, limit, "amount");
}

function compactEntity(value: string | null | undefined): string {
  if (!value) return "unknown";
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-5)}` : value;
}

function buildCexFlow(
  direction: "from_cex" | "to_cex",
  cex: string,
  counterparty: string,
  amount: bigint,
  value: Record<string, unknown>,
  network: string | null,
  timestamp: string | null
) {
  return {
    direction,
    cex,
    counterparty,
    amountMutez: amount.toString(),
    operationHash: readString(value, ["operationHash", "opHash"]),
    timestamp,
    network,
  };
}

function subjectAddresses(value: Record<string, unknown>): string[] {
  const raw = value.subjectAddresses;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeAnalyticsFilters(filters: Tz2atAnalyticsFilters): Tz2atAnalyticsFilters {
  const next: Tz2atAnalyticsFilters = {};
  if (filters.host && filters.host !== "all") next.host = filters.host;
  for (const key of ["network", "collection", "address", "contract", "marketplace", "token", "q", "minAmountMutez"] as const) {
    const value = filters[key];
    if (typeof value === "string" && value.trim()) next[key] = value.trim();
  }
  if (Number.isFinite(filters.fromLevel)) next.fromLevel = Math.trunc(filters.fromLevel as number);
  if (Number.isFinite(filters.toLevel)) next.toLevel = Math.trunc(filters.toLevel as number);
  return next;
}

function recordMatchesAnalyticsFilters(record: Tz2atRepoRecord, filters: Tz2atAnalyticsFilters): boolean {
  const value = record.value;
  if (filters.host && record.host !== filters.host) return false;
  if (filters.collection && !sameText(filters.collection, record.collection) && !sameText(filters.collection, readString(value, ["$type"]))) return false;
  if (filters.network && !sameText(filters.network, readString(value, ["network", "chain"]))) return false;
  if (filters.address && !recordHasAny(value, filters.address, ["source", "destination", "from", "to", "buyer", "seller", "address", "walletAddress", "creator", "bidder"])) return false;
  if (filters.contract && !recordHasAny(value, filters.contract, ["contract", "destination", "tokenContract", "faContract"])) return false;
  if (filters.marketplace && !recordHasAny(value, filters.marketplace, ["marketplace", "marketplaceRef"])) return false;
  if (filters.token && !recordHasToken(value, filters.token)) return false;
  if (filters.q && !JSON.stringify(value).toLowerCase().includes(filters.q.toLowerCase())) return false;

  const level = readNumber(value, ["blockLevel", "level"]);
  if (filters.fromLevel !== undefined && (level === null || level < filters.fromLevel)) return false;
  if (filters.toLevel !== undefined && (level === null || level > filters.toLevel)) return false;
  if (filters.minAmountMutez && readComparableAmount(value) < readMutez({ amount: filters.minAmountMutez }, ["amount"])) return false;
  return true;
}

function recordHasAny(value: Record<string, unknown>, needle: string, keys: string[]): boolean {
  const normalizedNeedle = normalizeAddress(needle);
  const candidates = [...subjectAddresses(value), ...keys.map((key) => readString(value, [key])).filter((item): item is string => Boolean(item))];
  return candidates.some((candidate) => normalizeAddress(candidate).includes(normalizedNeedle));
}

function recordHasToken(value: Record<string, unknown>, needle: string): boolean {
  const normalizedNeedle = needle.trim().toLowerCase();
  const candidates = [
    readString(value, ["tokenRef"]),
    tokenKey(value),
    readString(value, ["tokenId", "token_id", "objktId", "marketplaceObjectId"]),
  ].filter((item): item is string => Boolean(item));
  return candidates.some((candidate) => candidate.toLowerCase().includes(normalizedNeedle));
}

function sameText(a: string, b: string | null): boolean {
  return Boolean(b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

function readString(value: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }
  return null;
}

function readStringArray(value: Record<string, unknown>, key: string): string[] {
  const raw = value[key];
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function readNumber(value: Record<string, unknown>, keys: string[]): number | null {
  const raw = readString(value, keys);
  if (!raw) return null;
  const next = Number(raw);
  return Number.isFinite(next) ? next : null;
}

function readMutez(value: Record<string, unknown>, keys: string[]): bigint {
  const raw = readString(value, keys);
  if (!raw) return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

function readAnyMutez(value: Record<string, unknown>): bigint {
  return readMutez(value, ["amountMutez", "priceMutez", "valueMutez", "feeMutez"]);
}

function tokenKey(value: Record<string, unknown>): string | null {
  const contract = readString(value, ["tokenContract", "contract", "faContract"]);
  const tokenId = readString(value, ["tokenId", "token_id"]);
  if (contract && tokenId) return `${contract}:${tokenId}`;
  return tokenId;
}

function countBy<T>(items: T[], keyFor: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFor(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function sortedCounts(counts: Map<string, number>): NamedCount[] {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function segmentRecords(records: Tz2atRepoRecord[], keyFor: (record: Tz2atRepoRecord) => string): SegmentAnalytics[] {
  const segments = new Map<string, { count: number; amountMutez: bigint; latestTimestamp: string | null; latestBlockLevel: number | null }>();
  for (const record of records) {
    const key = keyFor(record);
    const current = segments.get(key) ?? { count: 0, amountMutez: 0n, latestTimestamp: null, latestBlockLevel: null };
    current.count += 1;
    const network = readString(record.value, ["network", "chain"]);
    current.amountMutez += normalizeToComparableMutez(readAnyMutez(record.value), network);
    current.latestTimestamp = maxTimestamp(current.latestTimestamp, readString(record.value, ["timestamp", "createdAt", "indexedAt"]));
    current.latestBlockLevel = maxNumber(current.latestBlockLevel, readNumber(record.value, ["blockLevel", "level"]));
    segments.set(key, current);
  }
  return [...segments.entries()]
    .map(([name, value]) => ({ name, count: value.count, amountMutez: value.amountMutez.toString(), latestTimestamp: value.latestTimestamp, latestBlockLevel: value.latestBlockLevel }))
    .sort((a, b) => b.count - a.count || compareBigIntDesc(BigInt(a.amountMutez), BigInt(b.amountMutez)) || a.name.localeCompare(b.name));
}

function normalizeCexAddressBook(entries: Tz2atCexAddress[]): Tz2atCexAddress[] {
  const seen = new Set<string>();
  const normalized: Tz2atCexAddress[] = [];
  for (const entry of entries) {
    const address = entry.address.trim();
    const key = normalizeAddress(address);
    if (!address || seen.has(key)) continue;
    seen.add(key);
    normalized.push({ address, label: entry.label.trim() || address, source: entry.source?.trim() || "operator" });
  }
  return normalized;
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function maxTimestamp(a: string | null, b: string | null): string | null {
  if (!b) return a;
  if (!a) return b;
  const aTime = Date.parse(a);
  const bTime = Date.parse(b);
  if (!Number.isFinite(aTime)) return b;
  if (!Number.isFinite(bTime)) return a;
  return bTime > aTime ? b : a;
}

function maxNumber(a: number | null, b: number | null): number | null {
  if (b === null) return a;
  if (a === null) return b;
  return Math.max(a, b);
}

function compareBigIntDesc(a: bigint, b: bigint): number {
  return a === b ? 0 : a > b ? -1 : 1;
}

function compareBigIntAsc(a: bigint, b: bigint): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value as number)));
}

function xrpc(service: string, method: string): string {
  return `${service.replace(/\/+$/, "")}/xrpc/${method}`;
}

async function defaultFetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`AT Protocol request failed ${response.status}: ${body.slice(0, 180)}`);
  }
  return response.json() as Promise<T>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
