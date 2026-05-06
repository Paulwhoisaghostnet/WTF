import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Button } from "react95";
import styled from "styled-components";
import { AppWindow } from "../../components/layout/AppWindow";
import type { WFollowsSummaryResponse, WView } from "./types";

type WNavItem = {
  key: WView;
  label: string;
  count?: number;
};

type WOAuthFlash = {
  kind: "ok" | "err";
  message: string;
};

type WShellProps = {
  accountsCount: number;
  activeView: WView;
  children: ReactNode;
  diagnosticsMessage?: string;
  isFetching: boolean;
  navItems: WNavItem[];
  nightMode: boolean;
  oauthFlash: WOAuthFlash | null;
  postsCount: number;
  refreshedAt?: string;
  refetch: () => unknown;
  setActiveView: Dispatch<SetStateAction<WView>>;
  setNightMode: Dispatch<SetStateAction<boolean>>;
  setOauthFlash: Dispatch<SetStateAction<WOAuthFlash | null>>;
  source?: string;
  xProfile: WFollowsSummaryResponse["profile"] | null;
};

const Shell = styled.div<{ $night: boolean }>`
  background: ${({ $night }) =>
    $night
      ? "repeating-linear-gradient(0deg, #000000 0px, #000000 16px, #000000 16px, #000000 32px)"
      : "repeating-linear-gradient(0deg, #f7f9fb 0px, #f7f9fb 16px, #edf1f5 16px, #edf1f5 32px)"};
  border: 1px solid ${({ $night }) => ($night ? "#2c3e50" : "#a6adb5")};
  color: ${({ $night }) => ($night ? "#e7edf7" : "#10161e")};
  padding: 10px;

  textarea,
  select,
  input {
    background: ${({ $night }) => ($night ? "#0d1726" : "#fff")};
    color: ${({ $night }) => ($night ? "#e8f0fb" : "#111")};
    border: 1px solid ${({ $night }) => ($night ? "#4c6788" : "#9cabbb")};
  }

  textarea::placeholder,
  input::placeholder {
    color: ${({ $night }) => ($night ? "#8ea2bd" : "#647486")};
  }

  option {
    background: ${({ $night }) => ($night ? "#0d1726" : "#fff")};
    color: ${({ $night }) => ($night ? "#e8f0fb" : "#111")};
  }

  fieldset {
    color: ${({ $night }) => ($night ? "#dbe7f7" : "#10161e")};
  }

  legend {
    color: #10161e;
  }

  p,
  label,
  li {
    color: ${({ $night }) => ($night ? "#dbe7f7" : "#10161e")};
  }

  code {
    color: ${({ $night }) => ($night ? "#ffdcae" : "#4b2b00")};
  }

  a {
    color: ${({ $night }) => ($night ? "#9ec5ff" : "#0b4da6")};
  }
`;

const HeaderBar = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const WBadge = styled.div<{ $night: boolean }>`
  width: 24px;
  height: 24px;
  border: 1px solid ${({ $night }) => ($night ? "#c7d3e5" : "#111")};
  background: ${({ $night }) => ($night ? "#141b26" : "#111")};
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  line-height: 22px;
  text-align: center;
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  box-shadow: inset 0 0 0 1px ${({ $night }) => ($night ? "#2d3c50" : "#444")};
`;

const TitleWrap = styled.div`
  min-width: 0;
`;

const Title = styled.div`
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.2px;
`;

const Subtitle = styled.div<{ $night: boolean }>`
  font-size: 11px;
  margin-top: 2px;
  color: ${({ $night }) => ($night ? "#aebfd8" : "#3f4b57")};
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
`;

const ViewNav = styled.div<{ $night: boolean }>`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin: 8px 0 10px;
  padding: 6px;
  border: 1px solid ${({ $night }) => ($night ? "#324863" : "#9ca6b1")};
  background: ${({ $night }) => ($night ? "#101a28" : "#eef3f8")};
`;

const MainSurface = styled.div<{ $night: boolean }>`
  border: 1px solid ${({ $night }) => ($night ? "#324863" : "#9ca6b1")};
  background: ${({ $night }) => ($night ? "#0d1726" : "#ffffff")};
  padding: 8px;
  min-height: 360px;
`;

