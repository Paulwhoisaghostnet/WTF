import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Select, TextInput } from "react95";
import styled from "styled-components";
import { api } from "../lib/api";
import { UserLink } from "./UserLink";
import {
  acceptBarterTrade,
  approveBarterForToken,
  cancelBarterTrade,
  createBarterTrade,
} from "../lib/tezos";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
`;

const TradeCard = styled(GroupBox)`
  position: relative;
`;

const Row = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 6px;
`;

interface OwnedToken {
  contract: string;
  tokenId: string;
  balance: string;
  name?: string;
  thumbnail?: string;
}

interface OwnedTokenResponse {
  items: OwnedToken[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number;
  };
}

interface BarterRequestedItem {
  tokenContract: string;
  tokenId: string | null;
  amount: string;
  tokenName: string | null;
  tokenThumbnail: string | null;
}

interface BarterOfferedItem {
  tokenContract: string;
  tokenId: string;
  amount: string;
  tokenName: string | null;
  tokenThumbnail: string | null;
}

interface BarterTrade {
  id: number;
  maker: string;
  makerUserId: number | null;
  makerUsername: string | null;
  makerDisplayName: string | null;
  requestedMode: "package" | "choice";
  requestedItems: BarterRequestedItem[];
  offeredMode: "package" | "choice";
  offeredItems: BarterOfferedItem[];
  expiresAt: string | null;
  active: boolean;
}

interface BarterOnchainResponse {
  contractAddress: string | null;
  admin: string | null;
  paused: boolean;
  trades: BarterTrade[];
  counts: {
    trades: number;
  };
  warning?: string;
}

interface BarterBoardResponse {
  contractAddress: string | null;
  items: BarterTrade[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
    total: number;
    hasMore: boolean;
    nextOffset: number;
  };
  warning?: string;
}

interface BarterBoardProps {
  address?: string | null;
}

interface OfferedDraft {
  tokenContract: string;
  tokenId: string;
  amount: string;
  name?: string;
  balance?: string;
}

interface RequestedDraft {
  tokenContract: string;
  tokenId: string;
  amount: string;
}

interface AcceptTransferDraft {
  tokenContract: string;
  tokenId: string;
  amount: string;
}

