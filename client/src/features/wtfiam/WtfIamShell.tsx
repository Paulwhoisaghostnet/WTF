import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass } from "react95";
import styled from "styled-components";
import { api } from "../../lib/api";
import { usePresentationShell } from "../../lib/presentation-shell";
import {
  approveInAppMarketForWtf,
  ensureWalletProviderForSend,
  purchaseInAppMarketListing,
} from "../../lib/tezos";
import { useWallet } from "../../lib/wallet-context";
import { isWtfIamCategoryKey } from "./catalog";
import { WtfIamCartPanel } from "./WtfIamCartPanel";
import { WtfIamItemCard } from "./WtfIamItemCard";
import { WtfIamTabs } from "./WtfIamTabs";
import { useWtfIamMarket } from "./useWtfIamMarket";
import type { InAppMarketIntentResponse, InAppMarketTipTransfer, WtfIamCategoryKey } from "./types";

const gammaWtfIamScope = `[data-wtfiam-presentation-host="gamma"]`;

const Shell = styled.div`
  min-height: 100%;
  background:
    linear-gradient(90deg, rgba(24, 168, 162, 0.18), transparent 26%),
    linear-gradient(180deg, #ded8bd 0%, #bfb8a0 100%);
  padding: 10px;
  color: #101010;

  &[data-wtfiam-presentation-host="gamma"] {
    background: #070706;
    background-image: none;
    color: #f2ead9;
    display: grid;
    gap: 14px;
    padding: 0;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
  }

  &[data-wtfiam-presentation-host="gamma"] *,
  &[data-wtfiam-presentation-host="gamma"] *::before,
  &[data-wtfiam-presentation-host="gamma"] *::after {
    text-shadow: none;
    box-shadow: none;
  }

  &[data-wtfiam-presentation-host="gamma"] [data-wtfiam-region],
  &[data-wtfiam-presentation-host="gamma"] fieldset,
  &[data-wtfiam-presentation-host="gamma"] button {
    border-radius: 6px;
  }

  &[data-wtfiam-presentation-host="gamma"] fieldset {
    background: #11110f;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.18);
    color: #f2ead9;
    padding: 14px;
  }

  &[data-wtfiam-presentation-host="gamma"] legend {
    background: #070706;
    color: #00d2ff;
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
    padding: 0 6px;
    text-transform: uppercase;
  }

  &[data-wtfiam-presentation-host="gamma"] button {
    background: #11110f;
    background-image: none;
    border: 1px solid rgba(0, 210, 255, 0.42);
    color: #f2ead9;
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
    min-height: 34px;
  }

  &[data-wtfiam-presentation-host="gamma"] button:disabled {
    border-color: rgba(242, 234, 217, 0.16);
    color: rgba(242, 234, 217, 0.48);
  }
`;

const Header = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: end;
  margin-bottom: 10px;

  ${gammaWtfIamScope} & {
    align-items: stretch;
    margin-bottom: 0;
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const TitleBlock = styled.div`
  border: 2px solid #101010;
  border-top-color: #ffffff;
  border-left-color: #ffffff;
  background:
    linear-gradient(90deg, #101010 0 8px, transparent 8px),
    #f5edc8;
  padding: 8px 12px 8px 18px;
  box-shadow: 3px 3px 0 #7a6a4d;

  ${gammaWtfIamScope} & {
    background: #11110f;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-left-color: #00d2ff;
    color: #f2ead9;
    padding: 14px 16px;
    box-shadow: none;
    border-radius: 6px;
  }
`;

const Title = styled.h2`
  margin: 0;
  font-size: 22px;
  letter-spacing: 0;

  ${gammaWtfIamScope} & {
    color: #f2ead9;
    font-size: 24px;
    font-weight: 760;
    line-height: 1.1;
  }
`;

const Subtitle = styled.div`
  margin-top: 3px;
  font-size: var(--wtf-type-caption, 13px);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  span {
    overflow-wrap: anywhere;
  }

  ${gammaWtfIamScope} & {
    color: rgba(242, 234, 217, 0.72);
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
    line-height: 1.45;
    text-transform: uppercase;
  }
`;

const Meter = styled.div`
  min-width: 210px;
  border: 2px inset #808080;
  background: #f3f0d7;
  padding: 7px 9px;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;

  ${gammaWtfIamScope} & {
    background: #11110f;
    background-image: none;
    border: 1px solid rgba(0, 210, 255, 0.32);
    border-radius: 6px;
    color: #f2ead9;
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    min-width: 220px;
    padding: 13px 14px;
  }
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 270px;
  gap: 10px;
  margin-top: 10px;

  ${gammaWtfIamScope} & {
    gap: 14px;
    margin-top: 0;
  }

  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }
`;

const ListingsBox = styled(GroupBox)`
  min-width: 0;

  ${gammaWtfIamScope} & {
    min-width: 0;
  }
`;

const ListingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
  gap: 10px;

  ${gammaWtfIamScope} & {
    gap: 12px;
  }
`;

const Empty = styled.div`
  min-height: 180px;
  border: 2px inset #808080;
  background: #e7e2c9;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  font-size: var(--wtf-type-caption, 13px);

  ${gammaWtfIamScope} & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    color: rgba(242, 234, 217, 0.68);
  }
