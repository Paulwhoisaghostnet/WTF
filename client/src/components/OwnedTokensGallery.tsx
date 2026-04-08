import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Button,
  TextInput,
  Select,
  Hourglass,
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableDataCell,
  TableBody,
  Checkbox,
  GroupBox,
  Tabs,
  Tab,
  TabBody,
  Anchor,
} from "react95";
import styled from "styled-components";
import { api } from "../lib/api";

export interface OwnedToken {
  id: number;
  contract: string;
  tokenId: string;
  balance: string;
  name?: string;
  symbol?: string;
  thumbnail?: string;
  metadata?: Record<string, any>;
  walletAddress: string;
  creatorAddress?: string;
  onTradeBoard: boolean;
  tradeBoardQuantity: number;
  updatedAt: string;
}

interface TokensResponse {
  items: OwnedToken[];
  contracts: string[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number;
  };
}

type SortColumn = "name" | "contract" | "tokenId" | "balance" | "updatedAt" | "lastSeenAt";
type SortDir = "asc" | "desc";

export interface OwnedTokensGalleryProps {
  walletFilter?: string;
  walletOptions?: { label: string; value: string }[];
  userWallets?: string[];
  selectable?: boolean;
  onSelect?: (token: OwnedToken) => void;
  pageSize?: number;
  tradeBoardOnly?: boolean;
}

// ─── Styled ──────────────────────────────────────────────

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  margin-top: 8px;
`;

const TokenCard = styled.div<{ $selected?: boolean; $onBoard?: boolean }>`
  background: ${(p) => (p.$selected ? "#000080" : p.$onBoard ? "#e8ffe8" : "#c0c0c0")};
  color: ${(p) => (p.$selected ? "#fff" : "#000")};
  border: 2px solid ${(p) => (p.$selected ? "#fff" : p.$onBoard ? "#008000" : "#808080")};
  padding: 4px;
  cursor: pointer;
  text-align: center;
  font-size: 10px;
  transition: background 0.1s;
  position: relative;
  &:hover { border-color: #000080; }
`;

const ThumbWrap = styled.div`
  width: 100%;
  aspect-ratio: 1;
  background: #dfdfdf;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  margin-bottom: 4px;
  border: 1px inset #808080;
  img { max-width: 100%; max-height: 100%; object-fit: contain; }
`;

const TokenName = styled.div`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: bold;
  font-size: 11px;
`;

const TokenMeta = styled.div`
  font-size: 9px;
  opacity: 0.8;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const PaginationBar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 11px;
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
`;

const FilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
`;

const ViewToggle = styled.div`
  display: flex;
  gap: 2px;
`;

const SortableHeader = styled(TableHeadCell)<{ $active?: boolean }>`
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  background: ${(p) => (p.$active ? "#d0d0d0" : "inherit")};
  &:hover { background: #d8d8d8; }
`;

const BatchBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #ffffcc;
  border: 1px solid #808080;
  margin-bottom: 8px;
  font-size: 11px;
`;

const BoardBadge = styled.span`
  display: inline-block;
  font-size: 8px;
  padding: 1px 4px;
  background: #008000;
  color: #fff;
  border-radius: 2px;
  margin-top: 2px;
`;

const CheckWrap = styled.div`
  position: absolute;
  top: 2px;
  left: 2px;
  z-index: 1;
`;

const DetailOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
`;

const DetailCard = styled(GroupBox)`
  background: #c0c0c0;
  max-width: 500px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  padding: 12px;
`;

const DetailImage = styled.div`
  width: 100%;
  max-height: 300px;
  background: #dfdfdf;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px inset #808080;
  margin-bottom: 8px;
  img { max-width: 100%; max-height: 300px; object-fit: contain; }
`;

const DetailRow = styled.div`
  display: flex;
  gap: 6px;
  font-size: 11px;
  margin-bottom: 4px;
  strong { min-width: 80px; }
`;

const LinkRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
`;

// ─── Helpers ─────────────────────────────────────────────

function teiaUrl(contract: string, tokenId: string) {
  return `https://teia.art/objkt/${contract}/${tokenId}`;
}

function objktUrl(contract: string, tokenId: string) {
  return `https://objkt.com/tokens/${contract}/${tokenId}`;
}

