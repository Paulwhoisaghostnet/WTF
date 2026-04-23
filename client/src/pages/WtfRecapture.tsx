import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, TextInput, Separator } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";

const Section = styled.div`
  margin-bottom: 16px;
`;

const Tabs = styled.div`
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
`;

const WindowCard = styled(GroupBox)`
  margin-bottom: 12px;
`;

const AuctionCard = styled(GroupBox)`
  margin-bottom: 12px;
`;

const LeaderRow = styled.div`
  display: grid;
  grid-template-columns: 40px 2fr 1fr 1fr;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid #d0d0d0;
  font-size: 13px;
`;

const LeaderHeader = styled(LeaderRow)`
  font-weight: bold;
  border-bottom: 2px solid #808080;
`;

const SmallAddr = styled.code`
  font-size: 11px;
  background: #f8f8f0;
  padding: 1px 4px;
`;

const StatusPill = styled.span<{ $tone: string }>`
  display: inline-block;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: bold;
  background: ${(p) =>
    p.$tone === "open"
      ? "#008800"
      : p.$tone === "closed"
        ? "#884400"
        : p.$tone === "cancelled"
          ? "#880000"
          : p.$tone === "funded"
            ? "#004488"
            : p.$tone === "live"
              ? "#008800"
              : p.$tone === "ended"
                ? "#884400"
                : p.$tone === "settled"
                  ? "#555555"
                  : "#606060"};
  color: #ffffff;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
  font-size: 13px;
`;