`;

const Counts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 0;
  font-size: var(--wtf-type-caption, 13px);
`;

const CountPill = styled.span<{ $tone?: "live" | "staged" }>`
  border: 1px solid #101010;
  background: ${(p) => (p.$tone === "live" ? "#fff06a" : "#dfdfdf")};
  padding: 2px 5px;
  font-weight: 700;

  ${gammaWtfIamScope} & {
    background: ${(p) => (p.$tone === "live" ? "rgba(214, 255, 63, 0.1)" : "rgba(242, 234, 217, 0.08)")};
    background-image: none;
    border: 1px solid ${(p) => (p.$tone === "live" ? "rgba(214, 255, 63, 0.52)" : "rgba(242, 234, 217, 0.18)")};
    border-radius: 4px;
    color: ${(p) => (p.$tone === "live" ? "#d6ff3f" : "rgba(242, 234, 217, 0.72)")};
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
    font-weight: 700;
    padding: 3px 7px;
  }
`;

const TipLedgerBox = styled.div`
  margin-top: 12px;
  border: 2px inset #808080;
  background: #eee7ce;
  padding: 8px;
  display: grid;
  gap: 8px;
  font-size: var(--wtf-type-caption, 13px);

  ${gammaWtfIamScope} & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    color: #f2ead9;
    padding: 12px;
  }
`;

const TipLedgerHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 900;

  ${gammaWtfIamScope} & {
    color: #00d2ff;
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
    text-transform: uppercase;
  }
`;

const TipLedgerRows = styled.div`
  display: grid;
  gap: 6px;
