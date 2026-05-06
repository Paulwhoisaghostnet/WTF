import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Anchor,
  Button,
  Hourglass,
  Separator,
  Table,
  TableBody,
  TableDataCell,
  TableHead,
  TableHeadCell,
  TableRow,
  TextInput,
} from "react95";
import styled from "styled-components";
import { api } from "../../lib/api";
import { useEtherlinkWallet } from "../../lib/etherlink";

interface EtherlinkWalletRow {
  id: number;
  walletAddress: string;
  chainId: number;
  network: string;
  providerName?: string | null;
  nativeBalanceXtz: string;
  isPrimary: boolean;
  tokenCount: number;
  lastSyncedAt: string | null;
  explorerUrl?: string | null;
}

interface EtherlinkAsset {
  id: number;
  walletAddress: string;
  chainId: number;
  network: string;
  tokenContract: string;
  tokenId: string;
  tokenStandard: string;
  balance: string;
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
  thumbnail?: string | null;
  explorerUrl?: string | null;
  updatedAt: string;
}

interface EtherlinkAssetsResponse {
  items: EtherlinkAsset[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number;
  };
}

const ToolbarRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 8px;
`;

const StatusLine = styled.p`
  font-size: 11px;
  color: #333;
  margin: 4px 0 8px;
`;

const ErrorLine = styled.p`
  font-size: 11px;
  background: #ffe8e8;
  border: 1px solid #c00;
  padding: 6px;
  margin: 6px 0;
`;

const Thumbnail = styled.div`
  width: 34px;
  height: 34px;
  background: #000;
  border: 1px solid #808080;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  span {
    color: #c0c0c0;
    font-size: 10px;
  }
