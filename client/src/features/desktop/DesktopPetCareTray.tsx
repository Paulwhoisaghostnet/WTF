import { type Dispatch, type RefObject, type SetStateAction } from "react";
import styled from "styled-components";
import { Button, Panel } from "react95";
import {
  Apple,
  Circle,
  Coins,
  Droplets,
  Heart,
  Minus,
  Moon,
  Package,
  Palette,
  Pill,
  Plus,
  Shovel,
  ShoppingCart,
  Ticket,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { type HamsterState } from "@shared/desktop";
import { MOBILE } from "../../global-styles";
import {
  type InAppMarketItem,
  type MarketCurrency,
  type PetTool,
} from "./DesktopPetTypes";

const CareTray = styled(Panel)`
  position: absolute;
  right: 12px;
  bottom: 8px;
  z-index: 2;
  width: 316px;
  padding: 8px;
  color: var(--wtf-text-color);
  background: var(--wtf-window-color);
  pointer-events: auto;

  ${MOBILE} {
    left: 8px;
    right: 8px;
    width: auto;
  }
`;

const CareTrayHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-weight: bold;

  button {
    min-width: 24px;
    height: 24px;
    padding: 0;
  }
`;

const CareToolGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;

  button {
    min-width: 0;
    min-height: 34px;
    font-size: 10px;
    line-height: 1;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 2px;
  }

  svg {
    width: 15px;
    height: 15px;
  }
`;

const MiniStatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin: 7px 0;
  font-size: 10px;

  span {
    padding: 2px 3px;
    border: 1px solid #7f7f7f;
    background: rgba(255, 255, 255, 0.42);
    text-align: center;
  }
`;

const CareMarketGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  margin: 6px 0;

  button {
    min-width: 0;
    min-height: 42px;
    font-size: 10px;
    line-height: 1.05;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 3px 2px;
    white-space: normal;
  }

  svg {
    width: 15px;
    height: 15px;
  }
`;

const MarketPanel = styled.div`
  margin: 6px 0;
  padding: 6px;
  border: 1px solid #7f7f7f;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.68), rgba(232, 232, 232, 0.38)),
    var(--wtf-window-color);
`;

const MarketHeader = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
  font-size: 10px;
  font-weight: bold;
`;

const MarketTitle = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;

  svg {
    width: 13px;
    height: 13px;
  }
`;

const CurrencyTabs = styled.div`
  display: inline-grid;
  grid-template-columns: repeat(2, 42px);
  gap: 2px;

  button {
    min-width: 0;
    height: 24px;
    padding: 0;
    font-size: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }

  svg {
    width: 12px;
    height: 12px;
  }
`;

const MarketTicketButton = styled(Button)`
  strong,
  span {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  strong {
    font-size: 10px;
  }

  span {
    font-size: 9px;
    opacity: 0.86;
  }
`;

const CartPanel = styled.div`
  margin-top: 5px;
  border-top: 1px solid #8f8f8f;
  padding-top: 5px;
  font-size: 10px;
`;

const CartLine = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 3px;
  min-height: 24px;
  border-bottom: 1px dotted rgba(0, 0, 0, 0.28);

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    width: 22px;
    min-width: 22px;
    height: 20px;
    padding: 0;
  }

  svg {
    width: 12px;
    height: 12px;
  }
`;

const CartQty = styled.b`
  min-width: 24px;
  text-align: center;
`;

const MarketTotals = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 8px;
  margin-top: 5px;
  font-size: 10px;

  strong {
    text-align: right;
  }
`;

const CheckoutButton = styled(Button)`
  width: 100%;
  min-height: 28px;
  margin-top: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 11px;

  svg {
    width: 14px;
    height: 14px;
  }
`;

const CareStatusLine = styled.div<{ $error?: boolean }>`
  min-height: 14px;
  margin-top: 5px;
  font-size: 10px;
  color: ${(p) => (p.$error ? "#a00000" : "#000080")};
  overflow-wrap: anywhere;
`;

type CartEntry = {
  item: InAppMarketItem;
  quantity: number;
};