`;

const TipLedgerRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  border: 1px solid #91866a;
  background: #f8f2d9;
  padding: 6px;

  ${gammaWtfIamScope} & {
    background: #11110f;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: rgba(242, 234, 217, 0.78);
    padding: 8px;
  }

  strong,
  span {
    overflow-wrap: anywhere;
  }

  ${gammaWtfIamScope} & strong {
    color: #f2ead9;
  }

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

export function WtfIamShell() {
  const presentation = usePresentationShell();
  const [activeCategory, setActiveCategory] =
    useState<WtfIamCategoryKey>(initialCategoryFromUrl);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const qc = useQueryClient();
  const wallet = useWallet();
  const market = useWtfIamMarket(activeCategory);
  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (market.cartEntries.length === 0) {
        throw new Error("Add an item before checkout.");
      }
      setCheckoutError("");
      setCheckoutMessage("Preparing checkout...");

      let checkoutWalletAddress = wallet.address;
      if (market.currency === "wtf") {
        if (checkoutWalletAddress) {
          setCheckoutMessage("Checking Tezos wallet session...");
          const prepared = await ensureWalletProviderForSend(checkoutWalletAddress);
          checkoutWalletAddress = prepared.address;
        } else {
          setCheckoutMessage("Connecting Tezos wallet...");
          const connected = await wallet.connect();
          checkoutWalletAddress = connected.address;
        }
      }

      const intentResponse = await api.post<InAppMarketIntentResponse>(
        "/api/in-app-market/intents",
        {
          currency: market.currency,
          walletAddress: checkoutWalletAddress,
          items: market.cartEntries.map((entry) => ({
            sku: entry.item.sku,
            quantity: entry.quantity,
          })),
        }
      );

      if (market.currency === "exp") {
        setCheckoutMessage("Redeeming EXP cart...");
        await api.post("/api/in-app-market/checkout-exp", {
          purchaseRef: intentResponse.intent.purchaseRef,
        });
        return { opHash: null as string | null };
      }

      if (market.currency === "reward_wtf") {
        setCheckoutMessage("Redeeming earned WTF cart...");
        await api.post("/api/in-app-market/checkout-reward-wtf", {
          purchaseRef: intentResponse.intent.purchaseRef,
        });
        return { opHash: null as string | null };
      }

      const address = checkoutWalletAddress;
      if (!address) throw new Error("Connect a Tezos wallet before WTF checkout.");
      setCheckoutMessage("Approving WTF for in-app market...");
      await approveInAppMarketForWtf(address);
      setCheckoutMessage("Sending WTF purchase...");
      const opHash = await purchaseInAppMarketListing({
        walletAddress: address,
        listingId: intentResponse.intent.routerListingId,
        amountWtfUnits: intentResponse.intent.subtotalWtfUnits,
        purchaseRef: intentResponse.intent.purchaseRef,
        contractVersion: intentResponse.intent.contractVersion,
        cartHash: intentResponse.intent.cartHash,
        expectedTreasuryAddress: intentResponse.intent.expectedTreasuryAddress,
        expectedWtfTokenContract: intentResponse.intent.expectedWtfTokenContract,
        expectedWtfTokenId: intentResponse.intent.expectedWtfTokenId,
      });
      setCheckoutMessage("Verifying purchase...");
      await api.post("/api/in-app-market/verify", { opHash });
      return { opHash };
    },
    onSuccess: (result) => {
      market.clearCart();
      setCheckoutError("");
      setCheckoutMessage(
        result.opHash ? `Purchase confirmed: ${result.opHash.slice(0, 10)}...` : "Purchase confirmed."
      );
      qc.invalidateQueries({ queryKey: ["wtfiam"] });
      qc.invalidateQueries({ queryKey: ["rewards-account"] });
      qc.invalidateQueries({ queryKey: ["in-app-market"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Checkout failed.";
      setCheckoutMessage("");
      setCheckoutError(message);
    },
  });
  const redeemTipMutation = useMutation({
    mutationFn: (transferId: number) =>
      api.post<{ ok: true; amountWtf: number }>("/api/in-app-market/tips/redeem", {
        transferId,
      }),
    onSuccess: (result) => {
      setCheckoutError("");
      setCheckoutMessage(`Tip redeemed for ${result.amountWtf} earned WTF.`);
      qc.invalidateQueries({ queryKey: ["wtfiam", "wtf_live"] });
      qc.invalidateQueries({ queryKey: ["rewards-account"] });
      qc.invalidateQueries({ queryKey: ["in-app-market"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Tip redemption failed.";
      setCheckoutMessage("");
      setCheckoutError(message);
    },
  });

  return (
    <Shell
      data-wtfiam-surface="marketplace"
      data-wtfiam-presentation-host={presentation.host}
      data-wtfiam-region="shell"
    >
      <Header data-wtfiam-region="header">
        <TitleBlock data-wtfiam-region="title-block">
          <Title data-wtfiam-region="title">WTF In-App Marketplace</Title>
          <Subtitle data-wtfiam-region="subtitle">
            <span>{market.category.label}</span>
            <span>{market.config?.network ?? "mainnet"}</span>
            <span>{market.config?.contractAddress ?? "contract pending"}</span>
          </Subtitle>
        </TitleBlock>
        <Meter data-wtfiam-region="meter">
          <div>EXP: {market.expBalance}</div>
          <div>Earned WTF: {market.rewardWtfBalance}</div>
          <div>Live: {market.liveCount}</div>
          <div>Staged: {market.stagedCount}</div>
        </Meter>
      </Header>

      <WtfIamTabs activeKey={activeCategory} onChange={setActiveCategory} />

      <Layout data-wtfiam-region="layout">
        <ListingsBox label={market.category.shortLabel} data-wtfiam-region="listings-box">
          <Counts data-wtfiam-region="counts">
            <CountPill $tone="live" data-wtfiam-region="count-pill">LIVE {market.liveCount}</CountPill>
            <CountPill data-wtfiam-region="count-pill">STAGED {market.stagedCount}</CountPill>
          </Counts>
          {market.isLoading ? (
            <Empty data-wtfiam-region="empty-state">
              <Hourglass size={28} />
            </Empty>
          ) : market.isError ? (
            <Empty data-wtfiam-region="empty-state">Market unavailable</Empty>
          ) : market.listings.length === 0 ? (
            <Empty data-wtfiam-region="empty-state">No listings</Empty>
          ) : (
            <>
              <ListingGrid data-wtfiam-region="listing-grid">
                {market.listings.map((item) => (
                  <WtfIamItemCard
                    key={item.sku}
                    item={item}
                    quantity={market.cart[item.sku] ?? 0}
                    onChangeTicket={market.changeTicket}
                  />
                ))}
              </ListingGrid>
              {activeCategory === "wtf_live" ? (
                <TipLedger
                  transfers={market.tipLedger.received}
                  busyTransferId={
                    redeemTipMutation.isPending
                      ? Number(redeemTipMutation.variables ?? 0)
                      : null
                  }
                  onRedeem={(transferId) => redeemTipMutation.mutate(transferId)}
                />
              ) : null}
            </>
          )}
        </ListingsBox>

        <WtfIamCartPanel
          cartEntries={market.cartEntries}
          currency={market.currency}
          expBalance={market.expBalance}
          rewardWtfBalance={market.rewardWtfBalance}
          subtotalExp={market.cartSubtotalExp}
          subtotalWtf={market.cartSubtotalWtfFormatted}
          ticketCount={market.cartTicketCount}
          onCurrencyChange={market.setCurrency}
          onClear={market.clearCart}
          onCheckout={() => checkoutMutation.mutate()}
          checkoutBusy={checkoutMutation.isPending}
          checkoutMessage={checkoutMessage}
          checkoutError={checkoutError}
        />
      </Layout>
    </Shell>
  );
}

function TipLedger({
  transfers,
  busyTransferId,
  onRedeem,
}: {
  transfers: InAppMarketTipTransfer[];
  busyTransferId: number | null;
  onRedeem: (transferId: number) => void;
}) {
  const received = transfers.slice(0, 12);
  return (
    <TipLedgerBox data-wtfiam-tip-ledger data-wtfiam-region="tip-ledger">
      <TipLedgerHeader data-wtfiam-region="tip-ledger-header">
        <span>Received WTF LIVE tips</span>
        <span>{received.length}</span>
      </TipLedgerHeader>
      {!received.length ? (
        <span>No received tips yet.</span>
      ) : (
        <TipLedgerRows>
          {received.map((transfer) => {
            const alreadyRedeemed = Boolean(transfer.redeemedAt || transfer.rewardLedgerId);
            const amountWtf = Math.max(0, Number(transfer.redeemWtf || 0) * transfer.quantity);
            return (
              <TipLedgerRow
                key={transfer.id}
                data-wtfiam-tip-transfer={transfer.id}
                data-wtfiam-tip-status={alreadyRedeemed ? "redeemed" : "available"}
                data-wtfiam-region="tip-ledger-row"
              >
                <div>
                  <strong>{transfer.quantity} x {transfer.name}</strong>
                  <span>
                    {" "}from user {transfer.senderUserId ?? "unknown"}
                    {transfer.sourceRoomId ? ` in ${transfer.sourceRoomId}` : ""}
                    {amountWtf > 0 ? ` · ${amountWtf} WTF` : ""}
                  </span>
                </div>
                <Button
                  size="sm"
                  disabled={alreadyRedeemed || busyTransferId === transfer.id}
                  onClick={() => onRedeem(transfer.id)}
                  data-wtfiam-tip-redeem={transfer.id}
                >
                  {alreadyRedeemed ? "Redeemed" : busyTransferId === transfer.id ? "Redeeming" : "Redeem Tip"}
                </Button>
              </TipLedgerRow>
            );
          })}
        </TipLedgerRows>
      )}
    </TipLedgerBox>
  );
}

function initialCategoryFromUrl(): WtfIamCategoryKey {
  if (typeof window === "undefined") return "desktop_pet";
  const category = new URLSearchParams(window.location.search).get("category");
  return isWtfIamCategoryKey(category) ? category : "desktop_pet";
}
