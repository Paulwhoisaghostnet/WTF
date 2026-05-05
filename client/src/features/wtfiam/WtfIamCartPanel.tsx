import { ShoppingCart, Trash2 } from "lucide-react";
import { Button, GroupBox } from "react95";
import styled from "styled-components";
import type { MarketCurrency, WtfIamCartEntry } from "./types";

const CartBox = styled(GroupBox)`
  min-width: 248px;

  @media (max-width: 920px) {
    min-width: 0;
  }
`;

const CurrencyToggle = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-bottom: 10px;
`;

const CurrencyButton = styled(Button)<{ $active: boolean }>`
  font-weight: ${(p) => (p.$active ? 900 : 400)};
`;

const CartRows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 78px;
  font-size: 11px;
`;

const CartRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 5px 6px;
  border: 1px solid #808080;
  background: #efecd4;
`;

const Empty = styled.div`
  min-height: 78px;
  border: 2px inset #808080;
  background: #e7e2c9;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5d5d5d;
`;

const Totals = styled.div`
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #808080;
  display: grid;
  gap: 4px;
  font-size: 12px;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  margin-top: 10px;

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
  subtotalExp: number;
  subtotalWtf: string;
  ticketCount: number;
  onCurrencyChange: (currency: MarketCurrency) => void;
  onClear: () => void;
};

export function WtfIamCartPanel({
  cartEntries,
  currency,
  expBalance,
  subtotalExp,
  subtotalWtf,
  ticketCount,
  onCurrencyChange,
  onClear,
}: Props) {
  return (
    <CartBox label="Cart">
      <CurrencyToggle>
        <CurrencyButton
          size="sm"
          $active={currency === "wtf"}
          onClick={() => onCurrencyChange("wtf")}
        >
          WTF
        </CurrencyButton>
        <CurrencyButton
          size="sm"
          $active={currency === "exp"}
          onClick={() => onCurrencyChange("exp")}
        >
          EXP
        </CurrencyButton>
      </CurrencyToggle>

      {cartEntries.length === 0 ? (
        <Empty>No tickets</Empty>
      ) : (
        <CartRows>
          {cartEntries.map((entry) => (
            <CartRow key={entry.item.sku}>
              <span>{entry.item.name}</span>
              <strong>x{entry.quantity}</strong>
            </CartRow>
          ))}
        </CartRows>
      )}

      <Totals>
        <div>Tickets: {ticketCount}</div>
        <div>WTF: {subtotalWtf}</div>
        <div>EXP: {subtotalExp}</div>
        <div>EXP balance: {expBalance}</div>
      </Totals>

      <ActionRow>
        <Button size="sm" disabled title="Checkout is staged for this marketplace surface">
          <ShoppingCart /> Checkout
        </Button>
        <Button size="sm" disabled={ticketCount === 0} onClick={onClear}>
          <Trash2 /> Clear
        </Button>
      </ActionRow>
    </CartBox>
  );
}
