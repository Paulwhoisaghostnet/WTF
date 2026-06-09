import { useMemo } from "react";
import styled from "styled-components";
import { Button } from "react95";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

const WALLET_DOSSIER_CAPTION_TYPE = "var(--wtf-type-caption, 13px)";
const WALLET_DOSSIER_APP_FONT = "var(--wtf-app-font)";

/* ─── Types matching server/lib/wallet-events.ts ────────── */

export type WalletEventType =
  | "token_transfer_in"
  | "token_transfer_out"
  | "token_mint"
  | "token_burn"
  | "xtz_transfer_in"
  | "xtz_transfer_out"
  | "contract_call"
  | "delegation"
  | "origination";

export interface DossierEvent {
  id: number;
  walletAddress: string;
  userId: number | null;
  eventType: WalletEventType;
  level: number;
  timestamp: string;
  opHash: string | null;
  tzktKind: string;
  tzktTransferId: number | null;
  tzktOperationId: number | null;
  tokenContract: string | null;
  tokenId: string | null;
  tokenStandard: string | null;
  tokenAmount: string | null;
  tokenName: string | null;
  tokenSymbol: string | null;
  tokenThumbnail: string | null;
  counterpartyAddress: string | null;
  xtzAmountMutez: number | null;
  marketplace: string | null;
}

export interface DossierCursor {
  walletAddress: string;
  lastTransferId: number | string;
  lastOperationId: number | string;
  lastLevel: number | string;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  eventsTracked: number | string;
  backfilled: boolean;
  backfilledAt: string | null;
}

export interface DossierStats {
  total: number;
  byType: Partial<Record<WalletEventType, number>>;
  firstEventAt: string | null;
  lastEventAt: string | null;
}

export interface WalletDossierPayload {
  walletAddress: string;
  cursor: DossierCursor | null;
  stats: DossierStats;
  events: DossierEvent[];
}

export interface UserDossierPayload {
  wallets: WalletDossierPayload[];
  aggregate: DossierStats;
}

export interface WalletGraphNode {
  id: string;
  type: "account" | "wallet" | "tezos_domain" | "token" | "creator";
  label: string;
  address?: string;
  tokenCount?: number;
}

export interface WalletGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: "linked_wallet" | "owns_domain" | "holds_token" | "created_by";
  label: string;
  weight?: number;
}

export interface WalletGraphPayload {
  nodes: WalletGraphNode[];
  edges: WalletGraphEdge[];
  totals: {
    wallets: number;
    tokens: number;
    domains: number;
    creators: number;
  };
  capped: boolean;
}

/* ─── Presentation helpers ───────────────────────────────── */

const EVENT_LABEL: Record<WalletEventType, string> = {
  token_transfer_in: "Received token",
  token_transfer_out: "Sent token",
  token_mint: "Minted token",
  token_burn: "Burned token",
  xtz_transfer_in: "Received XTZ",
  xtz_transfer_out: "Sent XTZ",
  contract_call: "Called contract",
  delegation: "Delegated",
  origination: "Originated contract",
};

const EVENT_TINT: Record<WalletEventType, string> = {
  token_transfer_in: "#d4f0d4",
  token_transfer_out: "#f6d8d4",
  token_mint: "#d4e8ff",
  token_burn: "#4a4a4a",
  xtz_transfer_in: "#e5f7d4",
  xtz_transfer_out: "#f0e4c8",
  contract_call: "#e4dbf3",
  delegation: "#fff0c0",
  origination: "#dfe1ff",
};

