import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { Button, GroupBox, Hourglass, TextField } from "react95";
import { AppWindow } from "../components/layout/AppWindow";
import { api, fetchWithCsrf } from "../lib/api";
import { logClientSystemEvent } from "../lib/system-log";
import { WTFOS_PDS_PUBLIC_URL } from "@shared/platform-branding";

type Tz2atChain = "tezos" | "etherlink";

interface Tz2atStatus {
  enabled: boolean;
  relay: { baseUrl: string; ok: boolean | null; network: string | null; error?: string | null };
  firehose: {
    mode: string;
    baseUrl: string;
    jsonFirehosePath: string;
    snapshotEndpoint: string;
    cursorStorage: string;
  };
  account: null | {
    id: number;
    did: string;
    handle: string;
    pdsUrl: string | null;
    oauthScopes: string | null;
    hasWalletLinkScope: boolean;
  };
  permissions: { identityScope: string; walletLinkScope: string };
  pdsOffering: {
    enabled: boolean;
    configured: boolean;
    provisioningEnabled: boolean;
    pdsUrl: string;
    handleDomain: string;
    suggestedHandle: string | null;
    identityLinkCollection: string;
    gameLexiconPrefix: string;
    serviceHealth: { ok: boolean | null; healthUrl: string | null; error?: string | null };
    canonicalRepoPolicy: { role: string; allowedWriteCollections: string[]; readOnlyImportCollections: string[] };
    wtfRepoPolicy: { role: string; writePrefix: string };
    identity: null | {
      id: number;
      canonicalDid: string;
      canonicalHandle: string | null;
      wtfDid: string | null;
      wtfHandle: string | null;
      wtfPdsUrl: string | null;
      status: "offered" | "requested" | "provisioning" | "active" | "failed";
      linkageRecordUri: string | null;
      requestedAt: string | null;
      provisionedAt: string | null;
    };
  };
  links: Array<{
    id: number;
    chain: Tz2atChain;
    walletAddress: string;
    source: "tzbsky_import" | "wtf_signature";
    verificationStatus: "imported" | "verified" | "published" | "failed";
    importedUri: string | null;
    tz2atRecordUri: string | null;
    publishedAt: string | null;
  }>;
  wallets: {
    tezos: Array<{ id: number; walletAddress: string; isPrimary: boolean; tezDomain: string | null }>;
    etherlink: Array<{ id: number; walletAddress: string; isPrimary: boolean; network: string | null; chainId: number | null }>;
  };
}

interface ActivityResponse {
  mode?: "wallet-activity-snapshot" | "relay-replay-search";
  sourceUrl?: string;
  walletAddress?: string | null;
  filters?: Record<string, string | undefined>;
  scannedItems?: number;
  matchedItems?: number;
  cursor?: string | null;
  items: Array<Record<string, unknown>>;
}

interface Tz2atEntityAnalytics {
  id: string;
  label?: string | null;
  count: number;
  amountMutez?: string;
  netMutez?: string;
  collections: string[];
  networks: string[];
  latestTimestamp: string | null;
}

interface Tz2atSegmentAnalytics {
  name: string;
  count: number;
  amountMutez: string;
  latestTimestamp: string | null;
  latestBlockLevel: number | null;
}

interface Tz2atInsightCard {
  id: string;
  tone: "good" | "watch" | "risk" | "info";
  title: string;
  value: string;
  detail: string;
  entityId?: string | null;
  amountMutez?: string;
  timestamp?: string | null;
}

interface Tz2atEcosystemLane extends Tz2atSegmentAnalytics {
  lane: string;
  label: string;
  shareOfMatchedRecords: number;
  topCollection: string | null;
}

interface Tz2atValueFlow {
  kind: string;
  label: string;
  from: string | null;
  to: string | null;
  amountMutez: string;
  collection: string;
  host: string;
  repo: string;
  uri: string;
  operationHash: string | null;
  network: string | null;
  timestamp: string | null;
  blockLevel: number | null;
}

interface Tz2atRouteFlow {
  route: string;
  from: string;
  to: string;
  via: string | null;
  collection: string;
  network: string | null;
  count: number;
  amountMutez: string;
  latestTimestamp: string | null;
}

type AnalyticsEntityKind = "address" | "contract" | "marketplace" | "token" | "group";

type SelectedAnalyticsEntity = {
  kind: AnalyticsEntityKind;
  id: string;
  label?: string | null;
};

interface Tz2atAddressAnalytics extends Tz2atEntityAnalytics {
  roles: string[];
  xtzInMutez: string;
  xtzOutMutez: string;
  marketplaceBuyMutez: string;
  marketplaceSellMutez: string;
}

type Tz2atMarketHealthSnapshot = {
  windowHours: number;
  since: string;
  until: string;
  network: string;
  capitalEnteredFromCexMutez: string;
  capitalExitedToCexMutez: string;
  internalNetFlowMutez: string;
  grossTransferVolumeMutez: string;
  marketplaceVolumeMutez: string;
  flowRecordCount: number;
  topInflowRoutes: Tz2atRouteFlow[];
  topOutflowRoutes: Tz2atRouteFlow[];
  userFlow: {
    topReceiversFromCex: Tz2atEntityAnalytics[];
    topSendersToCex: Tz2atEntityAnalytics[];
    topRetailSenders: Tz2atEntityAnalytics[];
    topRetailReceivers: Tz2atEntityAnalytics[];
    topRetailRoutes: Tz2atRouteFlow[];
  };
  marketFlow: {
    topBuyers: Tz2atEntityAnalytics[];
    topSellers: Tz2atEntityAnalytics[];
    topVenues: Tz2atEntityAnalytics[];
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
    recordSources: Record<string, number>;
  };
  hydration: {
    requested: boolean;
    wallets: number;
    queued: number;
    failed: number;
    maxPagesPerWallet: number;
  };
};

type Tz2atBridgeFlowSample = {
  direction: "l1_to_etherlink" | "etherlink_to_l1" | "etherlink_internal" | "tezos_bridge_corridor";
  network: string | null;
  from: string | null;
  to: string | null;
  amountRaw: string;
  entrypoint: string | null;
  operationHash: string | null;
  timestamp: string | null;
  collection: string;
  source: string;
  sourceLabel: string | null;
};

type Tz2atEtherlinkBridgeSnapshot = {
  windowHours: number;
  since: string;
  until: string;
  l1ToEtherlinkVolumeRaw: string;
  etherlinkToL1VolumeRaw: string;
  etherlinkInternalVolumeRaw: string;
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
    byRecordSource: Record<string, number>;
  };
  readout: string;
};

interface Tz2atEcosystemAnalytics {
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
    filters: Record<string, string | number | undefined>;
  };
  marketHealth: Tz2atMarketHealthSnapshot;
  etherlinkBridge: Tz2atEtherlinkBridgeSnapshot;
  hosts: Array<{
    key: string;
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
    collectionCounts: Array<{ name: string; count: number }>;
    networkCounts: Array<{ name: string; count: number }>;
    latestTimestamp: string | null;
    latestBlockLevel: number | null;
  };
  segments: {
    byHost: Tz2atSegmentAnalytics[];
    byNetwork: Tz2atSegmentAnalytics[];
    byCollection: Tz2atSegmentAnalytics[];
    addressRoles: Array<{ name: string; count: number }>;
  };
  intelligence: {
    cards: Tz2atInsightCard[];
    lanes: Tz2atEcosystemLane[];
    valueFlows: Tz2atValueFlow[];
    routes: Tz2atRouteFlow[];
    valueAdders: Tz2atEntityAnalytics[];
    valueExtractors: Tz2atEntityAnalytics[];
  };
  usage: {
    topAddresses: Tz2atAddressAnalytics[];
    topContracts: Tz2atEntityAnalytics[];
    topMarketplaces: Tz2atEntityAnalytics[];
    topTokens: Tz2atEntityAnalytics[];
    topObjktGroups: Tz2atEntityAnalytics[];
  };
  liquidity: {
    totalXtzFlowMutez: string;
    marketplaceVolumeMutez: string;
    topXtzSenders: Tz2atEntityAnalytics[];
    topXtzReceivers: Tz2atEntityAnalytics[];
    topNetXtzIn: Tz2atEntityAnalytics[];
    topNetXtzOut: Tz2atEntityAnalytics[];
    topMarketplaceBuyers: Tz2atEntityAnalytics[];
    topMarketplaceSellers: Tz2atEntityAnalytics[];
    topMarketplaceVolume: Tz2atEntityAnalytics[];
  };
  cexFlow: {
    configured: boolean;
    addressBook: Array<{ address: string; label: string; source?: string }>;
    totalWithdrawnFromCexMutez: string;
    totalDepositedToCexMutez: string;
    topBuyersFromCex: Tz2atEntityAnalytics[];
    topSellersToCex: Tz2atEntityAnalytics[];
    unclassifiedCandidates: Tz2atEntityAnalytics[];
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
    sample: Array<Record<string, unknown>>;
    errors: Array<{ host: string; collection?: string; repo?: string; error: string }>;
  };
}

type ExplorerFilters = {
  chain: "" | Tz2atChain;
  eventType: string;
  q: string;
  walletAddress: string;
  address: string;
  contract: string;
  marketplace: string;
  tokenId: string;
  operationHash: string;
  fromLevel: string;
  toLevel: string;
  limit: string;
};

const MARKET_WINDOW_OPTIONS = [
  { value: 24, label: "24h" },
  { value: 48, label: "48h" },
  { value: 72, label: "72h" },
  { value: 96, label: "96h" },
  { value: 168, label: "1 week" },
] as const;

type AnalyticsFilters = {
  windowHours: string;
  hydrateCex: string;
  marketNetwork: string;
  limit: string;
  sampleRepos: string;
  cexAddresses: string;
  host: string;
  network: string;
  collection: string;
  address: string;
  contract: string;
  marketplace: string;
  token: string;
  q: string;
  minAmountMutez: string;
  fromLevel: string;
  toLevel: string;
};

const TZ2AT_EVENT_TYPES = [
  "xyz.tz2at.marketplace.collect",
  "xyz.tz2at.marketplace.swap",
  "xyz.tz2at.marketplace.bid",
  "xyz.tz2at.fa2.transfer",
  "xyz.tz2at.fa2.operatorUpdate",
  "xyz.tz2at.contract.call",
  "xyz.tz2at.transaction",
  "xyz.tz2at.account.activity",
  "xyz.tz2at.xtz.flow",
  "xyz.tz2at.raw.observation",
  "xyz.tz2at.bigmap.update",
  "xyz.tz2at.internal.operation",
  "xyz.tz2at.block",
  "xyz.tz2at.wallet.profile",
  "xyz.tz2at.contract.profile",
  "xyz.tz2at.marketplace.profile",
  "xyz.tz2at.chain.profile",
  "xyz.tz2at.platform.profile",
  "xyz.tz2at.edge.walletContract",
  "xyz.tz2at.edge.tokenObjktGroup",
  "xyz.tz2at.objkt.group",
] as const;

const defaultExplorerFilters: ExplorerFilters = {
  chain: "tezos",
  eventType: "",
  q: "",
  walletAddress: "",
  address: "",
  contract: "",
  marketplace: "",
  tokenId: "",
  operationHash: "",
  fromLevel: "",
  toLevel: "",
  limit: "25",
};

const defaultAnalyticsFilters: AnalyticsFilters = {
  windowHours: "72",
  hydrateCex: "true",
  marketNetwork: "mainnet",
  limit: "60",
  sampleRepos: "8",
  cexAddresses: "",
  host: "all",
  network: "mainnet",
  collection: "",
  address: "",
  contract: "",
  marketplace: "",
  token: "",
  q: "",
  minAmountMutez: "",
  fromLevel: "",
  toLevel: "",
};

const Shell = styled.div`
  min-height: 100%;
  padding: 12px;
  background: #c0c0c0;
  display: grid;
  gap: 10px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(250px, 330px);
  gap: 10px;

  @media (max-width: 780px) {
    grid-template-columns: 1fr;
  }
`;

const ExplorerGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 320px);
  gap: 10px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const Stack = styled.div`
  display: grid;
  gap: 8px;
`;

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const Step = styled.div<{ $active?: boolean }>`
  border: 1px solid ${(p) => (p.$active ? "#000080" : "#808080")};
  background: ${(p) => (p.$active ? "#fffff0" : "#f4f4f4")};
  padding: 8px;
  display: grid;
  gap: 6px;
`;

const Label = styled.div`
  font-weight: 700;
`;

const Help = styled.p`
  margin: 0;
  font-size: 12px;
  line-height: 1.35;
`;

const Mono = styled.code`
  font-family: "MS Sans Serif", monospace;
  font-size: 11px;
  overflow-wrap: anywhere;
`;

const List = styled.div`
  display: grid;
  gap: 6px;
`;

const Item = styled.div`
  border: 1px solid #808080;
  background: #ffffff;
  padding: 7px;
  display: grid;
  gap: 5px;
`;

const Tabs = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const TabButton = styled(Button)<{ $active?: boolean }>`
  font-weight: ${(p) => (p.$active ? 700 : 400)};
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(140px, 1fr));
  gap: 8px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.label`
  display: grid;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
`;

const Select = styled.select`
  min-height: 32px;
  border: 2px inset #ffffff;
  background: #ffffff;
  color: #000000;
  font-family: "MS Sans Serif", sans-serif;
  font-size: 12px;
  padding: 4px;
`;

const EventCard = styled(Item)`
  border-left: 4px solid #000080;
`;

const Details = styled.details`
  font-size: 11px;

  summary {
    cursor: pointer;
    font-weight: 700;
  }
`;

const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(130px, 1fr));
  gap: 8px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(130px, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const Metric = styled.div`
  border: 1px solid #808080;
  background: #ffffff;
  padding: 8px;
  min-height: 58px;
`;

const ReadoutPanel = styled.div`
  border: 2px solid #000080;
  background: #f8fbff;
  padding: 12px;
  display: grid;
  gap: 10px;
`;

const ReadoutHeadline = styled.div`
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;
`;

const ReadoutGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(260px, 0.7fr);
  gap: 10px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const InterpretationBox = styled.div<{ $tone?: "good" | "watch" | "risk" | "info" }>`
  border: 1px solid #808080;
  border-left: 6px solid
    ${(p) => (p.$tone === "good" ? "#008000" : p.$tone === "risk" ? "#b00000" : p.$tone === "watch" ? "#b36b00" : "#000080")};
  background: #ffffff;
  padding: 9px;
  display: grid;
  gap: 5px;
`;

const NarrativeList = styled.ul`
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  line-height: 1.35;
`;

const ChartGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const ChartPanel = styled.div`
  border: 1px solid #808080;
  background: #ffffff;
  padding: 9px;
  display: grid;
  gap: 8px;
`;

const BarRow = styled.div`
  display: grid;
  grid-template-columns: minmax(90px, 130px) minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  font-size: 12px;
`;

const BarTrack = styled.div`
  height: 13px;
  border: 1px solid #808080;
  background: #f2f2f2;
  overflow: hidden;
`;

const BarFill = styled.div<{ $pct: number; $tone?: "good" | "watch" | "risk" | "info" }>`
  width: ${(p) => Math.max(2, Math.min(100, p.$pct))}%;
  height: 100%;
  background: ${(p) => (p.$tone === "good" ? "#008000" : p.$tone === "risk" ? "#b00000" : p.$tone === "watch" ? "#b36b00" : "#000080")};
`;

const FullReport = styled(Details)`
  border: 1px solid #808080;
  background: #efefef;
  padding: 8px;

  > summary {
    font-size: 13px;
    margin-bottom: 8px;
  }
`;

const InsightCard = styled(Metric)<{ $tone: Tz2atInsightCard["tone"] }>`
  border-left: 5px solid
    ${(p) => (p.$tone === "good" ? "#008000" : p.$tone === "watch" ? "#b36b00" : p.$tone === "risk" ? "#b00000" : "#000080")};
`;

const MetricLabel = styled.div`
  font-size: 11px;
  text-transform: uppercase;
`;

const MetricValue = styled.div`
  font-size: 20px;
  font-weight: 700;
  overflow-wrap: anywhere;
`;

const AnalyticsBand = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const DenseList = styled.div`
  display: grid;
  gap: 4px;
  max-height: 300px;
  overflow: auto;
`;

const RankItem = styled(Item)`
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
`;

const SelectableRankItem = styled(RankItem)<{ $selected?: boolean }>`
  cursor: pointer;
  outline: ${(p) => (p.$selected ? "2px solid #000080" : "none")};
  background: ${(p) => (p.$selected ? "#fffff0" : "#ffffff")};

  &:focus {
    outline: 2px solid #000080;
  }
