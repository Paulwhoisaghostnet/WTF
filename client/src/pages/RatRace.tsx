import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { Button, GroupBox, Hourglass, Panel } from "react95";
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
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  background: #f3e9b9;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const Title = styled.h2`
  margin: 0;
  font-size: 22px;
  letter-spacing: 0;
`;

const Subline = styled.div`
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
`;

const Pill = styled.span<{ $hot?: boolean }>`
  border: 1px solid #111;
  background: ${(p) => (p.$hot ? "#ffcf4a" : "#e8fff3")};
  padding: 2px 6px;
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

function tokenRef(item: RatRaceHotToken) {
  return `${item.tokenContract}:${item.tokenId}`;
}

export function RatRace() {
  const queryClient = useQueryClient();
  const { address } = useWallet();
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["rat-race", "hot-tokens"],
    queryFn: () => api.get<RatRaceHotTokensResponse>("/api/rat-race/hot-tokens?limit=24"),
    refetchInterval: 45_000,
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

  return (
    <AppWindow title="Rat Race">
      <Shell>
        <Header>
          <div>
            <Title>Rat Race</Title>
            <Subline>
              <Pill $hot>Hot editions</Pill>
              <Pill>{query.data?.windowHours ?? 24}h sales</Pill>
              <Pill>{query.data?.minSoldPercent ?? 50}% sold</Pill>
              <Pill>Parent market first</Pill>
            </Subline>
          </div>
          <Button onClick={() => query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? "Scanning..." : "Refresh"}
          </Button>
        </Header>

        {error ? <GroupBox label="Wallet">{error}</GroupBox> : null}

        {query.isLoading ? (
          <Hourglass size={32} />
        ) : items.length === 0 ? (
          <GroupBox label="Feed">No hot editions match the urgency filter yet.</GroupBox>
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
                    <StatLabel>24h sales</StatLabel>
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