function fmtRelative(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function fmtXtz(mutez: number | null | undefined): string {
  if (mutez == null) return "—";
  const tez = mutez / 1_000_000;
  if (tez === 0) return "0 ꜩ";
  if (Math.abs(tez) < 0.01) return `${tez.toFixed(6)} ꜩ`;
  return `${tez.toFixed(tez < 10 ? 4 : 2)} ꜩ`;
}

function shortAddr(addr: string | null | undefined): string {
  if (!addr) return "—";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/* ─── Styled pieces ──────────────────────────────────────── */

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-family: ${WALLET_DOSSIER_APP_FONT};
  font-size: var(--wtf-type-caption, 13px);
`;

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
`;

const StatCell = styled.div`
  background: #ececec;
  border: 1px solid #808080;
  padding: 6px 8px;
  line-height: 1.3;
  strong {
    display: block;
    font-size: 13px;
  }
  span {
    font-size: var(--wtf-type-caption, 13px);
    color: #555;
    text-transform: none;
    letter-spacing: 0;
  }
`;

const WalletHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #000080;
  color: #fff;
  font-weight: 600;
  font-size: var(--wtf-type-caption, 13px);
`;

const WalletBody = styled.div`
  border: 1px solid #808080;
  border-top: none;
  padding: 8px;
`;

const EventList = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid #808080;
  max-height: 320px;
  overflow-y: auto;
  background: #fff;
`;

const EventRow = styled.div<{ $tint: string }>`
  display: grid;
  grid-template-columns: 16px 130px 1fr auto;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid #eee;
  align-items: center;
  &:last-child {
    border-bottom: none;
  }
  .tint {
    width: 12px;
    height: 12px;
    background: ${(p) => p.$tint};
    border: 1px solid #444;
  }
  .kind {
    font-weight: 600;
    font-size: var(--wtf-type-caption, 13px);
  }
  .detail {
    font-size: var(--wtf-type-caption, 13px);
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    font-size: var(--wtf-type-caption, 13px);
    color: #555;
    text-align: right;
    white-space: nowrap;
  }
  a {
    color: #000080;
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }
`;

const SyncLine = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  font-size: var(--wtf-type-caption, 13px);
  color: #444;
  padding: 4px 0;
  .status-ok {
    color: #0a7a0a;
    font-weight: 600;
  }
  .status-err {
    color: #a00;
    font-weight: 600;
  }
  .status-none {
    color: #777;
  }
`;

const RelationList = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid #808080;
  background: #fff;
  max-height: 260px;
  overflow-y: auto;
`;

const RelationRow = styled.div`
  display: grid;
  grid-template-columns: minmax(110px, 1fr) 90px minmax(110px, 1fr);
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid #eee;
  align-items: center;
  &:last-child {
    border-bottom: none;
  }
  code {
    font-size: var(--wtf-type-caption, 13px);
  }
`;

/* ─── Event row rendering ────────────────────────────────── */

function TzktLink({
  event,
  children,
}: {
  event: DossierEvent;
  children: React.ReactNode;
}) {
  if (event.opHash) {
    return (
      <a
        href={`https://tzkt.io/${event.opHash}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  }
  return <span>{children}</span>;
}

function EventDetail({ event }: { event: DossierEvent }) {
  const label = event.tokenName || event.tokenSymbol || "";
  const counterparty = shortAddr(event.counterpartyAddress);
  const tokenRef =
    event.tokenContract && event.tokenId != null
      ? `${shortAddr(event.tokenContract)}#${event.tokenId}`
      : null;

  switch (event.eventType) {
    case "token_transfer_in":
      return (
        <>
          {label || tokenRef || "Token"} ← {counterparty}
        </>
      );
    case "token_transfer_out":
      return (
        <>
          {label || tokenRef || "Token"} → {counterparty}
        </>
      );
    case "token_mint":
      return <>minted {label || tokenRef || "token"}</>;
    case "token_burn":
      return <>burned {label || tokenRef || "token"}</>;
    case "xtz_transfer_in":
      return (
        <>
          {fmtXtz(event.xtzAmountMutez)} ← {counterparty}
        </>
      );
    case "xtz_transfer_out":
      return (
        <>
          {fmtXtz(event.xtzAmountMutez)} → {counterparty}
        </>
      );
    case "contract_call":
      return (
        <>
          {counterparty} · {fmtXtz(event.xtzAmountMutez)}
        </>
      );
    case "delegation":
      return <>new baker: {counterparty}</>;
    case "origination":
      return <>originated {counterparty}</>;
    default:
      return null;
  }
}

function renderEventRow(event: DossierEvent) {
  const tint = EVENT_TINT[event.eventType] ?? "#ccc";
  return (
    <EventRow key={event.id} $tint={tint}>
      <div className="tint" title={event.eventType} />
      <div className="kind">{EVENT_LABEL[event.eventType] ?? event.eventType}</div>
      <TzktLink event={event}>
        <span className="detail">
          <EventDetail event={event} />
        </span>
      </TzktLink>
      <div className="meta" title={new Date(event.timestamp).toLocaleString()}>
        {fmtRelative(event.timestamp)}
      </div>
    </EventRow>
  );
}

/* ─── Public components ──────────────────────────────────── */

export function WalletRelationshipGraph() {
  const { data, isLoading, isError } = useQuery<WalletGraphPayload>({
    queryKey: ["wallet-relationship-graph"],
    queryFn: () => api.get<WalletGraphPayload>("/api/profile/wallet-graph"),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const nodesById = useMemo(() => {
    const map = new Map<string, WalletGraphNode>();
    for (const node of data?.nodes ?? []) map.set(node.id, node);
    return map;
  }, [data?.nodes]);

  if (isLoading) return <Wrapper>Loading wallet graph…</Wrapper>;
  if (isError || !data)
    return <Wrapper>Unable to load wallet relationship graph.</Wrapper>;
  if (data.totals.wallets === 0)
    return <Wrapper>Link a wallet to map account relationships.</Wrapper>;

  const visibleEdges = data.edges.slice(0, 36);

  return (
    <Wrapper>
      <StatGrid>
        <StatCell>
          <strong>{data.totals.wallets}</strong>
          <span>Wallets</span>
        </StatCell>
        <StatCell>
          <strong>{data.totals.tokens}</strong>
          <span>Indexed tokens</span>
        </StatCell>
        <StatCell>
          <strong>{data.totals.domains}</strong>
          <span>Tezos domains</span>
        </StatCell>
        <StatCell>
          <strong>{data.totals.creators}</strong>
          <span>Creator addresses</span>
        </StatCell>
      </StatGrid>

      <RelationList>
        {visibleEdges.map((edge) => {
          const from = nodesById.get(edge.from);
          const to = nodesById.get(edge.to);
          return (
            <RelationRow key={edge.id}>
              <code>{shortAddr(from?.label)}</code>
              <span>{edge.label}</span>
              <code>{shortAddr(to?.label)}</code>
            </RelationRow>
          );
        })}
      </RelationList>

      {data.capped ? (
        <span style={{ fontSize: WALLET_DOSSIER_CAPTION_TYPE, color: "#555" }}>
          Showing the most recent indexed token relationships.
        </span>
      ) : null}
    </Wrapper>
  );
}

interface WalletDossierProps {
  /** Which endpoint to hit. */
  mode: "self" | "admin-user";
  /** Required when mode === "admin-user". */
  userId?: number;
  /** Max events to show.  Default 100. */
  limit?: number;
}

export function WalletDossier({ mode, userId, limit = 100 }: WalletDossierProps) {
  const qc = useQueryClient();
  const path =
    mode === "self"
      ? `/api/profile/dossier?limit=${limit}`
      : `/api/admin/users/${userId}/dossier?limit=${limit}`;
  const queryKey = ["wallet-dossier", mode, userId ?? "self", limit];

  const { data, isLoading, isError, refetch, isFetching } =
    useQuery<UserDossierPayload>({
      queryKey,
      queryFn: () => api.get<UserDossierPayload>(path),
      enabled: mode === "self" || typeof userId === "number",
      staleTime: 30_000,
      refetchInterval: 30_000,
    });

  const resyncMutation = useMutation({
    mutationFn: (walletAddress: string) =>
      mode === "self"
        ? api.post(`/api/wallets/${walletAddress}/resync`)
        : api.post(`/api/admin/wallets/${walletAddress}/resync`),
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey }), 1500);
    },
  });

  const resyncAllMutation = useMutation({
    mutationFn: () => {
      if (mode === "admin-user" && userId) {
        return api.post(`/api/admin/users/${userId}/resync`);
      }
      // "self" mode has no single endpoint; fire all in parallel.
      const addrs = data?.wallets.map((w) => w.walletAddress) ?? [];
      return Promise.all(addrs.map((a) => api.post(`/api/wallets/${a}/resync`)));
    },
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries({ queryKey }), 2000);
    },
  });

  const aggregate = data?.aggregate;

  if (isLoading) return <Wrapper>Loading dossier…</Wrapper>;
  if (isError || !data)
    return <Wrapper>Unable to load dossier. Try again.</Wrapper>;
  if (data.wallets.length === 0)
    return (
      <Wrapper>
        No wallets linked — nothing to surveil yet.
      </Wrapper>
    );

  return (
    <Wrapper>
      <StatGrid>
        <StatCell>
          <strong>{aggregate?.total ?? 0}</strong>
          <span>Events total</span>
        </StatCell>
        <StatCell>
          <strong>{data.wallets.length}</strong>
          <span>Linked wallets</span>
        </StatCell>
        <StatCell>
          <strong>
            {aggregate?.firstEventAt
              ? new Date(aggregate.firstEventAt).toLocaleDateString()
              : "—"}
          </strong>
          <span>First event</span>
        </StatCell>
        <StatCell>
          <strong>
            {aggregate?.lastEventAt
              ? fmtRelative(aggregate.lastEventAt)
              : "—"}
          </strong>
          <span>Last event</span>
        </StatCell>
      </StatGrid>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button
          size="sm"
          onClick={() => resyncAllMutation.mutate()}
          disabled={resyncAllMutation.isPending}
        >
          {resyncAllMutation.isPending ? "Queuing…" : "Resync all wallets"}
        </Button>
        <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
        {isFetching && (
          <span style={{ fontSize: WALLET_DOSSIER_CAPTION_TYPE, color: "#555" }}>
            Auto-refreshing every 30s
          </span>
        )}
      </div>

      {data.wallets.map((w) => (
        <div key={w.walletAddress}>
          <WalletHeader>
            <span>
              {w.walletAddress} &nbsp; · &nbsp; {w.stats.total} events
            </span>
            <Button
              size="sm"
              style={{ height: 20, padding: "0 8px" }}
              onClick={() => resyncMutation.mutate(w.walletAddress)}
              disabled={resyncMutation.isPending}
            >
              Resync
            </Button>
          </WalletHeader>
          <WalletBody>
            <SyncLine>
              <span>
                <strong>Last sync:</strong>{" "}
                {w.cursor?.lastSyncedAt
                  ? `${fmtRelative(w.cursor.lastSyncedAt)} — `
                  : "never — "}
                <span
                  className={
                    w.cursor?.lastSyncStatus === "ok"
                      ? "status-ok"
                      : w.cursor?.lastSyncStatus === "error"
                        ? "status-err"
                        : "status-none"
                  }
                >
                  {w.cursor?.lastSyncStatus ?? "pending"}
                </span>
                {w.cursor?.lastSyncError && (
                  <span style={{ color: "#a00" }}>
                    {" "}
                    ({w.cursor.lastSyncError})
                  </span>
                )}
              </span>
              <span>
                Cursor: transfer#{String(w.cursor?.lastTransferId ?? 0)} · op#
                {String(w.cursor?.lastOperationId ?? 0)} · L
                {String(w.cursor?.lastLevel ?? 0)}
              </span>
              <span>
                Backfilled:{" "}
                {w.cursor?.backfilled ? (
                  <span className="status-ok">yes</span>
                ) : (
                  <span className="status-none">no</span>
                )}
              </span>
            </SyncLine>

            <TypeBreakdown stats={w.stats} />

            {w.events.length === 0 ? (
              <p style={{ fontSize: WALLET_DOSSIER_CAPTION_TYPE, color: "#555" }}>
                No events on record. Try Resync to run a fresh backfill.
              </p>
            ) : (
              <EventList>{w.events.map(renderEventRow)}</EventList>
            )}
          </WalletBody>
        </div>
      ))}
    </Wrapper>
  );
}

function TypeBreakdown({ stats }: { stats: DossierStats }) {
  const entries = useMemo(
    () =>
      Object.entries(stats.byType)
        .filter(([, v]) => (v ?? 0) > 0)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)),
    [stats.byType]
  );
  if (entries.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        margin: "6px 0",
        fontSize: WALLET_DOSSIER_CAPTION_TYPE,
      }}
    >
      {entries.map(([type, count]) => (
        <span
          key={type}
          style={{
            background: EVENT_TINT[type as WalletEventType] ?? "#ccc",
            border: "1px solid #444",
            padding: "1px 6px",
          }}
        >
          <strong>{count}</strong>{" "}
          {EVENT_LABEL[type as WalletEventType] ?? type}
        </span>
      ))}
    </div>
  );
}
