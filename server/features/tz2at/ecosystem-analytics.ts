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

export type Tz2atRepoRecord = {
  host: Tz2atAtprotoHostKey;
  repo: string;
  collection: string;
  uri: string;
  cid: string | null;
  value: Record<string, unknown>;
};

export type Tz2atCexAddress = {
  address: string;
  label: string;
};

export type Tz2atEcosystemAnalytics = {
  generatedAt: string;
  mode: "atproto-pds-repo-analytics";
  query: {
    limitPerCollection: number;
    sampleReposPerHost: number;
    cexAddressCount: number;
    filters: Tz2atAnalyticsFilters;
  };
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

export function parseTz2atCexAddressBook(raw: string | undefined | null): Tz2atCexAddress[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => {
          if (typeof entry === "string") return { address: entry.trim(), label: entry.trim() };
          if (isRecord(entry) && typeof entry.address === "string") {
            return { address: entry.address.trim(), label: typeof entry.label === "string" ? entry.label.trim() || entry.address.trim() : entry.address.trim() };
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
      return { address, label };
    });
}

export async function buildTz2atEcosystemAnalytics(options: BuildOptions = {}): Promise<Tz2atEcosystemAnalytics> {
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  const limitPerCollection = clampInteger(options.limitPerCollection, 1, 100, DEFAULT_LIMIT_PER_COLLECTION);
  const sampleReposPerHost = clampInteger(options.sampleReposPerHost, 1, 25, DEFAULT_SAMPLE_REPOS_PER_HOST);
  const cexAddresses = normalizeCexAddressBook(options.cexAddresses ?? []);
  const filters = normalizeAnalyticsFilters(options.filters ?? {});
  const errors: Tz2atEcosystemAnalytics["records"]["errors"] = [];

  const inventories = await Promise.all(TZ2AT_ATPROTO_HOSTS.map((host) => loadHostInventory(host, fetchJson, errors)));
  const allRecords = await loadAnalyticsRecords(inventories, { fetchJson, limitPerCollection, sampleReposPerHost }, errors);
  const records = allRecords.filter((record) => recordMatchesAnalyticsFilters(record, filters));
  const analysis = analyzeRecords(records, cexAddresses);
  const intelligence = buildEcosystemIntelligence(records, analysis, {
    activeRepos: inventories.reduce((sum, inventory) => sum + inventory.repos.filter((repo) => repo.active).length, 0),
    scannedRecords: allRecords.length,
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
      filters,
    },
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
      scannedRecords: allRecords.length,
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
  options: { fetchJson: typeof defaultFetchJson; limitPerCollection: number; sampleReposPerHost: number },
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
                const found = await listRecords(inventory.host, repo.did, collection, options.limitPerCollection, options.fetchJson);
                if (found.length > 0) inventory.collections.add(collection);
                records.push(...found);
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

async function listRecords(
  host: Tz2atAtprotoHost,
  repo: string,
  collection: string,
  limit: number,
  fetchJson: typeof defaultFetchJson
): Promise<Tz2atRepoRecord[]> {
  const url = new URL(xrpc(host.service, "com.atproto.repo.listRecords"));
  url.searchParams.set("repo", repo);
  url.searchParams.set("collection", collection);
  url.searchParams.set("limit", String(limit));
  const response = await fetchJson<Tz2atListRecordsResponse>(url.toString());
  return (response.records ?? [])
    .filter((record) => isRecord(record.value) && typeof record.uri === "string")
    .map((record) => ({
      host: host.key,
      repo,
      collection,
      uri: record.uri as string,
      cid: typeof record.cid === "string" ? record.cid : null,
      value: record.value as Record<string, unknown>,
    }));
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
    const collection = readString(value, ["$type"]) ?? record.collection;
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
      const amount = readMutez(value, ["amountMutez"]);
      const source = readString(value, ["source"]);
      const destination = readString(value, ["destination"]);
      if (source) {
        touchAddress(addresses, source, record, "transaction_source", amount).xtzOutMutez += amount;
        addAmount(xtzSenders, source, record, amount);
        addNet(netXtz, source, record, -amount);
      }
      if (destination) {
        touchAddress(addresses, destination, record, "transaction_destination", amount).xtzInMutez += amount;
        addAmount(xtzReceivers, destination, record, amount);
        addNet(netXtz, destination, record, amount);
      }
      addRoute(routes, source, destination, null, record, amount);
      totalXtzFlowMutez += amount;
    }

    if (collection === "xyz.tz2at.xtz.flow") {
      const amount = readMutez(value, ["amountMutez"]);
      const from = readString(value, ["from"]);
      const to = readString(value, ["to"]);
      if (from) {
        touchAddress(addresses, from, record, "xtz_out", amount).xtzOutMutez += amount;
        addAmount(xtzSenders, from, record, amount);
        addNet(netXtz, from, record, -amount);
      }
      if (to) {
        touchAddress(addresses, to, record, "xtz_in", amount).xtzInMutez += amount;
        addAmount(xtzReceivers, to, record, amount);
        addNet(netXtz, to, record, amount);
      }
      addRoute(routes, from, to, null, record, amount);
      totalXtzFlowMutez += amount;
      const fromCex = from ? cexMap.get(normalizeAddress(from)) : undefined;
      const toCex = to ? cexMap.get(normalizeAddress(to)) : undefined;
      if (fromCex && to) {
        totalWithdrawnFromCexMutez += amount;
        addAmount(cexBuyers, to, record, amount);
        cexFlows.push(buildCexFlow("from_cex", fromCex.label, to, amount, value, network, timestamp));
      }
      if (toCex && from) {
        totalDepositedToCexMutez += amount;
        addAmount(cexSellers, from, record, amount);
        cexFlows.push(buildCexFlow("to_cex", toCex.label, from, amount, value, network, timestamp));
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
      const amount = readMutez(value, ["priceMutez", "amountMutez"]);
      const buyer = readString(value, ["buyer"]);
      const seller = readString(value, ["seller"]);
      if (buyer) {
        touchAddress(addresses, buyer, record, "marketplace_buyer", amount).marketplaceBuyMutez += amount;
        addAmount(marketplaceBuyers, buyer, record, amount);
      }
      if (seller) {
        touchAddress(addresses, seller, record, "marketplace_seller", amount).marketplaceSellMutez += amount;
        addAmount(marketplaceSellers, seller, record, amount);
      }
      if (marketplace) addAmount(marketplaces, marketplace, record, amount);
      addRoute(routes, buyer, seller, marketplace, record, amount);
      marketplaceVolumeMutez += amount;
    }

    if (collection === "xyz.tz2at.marketplace.swap" || collection === "xyz.tz2at.marketplace.bid") {
      const amount = readMutez(value, ["priceMutez", "amountMutez"]);
      const actor = readString(value, ["creator", "bidder", "buyer", "seller"]);
      if (actor) addAmount(collection === "xyz.tz2at.marketplace.bid" ? marketplaceBuyers : marketplaceSellers, actor, record, amount);
      if (marketplace) addAmount(marketplaces, marketplace, record, amount);
      addRoute(routes, actor, marketplace, marketplace, record, amount);
      marketplaceVolumeMutez += amount;
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

function topRouteFlows(routes: Map<string, RouteAccumulator>, limit: number): Tz2atRouteFlow[] {
  return [...routes.values()]
    .sort((a, b) => compareBigIntDesc(a.amountMutez, b.amountMutez) || b.count - a.count)
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
      const collection = readString(value, ["$type"]) ?? record.collection;
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
    .sort((a, b) => compareBigIntDesc(BigInt(a.amountMutez), BigInt(b.amountMutez)));
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
  if (filters.minAmountMutez && readAnyMutez(value) < readMutez({ amount: filters.minAmountMutez }, ["amount"])) return false;
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
    current.amountMutez += readAnyMutez(record.value);
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
    normalized.push({ address, label: entry.label.trim() || address });
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