const Small = styled.span<{ $night?: boolean }>`
  font-size: 11px;
  color: ${({ $night }) => ($night ? "#b8c5da" : "#3c4956")};
`;

const Avatar = styled.div<{ $night: boolean }>`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid ${({ $night }) => ($night ? "#4b6787" : "#9cb0c4")};
  background: ${({ $night }) => ($night ? "#223650" : "#dce8f4")};
  color: ${({ $night }) => ($night ? "#d5e9ff" : "#16395f")};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  flex-shrink: 0;
`;

function formatCount(value: number | null | undefined): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    Number(value || 0)
  );
}

export function WShell({
  accountsCount,
  activeView,
  children,
  diagnosticsMessage,
  isFetching,
  navItems,
  nightMode,
  oauthFlash,
  postsCount,
  refreshedAt,
  refetch,
  setActiveView,
  setNightMode,
  setOauthFlash,
  source,
  xProfile,
}: WShellProps) {
  return (
    <AppWindow title="W">
      <Shell $night={nightMode}>
        <HeaderBar>
          <HeaderLeft>
            {xProfile?.profileImageUrl ? (
              <Avatar $night={nightMode} title={`@${xProfile.username || "x"} on X`} style={{ width: 32, height: 32 }}>
                <img
                  src={xProfile.profileImageUrl}
                  alt={`${xProfile.username || "X"} avatar`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </Avatar>
            ) : (
              <WBadge $night={nightMode}>W</WBadge>
            )}
            <TitleWrap>
              <Title>WTF is an algo</Title>
              <Subtitle $night={nightMode}>
                {xProfile?.username ? `@${xProfile.username}` : "Like X, but with the bloat stripped out."}
                {xProfile ? (
                  <>
                    {" · "}
                    {formatCount(xProfile.followersCount)} followers
                    {" · "}
                    {formatCount(xProfile.followingCount)} following
                  </>
                ) : null}
              </Subtitle>
            </TitleWrap>
          </HeaderLeft>
          <Button size="sm" onClick={() => setNightMode((v) => !v)}>
            {nightMode ? "Day mode" : "Night mode"}
          </Button>
        </HeaderBar>

        <Row style={{ marginBottom: 10 }}>
          <Small $night={nightMode}>
            Source: <strong>{source || "unknown"}</strong>
            {" · "}
            Accounts: <strong>{accountsCount}</strong>
            {" · "}
            Posts: <strong>{postsCount}</strong>
            {" · "}
            Updated: <strong>{refreshedAt ? new Date(refreshedAt).toLocaleTimeString() : "n/a"}</strong>
          </Small>
          <Button size="sm" disabled={isFetching} onClick={() => refetch()}>
            {isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </Row>

        {diagnosticsMessage && (
          <p style={{ fontSize: 11, color: nightMode ? "#f5bc7b" : "#7a2f00", marginBottom: 10 }}>
            {diagnosticsMessage}
          </p>
        )}

        <ViewNav $night={nightMode}>
          {navItems.map((item) => (
            <Button
              key={item.key}
              size="sm"
              active={activeView === item.key}
              onClick={() => setActiveView(item.key)}
            >
              {item.label}
              {typeof item.count === "number" ? ` (${item.count})` : ""}
            </Button>
          ))}
        </ViewNav>

        <MainSurface $night={nightMode}>
          {oauthFlash && (
            <div
              role="status"
              style={{
                padding: 8,
                marginBottom: 8,
                fontSize: 11,
                background: oauthFlash.kind === "ok" ? "#0f3a1d" : "#3a1212",
                color: oauthFlash.kind === "ok" ? "#cdeccb" : "#ffd5d5",
                border: `1px solid ${oauthFlash.kind === "ok" ? "#2f9a4b" : "#a03737"}`,
              }}
            >
              {oauthFlash.message}
              <Button size="sm" onClick={() => setOauthFlash(null)} style={{ marginLeft: 8 }}>
                Dismiss
              </Button>
            </div>
          )}
          {children}
        </MainSurface>
      </Shell>
    </AppWindow>
  );
}
