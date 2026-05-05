import { useState } from "react";
import { GroupBox, Hourglass } from "react95";
import styled from "styled-components";
import { WtfIamCartPanel } from "./WtfIamCartPanel";
import { WtfIamItemCard } from "./WtfIamItemCard";
import { WtfIamTabs } from "./WtfIamTabs";
import { useWtfIamMarket } from "./useWtfIamMarket";
import type { WtfIamCategoryKey } from "./types";

const Shell = styled.div`
  min-height: 100%;
  background:
    linear-gradient(90deg, rgba(24, 168, 162, 0.18), transparent 26%),
    linear-gradient(180deg, #ded8bd 0%, #bfb8a0 100%);
  padding: 10px;
  color: #101010;
`;

const Header = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: end;
  margin-bottom: 10px;

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
`;

const Title = styled.h2`
  margin: 0;
  font-size: 22px;
  letter-spacing: 0;
`;

const Subtitle = styled.div`
  margin-top: 3px;
  font-size: 11px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  span {
    overflow-wrap: anywhere;
  }
`;

const Meter = styled.div`
  min-width: 210px;
  border: 2px inset #808080;
  background: #f3f0d7;
  padding: 7px 9px;
  font-size: 11px;
  line-height: 1.4;
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 270px;
  gap: 10px;
  margin-top: 10px;

  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }
`;

const ListingsBox = styled(GroupBox)`
  min-width: 0;
`;

const ListingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
  gap: 10px;
`;

const Empty = styled.div`
  min-height: 180px;
  border: 2px inset #808080;
  background: #e7e2c9;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  font-size: 12px;
`;

const Counts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 0;
  font-size: 10px;
`;

const CountPill = styled.span<{ $tone?: "live" | "staged" }>`
  border: 1px solid #101010;
  background: ${(p) => (p.$tone === "live" ? "#fff06a" : "#dfdfdf")};
  padding: 2px 5px;
  font-weight: 700;
`;

export function WtfIamShell() {
  const [activeCategory, setActiveCategory] = useState<WtfIamCategoryKey>("desktop_pet");
  const market = useWtfIamMarket(activeCategory);

  return (
    <Shell>
      <Header>
        <TitleBlock>
          <Title>WTF In-App Marketplace</Title>
          <Subtitle>
            <span>{market.category.label}</span>
            <span>{market.config?.network ?? "mainnet"}</span>
            <span>{market.config?.contractAddress ?? "contract pending"}</span>
          </Subtitle>
        </TitleBlock>
        <Meter>
          <div>EXP: {market.expBalance}</div>
          <div>Live: {market.liveCount}</div>
          <div>Staged: {market.stagedCount}</div>
        </Meter>
      </Header>

      <WtfIamTabs activeKey={activeCategory} onChange={setActiveCategory} />

      <Layout>
        <ListingsBox label={market.category.shortLabel}>
          <Counts>
            <CountPill $tone="live">LIVE {market.liveCount}</CountPill>
            <CountPill>STAGED {market.stagedCount}</CountPill>
          </Counts>
          {market.isLoading ? (
            <Empty>
              <Hourglass size={28} />
            </Empty>
          ) : market.isError ? (
            <Empty>Market unavailable</Empty>
          ) : market.listings.length === 0 ? (
            <Empty>No listings</Empty>
          ) : (
            <ListingGrid>
              {market.listings.map((item) => (
                <WtfIamItemCard
                  key={item.sku}
                  item={item}
                  quantity={market.cart[item.sku] ?? 0}
                  onChangeTicket={market.changeTicket}
                />
              ))}
            </ListingGrid>
          )}
        </ListingsBox>

        <WtfIamCartPanel
          cartEntries={market.cartEntries}
          currency={market.currency}
          expBalance={market.expBalance}
          subtotalExp={market.cartSubtotalExp}
          subtotalWtf={market.cartSubtotalWtfFormatted}
          ticketCount={market.cartTicketCount}
          onCurrencyChange={market.setCurrency}
          onClear={market.clearCart}
        />
      </Layout>
    </Shell>
  );
}
