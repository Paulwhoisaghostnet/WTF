import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "react95";
import styled from "styled-components";
import { api } from "../lib/api";

interface OwnedToken {
  id: number;
  contract: string;
  tokenId: string;
  balance: string;
  name?: string;
  symbol?: string;
  thumbnail?: string;
  metadata?: Record<string, any>;
  walletAddress: string;
  updatedAt: string;
}

interface TokensResponse {
  items: OwnedToken[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number;
  };
}

interface OwnedTokensGalleryProps {
  walletFilter?: string;
  walletOptions?: { label: string; value: string }[];
  selectable?: boolean;
  onSelect?: (token: OwnedToken) => void;
  pageSize?: number;
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  margin-top: 8px;
`;

const TokenCard = styled.div<{ $selected?: boolean }>`
  background: ${(p) => (p.$selected ? "#000080" : "#c0c0c0")};
  color: ${(p) => (p.$selected ? "#fff" : "#000")};
  border: 2px solid ${(p) => (p.$selected ? "#fff" : "#808080")};
  padding: 4px;
  cursor: pointer;
  text-align: center;
  font-size: 10px;
  transition: background 0.1s;

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

const ViewToggle = styled.div`
  display: flex;
  gap: 2px;
`;

export function OwnedTokensGallery({
  walletFilter,
  walletOptions,
  selectable = false,
  onSelect,
  pageSize = 48,
}: OwnedTokensGalleryProps) {
  const qc = useQueryClient();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [walletAddr, setWalletAddr] = useState(walletFilter ?? "");
  const [syncing, setSyncing] = useState(false);

  const effectiveWallet = walletFilter ?? walletAddr;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["profile-tokens", effectiveWallet, search, offset, pageSize],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      });
      if (effectiveWallet) params.set("wallet", effectiveWallet);
      if (search) params.set("q", search);
      return api.get<TokensResponse>(`/api/profile/tokens?${params}`);
    },
  });

  const items = data?.items ?? [];
  const pagination = data?.pagination;

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post<{ ok: boolean; walletsProcessed: number; totalTokens: number }>(
        "/api/profile/tokens/sync"
      );
      qc.invalidateQueries({ queryKey: ["profile-tokens"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
    } catch {
      // sync failures are non-fatal for UX
    } finally {
      setSyncing(false);
    }
  };

  const handleSearch = (e: any) => {
    setSearch(e.target?.value ?? "");
    setOffset(0);
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
            options={[
              { label: "All Wallets", value: "" },
              ...walletOptions,
            ]}
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
          <Button
            size="sm"
            active={view === "grid"}
            onClick={() => setView("grid")}
          >
            Grid
          </Button>
          <Button
            size="sm"
            active={view === "list"}
            onClick={() => setView("list")}
          >
            List
          </Button>
        </ViewToggle>
        <Button size="sm" onClick={handleSync} disabled={syncing}>
          {syncing ? "Syncing..." : "Sync"}
        </Button>
      </Controls>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 16 }}>
          <Hourglass size={32} />
          <p style={{ fontSize: 11 }}>Loading tokens...</p>
        </div>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 12, padding: 8 }}>
          {search
            ? "No tokens match your search."
            : "No tokens found. Connect a wallet and sync to index your tokens."}
        </p>
      ) : view === "grid" ? (
        <Grid>
          {items.map((token) => (
            <TokenCard
              key={`${token.contract}:${token.tokenId}:${token.walletAddress}`}
              onClick={() => selectable && onSelect?.(token)}
              $selected={false}
            >
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
              <TokenMeta>
                {token.contract.slice(0, 8)}...
              </TokenMeta>
              {Number(token.balance) > 1 && (
                <TokenMeta>x{token.balance}</TokenMeta>
              )}
            </TokenCard>
          ))}
        </Grid>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeadCell style={{ width: 40 }}></TableHeadCell>
              <TableHeadCell>Name</TableHeadCell>
              <TableHeadCell>Contract</TableHeadCell>
              <TableHeadCell>Token ID</TableHeadCell>
              <TableHeadCell>Qty</TableHeadCell>
              {!walletFilter && <TableHeadCell>Wallet</TableHeadCell>}
              {selectable && <TableHeadCell></TableHeadCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((token) => (
              <TableRow
                key={`${token.contract}:${token.tokenId}:${token.walletAddress}`}
                style={{ cursor: selectable ? "pointer" : "default" }}
                onClick={() => selectable && onSelect?.(token)}
              >
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
                <TableDataCell
                  style={{ fontFamily: "monospace", fontSize: 10 }}
                >
                  {token.contract.slice(0, 10)}...{token.contract.slice(-4)}
                </TableDataCell>
                <TableDataCell style={{ fontSize: 11 }}>
                  {token.tokenId}
                </TableDataCell>
                <TableDataCell style={{ fontSize: 11 }}>
                  {token.balance}
                </TableDataCell>
                {!walletFilter && (
                  <TableDataCell
                    style={{ fontFamily: "monospace", fontSize: 9 }}
                  >
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
            ))}
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