function tzktTokenUrl(contract: string, tokenId: string) {
  return `https://tzkt.io/${contract}/tokens/${tokenId}`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 8)}...${addr.slice(-5)}`;
}

// ─── Detail Modal ────────────────────────────────────────

function TokenDetailModal({
  token,
  onClose,
}: {
  token: OwnedToken;
  onClose: () => void;
}) {
  const meta = token.metadata || {};
  const description = meta.description || meta.Description || "";
  const tags = Array.isArray(meta.tags) ? meta.tags : [];
  const creators = Array.isArray(meta.creators) ? meta.creators : [];

  return (
    <DetailOverlay onClick={onClose}>
      <DetailCard
        label={token.name || `Token #${token.tokenId}`}
        onClick={(e: any) => e.stopPropagation()}
      >
        <DetailImage>
          {token.thumbnail ? (
            <img src={token.thumbnail} alt={token.name || "Token"} />
          ) : (
            <span style={{ fontSize: 32 }}>?</span>
          )}
        </DetailImage>

        <DetailRow>
          <strong>Contract:</strong>
          <span style={{ fontFamily: "monospace", fontSize: 10 }}>{token.contract}</span>
        </DetailRow>
        <DetailRow>
          <strong>Token ID:</strong> <span>{token.tokenId}</span>
        </DetailRow>
        <DetailRow>
          <strong>Balance:</strong> <span>{token.balance}</span>
        </DetailRow>
        {token.symbol && (
          <DetailRow>
            <strong>Symbol:</strong> <span>{token.symbol}</span>
          </DetailRow>
        )}
        {token.creatorAddress && (
          <DetailRow>
            <strong>Creator:</strong>
            <span style={{ fontFamily: "monospace", fontSize: 10 }}>
              {token.creatorAddress}
            </span>
          </DetailRow>
        )}
        {creators.length > 0 && !token.creatorAddress && (
          <DetailRow>
            <strong>Creator(s):</strong>
            <span style={{ fontFamily: "monospace", fontSize: 10 }}>
              {creators.join(", ")}
            </span>
          </DetailRow>
        )}
        <DetailRow>
          <strong>Wallet:</strong>
          <span style={{ fontFamily: "monospace", fontSize: 10 }}>
            {token.walletAddress}
          </span>
        </DetailRow>
        {token.onTradeBoard && (
          <DetailRow>
            <strong>Status:</strong>
            <BoardBadge>
              {token.tradeBoardQuantity}/{token.balance} on board
            </BoardBadge>
          </DetailRow>
        )}
        {description && (
          <DetailRow>
            <strong>Description:</strong>
            <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {String(description).slice(0, 500)}
            </span>
          </DetailRow>
        )}
        {tags.length > 0 && (
          <DetailRow>
            <strong>Tags:</strong> <span>{tags.join(", ")}</span>
          </DetailRow>
        )}

        <LinkRow>
          <Anchor href={objktUrl(token.contract, token.tokenId)} target="_blank">
            View on objkt
          </Anchor>
          <Anchor href={teiaUrl(token.contract, token.tokenId)} target="_blank">
            View on Teia
          </Anchor>
          <Anchor href={tzktTokenUrl(token.contract, token.tokenId)} target="_blank">
            View on TzKT
          </Anchor>
        </LinkRow>

        <div style={{ marginTop: 12, textAlign: "right" }}>
          <Button onClick={onClose}>Close</Button>
        </div>
      </DetailCard>
    </DetailOverlay>
  );
}

// ─── Main Component ──────────────────────────────────────