`;

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatSyncedAt(value: string | null): string {
  if (!value) return "never";
  return new Date(value).toLocaleString();
}

function formatAssetBalance(asset: EtherlinkAsset): string {
  if (asset.tokenStandard !== "ERC-20" || asset.decimals == null) {
    return asset.balance;
  }
  try {
    const raw = BigInt(asset.balance);
    const scale = 10n ** BigInt(asset.decimals);
    const whole = raw / scale;
    const fraction = raw % scale;
    const fractionText = fraction
      .toString()
      .padStart(asset.decimals, "0")
      .slice(0, Math.min(6, asset.decimals));
    return `${whole.toString()}.${fractionText}`.replace(/\.?0+$/, "");
  } catch {
    return asset.balance;
  }
}

export function EtherlinkWalletsPanel() {
  const {
    address,
    chainId,
    network,
    providerName,
    isConnecting,
    connect,
    disconnect,
    linkConnectedWallet,
  } = useEtherlinkWallet();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const pageSize = 25;

  const walletsQuery = useQuery({
    queryKey: ["etherlink-wallets"],
    queryFn: () => api.get<EtherlinkWalletRow[]>("/api/etherlink/wallets"),
  });

  const assetParams = useMemo(() => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (search) params.set("q", search);
    return params;
  }, [offset, search]);

  const assetsQuery = useQuery({
    queryKey: ["etherlink-assets", search, offset, pageSize],
    queryFn: () =>
      api.get<EtherlinkAssetsResponse>(`/api/etherlink/assets?${assetParams}`),
    enabled: Boolean(walletsQuery.data?.length),
  });

  const syncMutation = useMutation({
    mutationFn: (walletId: number) => api.post(`/api/etherlink/wallets/${walletId}/sync`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["etherlink-wallets"] });
      qc.invalidateQueries({ queryKey: ["etherlink-assets"] });
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: () => api.post("/api/etherlink/wallets/sync"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["etherlink-wallets"] });
      qc.invalidateQueries({ queryKey: ["etherlink-assets"] });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (walletId: number) => api.delete(`/api/etherlink/wallets/${walletId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["etherlink-wallets"] });
      qc.invalidateQueries({ queryKey: ["etherlink-assets"] });
    },
  });

  const primaryMutation = useMutation({
    mutationFn: (walletId: number) =>
      api.put(`/api/etherlink/wallets/${walletId}/primary`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["etherlink-wallets"] }),
  });

  const handleConnect = async (preference: "temple" | "metamask") => {
    setError(null);
    try {
      await connect(preference);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLink = async () => {
    setError(null);
    try {
      await linkConnectedWallet();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const wallets = walletsQuery.data ?? [];
  const assets = assetsQuery.data?.items ?? [];
  const pagination = assetsQuery.data?.pagination;

  return (
    <div>
      <StatusLine>
        Etherlink uses its own EVM wallet session, so your Tezos wallet can stay
        connected at the same time.
      </StatusLine>
      <ToolbarRow>
        <Button
          size="sm"
          onClick={() => handleConnect("temple")}
          disabled={isConnecting}
        >
          {isConnecting ? "Connecting..." : "Connect Temple"}
        </Button>
        <Button
          size="sm"
          onClick={() => handleConnect("metamask")}
          disabled={isConnecting}
        >
          Connect MetaMask
        </Button>
        {address && (
          <>
            <Button size="sm" onClick={handleLink}>
              Link Connected
            </Button>
            <Button size="sm" onClick={disconnect}>
              Disconnect EVM
            </Button>
          </>
        )}
        {wallets.length > 0 && (
          <Button
            size="sm"
            onClick={() => syncAllMutation.mutate()}
            disabled={syncAllMutation.isPending}
          >
            {syncAllMutation.isPending ? "Syncing..." : "Sync All"}
          </Button>
        )}
      </ToolbarRow>

      {address && (
        <StatusLine>
          Connected: <code>{shortAddress(address)}</code>
          {providerName ? ` via ${providerName}` : ""}
          {network && chainId ? ` on ${network} (${chainId})` : ""}
        </StatusLine>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}

      {walletsQuery.isLoading ? (
        <div style={{ padding: 8 }}>
          <Hourglass size={24} />
        </div>
      ) : wallets.length > 0 ? (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeadCell>Address</TableHeadCell>
              <TableHeadCell>Network</TableHeadCell>
              <TableHeadCell>XTZ</TableHeadCell>
              <TableHeadCell>Assets</TableHeadCell>
              <TableHeadCell>Synced</TableHeadCell>
              <TableHeadCell>Actions</TableHeadCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {wallets.map((wallet) => (
              <TableRow key={wallet.id}>
                <TableDataCell style={{ fontFamily: "monospace", fontSize: 10 }}>
                  {wallet.explorerUrl ? (
                    <Anchor href={wallet.explorerUrl} target="_blank" rel="noreferrer">
                      {shortAddress(wallet.walletAddress)}
                    </Anchor>
                  ) : (
                    shortAddress(wallet.walletAddress)
                  )}
                  {wallet.isPrimary ? " *" : ""}
                </TableDataCell>
                <TableDataCell>{wallet.network}</TableDataCell>
                <TableDataCell>{wallet.nativeBalanceXtz}</TableDataCell>
                <TableDataCell>{wallet.tokenCount}</TableDataCell>
                <TableDataCell>{formatSyncedAt(wallet.lastSyncedAt)}</TableDataCell>
                <TableDataCell>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {!wallet.isPrimary && (
                      <Button
                        size="sm"
                        onClick={() => primaryMutation.mutate(wallet.id)}
                      >
                        Primary
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => syncMutation.mutate(wallet.id)}
                      disabled={syncMutation.isPending}
                    >
                      Sync
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => unlinkMutation.mutate(wallet.id)}
                      disabled={unlinkMutation.isPending}
                    >
                      Unlink
                    </Button>
                  </div>
                </TableDataCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <StatusLine>No Etherlink wallets linked yet.</StatusLine>
      )}

      <Separator style={{ margin: "10px 0" }} />

      <ToolbarRow>
        <TextInput
          value={search}
          onChange={(event: any) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
          placeholder="Search Etherlink assets"
          style={{ minWidth: 240 }}
        />
        {assetsQuery.isFetching && <span style={{ fontSize: 11 }}>Loading...</span>}
      </ToolbarRow>

      {wallets.length === 0 ? null : assets.length > 0 ? (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>Asset</TableHeadCell>
                <TableHeadCell>Standard</TableHeadCell>
                <TableHeadCell>Contract</TableHeadCell>
                <TableHeadCell>Token</TableHeadCell>
                <TableHeadCell>Balance</TableHeadCell>
                <TableHeadCell>Wallet</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {assets.map((asset) => (
                <TableRow key={`${asset.chainId}:${asset.tokenContract}:${asset.tokenId}:${asset.walletAddress}`}>
                  <TableDataCell>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Thumbnail>
                        {asset.thumbnail ? (
                          <img src={asset.thumbnail} alt="" />
                        ) : (
                          <span>{asset.tokenStandard.replace("ERC-", "")}</span>
                        )}
                      </Thumbnail>
                      <span>{asset.name || asset.symbol || "Unnamed asset"}</span>
                    </div>
                  </TableDataCell>
                  <TableDataCell>{asset.tokenStandard}</TableDataCell>
                  <TableDataCell style={{ fontFamily: "monospace", fontSize: 10 }}>
                    {asset.explorerUrl ? (
                      <Anchor href={asset.explorerUrl} target="_blank" rel="noreferrer">
                        {shortAddress(asset.tokenContract)}
                      </Anchor>
                    ) : (
                      shortAddress(asset.tokenContract)
                    )}
                  </TableDataCell>
                  <TableDataCell>{asset.tokenId}</TableDataCell>
                  <TableDataCell>{formatAssetBalance(asset)}</TableDataCell>
                  <TableDataCell style={{ fontFamily: "monospace", fontSize: 10 }}>
                    {shortAddress(asset.walletAddress)}
                  </TableDataCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {pagination && (
            <ToolbarRow style={{ marginTop: 8 }}>
              <Button
                size="sm"
                disabled={offset <= 0}
                onClick={() => setOffset(Math.max(0, offset - pageSize))}
              >
                Prev
              </Button>
              <span style={{ fontSize: 11 }}>
                {offset + 1}-{offset + assets.length} of {pagination.total}
              </span>
              <Button
                size="sm"
                disabled={!pagination.hasMore}
                onClick={() => setOffset(pagination.nextOffset)}
              >
                Next
              </Button>
            </ToolbarRow>
          )}
        </>
      ) : (
        <StatusLine>
          {assetsQuery.isLoading ? "Loading Etherlink assets..." : "No Etherlink assets found."}
        </StatusLine>
      )}
    </div>
  );
}
