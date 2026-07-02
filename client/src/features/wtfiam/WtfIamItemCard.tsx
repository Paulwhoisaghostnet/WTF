import { Minus, Plus } from "lucide-react";
import { Button } from "react95";
import styled from "styled-components";
import type { WtfIamListing } from "./types";

const gammaWtfIamScope = `[data-wtfiam-presentation-host="gamma"]`;

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
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: ${(p) => p.$accent};
  }

  ${gammaWtfIamScope} & {
    background: ${(p) => (p.$comingSoon ? "rgba(242, 234, 217, 0.06)" : "#11110f")};
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    box-shadow: none;
    color: #f2ead9;
    min-height: 228px;
    opacity: ${(p) => (p.$comingSoon ? 0.64 : 1)};
  }

  ${gammaWtfIamScope} &::before {
    background: #00d2ff;
    height: 1px;
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
  font-size: var(--wtf-type-caption, 13px);

  ${gammaWtfIamScope} & {
    background: #070706;
    background-image: none;
    border-bottom: 1px solid rgba(242, 234, 217, 0.14);
    color: #f2ead9;
    min-height: 34px;
    padding: 7px 10px;
  }
`;

const Badge = styled.span<{ $live: boolean; $comingSoon?: boolean }>`
  border: 1px solid #101010;
  background: ${(p) => (p.$comingSoon ? "#ffcc44" : p.$live ? "#fff06a" : "#c8c8c8")};
  color: #101010;
  padding: 2px 5px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 900;

  ${gammaWtfIamScope} & {
    background: ${(p) =>
      p.$comingSoon
        ? "rgba(242, 234, 217, 0.08)"
        : p.$live
          ? "rgba(214, 255, 63, 0.1)"
          : "rgba(242, 234, 217, 0.08)"};
    background-image: none;
    border: 1px solid ${(p) => (p.$live && !p.$comingSoon ? "rgba(214, 255, 63, 0.54)" : "rgba(242, 234, 217, 0.18)")};
    border-radius: 4px;
    color: ${(p) => (p.$live && !p.$comingSoon ? "#d6ff3f" : "rgba(242, 234, 217, 0.72)")};
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
    padding: 3px 6px;
  }
`;

const SaleBadge = styled.span`
  border: 1px solid #101010;
  background: #ff9f45;
  color: #101010;
  padding: 2px 5px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 900;

  ${gammaWtfIamScope} & {
    background: rgba(0, 210, 255, 0.1);
    background-image: none;
    border: 1px solid rgba(0, 210, 255, 0.52);
    border-radius: 4px;
    color: #00d2ff;
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
    padding: 3px 6px;
  }
`;

const Body = styled.div`
  padding: 10px 10px 8px 16px;
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 10px;

  ${gammaWtfIamScope} & {
    padding: 12px;
  }
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

  ${gammaWtfIamScope} & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(0, 210, 255, 0.45);
    border-radius: 6px;
    box-shadow: none;
    color: #00d2ff;
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
  }
`;

const Detail = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: var(--wtf-type-caption, 13px);
`;

const Description = styled.p`
  margin: 0;
  line-height: 1.28;
  color: #202020;

  ${gammaWtfIamScope} & {
    color: rgba(242, 234, 217, 0.82);
    line-height: 1.35;
  }
`;

const Owned = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  color: #4a4a4a;

  ${gammaWtfIamScope} & {
    color: rgba(242, 234, 217, 0.62);
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
  }
`;

const PriceLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  font-size: var(--wtf-type-caption, 13px);
`;

const Price = styled.span`
  color: #000080;
  font-size: 17px;
  font-weight: 900;

  ${gammaWtfIamScope} & {
    color: #00d2ff;
    font-size: 17px;
  }
`;

const OldPrice = styled.span`
  color: #555555;
  text-decoration: line-through;

  ${gammaWtfIamScope} & {
    color: rgba(242, 234, 217, 0.42);
  }
`;

const Actions = styled.div`
  border-top: 1px solid #808080;
  padding: 6px 8px 7px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  ${gammaWtfIamScope} & {
    border-top: 1px solid rgba(242, 234, 217, 0.14);
    padding: 9px 10px;
  }
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

  ${gammaWtfIamScope} & {
    color: #f2ead9;
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
  }
`;

const IconButton = styled(Button)`
  min-width: 32px;
  width: 32px;
  height: 32px;
  padding: 0;

  svg {
    width: 15px;
    height: 15px;
  }

  ${gammaWtfIamScope} & {
    min-width: 34px;
    width: 34px;
    height: 34px;
  }
`;

const ComingSoonNotice = styled.span`
  font-size: var(--wtf-type-caption, 13px);
  font-style: italic;
  color: #666;
  padding: 2px 0;

  ${gammaWtfIamScope} & {
    color: rgba(242, 234, 217, 0.58);
  }
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
    <Card
      $accent={item.accent}
      $comingSoon={comingSoon}
      data-wtfiam-region="item-card"
      data-wtfiam-sku={item.sku}
      data-wtfiam-source={item.source}
    >
      <TitleBar $accent={item.accent} data-wtfiam-region="item-titlebar">
        <span>{item.name}</span>
        {comingSoon ? (
          <Badge $live={false} $comingSoon data-wtfiam-region="item-badge">COMING SOON</Badge>
        ) : item.sale ? (
          <SaleBadge data-wtfiam-region="item-badge">-{item.sale.discountPercent}%</SaleBadge>
        ) : (
          <Badge $live={live} data-wtfiam-region="item-badge">{live ? "LIVE" : "STAGED"}</Badge>
        )}
      </TitleBar>
      <Body data-wtfiam-region="item-body">
        <ProductMark $accent={item.accent} data-wtfiam-region="item-mark">{item.monogram}</ProductMark>
        <Detail data-wtfiam-region="item-detail">
          <Description data-wtfiam-region="item-description">{item.description ?? item.kind ?? item.sku}</Description>
          <Owned data-wtfiam-region="item-owned">Owned: {item.quantityOwned}</Owned>
          <Owned data-wtfiam-region="item-stock">Stock: {live ? item.stockQuantity : "—"}</Owned>
          <PriceLine data-wtfiam-region="item-price-line">
            <Price>{salePrice ?? item.priceWtfFormatted} WTF</Price>
            {salePrice && <OldPrice>{item.priceWtfFormatted}</OldPrice>}
            {item.priceExp > 0 && <span>{item.priceExp} EXP</span>}
          </PriceLine>
        </Detail>
      </Body>
      <Actions data-wtfiam-region="item-actions">
        {comingSoon ? (
          <ComingSoonNotice>Not yet available for purchase</ComingSoonNotice>
        ) : (
          <>
            <Stepper data-wtfiam-region="item-stepper">
              <IconButton
                size="sm"
                disabled={!live || quantity <= 0}
                title="Remove ticket"
                onClick={() => onChangeTicket(item.sku, -1)}
                data-wtfiam-action="remove-ticket"
              >
                <Minus />
              </IconButton>
              <Qty data-wtfiam-region="item-quantity">{quantity}</Qty>
              <IconButton
                size="sm"
                disabled={!canAdd}
                title="Add ticket"
                onClick={() => onChangeTicket(item.sku, 1)}
                data-wtfiam-action="add-ticket-stepper"
              >
                <Plus />
              </IconButton>
            </Stepper>
            <Button
              size="sm"
              disabled={!canAdd}
              onClick={() => onChangeTicket(item.sku, 1)}
              data-wtfiam-action="add-ticket"
            >
              {inStock ? "Add" : "Sold Out"}
            </Button>
          </>
        )}
      </Actions>
    </Card>
  );
}
