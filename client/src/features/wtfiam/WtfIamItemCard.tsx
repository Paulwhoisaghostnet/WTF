import { Minus, Plus } from "lucide-react";
import { Button } from "react95";
import styled from "styled-components";
import type { WtfIamListing } from "./types";

const Card = styled.article<{ $accent: string; $comingSoon?: boolean }>`
  min-height: 214px;
  border: 2px outset #ffffff;
  background: ${(p) => (p.$comingSoon ? "#c8c4b0" : "#d8d4c0")};
  display: grid;
  grid-template-rows: auto 1fr auto;
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.35);
  position: relative;
  overflow: hidden;
  opacity: ${(p) => (p.$comingSoon ? 0.72 : 1)};

  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    background: ${(p) => p.$accent};
  }
`;

const TitleBar = styled.div<{ $accent: string }>`
  min-height: 28px;
  padding: 5px 8px 5px 13px;
  background: linear-gradient(90deg, ${(p) => p.$accent}, #111);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 700;
  font-size: 12px;
`;

const Badge = styled.span<{ $live: boolean; $comingSoon?: boolean }>`
  border: 1px solid #101010;
  background: ${(p) => (p.$comingSoon ? "#ffcc44" : p.$live ? "#fff06a" : "#c8c8c8")};
  color: #101010;
  padding: 1px 4px;
  font-size: 9px;
  font-weight: 900;
`;

const SaleBadge = styled.span`
  border: 1px solid #101010;
  background: #ff9f45;
  color: #101010;
  padding: 1px 4px;
  font-size: 9px;
  font-weight: 900;
`;

const Body = styled.div`
  padding: 10px 10px 8px 16px;
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 10px;
`;

const ProductMark = styled.div<{ $accent: string }>`
  width: 68px;
  height: 68px;
  border: 2px solid #101010;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.72), transparent 34%),
    ${(p) => p.$accent};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  color: #101010;
  box-shadow: 3px 3px 0 #808080;
`;

const Detail = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 11px;
`;

const Description = styled.p`
  margin: 0;
  line-height: 1.28;
  color: #202020;
`;

const Owned = styled.div`
  font-size: 10px;
  color: #4a4a4a;
`;

const PriceLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  font-size: 11px;
`;

const Price = styled.span`
  color: #000080;
  font-size: 17px;
  font-weight: 900;
`;

const OldPrice = styled.span`
  color: #555555;
  text-decoration: line-through;
`;

const Actions = styled.div`
  border-top: 1px solid #808080;
  padding: 6px 8px 7px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const Stepper = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

const Qty = styled.span`
  min-width: 20px;
  text-align: center;
  font-weight: 700;
`;

const IconButton = styled(Button)`
  min-width: 26px;
  width: 26px;
  height: 24px;
  padding: 0;

  svg {
    width: 13px;
    height: 13px;
  }
`;

const ComingSoonNotice = styled.span`
  font-size: 10px;
  font-style: italic;
  color: #666;
  padding: 2px 0;
`;

type Props = {
  item: WtfIamListing;
  quantity: number;
  onChangeTicket: (sku: string, delta: number) => void;
};

export function WtfIamItemCard({ item, quantity, onChangeTicket }: Props) {
  const live = item.source === "live";
  const comingSoon = item.comingSoon === true;
  const inStock = live && item.stockQuantity > 0;
  const canAdd = inStock && quantity < item.stockQuantity;
  const salePrice = item.sale?.salePriceWtfFormatted;
  return (
    <Card $accent={item.accent} $comingSoon={comingSoon}>
      <TitleBar $accent={item.accent}>
        <span>{item.name}</span>
        {comingSoon ? (
          <Badge $live={false} $comingSoon>COMING SOON</Badge>
        ) : item.sale ? (
          <SaleBadge>-{item.sale.discountPercent}%</SaleBadge>
        ) : (
          <Badge $live={live}>{live ? "LIVE" : "STAGED"}</Badge>
        )}
      </TitleBar>
      <Body>
        <ProductMark $accent={item.accent}>{item.monogram}</ProductMark>
        <Detail>
          <Description>{item.description ?? item.kind ?? item.sku}</Description>
          <Owned>Owned: {item.quantityOwned}</Owned>
          <Owned>Stock: {live ? item.stockQuantity : "—"}</Owned>
          <PriceLine>
            <Price>{salePrice ?? item.priceWtfFormatted} WTF</Price>
            {salePrice && <OldPrice>{item.priceWtfFormatted}</OldPrice>}
            {item.priceExp > 0 && <span>{item.priceExp} EXP</span>}
          </PriceLine>
        </Detail>
      </Body>
      <Actions>
        {comingSoon ? (
          <ComingSoonNotice>Not yet available for purchase</ComingSoonNotice>
        ) : (
          <>
            <Stepper>
              <IconButton
                size="sm"
                disabled={!live || quantity <= 0}
                title="Remove ticket"
                onClick={() => onChangeTicket(item.sku, -1)}
              >
                <Minus />
              </IconButton>
              <Qty>{quantity}</Qty>
              <IconButton
                size="sm"
                disabled={!canAdd}
                title="Add ticket"
                onClick={() => onChangeTicket(item.sku, 1)}
              >
                <Plus />
              </IconButton>
            </Stepper>
            <Button
              size="sm"
              disabled={!canAdd}
              onClick={() => onChangeTicket(item.sku, 1)}
            >
              {inStock ? "Add" : "Sold Out"}
            </Button>
          </>
        )}
      </Actions>
    </Card>
  );
}