`;

function openOauth(handle: string, step: "identity" | "wallet-link") {
  const params = new URLSearchParams({
    app: "tz2at",
    step,
    returnTo: "/tz2at",
    popup: "1",
    handle: handle.trim(),
  });
  window.open(`/api/atproto/oauth/start?${params.toString()}`, "tz2at_atproto", "width=520,height=720");
}

function walletKey(chain: Tz2atChain, walletAddress: string) {
  return `${chain}:${walletAddress.toLowerCase()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function eventPayload(item: Record<string, unknown>) {
  return isRecord(item.payload) ? { ...item.payload, ...item } : item;
}

function fieldText(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return null;
}

function eventType(item: Record<string, unknown>) {
  return fieldText(item, ["$type", "eventType", "type", "collection"]) ?? "unknown event";
}

function compactHash(value: string | null) {
  if (!value) return null;
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}

function amountScaleForNetwork(network?: string | string[] | null) {
  const networks = Array.isArray(network) ? network : network ? [network] : [];
  return networks.some((item) => item.toLowerCase().includes("etherlink")) ? 1_000_000_000_000_000_000 : 1_000_000;
}

function formatMutez(value: string | undefined | null, network?: string | string[] | null) {
  if (!value) return "0 XTZ";
  const mutez = Number(value);
  if (!Number.isFinite(mutez)) return `${value} mutez`;
  const xtz = mutez / amountScaleForNetwork(network);
  if (Math.abs(xtz) >= 1_000_000) return `${(xtz / 1_000_000).toFixed(2)}M XTZ`;
  if (Math.abs(xtz) >= 1_000) return `${(xtz / 1_000).toFixed(2)}K XTZ`;
  return `${xtz.toFixed(2)} XTZ`;
}

function signedMutez(value: string | undefined | null, network?: string | string[] | null) {
  if (!value) return "0 XTZ";
  const sign = value.startsWith("-") ? "-" : "";
  return `${sign}${formatMutez(value.replace(/^-/, ""), network)}`;
}

function entityTitle(entity: Tz2atEntityAnalytics) {
  return entity.label || compactHash(entity.id) || entity.id;
}

function sameEntity(a: SelectedAnalyticsEntity | null, kind: AnalyticsEntityKind, id: string) {
  return Boolean(a && a.kind === kind && a.id.toLowerCase() === id.toLowerCase());
}

function entityFilterPatch(entity: SelectedAnalyticsEntity): Partial<AnalyticsFilters> {
  if (entity.kind === "contract") return { contract: entity.id };
  if (entity.kind === "marketplace") return { marketplace: entity.id };
  if (entity.kind === "token" || entity.kind === "group") return { token: entity.id };
  return { address: entity.id };
}

function rankAmount(entity: Tz2atEntityAnalytics) {
  // Server liquidity leaderboards aggregate in mutez-comparable units (WTF-BB-186).
  return entity.amountMutez && entity.amountMutez !== "0" ? formatMutez(entity.amountMutez) : `${entity.count}`;
}

function amountAsNumber(value: string | undefined | null, network?: string | string[] | null) {
  const raw = Number(value ?? "0");
  if (!Number.isFinite(raw)) return 0;
  return raw / amountScaleForNetwork(network);
}

function collectionLabel(collection: string) {
  return collection
    .replace(/^xyz\.tz2at\./, "")
    .replaceAll(".", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function latestAgeLabel(timestamp: string | null) {
  if (!timestamp) return "no timestamp";
  const ageMs = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(ageMs) || ageMs < 0) return "fresh timestamp";
  const minutes = Math.round(ageMs / 60_000);
  if (minutes < 2) return "about a minute old";
  if (minutes < 60) return `${minutes} minutes old`;
  const hours = Math.round(minutes / 60);
  return `${hours} hours old`;
}

function networkTone(network: string): "good" | "watch" | "risk" | "info" {
  const lower = network.toLowerCase();
  if (lower.includes("etherlink")) return "watch";
  if (lower.includes("mainnet") || lower.includes("tezos")) return "good";
  return "info";
}

function topNetworkSegments(analytics: Tz2atEcosystemAnalytics) {
  return analytics.segments.byNetwork
    .map((segment) => ({ ...segment, displayAmount: amountAsNumber(segment.amountMutez, segment.name) }))
    .sort((a, b) => b.displayAmount - a.displayAmount || b.count - a.count);
}

function topCollectionSegments(analytics: Tz2atEcosystemAnalytics) {
  return analytics.segments.byCollection
    .map((segment) => ({ ...segment, displayAmount: amountAsNumber(segment.amountMutez) }))
    .sort((a, b) => b.displayAmount - a.displayAmount || b.count - a.count);
}

function hasEtherlinkLiquidity(analytics: Tz2atEcosystemAnalytics) {
  return analytics.segments.byNetwork.some((segment) => segment.name.toLowerCase().includes("etherlink") && segment.amountMutez !== "0");
}

function hasBridgeEvidence(analytics: Tz2atEcosystemAnalytics) {
  return analytics.intelligence.valueFlows.some((flow) =>
    [flow.collection, flow.label, flow.from ?? "", flow.to ?? ""].some((value) => value.toLowerCase().includes("bridge"))
  );
}

function formatRecordSourceLabel(source: string, detail?: string | null) {
  const labels: Record<string, string> = {
    "main-relay": "Main relay (tz2at.store)",
    "category-pds": "Category PDS",
    "replay-mainnet": "Replay · Tezos mainnet",
    "replay-shadownet": "Replay · Shadownet",
    "replay-etherlink": "Replay · Etherlink",
    "cex-entity-repo": "CEX entity repo",
  };
  const base = labels[source] ?? source;
  return detail ? `${base} · ${detail}` : base;
}

function LiquidityFlowPanel({ analytics }: { analytics: Tz2atEcosystemAnalytics }) {
  const { userFlow, marketFlow } = analytics.marketHealth;
  const network = analytics.marketHealth.network;
  return (
    <GroupBox label="Liquidity flow: CEX, users, and markets">
      <Stack>
        <Help>
          CEX custody is book-labeled only. User and market rows are Tezos {network} flows in the selected window — not Etherlink rollup units (see Etherlink Bridge tab).
        </Help>
        <AnalyticsBand>
          <AnalyticsList title="Top receivers from CEX" items={userFlow.topReceiversFromCex} entityKind="address" />
          <AnalyticsList title="Top senders to CEX" items={userFlow.topSendersToCex} entityKind="address" />
        </AnalyticsBand>
        <AnalyticsBand>
          <AnalyticsList title="Top retail senders (non-CEX)" items={userFlow.topRetailSenders} entityKind="address" />
          <AnalyticsList title="Top retail receivers (non-CEX)" items={userFlow.topRetailReceivers} entityKind="address" />
        </AnalyticsBand>
        <AnalyticsBand>
          <AnalyticsList title="Marketplace buyers" items={marketFlow.topBuyers} entityKind="address" />
          <AnalyticsList title="Marketplace sellers" items={marketFlow.topSellers} entityKind="address" />
          <AnalyticsList title="Market venues" items={marketFlow.topVenues} entityKind="marketplace" />
        </AnalyticsBand>
        {(userFlow.topRetailRoutes.length > 0 || marketFlow.topRoutes.length > 0) && (
          <AnalyticsBand>
            <RouteFlowList routes={userFlow.topRetailRoutes} title="Top wallet-to-wallet routes (no CEX)" />
            <RouteFlowList routes={marketFlow.topRoutes} title="Top marketplace routes" />
          </AnalyticsBand>
        )}
      </Stack>
    </GroupBox>
  );
}

function EtherlinkBridgePanel({ analytics }: { analytics: Tz2atEcosystemAnalytics }) {
  const bridge = analytics.etherlinkBridge;
  const etherlinkNetwork = "etherlink-mainnet";
  return (
    <Stack>
      <GroupBox label={`Mainnet ↔ Etherlink (${bridge.windowHours}h)`}>
        <Stack>
          <Help>{bridge.readout}</Help>
          <Help>
            Window {bridge.since.slice(0, 16)} → {bridge.until.slice(0, 16)} UTC. Etherlink credit/debit entrypoints approximate L1 deposit and L1 withdrawal accounting; Tezos rows need explicit bridge/rollup/etherlink text in the record.
          </Help>
          <MetricGrid>
            <Metric>
              <MetricLabel>L1 → Etherlink (credit)</MetricLabel>
              <MetricValue>{formatMutez(bridge.l1ToEtherlinkVolumeRaw, etherlinkNetwork)}</MetricValue>
            </Metric>
            <Metric>
              <MetricLabel>Etherlink → L1 (debit)</MetricLabel>
              <MetricValue>{formatMutez(bridge.etherlinkToL1VolumeRaw, etherlinkNetwork)}</MetricValue>
            </Metric>
            <Metric>
              <MetricLabel>Etherlink internal</MetricLabel>
              <MetricValue>{formatMutez(bridge.etherlinkInternalVolumeRaw, etherlinkNetwork)}</MetricValue>
            </Metric>
            <Metric>
              <MetricLabel>Tezos bridge-tagged</MetricLabel>
              <MetricValue>{formatMutez(bridge.tezosBridgeCorridorVolumeMutez, "mainnet")}</MetricValue>
              <Help>Mainnet/shadownet flows mentioning bridge, rollup, or etherlink.</Help>
            </Metric>
            <Metric>
              <MetricLabel>Etherlink flow rows</MetricLabel>
              <MetricValue>{bridge.etherlinkFlowRecordCount.toLocaleString()}</MetricValue>
            </Metric>
            <Metric>
              <MetricLabel>Replay sources</MetricLabel>
              <MetricValue>
                EL {bridge.sources.replayEtherlinkRecords.toLocaleString()} / L1 {bridge.sources.replayMainnetRecords.toLocaleString()}
              </MetricValue>
              <Help>{bridge.sources.etherlinkRecordsInWindow.toLocaleString()} Etherlink-network rows in window.</Help>
            </Metric>
          </MetricGrid>
          <AnalyticsBand>
            <RouteFlowList routes={bridge.topL1ToEtherlinkRoutes} title="L1 → Etherlink routes (credit)" />
            <RouteFlowList routes={bridge.topEtherlinkToL1Routes} title="Etherlink → L1 routes (debit)" />
            <RouteFlowList routes={bridge.topEtherlinkInternalRoutes} title="Etherlink internal routes" />
          </AnalyticsBand>
        </Stack>
      </GroupBox>
      {bridge.flows.length > 0 && (
        <GroupBox label="Bridge flow samples (with source labels)">
          <DenseList>
            {bridge.flows.slice(0, 24).map((flow) => (
              <RankItem key={`${flow.operationHash ?? flow.timestamp}:${flow.direction}`}>
                <Stack>
                  <strong>{flow.direction.replaceAll("_", " ")}</strong>
                  <Mono>
                    {compactHash(flow.from)} → {compactHash(flow.to)}
                  </Mono>
                  <Help>
                    {formatRecordSourceLabel(flow.source, flow.sourceLabel)}
                    {flow.entrypoint ? ` · ${flow.entrypoint}` : ""}
                  </Help>
                </Stack>
                <strong>{formatMutez(flow.amountRaw, flow.network ?? etherlinkNetwork)}</strong>
              </RankItem>
            ))}
          </DenseList>
        </GroupBox>
      )}
    </Stack>
  );
}

function MarketHealthPanel({ analytics }: { analytics: Tz2atEcosystemAnalytics }) {
  const health = analytics.marketHealth;
  const network = health.network;
  const sourceEntries = Object.entries(health.sources.recordSources ?? {});
  return (
    <GroupBox label={`Market health (${health.windowHours}h · ${network})`}>
      <Stack>
        <Help>
          Tezos market snapshot from replay, category PDS repos, and per-CEX entity repos — not a live-stream head sample. Window: {health.since.slice(0, 16)} → {health.until.slice(0, 16)} UTC. Etherlink bridge liquidity is on the Etherlink Bridge tab.
        </Help>
        <MetricGrid>
          <Metric>
            <MetricLabel>Capital in from CEX</MetricLabel>
            <MetricValue>{formatMutez(health.capitalEnteredFromCexMutez, network)}</MetricValue>
            <Help>Withdrawals from known exchange custody into Tezos wallets.</Help>
          </Metric>
          <Metric>
            <MetricLabel>Capital out to CEX</MetricLabel>
            <MetricValue>{formatMutez(health.capitalExitedToCexMutez, network)}</MetricValue>
            <Help>Deposits from Tezos wallets into known exchange custody.</Help>
          </Metric>
          <Metric>
            <MetricLabel>Internal Tezos flow</MetricLabel>
            <MetricValue>{formatMutez(health.internalNetFlowMutez, network)}</MetricValue>
            <Help>Non-CEX wallet-to-wallet transfer volume in the window.</Help>
          </Metric>
          <Metric>
            <MetricLabel>Marketplace volume</MetricLabel>
            <MetricValue>{formatMutez(health.marketplaceVolumeMutez, network)}</MetricValue>
          </Metric>
          <Metric>
            <MetricLabel>Flow records</MetricLabel>
            <MetricValue>{health.flowRecordCount.toLocaleString()}</MetricValue>
            <Help>
              Sources: replay L1 {health.sources.replayMainnetRecords.toLocaleString()}, replay EL {health.sources.replayEtherlinkRecords.toLocaleString()}, entity repos{" "}
              {health.sources.cexEntityRepoRecords.toLocaleString()}, relay {health.sources.mainRelayRecords.toLocaleString()} ({health.sources.windowMatchedRecords.toLocaleString()} in window).
              {sourceEntries.length > 0 ? ` Labeled in-window: ${sourceEntries.map(([k, v]) => `${k} ${v}`).join(", ")}.` : ""}
            </Help>
          </Metric>
          <Metric>
            <MetricLabel>CEX hydration</MetricLabel>
            <MetricValue>
              {health.hydration.requested ? `${health.hydration.queued}/${health.hydration.wallets}` : "off"}
            </MetricValue>
            <Help>
              {health.hydration.requested
                ? `Queued async backfill jobs (max ${health.hydration.maxPagesPerWallet} pages/wallet). Failures: ${health.hydration.failed}.`
                : "Hydration disabled for this run."}
            </Help>
          </Metric>
        </MetricGrid>
        {(health.topInflowRoutes.length > 0 || health.topOutflowRoutes.length > 0) && (
          <AnalyticsBand>
            <RouteFlowList routes={health.topInflowRoutes} title="Top inflow routes (CEX → ecosystem)" />
            <RouteFlowList routes={health.topOutflowRoutes} title="Top outflow routes (ecosystem → CEX)" />
          </AnalyticsBand>
        )}
      </Stack>
    </GroupBox>
  );
}

function deriveEcosystemReadout(analytics: Tz2atEcosystemAnalytics) {
  const health = analytics.marketHealth;
  const topNetwork = topNetworkSegments(analytics)[0];
  const topCollection = topCollectionSegments(analytics)[0];
  const cexFlows = analytics.cexFlow.flows.length;
  const bridgeFlows = analytics.etherlinkBridge.etherlinkFlowRecordCount;
  const tezosBridgeTagged = analytics.etherlinkBridge.tezosBridgeTaggedCount;
  const marketVolume = amountAsNumber(analytics.liquidity.marketplaceVolumeMutez);
  const matched = analytics.overview.matchedRecords;
  const scanned = analytics.overview.scannedRecords;
  const coverage = scanned > 0 ? Math.round((matched / scanned) * 100) : 0;

  const headline =
    matched === 0
      ? `No tz2at records matched the last ${health.windowHours}h window on ${health.network} after filters.`
      : `Over the last ${health.windowHours}h on ${health.network}, ${formatMutez(health.capitalEnteredFromCexMutez, health.network)} entered from CEX custody and ${formatMutez(health.capitalExitedToCexMutez, health.network)} exited to CEX.`;

  const implications = [
    `${matched.toLocaleString()} of ${scanned.toLocaleString()} in-window records matched filters (${coverage}%). Replay contributed ${health.sources.replayRecords.toLocaleString()} rows; CEX entity repos ${health.sources.cexEntityRepoRecords.toLocaleString()}.`,
    cexFlows > 0
      ? `${cexFlows} flow${cexFlows === 1 ? "" : "s"} matched the current CEX custody book. Those are the only rows this panel should call CEX buy/sell evidence.`
      : `No CEX-classified deposits or withdrawals were observed in this sampled period with the current ${analytics.query.cexAddressCount.toLocaleString()}-address custody book.`,
    analytics.etherlinkBridge.etherlinkFlowRecordCount > 0
      ? `Etherlink bridge tab shows ${analytics.etherlinkBridge.etherlinkFlowRecordCount} classified rollup flows in the same window (credit/debit and internal).`
      : "Open the Etherlink Bridge tab for mainnet↔Etherlink corridor volume; this Tezos tab excludes Etherlink base units from CEX totals.",
    marketVolume > 0
      ? `Marketplace activity is part of the value story: ${formatMutez(analytics.liquidity.marketplaceVolumeMutez)} in visible collects, bids, or swaps.`
      : "Marketplace value is not visible in this slice; use the Marketplace preset or expand samples before reading that as quiet demand.",
  ];

  const caveats = [
    `Freshness: ${latestAgeLabel(analytics.overview.latestTimestamp)}${analytics.overview.latestBlockLevel ? ` at level ${analytics.overview.latestBlockLevel}` : ""}.`,
    "CEX labels are conservative: unknown exchange wallets, bridge custody, OTC desks, and internal exchange sweep addresses stay unclassified until added to the book.",
    "Cross-network XTZ totals are shown by network because Tezos L1 and Etherlink records use different base units.",
  ];

  return {
    headline,
    implications,
    caveats,
    cexTone: cexFlows > 0 ? ("good" as const) : ("watch" as const),
    bridgeTone: bridgeFlows > 0 || tezosBridgeTagged > 0 ? ("good" as const) : ("info" as const),
  };
}

function HorizontalBars({
  title,
  rows,
  valueLabel,
  toneFor,
}: {
  title: string;
  rows: Array<{ name: string; count: number; amountMutez: string; displayAmount: number }>;
  valueLabel: (row: { name: string; count: number; amountMutez: string; displayAmount: number }) => string;
  toneFor?: (row: { name: string; count: number; amountMutez: string; displayAmount: number }) => "good" | "watch" | "risk" | "info";
}) {
  const max = Math.max(...rows.map((row) => row.displayAmount), ...rows.map((row) => row.count), 1);
  return (
    <ChartPanel>
      <strong>{title}</strong>
      {rows.length ? (
        rows.slice(0, 6).map((row) => {
          const value = row.displayAmount > 0 ? row.displayAmount : row.count;
          return (
            <BarRow key={`${title}:${row.name}`}>
              <Mono>{collectionLabel(row.name)}</Mono>
              <BarTrack aria-label={`${row.name} share`}>
                <BarFill $pct={(value / max) * 100} $tone={toneFor?.(row) ?? "info"} />
              </BarTrack>
              <span>{valueLabel(row)}</span>
            </BarRow>
          );
        })
      ) : (
        <Item>No chartable records in this slice.</Item>
      )}
    </ChartPanel>
  );
}

function EcosystemReadout({ analytics }: { analytics: Tz2atEcosystemAnalytics }) {
  const readout = deriveEcosystemReadout(analytics);
  const networkRows = topNetworkSegments(analytics);
  const collectionRows = topCollectionSegments(analytics);
  const largestFlows = analytics.intelligence.valueFlows.slice(0, 5).map((flow) => ({
    name: `${flow.network ?? "unknown"} ${flow.label}`,
    count: 1,
    amountMutez: flow.amountMutez,
    displayAmount: amountAsNumber(flow.amountMutez, flow.network),
  }));

  return (
    <ReadoutPanel>
      <Stack>
        <MetricLabel>Executive Readout</MetricLabel>
        <ReadoutHeadline>{readout.headline}</ReadoutHeadline>
      </Stack>
      <ReadoutGrid>
        <Stack>
          <InterpretationBox $tone="info">
            <strong>What the report is saying</strong>
            <NarrativeList>
              {readout.implications.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </NarrativeList>
          </InterpretationBox>
          <InterpretationBox $tone={readout.cexTone}>
            <strong>CEX buy/sell read</strong>
            <Help>
              {analytics.cexFlow.flows.length
                ? `${analytics.cexFlow.flows.length} matched flow${analytics.cexFlow.flows.length === 1 ? "" : "s"} found. Buyers are addresses receiving from known exchange custody; sellers are addresses sending into known exchange custody.`
                : "No matched CEX flow in the current sample. This means the visible records did not touch the known custody book, not that no ecosystem user bought or sold through a CEX."}
            </Help>
          </InterpretationBox>
          <InterpretationBox $tone={readout.bridgeTone}>
            <strong>Etherlink and bridge context</strong>
            <Help>
              {hasEtherlinkLiquidity(analytics)
                ? hasBridgeEvidence(analytics)
                  ? "Etherlink value is present and bridge-like evidence appears in flow text. Open the firehose on those addresses before calling direction."
                  : "Etherlink value is present, but these records are Etherlink-network transfers. The current report cannot say L1-to-Etherlink, Etherlink-to-L1, or purely internal Etherlink movement without bridge endpoint labels."
                : "No Etherlink value movement appears under the current filters."}
            </Help>
          </InterpretationBox>
        </Stack>
        <InterpretationBox $tone="watch">
          <strong>Confidence notes</strong>
          <NarrativeList>
            {readout.caveats.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </NarrativeList>
        </InterpretationBox>
      </ReadoutGrid>
      <ChartGrid>
        <HorizontalBars
          title="Liquidity By Network"
          rows={networkRows}
          valueLabel={(row) => (row.amountMutez !== "0" ? formatMutez(row.amountMutez, row.name) : `${row.count} records`)}
          toneFor={(row) => networkTone(row.name)}
        />
        <HorizontalBars
          title="Record Families"
          rows={collectionRows}
          valueLabel={(row) => (row.amountMutez !== "0" ? formatMutez(row.amountMutez) : `${row.count} records`)}
        />
        <HorizontalBars
          title="Largest Visible Flows"
          rows={largestFlows}
          valueLabel={(row) => formatMutez(row.amountMutez, row.name)}
          toneFor={(row) => networkTone(row.name)}
        />
        <ChartPanel>
          <strong>Useful next read</strong>
          <DenseList>
            {analytics.cexFlow.unclassifiedCandidates?.slice(0, 4).map((entry) => (
              <RankItem key={`readout-candidate:${entry.id}`}>
                <Stack>
                  <Mono>{compactHash(entry.id)}</Mono>
                  <Help>Candidate custody hub, not labeled CEX yet</Help>
                </Stack>
                <strong>{formatMutez(entry.amountMutez, entry.networks)}</strong>
              </RankItem>
            ))}
            {!analytics.cexFlow.unclassifiedCandidates?.length ? <Item>No obvious unlabeled custody hubs in this slice.</Item> : null}
          </DenseList>
        </ChartPanel>
      </ChartGrid>
    </ReadoutPanel>
  );
}

function AnalyticsList({
  title,
  items,
  mode = "amount",
  entityKind = "address",
  selected,
  onSelect,
}: {
  title: string;
  items: Tz2atEntityAnalytics[];
  mode?: "amount" | "net" | "count";
  entityKind?: AnalyticsEntityKind;
  selected?: SelectedAnalyticsEntity | null;
  onSelect?: (entity: SelectedAnalyticsEntity) => void;
}) {
  return (
    <GroupBox label={title}>
      <DenseList>
        {items.length ? (
          items.map((item) => (
            <SelectableRankItem
              key={`${title}:${item.id}`}
              $selected={sameEntity(selected ?? null, entityKind, item.id)}
              role="button"
              tabIndex={0}
              onClick={() => onSelect?.({ kind: entityKind, id: item.id, label: item.label })}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect?.({ kind: entityKind, id: item.id, label: item.label });
              }}
            >
              <Stack>
                <Mono>{entityTitle(item)}</Mono>
                <Help>
                  {item.collections.slice(0, 2).join(", ") || "records"} {item.networks.length ? `on ${item.networks.join(", ")}` : ""}
                </Help>
              </Stack>
              <strong>{mode === "net" ? signedMutez(item.netMutez) : mode === "count" ? item.count : rankAmount(item)}</strong>
            </SelectableRankItem>
          ))
        ) : (
          <Item>No records in this slice.</Item>
        )}
      </DenseList>
    </GroupBox>
  );
}

function SegmentList({ title, items, networkAware = false }: { title: string; items: Tz2atSegmentAnalytics[]; networkAware?: boolean }) {
  return (
    <GroupBox label={title}>
      <DenseList>
        {items.length ? (
          items.map((item) => (
            <RankItem key={`${title}:${item.name}`}>
              <Stack>
                <Mono>{item.name}</Mono>
                <Help>
                  {item.latestBlockLevel ? `level ${item.latestBlockLevel}` : "level n/a"} {item.latestTimestamp ? ` / ${item.latestTimestamp}` : ""}
                </Help>
              </Stack>
              <Stack>
                <strong>{item.count}</strong>
                {item.amountMutez !== "0" ? <Help>{formatMutez(item.amountMutez, networkAware ? item.name : undefined)}</Help> : null}
              </Stack>
            </RankItem>
          ))
        ) : (
          <Item>No records in this segment.</Item>
        )}
      </DenseList>
    </GroupBox>
  );
}

function LaneList({ lanes }: { lanes: Tz2atEcosystemLane[] }) {
  return (
    <GroupBox label="Ecosystem Lanes">
      <DenseList>
        {lanes.length ? (
          lanes.map((lane) => (
            <RankItem key={lane.lane}>
              <Stack>
                <strong>{lane.label}</strong>
                <Help>
                  {lane.topCollection ?? "mixed records"} / {Math.round(lane.shareOfMatchedRecords * 100)}% of slice
                </Help>
              </Stack>
              <Stack>
                <strong>{lane.count}</strong>
                {lane.amountMutez !== "0" ? <Help>{formatMutez(lane.amountMutez)}</Help> : null}
              </Stack>
            </RankItem>
          ))
        ) : (
          <Item>No lanes in this slice.</Item>
        )}
      </DenseList>
    </GroupBox>
  );
}

function ValueFlowList({ flows, onSelectEntity }: { flows: Tz2atValueFlow[]; onSelectEntity?: (entity: SelectedAnalyticsEntity) => void }) {
  return (
    <GroupBox label="Largest Value Flows">
      <DenseList>
        {flows.length ? (
          flows.slice(0, 12).map((flow) => (
            <RankItem key={flow.uri}>
              <Stack>
                <Row>
                  <strong>{flow.label}</strong>
                  <span>{flow.network ?? "unknown"}</span>
                  {flow.blockLevel ? <span>level {flow.blockLevel}</span> : null}
                </Row>
                <Mono>
                  {compactHash(flow.from) ?? "unknown"} {"->"} {compactHash(flow.to) ?? "unknown"}
                </Mono>
                <Row>
                  {flow.from ? (
                    <Button size="sm" onClick={() => onSelectEntity?.({ kind: "address", id: flow.from ?? "" })}>
                      Focus source
                    </Button>
                  ) : null}
                  {flow.to ? (
                    <Button size="sm" onClick={() => onSelectEntity?.({ kind: "address", id: flow.to ?? "" })}>
                      Focus target
                    </Button>
                  ) : null}
                </Row>
                <Help>{flow.collection}</Help>
              </Stack>
              <strong>{formatMutez(flow.amountMutez, flow.network)}</strong>
            </RankItem>
          ))
        ) : (
          <Item>No value-bearing flows in this slice.</Item>
        )}
      </DenseList>
    </GroupBox>
  );
}

function RouteFlowList({
  routes,
  title = "Liquidity Routes",
  onSelectEntity,
}: {
  routes: Tz2atRouteFlow[];
  title?: string;
  onSelectEntity?: (entity: SelectedAnalyticsEntity) => void;
}) {
  return (
    <GroupBox label={title}>
      <DenseList>
        {routes.length ? (
          routes.slice(0, 12).map((route) => (
            <RankItem key={`${route.collection}:${route.from}:${route.to}:${route.via ?? ""}`}>
              <Stack>
                <Row>
                  <strong>{route.route}</strong>
                  <span>{route.network ?? "unknown"}</span>
                  <span>{route.count}x</span>
                </Row>
                <Help>
                  {route.collection} {route.latestTimestamp ? `/ ${route.latestTimestamp}` : ""}
                </Help>
                <Row>
                  <Button size="sm" onClick={() => onSelectEntity?.({ kind: "address", id: route.from })}>
                    From
                  </Button>
                  {route.via ? (
                    <Button size="sm" onClick={() => onSelectEntity?.({ kind: "marketplace", id: route.via ?? "" })}>
                      Via
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={() => onSelectEntity?.({ kind: "address", id: route.to })}>
                    To
                  </Button>
                </Row>
              </Stack>
              <strong>{formatMutez(route.amountMutez, route.network)}</strong>
            </RankItem>
          ))
        ) : (
          <Item>No repeated value routes in this slice.</Item>
        )}
      </DenseList>
    </GroupBox>
  );
}

function EntityDossier({
  entity,
  analytics,
  onScopeAnalytics,
  onOpenFirehose,
  onClear,
}: {
  entity: SelectedAnalyticsEntity | null;
  analytics: Tz2atEcosystemAnalytics;
  onScopeAnalytics: (entity: SelectedAnalyticsEntity) => void;
  onOpenFirehose: (entity: SelectedAnalyticsEntity) => void;
  onClear: () => void;
}) {
  const profile = entity ? findEntityProfile(analytics, entity) : null;
  const flows = entity ? analytics.intelligence.valueFlows.filter((flow) => flowTouchesEntity(flow, entity.id)).slice(0, 8) : [];
  const sampleRecords = entity ? analytics.records.sample.filter((record) => JSON.stringify(record).toLowerCase().includes(entity.id.toLowerCase())).slice(0, 4) : [];

  return (
    <GroupBox label="Entity Dossier">
      {!entity ? (
        <Item>Select an address, contract, marketplace, token, or flow endpoint to inspect it.</Item>
      ) : (
        <Stack>
          <Item>
            <Row>
              <strong>{entity.kind}</strong>
              <Button size="sm" onClick={() => onScopeAnalytics(entity)}>
                Scope analytics
              </Button>
              <Button size="sm" onClick={() => onOpenFirehose(entity)}>
                Open firehose
              </Button>
              <Button size="sm" onClick={onClear}>
                Clear
              </Button>
            </Row>
            <Mono>{entity.label || entity.id}</Mono>
            {profile ? (
              <Help>
                {profile.count} records / {profile.amountMutez && profile.amountMutez !== "0" ? formatMutez(profile.amountMutez, profile.networks) : "no value total"}{" "}
                {profile.networks.length ? `/ ${profile.networks.join(", ")}` : ""}
              </Help>
            ) : (
              <Help>No aggregate profile in the current slice. Scoping may find it in a larger sample.</Help>
            )}
          </Item>
          <DenseList>
            {flows.length ? (
              flows.map((flow) => (
                <RankItem key={`dossier:${flow.uri}`}>
                  <Stack>
                    <strong>{flow.label}</strong>
                    <Mono>
                      {compactHash(flow.from) ?? "unknown"} {"->"} {compactHash(flow.to) ?? "unknown"}
                    </Mono>
                    <Help>
                      {flow.network ?? "unknown"} {flow.blockLevel ? `/ level ${flow.blockLevel}` : ""}
                    </Help>
                  </Stack>
                  <strong>{formatMutez(flow.amountMutez, flow.network)}</strong>
                </RankItem>
              ))
            ) : (
              <Item>No value flows for this entity in the current slice.</Item>
            )}
          </DenseList>
          {sampleRecords.length ? (
            <Details>
              <summary>Matching sample records</summary>
              <Mono>{JSON.stringify(sampleRecords, null, 2).slice(0, 1200)}</Mono>
            </Details>
          ) : null}
        </Stack>
      )}
    </GroupBox>
  );
}

function findEntityProfile(analytics: Tz2atEcosystemAnalytics, entity: SelectedAnalyticsEntity): Tz2atEntityAnalytics | null {
  const sources = [
    analytics.usage.topAddresses,
    analytics.usage.topContracts,
    analytics.usage.topMarketplaces,
    analytics.usage.topTokens,
    analytics.usage.topObjktGroups,
    (analytics.intelligence.routes ?? []).map((route) => ({
      id: route.via ?? route.to,
      label: route.route,
      count: route.count,
      amountMutez: route.amountMutez,
      collections: [route.collection],
      networks: route.network ? [route.network] : [],
      latestTimestamp: route.latestTimestamp,
    })),
    analytics.liquidity.topXtzSenders,
    analytics.liquidity.topXtzReceivers,
    analytics.liquidity.topNetXtzIn,
    analytics.liquidity.topNetXtzOut,
    analytics.liquidity.topMarketplaceBuyers,
    analytics.liquidity.topMarketplaceSellers,
    analytics.liquidity.topMarketplaceVolume,
    analytics.cexFlow.topBuyersFromCex,
    analytics.cexFlow.topSellersToCex,
    analytics.intelligence.valueAdders,
    analytics.intelligence.valueExtractors,
  ];
  return sources.flat().find((item) => item.id.toLowerCase() === entity.id.toLowerCase()) ?? null;
}

function flowTouchesEntity(flow: Tz2atValueFlow, entityId: string) {
  const needle = entityId.toLowerCase();
  return [flow.from, flow.to, flow.uri, flow.operationHash].some((value) => value?.toLowerCase().includes(needle));
}

function buildExplorerParams(filters: ExplorerFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    const next = value.trim();
    if (next) params.set(key, next);
  });
  return params;
}

function Tz2atEventRow({ item }: { item: Record<string, unknown> }) {
  const event = eventPayload(item);
  const type = eventType(event);
  const hash = compactHash(fieldText(event, ["operationHash", "opHash", "hash"]));
  const timestamp = fieldText(event, ["timestamp", "createdAt", "indexedAt"]);
  const level = fieldText(event, ["blockLevel", "level"]);
  const actor = fieldText(event, ["buyer", "seller", "source", "from", "to", "address", "walletAddress"]);
  const target = fieldText(event, ["contract", "destination", "marketplace", "tokenContract"]);
  const token = fieldText(event, ["tokenId", "token_id", "objktId", "marketplaceObjectId"]);

  return (
    <EventCard>
      <Row>
        <strong>{type}</strong>
        {fieldText(event, ["network", "chain"]) ? <span>{fieldText(event, ["network", "chain"])}</span> : null}
        {level ? <span>level {level}</span> : null}
      </Row>
      <Row>
        {timestamp ? <span>{timestamp}</span> : null}
        {hash ? <Mono>{hash}</Mono> : null}
      </Row>
      <Row>
        {actor ? <Mono>{actor}</Mono> : null}
        {target ? <Mono>{target}</Mono> : null}
        {token ? <span>token {token}</span> : null}
      </Row>
      <Details>
        <summary>Raw record</summary>
        <Mono>{JSON.stringify(item, null, 2).slice(0, 900)}</Mono>
      </Details>
    </EventCard>
  );
}

export function Tz2at() {
  const queryClient = useQueryClient();
  const [handle, setHandle] = useState("");
  const [activePanel, setActivePanel] = useState<"tezos-market" | "etherlink" | "firehose" | "identity">("tezos-market");
  const [explorerDraft, setExplorerDraft] = useState<ExplorerFilters>(defaultExplorerFilters);
  const [explorerFilters, setExplorerFilters] = useState<ExplorerFilters>(defaultExplorerFilters);
  const [analyticsDraft, setAnalyticsDraft] = useState<AnalyticsFilters>(defaultAnalyticsFilters);
  const [analyticsFilters, setAnalyticsFilters] = useState<AnalyticsFilters>(defaultAnalyticsFilters);
  const [selectedEntity, setSelectedEntity] = useState<SelectedAnalyticsEntity | null>(null);
  const statusQuery = useQuery({
    queryKey: ["tz2at", "status"],
    queryFn: () => api.get<Tz2atStatus>("/api/tz2at/status"),
  });
  const status = statusQuery.data;
  const effectiveHandle = handle || status?.account?.handle || "";

  useEffect(() => {
    logClientSystemEvent({
      eventType: "tz2at.identity.viewed",
      message: "tz2at identity proof app opened",
    });
  }, []);

  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key?.startsWith("tz2at:atproto-")) {
        void queryClient.invalidateQueries({ queryKey: ["tz2at"] });
      }
    };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [queryClient]);

  const localWallets = useMemo(() => {
    const tezos = status?.wallets.tezos.map((wallet) => ({
      chain: "tezos" as const,
      walletAddress: wallet.walletAddress,
      label: wallet.tezDomain || wallet.walletAddress,
      primary: wallet.isPrimary,
    })) ?? [];
    const etherlink = status?.wallets.etherlink.map((wallet) => ({
      chain: "etherlink" as const,
      walletAddress: wallet.walletAddress,
      label: wallet.walletAddress,
      primary: wallet.isPrimary,
    })) ?? [];
    return [...tezos, ...etherlink];
  }, [status]);

  const publishedKeys = useMemo(
    () => new Set(status?.links.filter((link) => link.verificationStatus === "published").map((link) => walletKey(link.chain, link.walletAddress)) ?? []),
    [status]
  );

  const importMutation = useMutation({
    mutationFn: () => api.post("/api/tz2at/import/tzbsky", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tz2at"] }),
  });

  const publishMutation = useMutation({
    mutationFn: (wallet: { chain: Tz2atChain; walletAddress: string }) =>
      api.post("/api/tz2at/publish/wallet-link", wallet),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tz2at"] }),
  });

  const pdsRequestMutation = useMutation({
    mutationFn: () => api.post("/api/tz2at/pds-offering/request", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tz2at"] }),
  });

  function previewWallet(wallet: { chain: Tz2atChain; walletAddress: string }) {
    const next = {
      ...defaultExplorerFilters,
      chain: wallet.chain,
      walletAddress: wallet.walletAddress,
      address: "",
    };
    setExplorerDraft(next);
    setExplorerFilters(next);
    setActivePanel("firehose");
    void logClientSystemEvent({
      eventType: "tz2at.firehose.previewed",
      message: "tz2at firehose wallet preview selected",
      metadata: wallet,
    });
  }

  function updateExplorerField<K extends keyof ExplorerFilters>(field: K, value: ExplorerFilters[K]) {
    setExplorerDraft((current) => ({ ...current, [field]: value }));
  }

  function runExplorerSearch() {
    setExplorerFilters(explorerDraft);
    void logClientSystemEvent({
      eventType: "tz2at.firehose.searched",
      message: "tz2at firehose explorer searched",
      metadata: explorerDraft,
    });
  }

  function resetExplorerSearch() {
    setExplorerDraft(defaultExplorerFilters);
    setExplorerFilters(defaultExplorerFilters);
  }

  function updateAnalyticsField<K extends keyof AnalyticsFilters>(field: K, value: AnalyticsFilters[K]) {
    setAnalyticsDraft((current) => ({ ...current, [field]: value }));
  }

  function refreshAnalytics() {
    setAnalyticsFilters(analyticsDraft);
    void logClientSystemEvent({
      eventType: "tz2at.ecosystem.analytics_refreshed",
      message: "tz2at ecosystem analytics refreshed",
      metadata: analyticsDraft,
    });
  }

  function applyMarketWindow(hours: number) {
    const next = {
      ...analyticsDraft,
      windowHours: String(hours),
      network: analyticsDraft.network || analyticsDraft.marketNetwork || "mainnet",
      marketNetwork: analyticsDraft.marketNetwork || analyticsDraft.network || "mainnet",
    };
    setAnalyticsDraft(next);
    setAnalyticsFilters(next);
    void logClientSystemEvent({
      eventType: "tz2at.ecosystem.scope_changed",
      message: `tz2at market window set: ${hours}h`,
      metadata: next,
    });
  }

  function applyAnalyticsPreset(label: string, patch: Partial<AnalyticsFilters>) {
    const next = {
      ...analyticsDraft,
      windowHours: analyticsDraft.windowHours,
      hydrateCex: analyticsDraft.hydrateCex,
      marketNetwork: analyticsDraft.marketNetwork,
      limit: analyticsDraft.limit,
      sampleRepos: analyticsDraft.sampleRepos,
      cexAddresses: analyticsDraft.cexAddresses,
      ...patch,
    };
    setAnalyticsDraft(next);
    setAnalyticsFilters(next);
    void logClientSystemEvent({
      eventType: "tz2at.ecosystem.scope_changed",
      message: `tz2at ecosystem analytics preset selected: ${label}`,
      metadata: next,
    });
  }

  function selectAnalyticsEntity(entity: SelectedAnalyticsEntity) {
    setSelectedEntity(entity);
    void logClientSystemEvent({
      eventType: "tz2at.ecosystem.entity_selected",
      message: "tz2at ecosystem entity selected",
      metadata: entity,
    });
  }

  function scopeAnalyticsToEntity(entity: SelectedAnalyticsEntity) {
    const next = { ...analyticsDraft, ...entityFilterPatch(entity) };
    setAnalyticsDraft(next);
    setAnalyticsFilters(next);
    setSelectedEntity(entity);
    void logClientSystemEvent({
      eventType: "tz2at.ecosystem.entity_scoped",
      message: "tz2at ecosystem analytics scoped to entity",
      metadata: { entity, filters: next },
    });
  }

  function openEntityInFirehose(entity: SelectedAnalyticsEntity) {
    const patch = entityFilterPatch(entity);
    const next = {
      ...defaultExplorerFilters,
      address: patch.address ?? "",
      contract: patch.contract ?? "",
      marketplace: patch.marketplace ?? "",
      tokenId: patch.token ?? "",
    };
    setExplorerDraft(next);
    setExplorerFilters(next);
    setActivePanel("firehose");
    void logClientSystemEvent({
      eventType: "tz2at.firehose.entity_opened",
      message: "tz2at firehose opened from ecosystem entity",
      metadata: { entity, filters: next },
    });
  }

  const firehoseQuery = useQuery({
    queryKey: ["tz2at", "firehose", "explorer", explorerFilters],
    queryFn: async () => {
      const params = buildExplorerParams(explorerFilters);
      const response = await fetchWithCsrf(`/api/tz2at/firehose/events?${params.toString()}`);
      if (!response.ok) return { items: [] };
      return response.json() as Promise<ActivityResponse>;
    },
  });

  const analyticsQuery = useQuery({
    queryKey: ["tz2at", "ecosystem", "analytics", analyticsFilters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(analyticsFilters).forEach(([key, value]) => {
        const next = value.trim();
        if (next) params.set(key, next);
      });
      const response = await fetchWithCsrf(`/api/tz2at/ecosystem/analytics?${params.toString()}`);
      if (!response.ok) throw new Error("Unable to load tz2at ecosystem analytics");
      return response.json() as Promise<Tz2atEcosystemAnalytics>;
    },
  });

  useEffect(() => {
    if (activePanel === "tezos-market") {
      void logClientSystemEvent({
        eventType: "tz2at.ecosystem.analytics_viewed",
        message: "tz2at tezos market analytics viewed",
      });
    }
    if (activePanel === "etherlink") {
      void logClientSystemEvent({
        eventType: "tz2at.ecosystem.etherlink_bridge_viewed",
        message: "tz2at etherlink bridge analytics viewed",
      });
    }
  }, [activePanel]);

  return (
    <AppWindow title="tz2at">
      <Shell>
        {statusQuery.isLoading ? (
          <Hourglass size={32} />
        ) : (
          <>
            <Tabs>
              <TabButton $active={activePanel === "tezos-market"} onClick={() => setActivePanel("tezos-market")}>
                Tezos Market
              </TabButton>
              <TabButton $active={activePanel === "etherlink"} onClick={() => setActivePanel("etherlink")}>
                Etherlink Bridge
              </TabButton>
              <TabButton $active={activePanel === "firehose"} onClick={() => setActivePanel("firehose")}>
                Firehose Explorer
              </TabButton>
              <TabButton $active={activePanel === "identity"} onClick={() => setActivePanel("identity")}>
                Identity Proof
              </TabButton>
            </Tabs>

            {activePanel === "tezos-market" ? (
              <Stack>
                <GroupBox label="Tezos market analytics">
                  <Stack>
                    <Help>
                      CEX ↔ user ↔ marketplace liquidity on Tezos L1 (mainnet/shadownet). Uses replay for the selected window, category PDS repos, and per-CEX entity repos. Mainnet↔Etherlink corridor volume lives on the Etherlink Bridge tab.
                    </Help>
                    <Row>
                      {MARKET_WINDOW_OPTIONS.map((option) => (
                        <TabButton
                          key={option.value}
                          $active={analyticsDraft.windowHours === String(option.value)}
                          onClick={() => applyMarketWindow(option.value)}
                        >
                          {option.label}
                        </TabButton>
                      ))}
                    </Row>
                    <FieldGrid>
                      <Field>
                        Window (hours)
                        <Select
                          value={analyticsDraft.windowHours}
                          onChange={(event) => updateAnalyticsField("windowHours", event.currentTarget.value)}
                        >
                          {MARKET_WINDOW_OPTIONS.map((option) => (
                            <option key={option.value} value={String(option.value)}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field>
                        Market network
                        <Select
                          value={analyticsDraft.marketNetwork}
                          onChange={(event) => updateAnalyticsField("marketNetwork", event.currentTarget.value)}
                        >
                          <option value="mainnet">mainnet</option>
                          <option value="shadownet">shadownet</option>
                        </Select>
                      </Field>
                      <Field>
                        Hydrate CEX wallets
                        <Select
                          value={analyticsDraft.hydrateCex}
                          onChange={(event) => updateAnalyticsField("hydrateCex", event.currentTarget.value)}
                        >
                          <option value="true">Yes — queue backfill for book</option>
                          <option value="false">No — use repos as-is</option>
                        </Select>
                      </Field>
                      <Field>
                        Records per collection
                        <TextField value={analyticsDraft.limit} onChange={(event) => updateAnalyticsField("limit", event.currentTarget.value)} />
                      </Field>
                      <Field>
                        Repos per PDS sample
                        <TextField value={analyticsDraft.sampleRepos} onChange={(event) => updateAnalyticsField("sampleRepos", event.currentTarget.value)} />
                      </Field>
                      <Field>
                        Add CEX addresses
                        <TextField
                          value={analyticsDraft.cexAddresses}
                          onChange={(event) => updateAnalyticsField("cexAddresses", event.currentTarget.value)}
                          placeholder="Optional: Coinbase=tz1...,Kraken=tz1..."
                        />
                      </Field>
                      <Field>
                        PDS host
                        <Select value={analyticsDraft.host} onChange={(event) => updateAnalyticsField("host", event.currentTarget.value)}>
                          <option value="all">All tz2at PDSes</option>
                          <option value="main">Main relay repo</option>
                          <option value="wallets">Wallet repos</option>
                          <option value="contracts">Contract repos</option>
                          <option value="marketplaces">Marketplace repos</option>
                          <option value="currencies">Currency repos</option>
                          <option value="platforms">Platform repos</option>
                          <option value="chains">Chain repos</option>
                        </Select>
                      </Field>
                      <Field>
                        Network
                        <TextField value={analyticsDraft.network} onChange={(event) => updateAnalyticsField("network", event.currentTarget.value)} placeholder="mainnet / shadownet" />
                      </Field>
                      <Field>
                        Collection
                        <Select value={analyticsDraft.collection} onChange={(event) => updateAnalyticsField("collection", event.currentTarget.value)}>
                          <option value="">Any collection</option>
                          {TZ2AT_EVENT_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field>
                        Actor address
                        <TextField value={analyticsDraft.address} onChange={(event) => updateAnalyticsField("address", event.currentTarget.value)} placeholder="tz1 / KT1 / 0x" />
                      </Field>
                      <Field>
                        Contract
                        <TextField value={analyticsDraft.contract} onChange={(event) => updateAnalyticsField("contract", event.currentTarget.value)} placeholder="KT1..." />
                      </Field>
                      <Field>
                        Marketplace
                        <TextField value={analyticsDraft.marketplace} onChange={(event) => updateAnalyticsField("marketplace", event.currentTarget.value)} placeholder="KT1 / marketplace ref" />
                      </Field>
                      <Field>
                        Token / OBJKT
                        <TextField value={analyticsDraft.token} onChange={(event) => updateAnalyticsField("token", event.currentTarget.value)} placeholder="token ref or id" />
                      </Field>
                      <Field>
                        Minimum amount, mutez
                        <TextField value={analyticsDraft.minAmountMutez} onChange={(event) => updateAnalyticsField("minAmountMutez", event.currentTarget.value)} placeholder="1000000" />
                      </Field>
                      <Field>
                        From level
                        <TextField value={analyticsDraft.fromLevel} onChange={(event) => updateAnalyticsField("fromLevel", event.currentTarget.value)} />
                      </Field>
                      <Field>
                        To level
                        <TextField value={analyticsDraft.toLevel} onChange={(event) => updateAnalyticsField("toLevel", event.currentTarget.value)} />
                      </Field>
                      <Field>
                        Text search
                        <TextField value={analyticsDraft.q} onChange={(event) => updateAnalyticsField("q", event.currentTarget.value)} placeholder="operation, handle, symbol" />
                      </Field>
                    </FieldGrid>
                    <Row>
                      <Button onClick={refreshAnalytics} disabled={analyticsQuery.isFetching}>
                        {analyticsQuery.isFetching ? "Building snapshot..." : "Run market snapshot"}
                      </Button>
                      <Button onClick={() => applyAnalyticsPreset("Liquidity", { collection: "xyz.tz2at.xtz.flow" })}>Liquidity</Button>
                      <Button onClick={() => applyAnalyticsPreset("Marketplace", { collection: "xyz.tz2at.marketplace.collect", host: "main" })}>Marketplace</Button>
                      <Button onClick={() => applyAnalyticsPreset("Contracts", { host: "contracts" })}>Contracts</Button>
                      <Button onClick={() => applyAnalyticsPreset("Wallets", { host: "wallets" })}>Wallets</Button>
                      {analyticsQuery.data?.generatedAt ? <Mono>{analyticsQuery.data.generatedAt}</Mono> : null}
                    </Row>
                  </Stack>
                </GroupBox>

                {analyticsQuery.isLoading ? (
                  <Hourglass size={32} />
                ) : analyticsQuery.error ? (
                  <Item>{analyticsQuery.error.message}</Item>
                ) : analyticsQuery.data ? (
                  <>
                    <MarketHealthPanel analytics={analyticsQuery.data} />
                    <LiquidityFlowPanel analytics={analyticsQuery.data} />
                    <EcosystemReadout analytics={analyticsQuery.data} />

                    <FullReport>
                      <summary>Full Report: source metrics, route tables, dossiers, and classifier details</summary>
                      <Stack>
                        <MetricGrid>
                          <Metric>
                            <MetricLabel>Active repos</MetricLabel>
                            <MetricValue>{analyticsQuery.data.overview.activeRepos.toLocaleString()}</MetricValue>
                          </Metric>
                          <Metric>
                            <MetricLabel>Records scanned</MetricLabel>
                            <MetricValue>{analyticsQuery.data.overview.scannedRecords.toLocaleString()}</MetricValue>
                          </Metric>
                          <Metric>
                            <MetricLabel>Records matched</MetricLabel>
                            <MetricValue>{analyticsQuery.data.overview.matchedRecords.toLocaleString()}</MetricValue>
                          </Metric>
                          <Metric>
                            <MetricLabel>Latest level</MetricLabel>
                            <MetricValue>{analyticsQuery.data.overview.latestBlockLevel ?? "n/a"}</MetricValue>
                          </Metric>
                          <Metric>
                            <MetricLabel>Latest timestamp</MetricLabel>
                            <MetricValue>{analyticsQuery.data.overview.latestTimestamp?.slice(11, 19) ?? "n/a"}</MetricValue>
                          </Metric>
                          <Metric>
                            <MetricLabel>XTZ flow</MetricLabel>
                            <MetricValue>By network</MetricValue>
                            <Help>See Executive Readout; cross-network units are not collapsed.</Help>
                          </Metric>
                          <Metric>
                            <MetricLabel>Market volume</MetricLabel>
                            <MetricValue>{formatMutez(analyticsQuery.data.liquidity.marketplaceVolumeMutez)}</MetricValue>
                          </Metric>
                          <Metric>
                            <MetricLabel>CEX withdrawals</MetricLabel>
                            <MetricValue>{formatMutez(analyticsQuery.data.cexFlow.totalWithdrawnFromCexMutez)}</MetricValue>
                          </Metric>
                          <Metric>
                            <MetricLabel>CEX deposits</MetricLabel>
                            <MetricValue>{formatMutez(analyticsQuery.data.cexFlow.totalDepositedToCexMutez)}</MetricValue>
                          </Metric>
                          <Metric>
                            <MetricLabel>CEX book</MetricLabel>
                            <MetricValue>{analyticsQuery.data.query.cexAddressCount.toLocaleString()}</MetricValue>
                          </Metric>
                        </MetricGrid>

                        <GroupBox label="Operator Brief">
                          <MetricGrid>
                            {analyticsQuery.data.intelligence.cards.map((card) => (
                              <InsightCard key={card.id} $tone={card.tone}>
                                <MetricLabel>{card.title}</MetricLabel>
                                <MetricValue>
                                  {card.amountMutez
                                    ? formatMutez(card.amountMutez, card.id === "largest-flow" ? analyticsQuery.data.intelligence.valueFlows[0]?.network : undefined)
                                    : card.value}
                                </MetricValue>
                                <Help>{card.detail}</Help>
                              </InsightCard>
                            ))}
                          </MetricGrid>
                        </GroupBox>

                        <AnalyticsBand>
                          <GroupBox label="PDS Fleet">
                            <DenseList>
                              {analyticsQuery.data.hosts.map((host) => (
                                <RankItem key={host.key}>
                                  <Stack>
                                    <strong>{host.label}</strong>
                                    <Mono>{host.service}</Mono>
                                    <Help>{host.role}</Help>
                                  </Stack>
                                  <strong>{host.activeRepoCount.toLocaleString()}</strong>
                                </RankItem>
                              ))}
                            </DenseList>
                          </GroupBox>
                          <GroupBox label="Record Families">
                            <DenseList>
                              {analyticsQuery.data.overview.collectionCounts.slice(0, 14).map((collection) => (
                                <RankItem key={collection.name}>
                                  <Mono>{collection.name}</Mono>
                                  <strong>{collection.count}</strong>
                                </RankItem>
                              ))}
                            </DenseList>
                          </GroupBox>
                        </AnalyticsBand>

                        <AnalyticsBand>
                          <LaneList lanes={analyticsQuery.data.intelligence.lanes} />
                          <RouteFlowList routes={analyticsQuery.data.intelligence.routes ?? []} onSelectEntity={selectAnalyticsEntity} />
                          <ValueFlowList flows={analyticsQuery.data.intelligence.valueFlows} onSelectEntity={selectAnalyticsEntity} />
                        </AnalyticsBand>

                        <AnalyticsBand>
                          <EntityDossier
                            entity={selectedEntity}
                            analytics={analyticsQuery.data}
                            onScopeAnalytics={scopeAnalyticsToEntity}
                            onOpenFirehose={openEntityInFirehose}
                            onClear={() => setSelectedEntity(null)}
                          />
                          <GroupBox label="Drilldown Controls">
                            <Stack>
                              <Help>Click any ranked entity or flow endpoint to inspect it here, then scope analytics or open the firehose with the same entity filter.</Help>
                              <Item>
                                <Row>
                                  <strong>Current scope</strong>
                                  {selectedEntity ? <span>{selectedEntity.kind}</span> : <span>none</span>}
                                </Row>
                                <Mono>{selectedEntity?.id ?? "Select from any leaderboard."}</Mono>
                              </Item>
                            </Stack>
                          </GroupBox>
                        </AnalyticsBand>

                        <AnalyticsBand>
                          <SegmentList title="Host Segments" items={analyticsQuery.data.segments.byHost} />
                          <SegmentList title="Network Segments" items={analyticsQuery.data.segments.byNetwork} networkAware />
                          <SegmentList title="Collection Health" items={analyticsQuery.data.segments.byCollection} />
                          <GroupBox label="Actor Roles">
                            <DenseList>
                              {analyticsQuery.data.segments.addressRoles.length ? (
                                analyticsQuery.data.segments.addressRoles.map((role) => (
                                  <RankItem key={role.name}>
                                    <Mono>{role.name}</Mono>
                                    <strong>{role.count}</strong>
                                  </RankItem>
                                ))
                              ) : (
                                <Item>No actor roles in this slice.</Item>
                              )}
                            </DenseList>
                          </GroupBox>
                        </AnalyticsBand>

                        <AnalyticsBand>
                          <AnalyticsList title="Who Is Active" items={analyticsQuery.data.usage.topAddresses} mode="count" selected={selectedEntity} onSelect={selectAnalyticsEntity} />
                          <AnalyticsList title="Contracts Getting Used" items={analyticsQuery.data.usage.topContracts} mode="count" entityKind="contract" selected={selectedEntity} onSelect={selectAnalyticsEntity} />
                          <AnalyticsList title="Liquidity In" items={analyticsQuery.data.liquidity.topXtzReceivers} selected={selectedEntity} onSelect={selectAnalyticsEntity} />
                          <AnalyticsList title="Liquidity Out" items={analyticsQuery.data.liquidity.topXtzSenders} selected={selectedEntity} onSelect={selectAnalyticsEntity} />
                          <AnalyticsList title="Net XTZ Accumulators" items={analyticsQuery.data.liquidity.topNetXtzIn} mode="net" selected={selectedEntity} onSelect={selectAnalyticsEntity} />
                          <AnalyticsList title="Net XTZ Distributors" items={analyticsQuery.data.liquidity.topNetXtzOut} mode="net" selected={selectedEntity} onSelect={selectAnalyticsEntity} />
                          <AnalyticsList title="Marketplace Buyers" items={analyticsQuery.data.liquidity.topMarketplaceBuyers} selected={selectedEntity} onSelect={selectAnalyticsEntity} />
                          <AnalyticsList title="Marketplace Sellers" items={analyticsQuery.data.liquidity.topMarketplaceSellers} selected={selectedEntity} onSelect={selectAnalyticsEntity} />
                          <AnalyticsList title="Marketplaces Moving Value" items={analyticsQuery.data.liquidity.topMarketplaceVolume} entityKind="marketplace" selected={selectedEntity} onSelect={selectAnalyticsEntity} />
                          <AnalyticsList title="Tokens In Motion" items={analyticsQuery.data.usage.topTokens} mode="count" entityKind="token" selected={selectedEntity} onSelect={selectAnalyticsEntity} />
                          <AnalyticsList title="OBJKT Groups" items={analyticsQuery.data.usage.topObjktGroups} mode="count" entityKind="group" selected={selectedEntity} onSelect={selectAnalyticsEntity} />
                          <AnalyticsList title="CEX XTZ Buyers" items={analyticsQuery.data.cexFlow.topBuyersFromCex} selected={selectedEntity} onSelect={selectAnalyticsEntity} />
                          <AnalyticsList title="CEX XTZ Sellers" items={analyticsQuery.data.cexFlow.topSellersToCex} selected={selectedEntity} onSelect={selectAnalyticsEntity} />
                          <AnalyticsList title="Value Adders" items={analyticsQuery.data.intelligence.valueAdders} selected={selectedEntity} onSelect={selectAnalyticsEntity} />
                          <AnalyticsList title="Value Extractors" items={analyticsQuery.data.intelligence.valueExtractors} selected={selectedEntity} onSelect={selectAnalyticsEntity} />
                        </AnalyticsBand>

                        <GroupBox label="CEX Classification">
                          <Stack>
                            <Help>
                              {analyticsQuery.data.cexFlow.configured
                                ? "CEX flow is classified from the built-in TzKT-labeled exchange custody book plus any operator-added addresses. Withdrawals from those addresses are treated as users buying/withdrawing XTZ; deposits to those addresses are treated as users selling/depositing XTZ."
                                : "CEX classification is disabled. Remove TZ2AT_DISABLE_DEFAULT_CEX_ADDRESS_BOOK or add a CEX address book above to classify exchange inflow and outflow."}
                            </Help>
                            <DenseList>
                              {analyticsQuery.data.cexFlow.addressBook.slice(0, 8).map((entry) => (
                                <RankItem key={entry.address}>
                                  <Stack>
                                    <strong>{entry.label}</strong>
                                    <Mono>{compactHash(entry.address)}</Mono>
                                  </Stack>
                                  <Help>{entry.source ?? "operator"}</Help>
                                </RankItem>
                              ))}
                              {analyticsQuery.data.cexFlow.addressBook.length > 8 ? (
                                <Item>{analyticsQuery.data.cexFlow.addressBook.length - 8} more CEX addresses in classifier.</Item>
                              ) : null}
                            </DenseList>
                            <Stack>
                              <strong>Unclassified Custody Candidates</strong>
                              <Help>High-flow XTZ hubs that are not in the current CEX book. Label these before treating them as exchange custody.</Help>
                              <DenseList>
                                {analyticsQuery.data.cexFlow.unclassifiedCandidates?.length ? (
                                  analyticsQuery.data.cexFlow.unclassifiedCandidates.map((entry) => (
                                    <RankItem key={entry.id}>
                                      <Stack>
                                        <Mono>{compactHash(entry.id)}</Mono>
                                        <Help>
                                          {entry.count} records {entry.networks.length ? `/ ${entry.networks.join(", ")}` : ""}
                                        </Help>
                                      </Stack>
                                      <strong>{formatMutez(entry.amountMutez, entry.networks)}</strong>
                                    </RankItem>
                                  ))
                                ) : (
                                  <Item>No unclassified high-flow custody candidates in this slice.</Item>
                                )}
                              </DenseList>
                            </Stack>
                            <DenseList>
                              {analyticsQuery.data.cexFlow.flows.length ? (
                                analyticsQuery.data.cexFlow.flows.map((flow, index) => (
                                  <RankItem key={`${flow.operationHash ?? index}:${flow.counterparty}`}>
                                    <Stack>
                                      <strong>{flow.direction === "from_cex" ? "CEX withdrawal" : "CEX deposit"}</strong>
                                      <Mono>
                                        {flow.cex} / {compactHash(flow.counterparty)}
                                      </Mono>
                                      <Help>
                                        {flow.network ?? "unknown"} {flow.timestamp ?? ""}
                                      </Help>
                                    </Stack>
                                    <strong>{formatMutez(flow.amountMutez, flow.network)}</strong>
                                  </RankItem>
                                ))
                              ) : (
                                <Item>No CEX-classified flows in this slice.</Item>
                              )}
                            </DenseList>
                          </Stack>
                        </GroupBox>
                      </Stack>
                    </FullReport>

                    {analyticsQuery.data.records.errors.length ? (
                      <GroupBox label="Source Diagnostics">
                        <DenseList>
                          {analyticsQuery.data.records.errors.slice(0, 12).map((error, index) => (
                            <Item key={`${error.host}:${error.collection ?? ""}:${index}`}>
                              <Row>
                                <strong>{error.host}</strong>
                                {error.collection ? <span>{error.collection}</span> : null}
                              </Row>
                              <Help>{error.error}</Help>
                            </Item>
                          ))}
                        </DenseList>
                      </GroupBox>
                    ) : null}
                  </>
                ) : null}
              </Stack>
            ) : activePanel === "etherlink" ? (
              <Stack>
                <GroupBox label="Etherlink bridge analytics">
                  <Stack>
                    <Help>
                      Liquidity between Tezos L1 and Etherlink only — rollup credit (L1→L2), debit (L2→L1), and Etherlink-internal transfers. Uses the same window and &quot;Run market snapshot&quot; as Tezos Market; amounts use Etherlink 18-decimal base units where applicable.
                    </Help>
                    <Row>
                      {MARKET_WINDOW_OPTIONS.map((option) => (
                        <TabButton
                          key={`el-${option.value}`}
                          $active={analyticsDraft.windowHours === String(option.value)}
                          onClick={() => applyMarketWindow(option.value)}
                        >
                          {option.label}
                        </TabButton>
                      ))}
                    </Row>
                    <Button onClick={() => analyticsQuery.refetch()} disabled={analyticsQuery.isFetching}>
                      {analyticsQuery.isFetching ? "Refreshing…" : "Run market snapshot"}
                    </Button>
                  </Stack>
                </GroupBox>
                {analyticsQuery.isLoading ? (
                  <Hourglass size={32} />
                ) : analyticsQuery.error ? (
                  <Item>{analyticsQuery.error.message}</Item>
                ) : analyticsQuery.data ? (
                  <EtherlinkBridgePanel analytics={analyticsQuery.data} />
                ) : null}
              </Stack>
            ) : activePanel === "identity" ? (
              <Grid>
            <Stack>
              <GroupBox label="Identity Proof">
                <Stack>
                  <Step $active={!status?.account}>
                    <Label>1. Connect DID</Label>
                    <Help>tz2at first asks only for the base AT Protocol identity scope so WTF can know which DID is yours.</Help>
                    {status?.account ? (
                      <Mono>{status.account.did}</Mono>
                    ) : (
                      <Row>
                        <TextField value={effectiveHandle} onChange={(event) => setHandle(event.currentTarget.value)} placeholder="handle.bsky.social" />
                        <Button onClick={() => openOauth(effectiveHandle, "identity")} disabled={!effectiveHandle.trim()}>
                          Connect DID
                        </Button>
                      </Row>
                    )}
                  </Step>

                  <Step $active={Boolean(status?.account) && (status?.links.length ?? 0) === 0}>
                    <Label>2. Import tzbsky</Label>
                    <Help>Import reads your public `com.tzbsky.cryptoAddress/self` record from your PDS. It does not request repo write access.</Help>
                    <Button onClick={() => importMutation.mutate()} disabled={!status?.account || importMutation.isPending}>
                      {importMutation.isPending ? "Importing..." : "Import public tzbsky proof"}
                    </Button>
                    {importMutation.error ? <Help>{importMutation.error.message}</Help> : null}
                  </Step>

                  <Step $active={Boolean(status?.account) && localWallets.length > 0}>
                    <Label>3. Verify local wallet</Label>
                    <Help>tz2at uses wallets already linked through WTF signature routes. Add missing Tezos or Etherlink wallets in Profile, then refresh this app.</Help>
                    <List>
                      {localWallets.length === 0 ? (
                        <Item>No verified WTF wallets found yet.</Item>
                      ) : (
                        localWallets.map((wallet) => (
                          <Item key={walletKey(wallet.chain, wallet.walletAddress)}>
                            <Row>
                              <strong>{wallet.chain}</strong>
                              {wallet.primary ? <span>primary</span> : null}
                            </Row>
                            <Mono>{wallet.label}</Mono>
                            <Row>
                              <Button onClick={() => previewWallet(wallet)}>Use in explorer</Button>
                              <Button
                                onClick={() => publishMutation.mutate(wallet)}
                                disabled={!status?.account?.hasWalletLinkScope || publishedKeys.has(walletKey(wallet.chain, wallet.walletAddress)) || publishMutation.isPending}
                              >
                                {publishedKeys.has(walletKey(wallet.chain, wallet.walletAddress)) ? "Published" : "Publish tz2at proof"}
                              </Button>
                            </Row>
                          </Item>
                        ))
                      )}
                    </List>
                  </Step>

                  <Step $active={Boolean(status?.account && !status.account.hasWalletLinkScope)}>
                    <Label>4. Approve wallet-link write</Label>
                    <Help>Publishing asks for exactly `repo:xyz.tz2at.identity.walletLink`, only when you choose to write a new tz2at proof.</Help>
                    <Button onClick={() => openOauth(effectiveHandle, "wallet-link")} disabled={!status?.account}>
                      Approve tz2at wallet-link scope
                    </Button>
                    {publishMutation.error ? <Help>{publishMutation.error.message}</Help> : null}
                  </Step>
                </Stack>
              </GroupBox>
            </Stack>

            <Stack>
              <GroupBox label="Linked Proofs">
                <List>
                  {status?.links.length ? (
                    status.links.map((link) => (
                      <Item key={link.id}>
                        <Row>
                          <strong>{link.chain}</strong>
                          <span>{link.source === "tzbsky_import" ? "tzbsky" : "tz2at"}</span>
                          <span>{link.verificationStatus}</span>
                        </Row>
                        <Mono>{link.walletAddress}</Mono>
                        {link.tz2atRecordUri ? <Mono>{link.tz2atRecordUri}</Mono> : null}
                        <Button onClick={() => previewWallet({ chain: link.chain, walletAddress: link.walletAddress })}>
                          Use in explorer
                        </Button>
                      </Item>
                    ))
                  ) : (
                    <Item>No imported or published wallet proofs yet.</Item>
                  )}
                </List>
              </GroupBox>

              <GroupBox label="WTFOS PDS Spine">
                <Stack>
                  <Help>
                    WTFOS needs its own PDS for game state, achievements, replay, telemetry, and outward AT Protocol activity. Your canonical DID stays separate.
                  </Help>
                  <Item>
                    <Row>
                      <strong>{status?.pdsOffering.configured ? "Configured" : "Not configured"}</strong>
                      <span>{status?.pdsOffering.serviceHealth.ok === true ? "healthy" : status?.pdsOffering.serviceHealth.ok === false ? "unhealthy" : "unknown"}</span>
                    </Row>
                    <Mono>{status?.pdsOffering.pdsUrl ?? WTFOS_PDS_PUBLIC_URL}</Mono>
                    {status?.pdsOffering.serviceHealth.healthUrl ? <Mono>{status.pdsOffering.serviceHealth.healthUrl}</Mono> : null}
                    {status?.pdsOffering.serviceHealth.error ? <Help>{status.pdsOffering.serviceHealth.error}</Help> : null}
                  </Item>
                  <Item>
                    <Row>
                      <strong>Canonical repo</strong>
                      <span>proofs only</span>
                    </Row>
                    <Mono>{status?.account?.did ?? "Connect DID first"}</Mono>
                    <Help>{status?.pdsOffering.canonicalRepoPolicy.allowedWriteCollections.join(", ")}</Help>
                  </Item>
                  <Item>
                    <Row>
                      <strong>WTFOS repo</strong>
                      <span>{status?.pdsOffering.identity?.status ?? "not requested"}</span>
                    </Row>
                    <Mono>{status?.pdsOffering.identity?.wtfDid ?? status?.pdsOffering.suggestedHandle ?? "pending WTFOS handle"}</Mono>
                    <Help>{status?.pdsOffering.wtfRepoPolicy.writePrefix ?? "app.wtfos"}.*</Help>
                    <Button
                      onClick={() => pdsRequestMutation.mutate()}
                      disabled={!status?.account || !status?.pdsOffering.configured || pdsRequestMutation.isPending}
                    >
                      {pdsRequestMutation.isPending ? "Requesting..." : "Request WTFOS repo"}
                    </Button>
                    {pdsRequestMutation.error ? <Help>{pdsRequestMutation.error.message}</Help> : null}
                  </Item>
                </Stack>
              </GroupBox>

            </Stack>
          </Grid>
            ) : (
              <ExplorerGrid>
                <Stack>
                  <GroupBox label="Firehose Explorer">
                    <Stack>
                      <Help>
                        Search the read-only tz2at replay/firehose surface across event type, chain, wallet, contract, marketplace, token, operation hash, and block range.
                      </Help>
                      <Row>
                        <strong>{status?.relay.ok === true ? "Relay online" : status?.relay.ok === false ? "Relay offline" : "Relay unknown"}</strong>
                        {status?.relay.network ? <span>{status.relay.network}</span> : null}
                        <Mono>{status ? `${status.firehose.baseUrl}${status.firehose.jsonFirehosePath}` : "wss://tz2at.xyz/firehose"}</Mono>
                      </Row>
                      <FieldGrid>
                        <Field>
                          Chain
                          <Select value={explorerDraft.chain} onChange={(event) => updateExplorerField("chain", event.currentTarget.value as ExplorerFilters["chain"])}>
                            <option value="">Any chain</option>
                            <option value="tezos">Tezos</option>
                            <option value="etherlink">Etherlink</option>
                          </Select>
                        </Field>
                        <Field>
                          Event type
                          <Select value={explorerDraft.eventType} onChange={(event) => updateExplorerField("eventType", event.currentTarget.value)}>
                            <option value="">Any event</option>
                            {TZ2AT_EVENT_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field>
                          Limit
                          <TextField value={explorerDraft.limit} onChange={(event) => updateExplorerField("limit", event.currentTarget.value)} />
                        </Field>
                        <Field>
                          Text search
                          <TextField value={explorerDraft.q} onChange={(event) => updateExplorerField("q", event.currentTarget.value)} placeholder="operation, actor, title" />
                        </Field>
                        <Field>
                          Any address
                          <TextField value={explorerDraft.address} onChange={(event) => updateExplorerField("address", event.currentTarget.value)} placeholder="tz1 / KT1 / 0x" />
                        </Field>
                        <Field>
                          Wallet activity
                          <TextField value={explorerDraft.walletAddress} onChange={(event) => updateExplorerField("walletAddress", event.currentTarget.value)} placeholder="wallet-specific endpoint" />
                        </Field>
                        <Field>
                          Contract
                          <TextField value={explorerDraft.contract} onChange={(event) => updateExplorerField("contract", event.currentTarget.value)} placeholder="KT1..." />
                        </Field>
                        <Field>
                          Marketplace
                          <TextField value={explorerDraft.marketplace} onChange={(event) => updateExplorerField("marketplace", event.currentTarget.value)} placeholder="KT1 marketplace" />
                        </Field>
                        <Field>
                          Token ID
                          <TextField value={explorerDraft.tokenId} onChange={(event) => updateExplorerField("tokenId", event.currentTarget.value)} />
                        </Field>
                        <Field>
                          Operation hash
                          <TextField value={explorerDraft.operationHash} onChange={(event) => updateExplorerField("operationHash", event.currentTarget.value)} placeholder="oo..." />
                        </Field>
                        <Field>
                          From level
                          <TextField value={explorerDraft.fromLevel} onChange={(event) => updateExplorerField("fromLevel", event.currentTarget.value)} />
                        </Field>
                        <Field>
                          To level
                          <TextField value={explorerDraft.toLevel} onChange={(event) => updateExplorerField("toLevel", event.currentTarget.value)} />
                        </Field>
                      </FieldGrid>
                      <Row>
                        <Button onClick={runExplorerSearch}>Search firehose</Button>
                        <Button onClick={resetExplorerSearch}>Reset</Button>
                      </Row>
                    </Stack>
                  </GroupBox>

                  <GroupBox label="Results">
                    <Stack>
                      <Row>
                        <strong>{firehoseQuery.data?.mode === "wallet-activity-snapshot" ? "Wallet activity" : "Replay search"}</strong>
                        <span>{firehoseQuery.data ? `${firehoseQuery.data.matchedItems ?? firehoseQuery.data.items.length}/${firehoseQuery.data.scannedItems ?? firehoseQuery.data.items.length} shown` : "loading"}</span>
                        {firehoseQuery.data?.cursor ? <Mono>cursor {firehoseQuery.data.cursor}</Mono> : null}
                      </Row>
                      {firehoseQuery.data?.sourceUrl ? <Mono>{firehoseQuery.data.sourceUrl}</Mono> : null}
                      <List>
                        {firehoseQuery.isFetching ? (
                          <Hourglass size={24} />
                        ) : firehoseQuery.data?.items.length ? (
                          firehoseQuery.data.items.map((item, index) => <Tz2atEventRow key={String(item.uri ?? item.operationHash ?? item.opHash ?? index)} item={item} />)
                        ) : (
                          <Item>No matching tz2at events returned for these filters.</Item>
                        )}
                      </List>
                    </Stack>
                  </GroupBox>
                </Stack>

                <Stack>
                  <GroupBox label="Wallet Presets">
                    <List>
                      {[...(status?.links ?? []), ...localWallets].length ? (
                        <>
                          {status?.links.map((link) => (
                            <Item key={`proof:${link.id}`}>
                              <Row>
                                <strong>{link.chain}</strong>
                                <span>{link.verificationStatus}</span>
                              </Row>
                              <Mono>{link.walletAddress}</Mono>
                              <Button onClick={() => previewWallet({ chain: link.chain, walletAddress: link.walletAddress })}>Search wallet</Button>
                            </Item>
                          ))}
                          {localWallets.map((wallet) => (
                            <Item key={`local:${walletKey(wallet.chain, wallet.walletAddress)}`}>
                              <Row>
                                <strong>{wallet.chain}</strong>
                                {wallet.primary ? <span>primary</span> : null}
                              </Row>
                              <Mono>{wallet.label}</Mono>
                              <Button onClick={() => previewWallet(wallet)}>Search wallet</Button>
                            </Item>
                          ))}
                        </>
                      ) : (
                        <Item>No linked wallet presets yet. Network search still works.</Item>
                      )}
                    </List>
                  </GroupBox>

                  <GroupBox label="AppView Boundary">
                    <Stack>
                      <Item>
                        <Row>
                          <strong>Network search</strong>
                          <span>read-only</span>
                        </Row>
                        <Help>Uses tz2at replay/firehose data without writing to canonical user repos.</Help>
                      </Item>
                      <Item>
                        <Row>
                          <strong>Identity proof</strong>
                          <span>opt-in writes</span>
                        </Row>
                        <Help>Wallet-link publication remains in the identity panel with its separate repo-scope approval.</Help>
                      </Item>
                    </Stack>
                  </GroupBox>
                </Stack>
              </ExplorerGrid>
            )}
          </>
        )}
      </Shell>
    </AppWindow>
  );
}