interface AcceptForm {
  selectedOfferKey: string;
  selectedRequestKey: string;
  requestedTransfers: AcceptTransferDraft[];
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 7)}...${addr.slice(-5)}`;
}

function parseNat(value: string | number, field: string): number {
  const raw = typeof value === "number" ? String(value) : value;
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) throw new Error(`${field} is too large`);
  return n;
}

function parsePositiveNat(value: string | number, field: string): number {
  const n = parseNat(value, field);
  if (n <= 0) throw new Error(`${field} must be greater than zero`);
  return n;
}

function offeredKey(tokenContract: string, tokenId: string): string {
  return `${tokenContract}:${tokenId}`;
}

function requestedKey(tokenContract: string, tokenId: string | null): string {
  return `${tokenContract}:${tokenId ?? "*"}`;
}

function parseOfferedKey(value: string): { tokenContract: string; tokenId: string } {
  const idx = value.lastIndexOf(":");
  if (idx <= 0 || idx >= value.length - 1) {
    throw new Error("Invalid offered token selection");
  }
  return {
    tokenContract: value.slice(0, idx),
    tokenId: value.slice(idx + 1),
  };
}

function parseRequestedKey(value: string): {
  tokenContract: string;
  tokenId: string | null;
} {
  const idx = value.lastIndexOf(":");
  if (idx <= 0 || idx >= value.length - 1) {
    throw new Error("Invalid requested token selection");
  }
  const tokenIdRaw = value.slice(idx + 1);
  return {
    tokenContract: value.slice(0, idx),
    tokenId: tokenIdRaw === "*" ? null : tokenIdRaw,
  };
}

function templateTransfersFromTrade(
  trade: BarterTrade,
  selectedRequestKey: string
): AcceptTransferDraft[] {
  if (trade.requestedMode === "choice") {
    const picked = trade.requestedItems.find(
      (item) => requestedKey(item.tokenContract, item.tokenId) === selectedRequestKey
    );
    if (!picked) return [];
    return [
      {
        tokenContract: picked.tokenContract,
        tokenId: picked.tokenId ?? "",
        amount: picked.amount,
      },
    ];
  }

  return trade.requestedItems.map((item) => ({
    tokenContract: item.tokenContract,
    tokenId: item.tokenId ?? "",
    amount: item.amount,
  }));
}

export function BarterBoard({ address }: BarterBoardProps) {
  const qc = useQueryClient();

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [offeredMode, setOfferedMode] = useState<"package" | "choice">("package");
  const [requestedMode, setRequestedMode] = useState<"package" | "choice">("package");
  const [expiresLocal, setExpiresLocal] = useState("");
  const [offeredPickKey, setOfferedPickKey] = useState("");
  const [offeredItems, setOfferedItems] = useState<OfferedDraft[]>([]);
  const [requestedItems, setRequestedItems] = useState<RequestedDraft[]>([
    { tokenContract: "", tokenId: "", amount: "1" },
  ]);

  const [creating, setCreating] = useState(false);
  const [busyTradeId, setBusyTradeId] = useState<number | null>(null);
  const [openAcceptTradeId, setOpenAcceptTradeId] = useState<number | null>(null);
  const [acceptForms, setAcceptForms] = useState<Record<number, AcceptForm>>({});

  const { data: onchain } = useQuery({
    queryKey: ["barter", "onchain"],
    queryFn: () => api.get<BarterOnchainResponse>("/api/barter/onchain"),
    refetchInterval: 15_000,
  });

  const { data: board, isLoading } = useQuery({
    queryKey: ["barter", "trade-board", search],
    queryFn: () =>
      api.get<BarterBoardResponse>(
        `/api/barter/trade-board?limit=200&q=${encodeURIComponent(search)}`
      ),
    refetchInterval: 15_000,
  });

  const { data: ownedTokens } = useQuery({
    queryKey: ["barter", "owned", address],
    enabled: !!address,
    queryFn: () =>
      api.get<OwnedTokenResponse>(
        `/api/profile/tokens?wallet=${encodeURIComponent(address || "")}&limit=400&offset=0`
      ),
  });

  const ownedMap = useMemo(() => {
    const map = new Map<string, OwnedToken>();
    for (const token of ownedTokens?.items || []) {
      map.set(offeredKey(token.contract, token.tokenId), token);
    }
    return map;
  }, [ownedTokens?.items]);

  const isAdmin = !!address && !!onchain?.admin && address === onchain.admin;

  const offeredSelectOptions = useMemo(
    () =>
      (ownedTokens?.items || []).map((token) => ({
        value: offeredKey(token.contract, token.tokenId),
        label: `${token.name || `#${token.tokenId}`} (${token.balance})`,
      })),
    [ownedTokens?.items]
  );

  const invalidateBarter = () => {
    qc.invalidateQueries({ queryKey: ["barter"] });
    qc.invalidateQueries({ queryKey: ["marketplace", "trade-board"] });
  };

  const clearMessages = () => {
    setErrorMsg("");
    setSuccessMsg("");
  };

  const addOfferedToken = () => {
    clearMessages();
    if (!offeredPickKey) return;
    if (offeredItems.length >= 25) {
      setErrorMsg("You can offer at most 25 token lines.");
      return;
    }
    if (offeredItems.some((item) => offeredKey(item.tokenContract, item.tokenId) === offeredPickKey)) {
      setErrorMsg("That offered token is already added.");
      return;
    }

    const token = ownedMap.get(offeredPickKey);
    if (!token) {
      setErrorMsg("Selected token not found in your wallet index.");
      return;
    }

    setOfferedItems((prev) => [
      ...prev,
      {
        tokenContract: token.contract,
        tokenId: token.tokenId,
        amount: "1",
        name: token.name,
        balance: token.balance,
      },
    ]);
    setOfferedPickKey("");
  };

  const ensureAcceptForm = (trade: BarterTrade) => {
    if (acceptForms[trade.id]) return;

    const selectedOfferKey =
      trade.offeredMode === "choice" && trade.offeredItems.length > 0
        ? offeredKey(trade.offeredItems[0].tokenContract, trade.offeredItems[0].tokenId)
        : "";

    const selectedRequestKey =
      trade.requestedMode === "choice" && trade.requestedItems.length > 0
        ? requestedKey(trade.requestedItems[0].tokenContract, trade.requestedItems[0].tokenId)
        : "";

    setAcceptForms((prev) => ({
      ...prev,
      [trade.id]: {
        selectedOfferKey,
        selectedRequestKey,
        requestedTransfers: templateTransfersFromTrade(trade, selectedRequestKey),
      },
    }));
  };

  const updateAcceptForm = (
    tradeId: number,
    updater: (current: AcceptForm) => AcceptForm
  ) => {
    setAcceptForms((prev) => {
      const existing = prev[tradeId];
      if (!existing) return prev;
      return {
        ...prev,
        [tradeId]: updater(existing),
      };
    });
  };

  const createTrade = async () => {
    clearMessages();
    if (!address) {
      setErrorMsg("Connect wallet before creating barter trades.");
      return;
    }
    if (onchain?.paused) {
      setErrorMsg("Barter contract is paused.");
      return;
    }

    try {
      setCreating(true);

      if (offeredItems.length === 0) {
        throw new Error("Add at least one offered token.");
      }
      if (offeredItems.length > 25) {
        throw new Error("Offered token lines cannot exceed 25.");
      }
      if (requestedItems.length === 0) {
        throw new Error("Add at least one requested token line.");
      }
      if (requestedItems.length > 25) {
        throw new Error("Requested token lines cannot exceed 25.");
      }

      const normalizedOffered = offeredItems.map((item, idx) => {
        const amount = parsePositiveNat(item.amount, `Offered amount #${idx + 1}`);
        const tokenId = parseNat(item.tokenId, `Offered token id #${idx + 1}`);

        const owned = ownedMap.get(offeredKey(item.tokenContract, item.tokenId));
        if (owned) {
          const max = parseNat(owned.balance, `Owned balance for offered item #${idx + 1}`);
          if (amount > max) {
            throw new Error(`Offered amount #${idx + 1} exceeds your indexed balance`);
          }
        }

        return {
          tokenContract: item.tokenContract,
          tokenId,
          amount,
        };
      });

      const normalizedRequested = requestedItems.map((item, idx) => {
        const tokenContract = item.tokenContract.trim();
        if (!tokenContract.startsWith("KT1")) {
          throw new Error(`Requested contract #${idx + 1} must be a KT1 address`);
        }
        const amount = parsePositiveNat(item.amount, `Requested amount #${idx + 1}`);
        const tokenIdRaw = item.tokenId.trim();
        const tokenId = tokenIdRaw === "" ? null : parseNat(tokenIdRaw, `Requested token id #${idx + 1}`);

        return {
          tokenContract,
          tokenId,
          amount,
        };
      });

      const uniqueApprovals = new Set<string>();
      for (const item of normalizedOffered) {
        uniqueApprovals.add(offeredKey(item.tokenContract, String(item.tokenId)));
      }

      for (const key of uniqueApprovals) {
        const parsed = parseOfferedKey(key);
        await approveBarterForToken(address, parsed.tokenContract, parsed.tokenId);
      }

      const expiresAtIso = expiresLocal
        ? new Date(expiresLocal).toISOString()
        : null;

      await createBarterTrade({
        offeredMode,
        requestedMode,
        offeredItems: normalizedOffered,
        requestedItems: normalizedRequested,
        expiresAtIso,
      });

      setSuccessMsg("Barter trade created on-chain.");
      setOfferedItems([]);
      setRequestedItems([{ tokenContract: "", tokenId: "", amount: "1" }]);
      setExpiresLocal("");
      setShowCreate(false);
      invalidateBarter();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to create barter trade");
    } finally {
      setCreating(false);
    }
  };

  const submitAccept = async (trade: BarterTrade) => {
    clearMessages();
    if (!address) {
      setErrorMsg("Connect wallet before accepting trades.");
      return;
    }
    if (onchain?.paused) {
      setErrorMsg("Barter contract is paused.");
      return;
    }

    const form = acceptForms[trade.id];
    if (!form) {
      setErrorMsg("Accept form is not initialized.");
      return;
    }

    try {
      setBusyTradeId(trade.id);

      let selectedOfferToken:
        | { tokenContract: string; tokenId: number }
        | null
        | undefined = undefined;
      if (trade.offeredMode === "choice") {
        if (!form.selectedOfferKey) throw new Error("Select which offered token you want.");
        const parsed = parseOfferedKey(form.selectedOfferKey);
        selectedOfferToken = {
          tokenContract: parsed.tokenContract,
          tokenId: parseNat(parsed.tokenId, "Selected offered token id"),
        };
      }

      let selectedRequestToken:
        | { tokenContract: string; tokenId: number | null }
        | null
        | undefined = undefined;
      if (trade.requestedMode === "choice") {
        if (!form.selectedRequestKey) throw new Error("Select requested token option.");
        const parsed = parseRequestedKey(form.selectedRequestKey);
        selectedRequestToken = {
          tokenContract: parsed.tokenContract,
          tokenId: parsed.tokenId === null ? null : parseNat(parsed.tokenId, "Selected request token id"),
        };
      }

      if (form.requestedTransfers.length === 0) {
        throw new Error("Add at least one requested transfer line.");
      }

      const normalizedTransfers = form.requestedTransfers.map((line, idx) => {
        const tokenContract = line.tokenContract.trim();
        if (!tokenContract.startsWith("KT1")) {
          throw new Error(`Requested transfer contract #${idx + 1} must be KT1`);
        }
        const tokenId = parseNat(line.tokenId.trim(), `Requested transfer token id #${idx + 1}`);
        const amount = parsePositiveNat(line.amount, `Requested transfer amount #${idx + 1}`);
        return { tokenContract, tokenId, amount };
      });

      const uniqueApprovals = new Set<string>();
      for (const transfer of normalizedTransfers) {
        uniqueApprovals.add(offeredKey(transfer.tokenContract, String(transfer.tokenId)));
      }

      for (const key of uniqueApprovals) {
        const parsed = parseOfferedKey(key);
        await approveBarterForToken(address, parsed.tokenContract, parsed.tokenId);
      }

      await acceptBarterTrade({
        tradeId: trade.id,
        selectedOfferToken: selectedOfferToken || null,
        selectedRequestToken: selectedRequestToken || null,
        requestedTransfers: normalizedTransfers,
      });

      setSuccessMsg(`Trade #${trade.id} accepted.`);
      setOpenAcceptTradeId(null);
      setAcceptForms((prev) => {
        const next = { ...prev };
        delete next[trade.id];
        return next;
      });
      invalidateBarter();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to accept trade");
    } finally {
      setBusyTradeId(null);
    }
  };

  const submitCancel = async (tradeId: number) => {
    clearMessages();
    try {
      setBusyTradeId(tradeId);
      await cancelBarterTrade(tradeId);
      setSuccessMsg(`Trade #${tradeId} cancelled.`);
      invalidateBarter();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to cancel trade");
    } finally {
      setBusyTradeId(null);
    }
  };

  return (
    <div>
      <Row style={{ justifyContent: "space-between" }}>
        <div>
          {board?.items?.length ?? 0} active barter post(s)
          {onchain?.paused ? " | Contract paused" : ""}
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Close Create" : "+ New Barter Post"}
        </Button>
      </Row>

      {showCreate && (
        <GroupBox label="Create Barter Post" style={{ marginBottom: 12 }}>
          {!address && (
            <p style={{ color: "red", fontSize: 12 }}>
              Connect wallet before creating barter posts.
            </p>
          )}

          {address && (
            <>
              <Row>
                <Select
                  options={[
                    { value: "", label: "Select offered token" },
                    ...offeredSelectOptions,
                  ]}
                  value={offeredPickKey}
                  onChange={(e: any) => setOfferedPickKey(e.value)}
                  width={320}
                />
                <Button onClick={addOfferedToken}>Add Offered Token</Button>
              </Row>

              {offeredItems.map((item, idx) => (
                <Row key={`offered-${item.tokenContract}-${item.tokenId}`}>
                  <div style={{ fontSize: 11, minWidth: 220 }}>
                    {item.name || `#${item.tokenId}`} ({item.balance || "?"})
                  </div>
                  <TextInput
                    value={item.amount}
                    onChange={(e: any) =>
                      setOfferedItems((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, amount: e.target?.value ?? "" } : x
                        )
                      )
                    }
                    placeholder="Amount"
                    width={90}
                  />
                  <Button
                    onClick={() =>
                      setOfferedItems((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    Remove
                  </Button>
                </Row>
              ))}

              <Row>
                <label style={{ minWidth: 110, fontSize: 11 }}>Offered mode</label>
                <Select
                  options={[
                    { value: "package", label: "PACKAGE (all offered)" },
                    { value: "choice", label: "CHOICE (pick one offered)" },
                  ]}
                  value={offeredMode}
                  onChange={(e: any) => setOfferedMode(e.value)}
                  width={260}
                />
              </Row>

              <Row>
                <label style={{ minWidth: 110, fontSize: 11 }}>Requested mode</label>
                <Select
                  options={[
                    { value: "package", label: "PACKAGE (all requested lines)" },
                    { value: "choice", label: "CHOICE (pick one requested line)" },
                  ]}
                  value={requestedMode}
                  onChange={(e: any) => setRequestedMode(e.value)}
                  width={260}
                />
              </Row>

              <div style={{ margin: "8px 0", fontSize: 11 }}>
                Requested lines (leave token ID blank for wildcard "any token from contract"):
              </div>

              {requestedItems.map((item, idx) => (
                <Row key={`requested-${idx}`}>
                  <TextInput
                    value={item.tokenContract}
                    onChange={(e: any) =>
                      setRequestedItems((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, tokenContract: e.target?.value ?? "" } : x
                        )
                      )
                    }
                    placeholder="KT1... contract"
                    width={220}
                  />
                  <TextInput
                    value={item.tokenId}
                    onChange={(e: any) =>
                      setRequestedItems((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, tokenId: e.target?.value ?? "" } : x
                        )
                      )
                    }
                    placeholder="token id (optional)"
                    width={140}
                  />
                  <TextInput
                    value={item.amount}
                    onChange={(e: any) =>
                      setRequestedItems((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, amount: e.target?.value ?? "" } : x
                        )
                      )
                    }
                    placeholder="amount"
                    width={90}
                  />
                  <Button
                    onClick={() =>
                      setRequestedItems((prev) => prev.filter((_, i) => i !== idx))
                    }
                    disabled={requestedItems.length <= 1}
                  >
                    Remove
                  </Button>
                </Row>
              ))}

              <Row>
                <Button
                  onClick={() =>
                    setRequestedItems((prev) => {
                      if (prev.length >= 25) return prev;
                      return [...prev, { tokenContract: "", tokenId: "", amount: "1" }];
                    })
                  }
                >
                  + Requested Line
                </Button>
              </Row>

              <Row>
                <label style={{ minWidth: 110, fontSize: 11 }}>Expiry (optional)</label>
                <TextInput
                  value={expiresLocal}
                  onChange={(e: any) => setExpiresLocal(e.target?.value ?? "")}
                  placeholder="YYYY-MM-DDTHH:mm"
                  width={220}
                />
              </Row>

              <Row>
                <Button onClick={createTrade} disabled={creating}>
                  {creating ? "Creating..." : "Create Barter Trade"}
                </Button>
              </Row>
            </>
          )}
        </GroupBox>
      )}

      <Row>
        <TextInput
          value={search}
          onChange={(e: any) => setSearch(e.target?.value ?? "")}
          placeholder="Search barter posts"
          fullWidth
        />
      </Row>

      {isLoading ? (
        <Hourglass size={32} />
      ) : (
        <Grid>
          {(board?.items || []).map((trade) => {
            const canCancel = !!address && (address === trade.maker || isAdmin);
            const canAccept = !!address && address !== trade.maker;
            const form = acceptForms[trade.id];
            const isOpen = openAcceptTradeId === trade.id;

            const offeredOptions = trade.offeredItems.map((item) => ({
              value: offeredKey(item.tokenContract, item.tokenId),
              label: `${item.tokenName || `#${item.tokenId}`} x${item.amount}`,
            }));
            const requestedOptions = trade.requestedItems.map((item) => ({
              value: requestedKey(item.tokenContract, item.tokenId),
              label: `${item.tokenName || `${item.tokenId ?? "*"}`} x${item.amount}`,
            }));

            return (
              <TradeCard key={`barter-${trade.id}`} label={`Barter #${trade.id}`}>
                <p style={{ fontSize: 11, margin: "4px 0" }}>Maker: <UserLink username={trade.makerUsername} displayName={trade.makerDisplayName} fallback={shortAddress(trade.maker)} /></p>
                <p style={{ fontSize: 10, margin: "4px 0" }}>
                  Requested mode: {trade.requestedMode.toUpperCase()} | Offered mode: {trade.offeredMode.toUpperCase()}
                </p>
                <p style={{ fontSize: 10, margin: "4px 0" }}>
                  Expiry: {trade.expiresAt ? new Date(trade.expiresAt).toLocaleString() : "No expiry"}
                </p>

                <div style={{ marginTop: 6, fontSize: 11, fontWeight: "bold" }}>Requested</div>
                {trade.requestedItems.map((item, idx) => (
                  <div key={`rq-${trade.id}-${idx}`} style={{ fontSize: 10 }}>
                    {item.tokenName || item.tokenContract} | token {item.tokenId ?? "*"} | amount {item.amount}
                  </div>
                ))}

                <div style={{ marginTop: 6, fontSize: 11, fontWeight: "bold" }}>Offered</div>
                {trade.offeredItems.map((item, idx) => (
                  <div key={`of-${trade.id}-${idx}`} style={{ fontSize: 10 }}>
                    {item.tokenName || item.tokenContract} | token {item.tokenId} | amount {item.amount}
                  </div>
                ))}

                {canAccept && (
                  <Row style={{ marginTop: 8 }}>
                    <Button
                      onClick={() => {
                        ensureAcceptForm(trade);
                        setOpenAcceptTradeId((prev) => (prev === trade.id ? null : trade.id));
                      }}
                    >
                      {isOpen ? "Close Accept" : "Accept Trade"}
                    </Button>
                  </Row>
                )}

                {canCancel && (
                  <Row style={{ marginTop: 6 }}>
                    <Button
                      onClick={() => submitCancel(trade.id)}
                      disabled={busyTradeId === trade.id}
                    >
                      {busyTradeId === trade.id ? "Cancelling..." : "Cancel Trade"}
                    </Button>
                  </Row>
                )}

                {isOpen && form && (
                  <GroupBox label="Accept Setup" style={{ marginTop: 8 }}>
                    {trade.offeredMode === "choice" && (
                      <Row>
                        <label style={{ minWidth: 110, fontSize: 11 }}>Pick offered</label>
                        <Select
                          options={offeredOptions}
                          value={form.selectedOfferKey}
                          onChange={(e: any) =>
                            updateAcceptForm(trade.id, (current) => ({
                              ...current,
                              selectedOfferKey: e.value,
                            }))
                          }
                          width={240}
                        />
                      </Row>
                    )}

                    {trade.requestedMode === "choice" && (
                      <Row>
                        <label style={{ minWidth: 110, fontSize: 11 }}>Pick request</label>
                        <Select
                          options={requestedOptions}
                          value={form.selectedRequestKey}
                          onChange={(e: any) => {
                            updateAcceptForm(trade.id, (current) => ({
                              ...current,
                              selectedRequestKey: e.value,
                              requestedTransfers: templateTransfersFromTrade(trade, e.value),
                            }));
                          }}
                          width={240}
                        />
                      </Row>
                    )}

                    <div style={{ fontSize: 11, marginTop: 6 }}>
                      Requested transfers to send (token id required here):
                    </div>

                    {form.requestedTransfers.map((line, idx) => (
                      <Row key={`at-${trade.id}-${idx}`}>
                        <TextInput
                          value={line.tokenContract}
                          onChange={(e: any) =>
                            updateAcceptForm(trade.id, (current) => ({
                              ...current,
                              requestedTransfers: current.requestedTransfers.map((x, i) =>
                                i === idx
                                  ? { ...x, tokenContract: e.target?.value ?? "" }
                                  : x
                              ),
                            }))
                          }
                          placeholder="KT1..."
                          width={180}
                        />
                        <TextInput
                          value={line.tokenId}
                          onChange={(e: any) =>
                            updateAcceptForm(trade.id, (current) => ({
                              ...current,
                              requestedTransfers: current.requestedTransfers.map((x, i) =>
                                i === idx ? { ...x, tokenId: e.target?.value ?? "" } : x
                              ),
                            }))
                          }
                          placeholder="token id"
                          width={100}
                        />
                        <TextInput
                          value={line.amount}
                          onChange={(e: any) =>
                            updateAcceptForm(trade.id, (current) => ({
                              ...current,
                              requestedTransfers: current.requestedTransfers.map((x, i) =>
                                i === idx ? { ...x, amount: e.target?.value ?? "" } : x
                              ),
                            }))
                          }
                          placeholder="amount"
                          width={80}
                        />
                        <Button
                          onClick={() =>
                            updateAcceptForm(trade.id, (current) => ({
                              ...current,
                              requestedTransfers: current.requestedTransfers.filter(
                                (_, i) => i !== idx
                              ),
                            }))
                          }
                          disabled={form.requestedTransfers.length <= 1}
                        >
                          Remove
                        </Button>
                      </Row>
                    ))}

                    <Row>
                      <Button
                        onClick={() =>
                          updateAcceptForm(trade.id, (current) => ({
                            ...current,
                            requestedTransfers: [
                              ...current.requestedTransfers,
                              { tokenContract: "", tokenId: "", amount: "1" },
                            ].slice(0, 25),
                          }))
                        }
                      >
                        + Transfer Line
                      </Button>

                      <Button
                        onClick={() =>
                          updateAcceptForm(trade.id, (current) => ({
                            ...current,
                            requestedTransfers: templateTransfersFromTrade(
                              trade,
                              current.selectedRequestKey
                            ),
                          }))
                        }
                      >
                        Reset From Request
                      </Button>
                    </Row>

                    <Row>
                      <Button
                        onClick={() => submitAccept(trade)}
                        disabled={busyTradeId === trade.id}
                      >
                        {busyTradeId === trade.id ? "Accepting..." : "Execute Accept"}
                      </Button>
                    </Row>
                  </GroupBox>
                )}
              </TradeCard>
            );
          })}

          {(board?.items?.length || 0) === 0 && (
            <p style={{ fontSize: 12 }}>No active barter posts found.</p>
          )}
        </Grid>
      )}

      {errorMsg && (
        <p style={{ color: "red", fontSize: 12, marginTop: 8 }}>{errorMsg}</p>
      )}
      {successMsg && (
        <p style={{ color: "green", fontSize: 12, marginTop: 8 }}>{successMsg}</p>
      )}
    </div>
  );
}
