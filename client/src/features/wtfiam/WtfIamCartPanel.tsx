import { ShoppingCart, Trash2 } from "lucide-react";
import { Button, GroupBox } from "react95";
import styled from "styled-components";
import type { MarketCurrency, WtfIamCartEntry } from "./types";

const gammaWtfIamScope = `[data-wtfiam-presentation-host="gamma"]`;

const CartBox = styled(GroupBox)`
  min-width: 248px;

  ${gammaWtfIamScope} & {
    min-width: 248px;
    box-shadow: none;
  }

  @media (max-width: 920px) {
    min-width: 0;
  }
`;

const CurrencyToggle = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin-bottom: 10px;

  ${gammaWtfIamScope} & {
    gap: 6px;
  }
`;

const CurrencySlot = styled.div`
  min-width: 0;

  ${gammaWtfIamScope} & {
    background: transparent;
    background-image: none;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    padding: 1px;
  }

  ${gammaWtfIamScope} &[data-wtfiam-currency-active="true"] {
    background: rgba(0, 210, 255, 0.1);
    background-image: none;
    border-color: #00d2ff;
  }

  ${gammaWtfIamScope} & button {
    width: 100%;
    border-color: transparent !important;
  }
`;

const CurrencyButton = styled(Button)<{ $active: boolean }>`
  font-weight: ${(p) => (p.$active ? 900 : 400)};

  ${gammaWtfIamScope} && {
    background: #070706;
    background-image: none;
    border-color: rgba(242, 234, 217, 0.18);
    color: rgba(242, 234, 217, 0.72);
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
  }
`;

const CartRows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 78px;
  font-size: var(--wtf-type-caption, 13px);

  ${gammaWtfIamScope} & {
    gap: 8px;
  }
`;

const CartRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 5px 6px;
  border: 1px solid #808080;
  background: #efecd4;

  ${gammaWtfIamScope} & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: #f2ead9;
    padding: 7px 8px;
  }
`;

const Empty = styled.div`
  min-height: 78px;
  border: 2px inset #808080;
  background: #e7e2c9;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5d5d5d;

  ${gammaWtfIamScope} & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: rgba(242, 234, 217, 0.58);
  }
`;

const Totals = styled.div`
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #808080;
  display: grid;
  gap: 4px;
  font-size: var(--wtf-type-caption, 13px);

  ${gammaWtfIamScope} & {
    border-top: 1px solid rgba(242, 234, 217, 0.14);
    color: rgba(242, 234, 217, 0.74);
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
    gap: 6px;
  }
`;

const StatusLine = styled.div<{ $error?: boolean }>`
  margin-top: 8px;
  min-height: 18px;
  color: ${(p) => (p.$error ? "#8a1a1a" : "#1f4d22")};
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.25;

  ${gammaWtfIamScope} & {
    color: ${(p) => (p.$error ? "#f2ead9" : "#d6ff3f")};
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
  }
`;

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  margin-top: 10px;

  ${gammaWtfIamScope} & {
    gap: 8px;
  }

  button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  svg {
    width: 13px;
    height: 13px;
  }
`;

type Props = {
  cartEntries: WtfIamCartEntry[];
  currency: MarketCurrency;
  expBalance: number;
  rewardWtfBalance: number;
  subtotalExp: number;
  subtotalWtf: string;
  ticketCount: number;
  onCurrencyChange: (currency: MarketCurrency) => void;
  onClear: () => void;
  onCheckout: () => void;
  checkoutBusy?: boolean;
  checkoutMessage?: string;
  checkoutError?: string;
};

export function WtfIamCartPanel({
  cartEntries,
  currency,
  expBalance,
  rewardWtfBalance,
  subtotalExp,
  subtotalWtf,
  ticketCount,
  onCurrencyChange,
  onClear,
  onCheckout,
  checkoutBusy = false,
  checkoutMessage,
  checkoutError,
}: Props) {
  return (
    <CartBox label="Cart" data-wtfiam-region="cart-panel">
      <CurrencyToggle data-wtfiam-region="currency-toggle">
        <CurrencySlot
          data-wtfiam-currency="wtf"
          data-wtfiam-currency-active={currency === "wtf" ? "true" : "false"}
          onClick={() => onCurrencyChange("wtf")}
        >
          <CurrencyButton
            size="sm"
            $active={currency === "wtf"}
            onClick={() => onCurrencyChange("wtf")}
            data-wtfiam-currency-button="wtf"
          >
            WTF
          </CurrencyButton>
        </CurrencySlot>
        <CurrencySlot
          data-wtfiam-currency="reward_wtf"
          data-wtfiam-currency-active={currency === "reward_wtf" ? "true" : "false"}
          onClick={() => onCurrencyChange("reward_wtf")}
        >
          <CurrencyButton
            size="sm"
            $active={currency === "reward_wtf"}
            onClick={() => onCurrencyChange("reward_wtf")}
            data-wtfiam-currency-button="reward_wtf"
          >
            Earned
          </CurrencyButton>
        </CurrencySlot>
        <CurrencySlot
          data-wtfiam-currency="exp"
          data-wtfiam-currency-active={currency === "exp" ? "true" : "false"}
          onClick={() => onCurrencyChange("exp")}
        >
          <CurrencyButton
            size="sm"
            $active={currency === "exp"}
            onClick={() => onCurrencyChange("exp")}
            data-wtfiam-currency-button="exp"
          >
            EXP
          </CurrencyButton>
        </CurrencySlot>
      </CurrencyToggle>

      {cartEntries.length === 0 ? (
        <Empty data-wtfiam-region="cart-empty">No tickets</Empty>
      ) : (
        <CartRows data-wtfiam-region="cart-rows">
          {cartEntries.map((entry) => (
            <CartRow key={entry.item.sku} data-wtfiam-region="cart-row">
              <span>{entry.item.name}</span>
              <strong>x{entry.quantity}</strong>
            </CartRow>
          ))}
        </CartRows>
      )}

      <Totals data-wtfiam-region="cart-totals">
        <div>Tickets: {ticketCount}</div>
        <div>WTF: {subtotalWtf}</div>
        <div>EXP: {subtotalExp}</div>
        <div>Earned WTF: {rewardWtfBalance}</div>
        <div>EXP balance: {expBalance}</div>
      </Totals>

      <StatusLine $error={Boolean(checkoutError)} data-wtfiam-region="checkout-status">
        {checkoutError || checkoutMessage || ""}
      </StatusLine>

      <ActionRow data-wtfiam-region="cart-actions">
        <Button
          size="sm"
          disabled={ticketCount === 0 || checkoutBusy}
          onClick={onCheckout}
          title={ticketCount === 0 ? "Add an item before checkout" : "Create market checkout"}
          data-wtfiam-action="checkout"
        >
          <ShoppingCart /> {checkoutBusy ? "Working" : "Checkout"}
        </Button>
        <Button size="sm" disabled={ticketCount === 0} onClick={onClear} data-wtfiam-action="clear-cart">
          <Trash2 /> Clear
        </Button>
      </ActionRow>
    </CartBox>
  );
}