const KV = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
`;

type LeaderboardEntry = {
  userId: number | null;
  walletAddress: string;
  totalWtf: string;
  eventCount: number;
  lastAt: string | null;
  user: {
    id: number;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
};

type Window = {
  id: number;
  label: string;
  contractAddress: string;
  network: string;
  status: string;
  rateMutezPerWtf: string;
  perSellerCapWtf: string;
  totalXtzBudgetMutez: string;
  opensAt: string;
  closesAt: string;
  merkleRoot: string | null;
  swapsObserved: number;
  wtfRecaptured: string;
  xtzDispensedMutez: string;
};

type Auction = {
  id: number;
  title: string;
  description: string | null;
  perkKind: string;
  startsAt: string;
  endsAt: string;
  minBidWtf: string;
  bidIncrementWtf: string;
  status: string;
  winningBidId: number | null;
  settlementOpHash: string | null;
};

type RecaptureEvent = {
  id: number;
  walletAddress: string;
  source: string;
  amountWtf: string;
  opHash: string | null;
  observedAt: string;
};

function formatWtfRaw(raw: string): string {
  const n = BigInt(raw);
  const denom = 10n ** 8n;
  const whole = n / denom;
  const frac = (n % denom).toString().padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

function formatXtzMutez(mutez: string): string {
  const n = BigInt(mutez);
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

export function WtfRecapture() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"leaderboard" | "buybacks" | "auctions" | "mine">(
    "leaderboard"
  );

  const { data: leaderboard, isLoading: lbLoading } = useQuery({
    queryKey: ["wtf-recapture", "leaderboard"],
    queryFn: () =>
      api.get<{ entries: LeaderboardEntry[]; operatorWallet: string | null }>(
        "/api/wtf-recapture/leaderboard?limit=100"
      ),
  });

  const { data: windowsData, isLoading: winLoading } = useQuery({
    queryKey: ["buyback-windows", "active"],
    queryFn: () =>
      api.get<{ windows: Window[] }>("/api/buyback-windows/active"),
  });

  const { data: auctionsData, isLoading: aucLoading } = useQuery({
    queryKey: ["wtf-auctions"],
    queryFn: () => api.get<{ auctions: Auction[] }>("/api/wtf-auctions"),
  });

  const { data: mineData } = useQuery({
    enabled: !!user && tab === "mine",
    queryKey: ["wtf-recapture", "mine"],
    queryFn: () =>
      api.get<{ events: RecaptureEvent[] }>("/api/wtf-recapture/mine"),
  });

  return (
    <AppWindow title="WTF Recapture">
      <Tabs>
        <Button
          active={tab === "leaderboard"}
          onClick={() => setTab("leaderboard")}
        >
          Leaderboard
        </Button>
        <Button active={tab === "buybacks"} onClick={() => setTab("buybacks")}>
          Buyback Windows
        </Button>
        <Button active={tab === "auctions"} onClick={() => setTab("auctions")}>
          WTF Auctions
        </Button>
        {user ? (
          <Button active={tab === "mine"} onClick={() => setTab("mine")}>
            My Events
          </Button>
        ) : null}
      </Tabs>

      {tab === "leaderboard" && (
        <Section>
          <GroupBox label="Total WTF returned to the operator wallet">
            {leaderboard?.operatorWallet ? (
              <div style={{ marginBottom: 8, fontSize: 12 }}>
                Operator wallet:{" "}
                <SmallAddr>{leaderboard.operatorWallet}</SmallAddr>
              </div>
            ) : null}
            {lbLoading ? (
              <Hourglass />
            ) : (
              <>
                <LeaderHeader>
                  <div>#</div>
                  <div>Seller</div>
                  <div>Events</div>
                  <div>WTF returned</div>
                </LeaderHeader>
                {(leaderboard?.entries ?? []).map((e, i) => (
                  <LeaderRow key={`${e.walletAddress}-${i}`}>
                    <div>{i + 1}</div>
                    <div>
                      {e.user?.displayName || e.user?.username || (
                        <SmallAddr>{e.walletAddress}</SmallAddr>
                      )}
                    </div>
                    <div>{e.eventCount}</div>
                    <div>{formatWtfRaw(e.totalWtf)} WTF</div>
                  </LeaderRow>
                ))}
                {(leaderboard?.entries ?? []).length === 0 ? (
                  <div style={{ padding: 8, fontSize: 12 }}>
                    Nothing recaptured yet. Come back after the first buyback
                    window or WTF auction settles.
                  </div>
                ) : null}
              </>
            )}
          </GroupBox>
        </Section>
      )}

      {tab === "buybacks" && (
        <Section>
          {winLoading ? (
            <Hourglass />
          ) : (
            <>
              {(windowsData?.windows ?? []).length === 0 && (
                <div style={{ padding: 8, fontSize: 13 }}>
                  No active buyback windows right now.
                </div>
              )}
              {(windowsData?.windows ?? []).map((w) => (
                <BuybackWindowCard key={w.id} window={w} />
              ))}
            </>
          )}
        </Section>
      )}

      {tab === "auctions" && (
        <Section>
          {aucLoading ? (
            <Hourglass />
          ) : (
            <>
              {(auctionsData?.auctions ?? []).length === 0 && (
                <div style={{ padding: 8, fontSize: 13 }}>
                  No WTF auctions scheduled yet.
                </div>
              )}
              {(auctionsData?.auctions ?? []).map((a) => (
                <WtfAuctionCard key={a.id} auction={a} />
              ))}
            </>
          )}
        </Section>
      )}

      {tab === "mine" && user && (
        <Section>
          <GroupBox label="My WTF → operator wallet">
            {(mineData?.events ?? []).length === 0 ? (
              <div style={{ padding: 8, fontSize: 13 }}>
                You haven&apos;t sent WTF to the operator wallet yet. Buybacks,
                antes, side-quest entry fees, and auction settlements all show
                up here once the watcher confirms them on-chain.
              </div>
            ) : (
              (mineData?.events ?? []).map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr 1fr",
                    gap: 8,
                    padding: "4px 0",
                    borderBottom: "1px solid #d0d0d0",
                    fontSize: 12,
                  }}
                >
                  <div>{ev.source}</div>
                  <div>{formatWtfRaw(ev.amountWtf)} WTF</div>
                  <div>
                    {ev.observedAt
                      ? new Date(ev.observedAt).toLocaleString()
                      : ""}
                  </div>
                </div>
              ))
            )}
          </GroupBox>
        </Section>
      )}
    </AppWindow>
  );
}

function BuybackWindowCard({ window: w }: { window: Window }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [opHash, setOpHash] = useState("");
  const [amount, setAmount] = useState("");

  const { data: eligibility } = useQuery({
    enabled: !!user,
    queryKey: ["buyback-windows", w.id, "eligibility"],
    queryFn: () =>
      api.get<{
        window: Window;
        eligibility: Array<{
          id: number;
          walletAddress: string;
          maxWtf: string;
          merkleProof: string[];
          eligibilityReason: string;
          swappedWtf: string;
          swappedAt: string | null;
          swapOpHash: string | null;
        }>;
      }>(`/api/buyback-windows/${w.id}/eligibility`),
  });

  const intentMut = useMutation({
    mutationFn: async (payload: {
      allowlistId: number;
      opHash: string;
      amountWtf: string;
    }) =>
      api.post(`/api/buyback-windows/${w.id}/swap-intent`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["buyback-windows"] });
      qc.invalidateQueries({ queryKey: ["wtf-recapture"] });
      setOpHash("");
      setAmount("");
    },
  });

  const mine = eligibility?.eligibility?.[0] ?? null;

  return (
    <WindowCard label={w.label}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <StatusPill $tone={w.status}>{w.status.toUpperCase()}</StatusPill>
        <SmallAddr>{w.contractAddress}</SmallAddr>
      </div>
      <Grid>
        <KV>
          <span>Rate</span>
          <strong>{w.rateMutezPerWtf} µꜩ/WTF</strong>
        </KV>
        <KV>
          <span>Per-seller cap</span>
          <strong>{formatWtfRaw(w.perSellerCapWtf)} WTF</strong>
        </KV>
        <KV>
          <span>Total XTZ budget</span>
          <strong>{formatXtzMutez(w.totalXtzBudgetMutez)} XTZ</strong>
        </KV>
        <KV>
          <span>Recaptured so far</span>
          <strong>
            {formatWtfRaw(w.wtfRecaptured)} WTF · {w.swapsObserved} swap(s)
          </strong>
        </KV>
        <KV>
          <span>Opens</span>
          <strong>{new Date(w.opensAt).toLocaleString()}</strong>
        </KV>
        <KV>
          <span>Closes</span>
          <strong>{new Date(w.closesAt).toLocaleString()}</strong>
        </KV>
      </Grid>

      <Separator />
      {!user ? (
        <div style={{ padding: 8, fontSize: 12 }}>
          Log in to see if your wallet is on the allowlist.
        </div>
      ) : mine ? (
        <>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            You&apos;re eligible ({mine.eligibilityReason}). Cap:{" "}
            <strong>{formatWtfRaw(mine.maxWtf)} WTF</strong>. Swapped so far:{" "}
            <strong>{formatWtfRaw(mine.swappedWtf)} WTF</strong>.
          </div>
          <div style={{ marginTop: 4, fontSize: 11 }}>
            Merkle proof (hex, sorted-pair):{" "}
            <code>{(mine.merkleProof || []).join(", ") || "—"}</code>
          </div>
          {w.status === "open" && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                After your wallet swaps WTF for XTZ against the buyback
                contract, paste the resulting operation hash here so the
                recapture leaderboard credits your swap immediately (instead of
                waiting 2 min for the watcher).
              </div>
              <div
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}
              >
                <TextInput
                  placeholder="Amount WTF swapped (raw)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <TextInput
                  placeholder="Op hash (ooXY…)"
                  value={opHash}
                  onChange={(e) => setOpHash(e.target.value)}
                />
              </div>
              <Button
                disabled={!amount || !opHash || intentMut.isPending}
                onClick={() =>
                  intentMut.mutate({
                    allowlistId: mine.id,
                    amountWtf: amount,
                    opHash,
                  })
                }
                style={{ marginTop: 6 }}
              >
                {intentMut.isPending ? "Submitting…" : "Record swap"}
              </Button>
              {intentMut.isError && (
                <div style={{ color: "#880000", marginTop: 4, fontSize: 12 }}>
                  {(intentMut.error as Error)?.message}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: 8, fontSize: 12 }}>
          Your linked wallet is not on this window&apos;s allowlist.
        </div>
      )}
    </WindowCard>
  );
}

function WtfAuctionCard({ auction }: { auction: Auction }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [bid, setBid] = useState("");

  const { data: details } = useQuery({
    queryKey: ["wtf-auctions", auction.id],
    queryFn: () =>
      api.get<{
        auction: Auction;
        bids: Array<{
          id: number;
          amountWtf: string;
          userId: number;
          username: string | null;
          createdAt: string;
        }>;
      }>(`/api/wtf-auctions/${auction.id}`),
  });

  const bidMut = useMutation({
    mutationFn: async (amountWtf: string) =>
      api.post(`/api/wtf-auctions/${auction.id}/bids`, { amountWtf }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wtf-auctions", auction.id] });
      setBid("");
    },
  });

  return (
    <AuctionCard label={auction.title}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <StatusPill $tone={auction.status}>
          {auction.status.toUpperCase()}
        </StatusPill>
        <span style={{ fontSize: 12 }}>Perk: {auction.perkKind}</span>
      </div>
      {auction.description && (
        <p style={{ fontSize: 12, marginTop: 8 }}>{auction.description}</p>
      )}
      <Grid>
        <KV>
          <span>Opens</span>
          <strong>{new Date(auction.startsAt).toLocaleString()}</strong>
        </KV>
        <KV>
          <span>Closes</span>
          <strong>{new Date(auction.endsAt).toLocaleString()}</strong>
        </KV>
        <KV>
          <span>Min bid</span>
          <strong>{formatWtfRaw(auction.minBidWtf)} WTF</strong>
        </KV>
        <KV>
          <span>Increment</span>
          <strong>{formatWtfRaw(auction.bidIncrementWtf)} WTF</strong>
        </KV>
      </Grid>

      {auction.status === "live" && user && (
        <div style={{ marginTop: 8 }}>
          <TextInput
            placeholder="Bid amount (raw WTF)"
            value={bid}
            onChange={(e) => setBid(e.target.value)}
          />
          <Button
            disabled={!bid || bidMut.isPending}
            onClick={() => bidMut.mutate(bid)}
            style={{ marginTop: 6 }}
          >
            {bidMut.isPending ? "Bidding…" : "Place bid"}
          </Button>
          {bidMut.isError && (
            <div style={{ color: "#880000", marginTop: 4, fontSize: 12 }}>
              {(bidMut.error as Error)?.message}
            </div>
          )}
        </div>
      )}

      {(details?.bids ?? []).length > 0 && (
        <>
          <Separator />
          <div style={{ marginTop: 8, fontSize: 12 }}>
            Top bids:
            <ul style={{ marginTop: 4 }}>
              {(details?.bids ?? []).slice(0, 5).map((b) => (
                <li key={b.id}>
                  {b.username ?? `user#${b.userId}`} —{" "}
                  <strong>{formatWtfRaw(b.amountWtf)} WTF</strong>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </AuctionCard>
  );
}