export function DesktopPetCareTray({
  trayRef,
  pet,
  activeTool,
  setActiveTool,
  onClose,
  onRevive,
  foodQty,
  medicineQty,
  shoeboxQty,
  activeLocalBallCount,
  localBallCapacity,
  marketCurrency,
  setMarketCurrency,
  expBalance,
  marketListings,
  ballItem,
  ballQty,
  cartTickets,
  cartEntries,
  cartTicketCount,
  cartSubtotalWtfFormatted,
  cartSubtotalExp,
  checkoutBusy,
  marketConfigured,
  marketStatus,
  estimatedFeeTez,
  maxToyBalls,
  toolHint,
  addCartTicket,
  changeCartTicket,
  clearCart,
  checkoutMarketCart,
}: {
  trayRef: RefObject<HTMLDivElement | null>;
  pet: HamsterState;
  activeTool: PetTool;
  setActiveTool: Dispatch<SetStateAction<PetTool>>;
  onClose: () => void;
  onRevive: () => void;
  foodQty: number;
  medicineQty: number;
  shoeboxQty: number;
  activeLocalBallCount: number;
  localBallCapacity: number;
  marketCurrency: MarketCurrency;
  setMarketCurrency: Dispatch<SetStateAction<MarketCurrency>>;
  expBalance: number;
  marketListings: InAppMarketItem[];
  ballItem: InAppMarketItem | null;
  ballQty: number;
  cartTickets: Record<string, number>;
  cartEntries: CartEntry[];
  cartTicketCount: number;
  cartSubtotalWtfFormatted: string;
  cartSubtotalExp: number;
  checkoutBusy: boolean;
  marketConfigured: boolean;
  marketStatus: { text: string; error?: boolean };
  estimatedFeeTez: string;
  maxToyBalls: number;
  toolHint: string;
  addCartTicket: (item: InAppMarketItem | null) => void;
  changeCartTicket: (sku: string, delta: number) => void;
  clearCart: () => void;
  checkoutMarketCart: () => void;
}) {
  return (
    <CareTray variant="outside" ref={trayRef as RefObject<HTMLDivElement>}>
      <CareTrayHeader>
        <span>{pet.name} care</span>
        <Button size="sm" onClick={onClose} title="Close hamster care">
          <X />
        </Button>
      </CareTrayHeader>
      <MiniStatGrid>
        <span>Food {pet.hunger}</span>
        <span>Water {pet.thirst}</span>
        <span>Clean {pet.hygiene}</span>
        <span>Rest {pet.energy}</span>
        <span>{pet.sick ? "Sick" : `Risk ${pet.sicknessRisk}`}</span>
        <span>Care {pet.carePoints}</span>
        <span>Bond L{pet.bondLevel}</span>
        <span>Happy {pet.happinessIndexScore}</span>
        <span>Trauma {pet.trauma}</span>
      </MiniStatGrid>
      <MarketPanel>
        <MarketHeader>
          <MarketTitle>
            <ShoppingCart /> Market
          </MarketTitle>
          <CurrencyTabs>
            <Button
              size="sm"
              active={marketCurrency === "wtf" ? true : undefined}
              onClick={() => setMarketCurrency("wtf")}
              title="Pay with WTF"
            >
              <Ticket /> WTF
            </Button>
            <Button
              size="sm"
              active={marketCurrency === "exp" ? true : undefined}
              onClick={() => setMarketCurrency("exp")}
              title={`Pay with EXP (${expBalance} available)`}
            >
              <Coins /> EXP
            </Button>
          </CurrencyTabs>
        </MarketHeader>
        <CareMarketGrid>
          {marketListings.map((item) => {
            const price =
              marketCurrency === "wtf"
                ? `${item.priceWtfFormatted} WTF`
                : `${item.priceExp} EXP`;
            const ballLimitReached =
              item.sku === ballItem?.sku &&
              ballQty + (cartTickets[item.sku] ?? 0) >= maxToyBalls;
            const disabled =
              checkoutBusy ||
              ballLimitReached ||
              (marketCurrency === "wtf" && !marketConfigured) ||
              (marketCurrency === "exp" && item.priceExp <= 0);
            return (
              <MarketTicketButton
                key={item.sku}
                size="sm"
                disabled={disabled}
                onClick={() => addCartTicket(item)}
                title={`${item.name} (${price})`}
              >
                {item.sku === "pet-food" ? (
                  <Apple />
                ) : item.sku === "pet-medicine" ? (
                  <Pill />
                ) : item.sku === ballItem?.sku ? (
                  <Circle />
                ) : (
                  <Package />
                )}
                <strong>{item.name.replace(/^Pet /, "")}</strong>
                <span>{ballLimitReached ? `Limit ${maxToyBalls}` : price}</span>
              </MarketTicketButton>
            );
          })}
        </CareMarketGrid>
        <CartPanel>
          {cartEntries.length === 0 ? (
            <CartLine>
              <span>No tickets</span>
              <CartQty>0</CartQty>
              <Button size="sm" disabled title="Remove">
                <Minus />
              </Button>
              <Button size="sm" disabled title="Add">
                <Plus />
              </Button>
            </CartLine>
          ) : (
            cartEntries.map(({ item, quantity }) => (
              <CartLine key={item.sku}>
                <span>{item.name}</span>
                <CartQty>{quantity}</CartQty>
                <Button
                  size="sm"
                  onClick={() => changeCartTicket(item.sku, -1)}
                  title={`Remove ${item.name}`}
                >
                  <Minus />
                </Button>
                <Button
                  size="sm"
                  onClick={() => changeCartTicket(item.sku, 1)}
                  title={`Add ${item.name}`}
                >
                  <Plus />
                </Button>
              </CartLine>
            ))
          )}
          {cartEntries.length > 0 && (
            <CartLine>
              <span>Clear cart</span>
              <CartQty>{cartTicketCount}</CartQty>
              <Button size="sm" onClick={clearCart} title="Clear cart">
                <Trash2 />
              </Button>
              <Button size="sm" disabled title="Tickets">
                <Ticket />
              </Button>
            </CartLine>
          )}
          <MarketTotals>
            <span>Subtotal</span>
            <strong>
              {marketCurrency === "wtf"
                ? `${cartSubtotalWtfFormatted} WTF`
                : `${cartSubtotalExp} EXP`}
            </strong>
            <span>Est. gas/storage</span>
            <strong>{marketCurrency === "wtf" ? `~${estimatedFeeTez} tez` : "0 tez"}</strong>
            <span>Router total</span>
            <strong>
              {marketCurrency === "wtf"
                ? `${cartSubtotalWtfFormatted} WTF`
                : `${cartSubtotalExp} EXP`}
            </strong>
          </MarketTotals>
          <CheckoutButton
            size="sm"
            disabled={
              checkoutBusy ||
              cartEntries.length === 0 ||
              (marketCurrency === "wtf" && !marketConfigured) ||
              (marketCurrency === "exp" && cartSubtotalExp > expBalance)
            }
            onClick={checkoutMarketCart}
          >
            <Zap />
            {marketCurrency === "wtf" ? "Send WTF" : `Redeem EXP (${expBalance})`}
          </CheckoutButton>
        </CartPanel>
      </MarketPanel>
      <CareToolGrid>
        <Button
          size="sm"
          active={activeTool === "food" ? true : undefined}
          disabled={foodQty <= 0}
          onClick={() => setActiveTool((tool) => (tool === "food" ? null : "food"))}
        >
          <Apple /> Food {foodQty}
        </Button>
        <Button
          size="sm"
          active={activeTool === "water" ? true : undefined}
          onClick={() => setActiveTool((tool) => (tool === "water" ? null : "water"))}
        >
          <Droplets /> Water
        </Button>
        <Button
          size="sm"
          active={activeTool === "scoop" ? true : undefined}
          onClick={() => setActiveTool((tool) => (tool === "scoop" ? null : "scoop"))}
        >
          <Shovel /> Scoop
        </Button>
        <Button
          size="sm"
          active={activeTool === "pet" ? true : undefined}
          onClick={() => {
            if (!pet.alive) {
              onRevive();
              return;
            }
            setActiveTool((tool) => (tool === "pet" ? null : "pet"));
          }}
        >
          <Heart /> {pet.alive ? "Pet" : "Revive"}
        </Button>
        <Button
          size="sm"
          active={activeTool === "medicine" ? true : undefined}
          disabled={!pet.alive || medicineQty <= 0}
          onClick={() => setActiveTool((tool) => (tool === "medicine" ? null : "medicine"))}
        >
          <Pill /> Med {medicineQty}
        </Button>
        <Button
          size="sm"
          active={activeTool === "pillow" ? true : undefined}
          disabled={!pet.alive || shoeboxQty <= 0}
          onClick={() => setActiveTool((tool) => (tool === "pillow" ? null : "pillow"))}
        >
          <Moon /> Box {shoeboxQty}
        </Button>
        <Button
          size="sm"
          active={activeTool === "ball" ? true : undefined}
          disabled={!pet.alive || activeLocalBallCount >= localBallCapacity}
          onClick={() => setActiveTool((tool) => (tool === "ball" ? null : "ball"))}
        >
          <Circle /> Ball {Math.max(0, localBallCapacity - activeLocalBallCount)}
        </Button>
        <Button
          size="sm"
          onClick={() => setActiveTool(null)}
          active={!activeTool ? true : undefined}
        >
          <Palette /> Idle
        </Button>
      </CareToolGrid>
      <div style={{ marginTop: 7, fontSize: 10 }}>{toolHint}</div>
      <CareStatusLine $error={marketStatus.error}>
        {checkoutBusy ? "Checkout in progress." : marketStatus.text}
      </CareStatusLine>
    </CareTray>
  );
}
