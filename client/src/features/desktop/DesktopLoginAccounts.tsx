import { useQuery } from "@tanstack/react-query";
import styled from "styled-components";
import { api } from "../../lib/api";

type LoginAccountsResponse = {
  uniqueAccounts: number;
  windowDays: 30;
};

const Counter = styled.aside`
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 0;
  min-width: 190px;
  max-width: calc(100% - 32px);
  border: 1px solid #101010;
  background: var(--wtf-window-color, #c0c0c0);
  color: var(--wtf-text-color, #101010);
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #777777, 2px 2px 0 rgba(0, 0, 0, 0.35);
  font-family: var(--wtf-shell-font, "MS Sans Serif", "Segoe UI", Tahoma, sans-serif);
  pointer-events: none;
  user-select: none;

  @media (max-width: 600px) {
    right: 10px;
    bottom: 10px;
    min-width: 160px;
    max-width: calc(100% - 20px);
  }
`;

const Title = styled.h2`
  margin: 0;
  padding: 5px 8px;
  background: var(--wtf-active-title, #000080);
  color: var(--wtf-active-title-text, #ffffff);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
`;

const Body = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 7px 8px 8px;
`;

const Value = styled.span`
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
`;

const Period = styled.span`
  font-size: 13px;
  line-height: 1.2;
`;

export function DesktopLoginAccounts() {
  const query = useQuery({
    queryKey: ["desktop", "login-accounts-30d"],
    queryFn: async () => {
      const response = await api.get<LoginAccountsResponse>("/api/desktop/login-accounts-30d");
      if (
        !Number.isSafeInteger(response?.uniqueAccounts) ||
        response.uniqueAccounts < 0 ||
        response.windowDays !== 30
      ) {
        throw new Error("Invalid desktop login account count");
      }
      return response;
    },
    retry: false,
  });

  const count = query.data?.uniqueAccounts;
  const value = query.isError ? "—" : count === undefined ? "…" : count.toLocaleString();
  const period = query.isError ? "Unavailable" : query.isPending ? "Loading" : "Last 30 days";
  const accessibleValue = query.isError
    ? "Account count unavailable"
    : count === undefined
      ? "Loading account count"
      : `${count} distinct accounts signed in to wtfOS in the last 30 days`;

  return (
    <Counter aria-label="Distinct accounts signed in to wtfOS in the last 30 days">
      <Title>Accounts signed in</Title>
      <Body>
        <Value
          data-testid="desktop-login-account-count"
          aria-label={accessibleValue}
          aria-live="polite"
          aria-atomic="true"
        >
          {value}
        </Value>
        <Period>{period}</Period>
      </Body>
    </Counter>
  );
}