export function OwnedTokensGallery({
  walletFilter,
  walletOptions,
  userWallets = [],
  selectable = false,
  onSelect,
  pageSize = 48,
  tradeBoardOnly = false,
}: OwnedTokensGalleryProps) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [walletAddr, setWalletAddr] = useState(walletFilter ?? "");
  const [syncing, setSyncing] = useState(false);
  const [sortBy, setSortBy] = useState<SortColumn>("lastSeenAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [contractFilter, setContractFilter] = useState("");
  const [boardFilter, setBoardFilter] = useState<"" | "true" | "false">(
    tradeBoardOnly ? "true" : ""
  );
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [detailToken, setDetailToken] = useState<OwnedToken | null>(null);
  const [creatorTab, setCreatorTab] = useState<0 | 1>(0);
  const [boardQtyInputs, setBoardQtyInputs] = useState<Record<number, string>>({});

  const effectiveWallet = walletFilter ?? walletAddr;
  const createdByMe = !selectable && !tradeBoardOnly
    ? (creatorTab === 0 ? "true" : "false")
    : undefined;

  const queryKey = [
    "profile-tokens",
    effectiveWallet,
    search,
    offset,
    pageSize,
    sortBy,
    sortDir,
    contractFilter,
    boardFilter,
    createdByMe ?? "",
  ];

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
        sortBy,
        sortDir,
      });
      if (effectiveWallet) params.set("wallet", effectiveWallet);
      if (search) params.set("q", search);
      if (contractFilter) params.set("contract", contractFilter);
      if (boardFilter) params.set("onTradeBoard", boardFilter);
      if (createdByMe) params.set("createdByMe", createdByMe);
      return api.get<TokensResponse>(`/api/profile/tokens?${params}`);
    },
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;
  const contracts = data?.contracts ?? [];

  const tradeBoardMutation = useMutation({
    mutationFn: (payload: { tokenIds: number[]; add: boolean; quantity?: number }) =>
      api.post("/api/profile/tokens/trade-board", payload),
    onSuccess: () => {
      setSelected(new Set());
      setBoardQtyInputs({});
      qc.invalidateQueries({ queryKey: ["profile-tokens"] });
      qc.invalidateQueries({ queryKey: ["marketplace"] });
    },
  });

  const toggleSort = useCallback(
    (col: SortColumn) => {
      if (sortBy === col) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortBy(col);
        setSortDir("desc");
      }
      setOffset(0);
    },
    [sortBy]
  );

  const sortArrow = (col: SortColumn) =>
    sortBy === col ? (sortDir === "desc" ? " ▼" : " ▲") : "";

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(items.map((t) => t.id)));
  }, [items]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post<{ ok: boolean; walletsProcessed: number; totalTokens: number }>(
        "/api/profile/tokens/sync"
      );
      qc.invalidateQueries({ queryKey: ["profile-tokens"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
    } catch {
      // non-fatal
    } finally {
      setSyncing(false);
    }
  };

  const handleSearch = (e: any) => {
    setSearch(e.target?.value ?? "");
    setOffset(0);
  };

  const handleTokenClick = (token: OwnedToken) => {
    if (selectable && onSelect) {
      onSelect(token);
      return;
    }
    if (selectMode) {
      toggleSelect(token.id);
    } else {
      setDetailToken(token);
    }
  };

  const handleTabChange = (v: number) => {
    setCreatorTab(v as 0 | 1);
    setOffset(0);
    setSelected(new Set());
  };

  const showTabs = !selectable && !tradeBoardOnly;
  const showSelectToggle = !selectable;

  const tokenGrid = (
    <>
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 16 }}>
          <Hourglass size={32} />
          <p style={{ fontSize: 11 }}>Loading tokens...</p>
        </div>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 12, padding: 8 }}>
          {search || contractFilter || boardFilter
            ? "No tokens match your filters."
            : creatorTab === 0
              ? "No created tokens found. Sync your wallet to update."
              : "No collected tokens found. Sync your wallet to update."}
        </p>
      ) : view === "grid" ? (
        <Grid>
          {items.map((token) => {
            const isSelected = selected.has(token.id);
            return (
              <TokenCard
                key={`${token.contract}:${token.tokenId}:${token.walletAddress}`}
                onClick={() => handleTokenClick(token)}
                $selected={isSelected}
                $onBoard={token.onTradeBoard && !isSelected}
              >
                {selectMode && (
                  <CheckWrap>
                    <Checkbox
                      checked={isSelected}
                      readOnly
                    />
                  </CheckWrap>
                )}
                <ThumbWrap>
                  {token.thumbnail ? (
                    <img
                      src={token.thumbnail}
                      alt={token.name || "Token"}
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: 20 }}>?</span>
                  )}
                </ThumbWrap>
                <TokenName>{token.name || `#${token.tokenId}`}</TokenName>
                <TokenMeta>{token.contract.slice(0, 8)}...</TokenMeta>
                {Number(token.balance) > 1 && <TokenMeta>x{token.balance}</TokenMeta>}
                {token.onTradeBoard && (
                  <BoardBadge>
                    {token.tradeBoardQuantity}/{token.balance} on board
                  </BoardBadge>
                )}
                {!selectable && token.onTradeBoard && (
                  <div
                    style={{ display: "flex", gap: 2, marginTop: 2, alignItems: "center" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="number"
                      min={1}
                      max={Number(token.balance)}
                      value={boardQtyInputs[token.id] ?? String(token.tradeBoardQuantity)}
                      onChange={(e) =>
                        setBoardQtyInputs((prev) => ({ ...prev, [token.id]: e.target.value }))
                      }
                      style={{ width: 40, fontSize: 10, textAlign: "center" }}
                    />
                    <Button
                      size="sm"
                      style={{ fontSize: 9, padding: "0 4px", minWidth: 0 }}
                      disabled={tradeBoardMutation.isPending}
                      onClick={() => {
                        const qty = Math.min(
                          Math.max(1, parseInt(boardQtyInputs[token.id] || String(token.tradeBoardQuantity), 10) || 1),
                          Number(token.balance)
                        );
                        tradeBoardMutation.mutate({ tokenIds: [token.id], add: true, quantity: qty });
                      }}
                    >
                      Set
                    </Button>
                    <Button
                      size="sm"
                      style={{ fontSize: 9, padding: "0 4px", minWidth: 0 }}
                      onClick={() =>
                        setLocation(
                          `/marketplace?listToken=${token.id}&contract=${token.contract}&tokenId=${token.tokenId}&amount=1`
                        )
                      }
                    >
                      List
                    </Button>
                  </div>
                )}
              </TokenCard>
            );
          })}
        </Grid>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              {selectMode && (
                <TableHeadCell style={{ width: 30 }}>
                  <Checkbox
                    checked={items.length > 0 && items.every((t) => selected.has(t.id))}
                    onChange={() => {
                      if (items.every((t) => selected.has(t.id))) deselectAll();
                      else selectAll();
                    }}
                    label=""
                  />
                </TableHeadCell>
              )}
              <TableHeadCell style={{ width: 40 }}></TableHeadCell>
              <SortableHeader $active={sortBy === "name"} onClick={() => toggleSort("name")}>
                Name{sortArrow("name")}
              </SortableHeader>
              <SortableHeader $active={sortBy === "contract"} onClick={() => toggleSort("contract")}>
                Contract{sortArrow("contract")}
              </SortableHeader>
              <SortableHeader $active={sortBy === "tokenId"} onClick={() => toggleSort("tokenId")}>
                Token ID{sortArrow("tokenId")}
              </SortableHeader>
              <SortableHeader $active={sortBy === "balance"} onClick={() => toggleSort("balance")}>
                Qty{sortArrow("balance")}
              </SortableHeader>
              <TableHeadCell style={{ width: 60 }}>Board</TableHeadCell>
              {!walletFilter && <TableHeadCell>Wallet</TableHeadCell>}
              {selectable && <TableHeadCell></TableHeadCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((token) => {
              const isSelected = selected.has(token.id);
              return (
                <TableRow
                  key={`${token.contract}:${token.tokenId}:${token.walletAddress}`}
                  style={{
                    cursor: "pointer",
                    background: isSelected
                      ? "#cce"
                      : token.onTradeBoard
                        ? "#efffef"
                        : undefined,
                  }}
                  onClick={() => handleTokenClick(token)}
                >
                  {selectMode && (
                    <TableDataCell>
                      <Checkbox checked={isSelected} readOnly />
                    </TableDataCell>
                  )}
                  <TableDataCell>
                    {token.thumbnail ? (
                      <img
                        src={token.thumbnail}
                        alt=""
                        style={{ width: 28, height: 28, objectFit: "contain" }}
                        loading="lazy"
                      />
                    ) : (
                      <span style={{ fontSize: 16 }}>?</span>
                    )}
                  </TableDataCell>
                  <TableDataCell style={{ fontSize: 11, fontWeight: "bold" }}>
                    {token.name || `Token #${token.tokenId}`}
                  </TableDataCell>
                  <TableDataCell style={{ fontFamily: "monospace", fontSize: 10 }}>
                    {token.contract.slice(0, 10)}...{token.contract.slice(-4)}
                  </TableDataCell>
                  <TableDataCell style={{ fontSize: 11 }}>{token.tokenId}</TableDataCell>
                  <TableDataCell style={{ fontSize: 11 }}>{token.balance}</TableDataCell>
                  <TableDataCell>
                    {token.onTradeBoard ? (
                      <BoardBadge>{token.tradeBoardQuantity}/{token.balance}</BoardBadge>
                    ) : (
                      <span style={{ fontSize: 9, opacity: 0.5 }}>—</span>
                    )}
                  </TableDataCell>
                  {!walletFilter && (
                    <TableDataCell style={{ fontFamily: "monospace", fontSize: 9 }}>
                      {token.walletAddress.slice(0, 8)}...
                    </TableDataCell>
                  )}
                  {selectable && (
                    <TableDataCell>
                      <Button
                        size="sm"
                        onClick={(e: any) => {
                          e.stopPropagation();
                          onSelect?.(token);
                        }}
                      >
                        Select
                      </Button>
                    </TableDataCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {pagination && pagination.total > 0 && (
        <PaginationBar>
          <Button
            size="sm"
            disabled={offset === 0 || isFetching}
            onClick={() => setOffset(Math.max(0, offset - pageSize))}
          >
            Prev
          </Button>
          <Button
            size="sm"
            disabled={!pagination.hasMore || isFetching}
            onClick={() => setOffset(pagination.nextOffset)}
          >
            Next
          </Button>
          <span>
            {offset + 1}&ndash;{Math.min(offset + items.length, pagination.total)} of{" "}
            {pagination.total} tokens
          </span>
          {isFetching && <Hourglass size={16} />}
        </PaginationBar>
      )}
    </>
  );

  return (
    <div>
      <Controls>
        {walletOptions && walletOptions.length > 1 && !walletFilter && (
          <Select
            value={walletAddr}
            onChange={(e: any) => {
              setWalletAddr(e.value);
              setOffset(0);
            }}
            options={[{ label: "All Wallets", value: "" }, ...walletOptions]}
            width={260}
          />
        )}
        <TextInput
          value={search}
          onChange={handleSearch}
          placeholder="Search tokens..."
          style={{ minWidth: 180, flex: 1 }}
        />
        <ViewToggle>
          <Button size="sm" active={view === "grid"} onClick={() => setView("grid")}>
            Grid
          </Button>
          <Button size="sm" active={view === "list"} onClick={() => setView("list")}>
            List
          </Button>
        </ViewToggle>
        <Button size="sm" onClick={handleSync} disabled={syncing}>
          {syncing ? "Syncing..." : "Sync"}
        </Button>
      </Controls>

      <FilterRow>
        {contracts.length > 1 && (
          <Select
            value={contractFilter}
            onChange={(e: any) => {
              setContractFilter(e.value);
              setOffset(0);
            }}
            options={[
              { label: "All Contracts", value: "" },
              ...contracts.map((c) => ({
                label: `${c.slice(0, 10)}...${c.slice(-4)}`,
                value: c,
              })),
            ]}
            width={220}
          />
        )}
        {!tradeBoardOnly && (
          <Select
            value={boardFilter}
            onChange={(e: any) => {
              setBoardFilter(e.value);
              setOffset(0);
            }}
            options={[
              { label: "All Tokens", value: "" },
              { label: "On Trade Board", value: "true" },
              { label: "Not on Trade Board", value: "false" },
            ]}
            width={180}
          />
        )}
        {showSelectToggle && (
          <Button
            size="sm"
            active={selectMode}
            onClick={() => {
              setSelectMode((m) => {
                if (m) setSelected(new Set());
                return !m;
              });
            }}
          >
            {selectMode ? "Cancel Select" : "Select Multiple"}
          </Button>
        )}
        {view === "list" && (
          <span style={{ fontSize: 10, opacity: 0.7 }}>
            Sort: {sortBy} {sortDir === "desc" ? "▼" : "▲"}
          </span>
        )}
      </FilterRow>

      {selectMode && (
        <BatchBar>
          <span>{selected.size} selected</span>
          <Button
            size="sm"
            onClick={() => tradeBoardMutation.mutate({ tokenIds: [...selected], add: true })}
            disabled={tradeBoardMutation.isPending || selected.size === 0}
          >
            + Board (all)
          </Button>
          <Button
            size="sm"
            onClick={() => tradeBoardMutation.mutate({ tokenIds: [...selected], add: false })}
            disabled={tradeBoardMutation.isPending || selected.size === 0}
          >
            − Board
          </Button>
          <Button size="sm" onClick={selectAll}>
            Select Page
          </Button>
          <Button size="sm" onClick={deselectAll} disabled={selected.size === 0}>
            Clear
          </Button>
          {tradeBoardMutation.isPending && <Hourglass size={16} />}
        </BatchBar>
      )}

      {showTabs ? (
        <>
          <Tabs value={creatorTab} onChange={handleTabChange}>
            <Tab value={0}>My Creations</Tab>
            <Tab value={1}>Collected</Tab>
          </Tabs>
          <TabBody>{tokenGrid}</TabBody>
        </>
      ) : (
        tokenGrid
      )}

      {detailToken && (
        <TokenDetailModal token={detailToken} onClose={() => setDetailToken(null)} />
      )}
    </div>
  );
}
