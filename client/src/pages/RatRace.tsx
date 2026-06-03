import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { Button, GroupBox, Hourglass, Panel, Select } from "react95";
import type { RatRaceHotToken, RatRaceHotTokensResponse } from "@shared/tezos-intel";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { logClientSystemEvent } from "../lib/system-log";
import { useWallet } from "../lib/wallet-context";
import { purchaseRatRaceListing } from "../lib/tezos";

const Shell = styled.div`
  min-height: 100%;
  padding: 10px;
  color: #101010;
  background:
    linear-gradient(90deg, rgba(0, 112, 84, 0.16) 0 2px, transparent 2px 32px),
    linear-gradient(180deg, #d7d7d7 0%, #bdbdbd 100%);
  display: grid;
  gap: 10px;
`;

const Header = styled(Panel).attrs({ variant: "well" })`
  padding: 10px;
  display: grid;
  grid-template-columns: minmax(160px, 0.7fr) minmax(0, 1.3fr) auto;
  gap: 10px;
  align-items: center;
  background: #f3e9b9;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const Title = styled.h2`
  margin: 0;
  font-size: 22px;
  letter-spacing: 0;
`;

const ScanControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: end;
`;

const ScanField = styled.label`
  display: grid;
  gap: 3px;
  min-width: 118px;
  font-size: 11px;
  font-weight: 700;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 10px;
`;

const Card = styled(Panel).attrs({ variant: "well" })`
  background: #fffdf2;
  padding: 8px;
  display: grid;
  gap: 8px;
`;

const ThumbFrame = styled.div`
  aspect-ratio: 1 / 1;
  border: 1px solid #111;
  background: #1d2430;
  display: grid;
  place-items: center;
  overflow: hidden;
`;

const Thumb = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

const Placeholder = styled.div`
  color: #fff;
  font-weight: 700;
  font-size: 32px;
`;

const CardTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  line-height: 1.25;
`;

const MetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
`;

const Stat = styled.div`
  border: 1px solid #808080;
  background: #fff;
  padding: 6px;
  min-width: 0;
`;

const StatLabel = styled.div`
  font-size: 11px;
  color: #333;
`;

const StatValue = styled.div`
  font-weight: 700;
  overflow-wrap: anywhere;
`;

const Meter = styled.div`
  height: 12px;
  border: 1px solid #111;
  background: #fff;
`;

const MeterFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${(p) => Math.max(0, Math.min(100, p.$pct))}%;
  background: linear-gradient(90deg, #009b72, #ffcf4a, #d02020);
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Fine = styled.div`
  font-size: 11px;
  color: #343434;
  overflow-wrap: anywhere;
`;

const DiagnosticGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 6px;
  margin-top: 8px;
`;

const NearMissList = styled.ul`
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12px;
`;

function formatMutez(value: string | null) {
  if (!value) return "n/a";
  const tez = Number(value) / 1_000_000;
  if (!Number.isFinite(tez)) return "n/a";
  return `${tez.toLocaleString(undefined, { maximumFractionDigits: 3 })} tez`;
}

function selloutLabel(item: RatRaceHotToken) {
  if (item.hoursToSellout === 0) return "sold out";
  if (item.hoursToSellout === null) return "watching";
  if (item.hoursToSellout < 1) return `${Math.round(item.hoursToSellout * 60)} min`;
  if (item.hoursToSellout < 48) return `${item.hoursToSellout.toFixed(1)} hr`;
  return `${Math.round(item.hoursToSellout / 24)} days`;
}

function freshnessLabel(freshness: NonNullable<RatRaceHotTokensResponse["diagnostics"]>["sourceFreshness"]) {
  if (!freshness) return "n/a";
  const state = freshness.state || (freshness.ok === false ? "stale" : freshness.ok === true ? "fresh" : "unknown");
  const lag = freshness.headLagBlocks === null ? "unknown lag" : `${freshness.headLagBlocks} block lag`;
  const processed =
    freshness.processedLevel !== null && freshness.intakeLevel !== null
      ? `processed ${freshness.processedLevel.toLocaleString()} / intake ${freshness.intakeLevel.toLocaleString()}`
      : null;
  return [state, lag, processed].filter(Boolean).join(", ");
}

function tokenRef(item: RatRaceHotToken) {
  return `${item.tokenContract}:${item.tokenId}`;
}

type RatRaceFilters = {
  limit: number;
  windowHours: number;
  mintedWithinDays: number;
  minSoldPercent: number;
  minRecentSales: number;
};

const DEFAULT_FILTERS: RatRaceFilters = {
  limit: 24,
  windowHours: 24,
  mintedWithinDays: 7,
  minSoldPercent: 50,
  minRecentSales: 2,
};

const FILTER_LIMITS = {
  limit: { min: 1, max: 60 },
  windowHours: { min: 1, max: 168 },
  mintedWithinDays: { min: 1, max: 7 },
  minSoldPercent: { min: 1, max: 99 },
  minRecentSales: { min: 1, max: 25 },
} as const;

const FILTER_OPTIONS = {
  limit: [
    { value: 12, label: "12 cards" },
    { value: 24, label: "24 cards" },
    { value: 36, label: "36 cards" },
    { value: 60, label: "60 cards" },
  ],
  windowHours: [
    { value: 12, label: "12 hours" },
    { value: 24, label: "24 hours" },
    { value: 48, label: "48 hours" },
    { value: 72, label: "3 days" },
    { value: 168, label: "7 days" },
  ],
  mintedWithinDays: [
    { value: 1, label: "24 hours" },
    { value: 3, label: "3 days" },
    { value: 7, label: "7 days" },
  ],
  minSoldPercent: [
    { value: 10, label: "10% sold" },
    { value: 25, label: "25% sold" },
    { value: 50, label: "50% sold" },
    { value: 75, label: "75% sold" },
    { value: 90, label: "90% sold" },
  ],
  minRecentSales: [
    { value: 1, label: "1+ buy" },
    { value: 2, label: "2+ buys" },
    { value: 3, label: "3+ buys" },
    { value: 5, label: "5+ buys" },
    { value: 10, label: "10+ buys" },
  ],
} as const;

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeFilters(filters: RatRaceFilters): RatRaceFilters {
  return {
    limit: Math.floor(clampNumber(filters.limit, FILTER_LIMITS.limit.min, FILTER_LIMITS.limit.max)),
    windowHours: Math.floor(clampNumber(filters.windowHours, FILTER_LIMITS.windowHours.min, FILTER_LIMITS.windowHours.max)),
    mintedWithinDays: Math.floor(
      clampNumber(filters.mintedWithinDays, FILTER_LIMITS.mintedWithinDays.min, FILTER_LIMITS.mintedWithinDays.max)
    ),
    minSoldPercent: clampNumber(
      filters.minSoldPercent,
      FILTER_LIMITS.minSoldPercent.min,
      FILTER_LIMITS.minSoldPercent.max
    ),
    minRecentSales: Math.floor(
      clampNumber(filters.minRecentSales, FILTER_LIMITS.minRecentSales.min, FILTER_LIMITS.minRecentSales.max)
    ),
  };
}

function ratRaceQueryPath(filters: RatRaceFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(normalizeFilters(filters))) {
    params.set(key, String(value));
  }
  return `/api/rat-race/hot-tokens?${params.toString()}`;
}

function selectOptions(key: keyof RatRaceFilters) {
  return FILTER_OPTIONS[key].map((option) => ({
    label: option.label,
    value: String(option.value),
  }));
}

function sameFilters(a: RatRaceFilters, b: RatRaceFilters) {
  return (
    a.limit === b.limit &&
    a.windowHours === b.windowHours &&
    a.mintedWithinDays === b.mintedWithinDays &&
    a.minSoldPercent === b.minSoldPercent &&
    a.minRecentSales === b.minRecentSales
  );
}

export function RatRace() {
  const queryClient = useQueryClient();
  const { address } = useWallet();
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<RatRaceFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<RatRaceFilters>(DEFAULT_FILTERS);
  const query = useQuery({
    queryKey: ["rat-race", "hot-tokens", filters],
    queryFn: () => api.get<RatRaceHotTokensResponse>(ratRaceQueryPath(filters)),
    refetchInterval: (currentQuery) => (currentQuery.state.fetchStatus === "fetching" ? false : 45_000),
  });

  useEffect(() => {
    logClientSystemEvent({
      eventType: "rat_race.viewed",
      message: "Rat Race opened",
    });
    void api.post("/api/rat-race/events", { eventType: "rat_race.viewed" }).catch(() => undefined);
  }, []);

  const buyMutation = useMutation({
    mutationFn: async (item: RatRaceHotToken) => {
      if (!address) throw new Error("Connect wallet before direct contract purchase");
      await api.post("/api/rat-race/events", {
        eventType: "rat_race.purchase_intent.created",
        tokenRef: tokenRef(item),
        metadata: {
          marketplaceContract: item.purchaseIntent.marketplaceContract,
          listingId: item.purchaseIntent.listingId,
          totalMutez: item.purchaseIntent.totalMutez,
        },
      });
      return purchaseRatRaceListing({
        walletAddress: address,
        tokenContract: item.tokenContract,
        tokenId: item.tokenId,
        intent: item.purchaseIntent,
      });
    },
    onSuccess: () => {
      setError("");
      void queryClient.invalidateQueries({ queryKey: ["rat-race"] });
    },
    onError: (err) => setError((err as Error).message || "Purchase failed"),
  });

  function openMarket(item: RatRaceHotToken) {
    void api.post("/api/rat-race/events", {
      eventType: "rat_race.card.opened",
      tokenRef: tokenRef(item),
      metadata: { marketUrl: item.marketUrl },
    }).catch(() => undefined);
    window.open(item.marketUrl, "_blank", "noopener,noreferrer");
  }

  const items = query.data?.items ?? [];
  const diagnostics = query.data?.diagnostics;
  const activeFilters = query.data
    ? {
        limit: query.data.limit,
        windowHours: query.data.windowHours,
        mintedWithinDays: query.data.mintedWithinDays,
        minSoldPercent: query.data.minSoldPercent,
        minRecentSales: query.data.minRecentSales,
      }
    : filters;

  function updateDraftFilter(key: keyof RatRaceFilters, value: string | number) {
    setDraftFilters((current) => ({
      ...current,
      [key]: Number(value),
    }));
  }

  function scanFilters() {
    const next = normalizeFilters(draftFilters);
    setDraftFilters(next);
    logClientSystemEvent({
      eventType: "rat_race.scan_requested",
      message: "Rat Race scan requested",
      metadata: next,
    });
    void api.post("/api/rat-race/events", {
      eventType: "rat_race.scan_requested",
      metadata: next,
    }).catch(() => undefined);
    if (sameFilters(next, filters)) {
      void query.refetch();
      return;
    }
    setFilters(next);
  }

  return (
    <AppWindow title="Rat Race">
      <Shell>
        <Header>
          <div>
            <Title>Rat Race</Title>
          </div>
          <ScanControls aria-label="Rat Race scan filters">
            <ScanField>
              Sales
              <Select
                options={selectOptions("windowHours")}
                value={String(draftFilters.windowHours)}
                onChange={(event: any) => updateDraftFilter("windowHours", event.value)}
                width={118}
              />
            </ScanField>
            <ScanField>
              Minted
              <Select
                options={selectOptions("mintedWithinDays")}
                value={String(draftFilters.mintedWithinDays)}
                onChange={(event: any) => updateDraftFilter("mintedWithinDays", event.value)}
                width={118}
              />
            </ScanField>
            <ScanField>
              Sold
              <Select
                options={selectOptions("minSoldPercent")}
                value={String(draftFilters.minSoldPercent)}
                onChange={(event: any) => updateDraftFilter("minSoldPercent", event.value)}
                width={118}
              />
            </ScanField>
            <ScanField>
              Buys
              <Select
                options={selectOptions("minRecentSales")}
                value={String(draftFilters.minRecentSales)}
                onChange={(event: any) => updateDraftFilter("minRecentSales", event.value)}
                width={118}
              />
            </ScanField>
            <ScanField>
              Cards
              <Select
                options={selectOptions("limit")}
                value={String(draftFilters.limit)}
                onChange={(event: any) => updateDraftFilter("limit", event.value)}
                width={118}
              />
            </ScanField>
          </ScanControls>
          <Button onClick={scanFilters} disabled={query.isFetching}>
            {query.isFetching ? "Scanning..." : "Scan"}
          </Button>
        </Header>

        {error ? <GroupBox label="Wallet">{error}</GroupBox> : null}

        {error || query.error ? (
          <GroupBox label="Scan error">{error || (query.error as Error)?.message || "Rat Race scan failed"}</GroupBox>
        ) : null}

        {query.isLoading || query.isFetching ? (
          <GroupBox label="Scan">
            <Hourglass size={32} />
            <Fine>Pulling the tz2at rolling market stream...</Fine>
          </GroupBox>
        ) : items.length === 0 ? (
          <GroupBox label="Feed">
            <div>{diagnostics?.note || "No hot editions match the urgency filter yet."}</div>
            {diagnostics ? (
              <>
                <DiagnosticGrid>
                  <Stat>
                    <StatLabel>Source</StatLabel>
                    <StatValue>{diagnostics.source}</StatValue>
                  </Stat>
                  <Stat>
                    <StatLabel>Local rows</StatLabel>
                    <StatValue>{diagnostics.localCandidateRows}</StatValue>
                  </Stat>
                  <Stat>
                    <StatLabel>tz2at rows</StatLabel>
                    <StatValue>{diagnostics.tz2atCandidateRows}</StatValue>
                  </Stat>
                  <Stat>
                    <StatLabel>tz2at freshness</StatLabel>
                    <StatValue>{freshnessLabel(diagnostics.sourceFreshness)}</StatValue>
                  </Stat>
                  <Stat>
                    <StatLabel>Supplements</StatLabel>
                    <StatValue>
                      {(diagnostics.supplementSources ?? [])
                        .filter((source) => source.used)
                        .map((source) => source.source)
                        .join(", ") || "none"}
                    </StatValue>
                  </Stat>
                  <Stat>
                    <StatLabel>Rejected</StatLabel>
                    <StatValue>
                      {diagnostics.rejectedByUnknownSupply} supply / {diagnostics.rejectedByNoActiveListing} listing /{" "}
                      {diagnostics.rejectedByMintWindow} old / {diagnostics.rejectedByRecentSales} quiet /{" "}
                      {diagnostics.rejectedBySoldPercent} low
                    </StatValue>
                  </Stat>
                </DiagnosticGrid>
                {diagnostics.nearMisses.length > 0 ? (
                  <NearMissList>
                    {diagnostics.nearMisses.map((miss) => (
                      <li key={`${miss.tokenContract}:${miss.tokenId}`}>
                        <strong>{miss.tokenName}</strong>: {miss.soldEditions}/{miss.totalEditions} sold,{" "}
                        {miss.recentSaleCount} recent sale(s). {miss.reasons.join("; ")}.{" "}
                        <a href={miss.marketUrl} target="_blank" rel="noopener noreferrer">
                          Open market
                        </a>
                      </li>
                    ))}
                  </NearMissList>
                ) : null}
              </>
            ) : null}
          </GroupBox>
        ) : (
          <Grid>
            {items.map((item) => (
              <Card key={tokenRef(item)}>
                <ThumbFrame>
                  {item.tokenThumbnail ? <Thumb src={item.tokenThumbnail} alt="" /> : <Placeholder>RR</Placeholder>}
                </ThumbFrame>
                <div>
                  <CardTitle>{item.tokenName}</CardTitle>
                  <Fine>{item.tokenContract} #{item.tokenId}</Fine>
                </div>
                <Meter>
                  <MeterFill $pct={item.soldPercent} />
                </Meter>
                <MetaGrid>
                  <Stat>
                    <StatLabel>Sold</StatLabel>
                    <StatValue>
                      {item.soldEditions}/{item.totalEditions}
                    </StatValue>
                  </Stat>
                  <Stat>
                    <StatLabel>{activeFilters.windowHours}h sales</StatLabel>
                    <StatValue>{item.recentSaleCount}</StatValue>
                  </Stat>
                  <Stat>
                    <StatLabel>Sellout ETA</StatLabel>
                    <StatValue>{selloutLabel(item)}</StatValue>
                  </Stat>
                  <Stat>
                    <StatLabel>Floor</StatLabel>
                    <StatValue>{formatMutez(item.floorMutez)}</StatValue>
                  </Stat>
                </MetaGrid>
                <Fine>
                  {item.activeListingCount} active listing(s) | {item.purchaseIntent.marketplaceName || "external market"}
                </Fine>
                <Actions>
                  <Button onClick={() => openMarket(item)}>Open listing</Button>
                  <Button
                    onClick={() => buyMutation.mutate(item)}
                    disabled={!address || !item.purchaseIntent.supported || buyMutation.isPending}
                  >
                    {buyMutation.isPending ? "Buying..." : "Buy direct"}
                  </Button>
                </Actions>
                {!item.purchaseIntent.supported ? <Fine>{item.purchaseIntent.reason}</Fine> : null}
              </Card>
            ))}
          </Grid>
        )}
      </Shell>
    </AppWindow>
  );
}
