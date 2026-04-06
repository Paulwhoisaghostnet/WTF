import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
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
  onTradeBoard: boolean;
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
  selectable?: boolean;
  onSelect?: (token: OwnedToken) => void;
  pageSize?: number;
  tradeBoardOnly?: boolean;
}

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

  &:hover {
    border-color: #000080;
  }
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

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
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

  &:hover {
    background: #d8d8d8;
  }
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

export function OwnedTokensGallery({
  walletFilter,
  walletOptions,
  selectable = false,
  onSelect,
  pageSize = 48,
  tradeBoardOnly = false,
}: OwnedTokensGalleryProps) {
  const qc = useQueryClient();
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

  const effectiveWallet = walletFilter ?? walletAddr;

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
      return api.get<TokensResponse>(`/api/profile/tokens?${params}`);
    },
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;
  const contracts = data?.contracts ?? [];

  const tradeBoardMutation = useMutation({
    mutationFn: (payload: { tokenIds: number[]; add: boolean }) =>
      api.post("/api/profile/tokens/trade-board", payload),
    onSuccess: () => {
      setSelected(new Set());
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

  const selectedItems = useMemo(
    () => items.filter((t) => selected.has(t.id)),
    [items, selected]
  );

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
    } else {
      toggleSelect(token.id);
    }
  };

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
        <span style={{ fontSize: 10, opacity: 0.7 }}>
          Sort: {sortBy} {sortDir === "desc" ? "▼" : "▲"}
        </span>
      </FilterRow>

      {selected.size > 0 && (
        <BatchBar>
          <span>{selected.size} selected</span>
          <Button
            size="sm"
            onClick={() => tradeBoardMutation.mutate({ tokenIds: [...selected], add: true })}
            disabled={tradeBoardMutation.isPending}
          >
            + Trade Board
          </Button>
          <Button
            size="sm"
            onClick={() => tradeBoardMutation.mutate({ tokenIds: [...selected], add: false })}
            disabled={tradeBoardMutation.isPending}
          >
            - Trade Board
          </Button>
          <Button size="sm" onClick={selectAll}>
            Select Page
          </Button>
          <Button size="sm" onClick={deselectAll}>
            Clear
          </Button>
          {tradeBoardMutation.isPending && <Hourglass size={16} />}
        </BatchBar>
      )}

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 16 }}>
          <Hourglass size={32} />
          <p style={{ fontSize: 11 }}>Loading tokens...</p>
        </div>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 12, padding: 8 }}>
          {search || contractFilter || boardFilter
            ? "No tokens match your filters."
            : "No tokens found. Connect a wallet and sync to index your tokens."}
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
                {!selectable && (
                  <CheckWrap>
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleSelect(token.id)}
                      onClick={(e: any) => e.stopPropagation()}
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
                {token.onTradeBoard && <BoardBadge>Trade Board</BoardBadge>}
              </TokenCard>
            );
          })}
        </Grid>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              {!selectable && (
                <TableHeadCell style={{ width: 30 }}>
                  <Checkbox
                    checked={items.length > 0 && items.every((t) => selected.has(t.id))}
                    onChange={() => {
                      if (items.every((t) => selected.has(t.id))) deselectAll();
                      else selectAll();
                    }}
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
              {!walletFilter && (
                <SortableHeader $active={false}>Wallet</SortableHeader>
              )}
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
                  {!selectable && (
                    <TableDataCell>
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggleSelect(token.id)}
                        onClick={(e: any) => e.stopPropagation()}
                      />
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
                      <BoardBadge>Yes</BoardBadge>
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
    </div>
  );
}
