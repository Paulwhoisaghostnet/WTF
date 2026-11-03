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
  top: 16px;
  z-index: 0;
  box-sizing: border-box;
  width: 260px;
  max-width: calc(100% - 100px);
  border: 2px solid #161616;
  background: #f4d247;
  color: #161616;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.52);
  font-family: var(--wtf-shell-font, "MS Sans Serif", "Segoe UI", Tahoma, sans-serif);
  pointer-events: none;
  user-select: none;

  &::before,
  &::after {
    content: "";
    display: block;
    height: 6px;
    background: repeating-linear-gradient(135deg, #161616 0 7px, #f4d247 7px 14px);
  }

  @media (max-width: 600px) {
    right: 10px;
    top: 10px;
    width: 240px;
    max-width: calc(100% - 100px);

    &::before,
    &::after {
      height: 4px;
    }
  }
`;

const Title = styled.h2`
  margin: 0;
  padding: 5px 8px 4px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.15;

  @media (max-width: 600px) {
    padding: 3px 6px 2px;
    font-size: 10px;
    line-height: 1.1;
  }
`;

const Body = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  margin: 0 6px 5px;
  padding: 2px 8px;
  border: 2px inset #777;
  background: #171a16;
  color: #f9f4db;

  @media (max-width: 600px) {
    min-height: 32px;
    margin: 0 5px 3px;
    padding: 1px 6px;
  }
`;

const Value = styled.span`
  min-width: 4ch;
  text-align: center;
  font-size: 34px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;

  @media (max-width: 600px) {
    font-size: 30px;
  }
`;

const Period = styled.span`
  margin-left: 8px;
  font-size: 12px;
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
  const period = query.isError ? "Unavailable" : query.isPending ? "Loading" : null;
  const accessibleValue = query.isError
    ? "Account count unavailable"
    : count === undefined
      ? "Loading account count"
      : `${count} distinct accounts signed in to wtfOS in the last 30 days`;

  return (
    <Counter aria-label="Distinct accounts signed in to wtfOS in the last 30 days">
      <Title>Unique users served (30 days):</Title>
      <Body>
        <Value
          data-testid="desktop-login-account-count"
          aria-label={accessibleValue}
          aria-live="polite"
          aria-atomic="true"
        >
          {value}
        </Value>
        {period ? <Period>{period}</Period> : null}
      </Body>
    </Counter>
  );
}
