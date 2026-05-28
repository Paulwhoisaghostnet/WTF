import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { Button, GroupBox, Hourglass, TextField } from "react95";
import { AppWindow } from "../components/layout/AppWindow";
import { api, fetchWithCsrf } from "../lib/api";
import { logClientSystemEvent } from "../lib/system-log";

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

interface Tz2atEcosystemAnalytics {
  generatedAt: string;
  mode: "atproto-pds-repo-analytics";
  query: { limitPerCollection: number; sampleReposPerHost: number; cexAddressCount: number; filters: Record<string, string | number | undefined> };
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
    addressBook: Array<{ address: string; label: string }>;
    totalWithdrawnFromCexMutez: string;
    totalDepositedToCexMutez: string;
    topBuyersFromCex: Tz2atEntityAnalytics[];
    topSellersToCex: Tz2atEntityAnalytics[];
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

type AnalyticsFilters = {
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
  limit: "40",
  sampleRepos: "8",
  cexAddresses: "",
  host: "all",
  network: "",
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
  return entity.amountMutez && entity.amountMutez !== "0" ? formatMutez(entity.amountMutez, entity.networks) : `${entity.count}`;
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
              <strong>{mode === "net" ? signedMutez(item.netMutez, item.networks) : mode === "count" ? item.count : rankAmount(item)}</strong>
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

function RouteFlowList({ routes, onSelectEntity }: { routes: Tz2atRouteFlow[]; onSelectEntity?: (entity: SelectedAnalyticsEntity) => void }) {
  return (
    <GroupBox label="Liquidity Routes">
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
  const [activePanel, setActivePanel] = useState<"analytics" | "firehose" | "identity">("analytics");
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

  function applyAnalyticsPreset(label: string, patch: Partial<AnalyticsFilters>) {
    const next = { ...defaultAnalyticsFilters, limit: analyticsDraft.limit, sampleRepos: analyticsDraft.sampleRepos, cexAddresses: analyticsDraft.cexAddresses, ...patch };
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
    if (activePanel === "analytics") {
      void logClientSystemEvent({
        eventType: "tz2at.ecosystem.analytics_viewed",
        message: "tz2at ecosystem analytics viewed",
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
              <TabButton $active={activePanel === "analytics"} onClick={() => setActivePanel("analytics")}>
                Ecosystem Analytics
              </TabButton>
              <TabButton $active={activePanel === "firehose"} onClick={() => setActivePanel("firehose")}>
                Firehose Explorer
              </TabButton>
              <TabButton $active={activePanel === "identity"} onClick={() => setActivePanel("identity")}>
                Identity Proof
              </TabButton>
            </Tabs>

            {activePanel === "analytics" ? (
              <Stack>
                <GroupBox label="Ecosystem Analytics">
                  <Stack>
                    <Help>
                      Aggregates live AT Protocol PDS repo records from tz2at into network, usage, liquidity, marketplace, and CEX-flow intelligence. Canonical user repos are not used as the analytics store.
                    </Help>
                    <FieldGrid>
                      <Field>
                        Records per collection
                        <TextField value={analyticsDraft.limit} onChange={(event) => updateAnalyticsField("limit", event.currentTarget.value)} />
                      </Field>
                      <Field>
                        Repos per PDS sample
                        <TextField value={analyticsDraft.sampleRepos} onChange={(event) => updateAnalyticsField("sampleRepos", event.currentTarget.value)} />
                      </Field>
                      <Field>
                        CEX address book
                        <TextField
                          value={analyticsDraft.cexAddresses}
                          onChange={(event) => updateAnalyticsField("cexAddresses", event.currentTarget.value)}
                          placeholder="Coinbase=tz1...,Kraken=tz1..."
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
                        {analyticsQuery.isFetching ? "Refreshing..." : "Refresh analytics"}
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
                        <MetricValue>{formatMutez(analyticsQuery.data.liquidity.totalXtzFlowMutez)}</MetricValue>
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
                            ? "CEX flow is classified from the configured address book. Withdrawals from those addresses are treated as users buying/withdrawing XTZ; deposits to those addresses are treated as users selling/depositing XTZ."
                            : "Add a CEX address book above or set TZ2AT_CEX_ADDRESS_BOOK to classify exchange inflow and outflow."}
                        </Help>
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
                    <Mono>{status?.pdsOffering.pdsUrl ?? "https://pds.wtfgameshow.app"}</Mono>
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
