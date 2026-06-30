import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Moon, RefreshCcw, Sun } from "lucide-react";
import { Button } from "react95";
import styled from "styled-components";
import { AppWindow } from "../../components/layout/AppWindow";
import { usePresentationShell } from "../../lib/presentation-shell";
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
  adminToggle?: {
    showAdmin: boolean;
    setShowAdmin: Dispatch<SetStateAction<boolean>>;
    label: string;
  };
  children: ReactNode;
  diagnosticsMessage?: string;
  isFetching: boolean;
  navItems: WNavItem[];
  nightMode: boolean;
  oauthFlash: WOAuthFlash | null;
  postsCount: number;
  refreshedAt?: string;
  refetch: () => unknown;
  setActiveView: Dispatch<SetStateAction<WView>> | (() => void);
  setNightMode: Dispatch<SetStateAction<boolean>>;
  setOauthFlash: Dispatch<SetStateAction<WOAuthFlash | null>> | (() => void);
  source?: string;
  xProfile: WFollowsSummaryResponse["profile"] | null;
};

const gammaWScope = `[data-w-presentation-host="gamma"]`;

const Shell = styled.div<{ $night: boolean }>`
  background: ${({ $night }) =>
    $night
      ? "radial-gradient(circle at 0 0, rgba(0, 255, 188, 0.10), transparent 28%), linear-gradient(135deg, #050505 0%, #111111 56%, #1f1710 100%)"
      : "linear-gradient(135deg, #f4f1e8 0%, #f8fafc 48%, #ecf7f5 100%)"};
  border: 1px solid ${({ $night }) => ($night ? "#343434" : "#9fa7a8")};
  color: ${({ $night }) => ($night ? "#e7edf7" : "#10161e")};
  padding: 10px;

  &[data-w-presentation-host="gamma"] {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  textarea,
  select,
  input {
    background: ${({ $night }) => ($night ? "#0d1726" : "#fff")};
    color: ${({ $night }) => ($night ? "#e8f0fb" : "#111")};
    border: 1px solid ${({ $night }) => ($night ? "#4c6788" : "#9cabbb")};
  }

  &[data-w-presentation-host="gamma"] textarea,
  &[data-w-presentation-host="gamma"] select,
  &[data-w-presentation-host="gamma"] input {
    background: #11110f;
    color: #f2ead9;
    border: 1px solid rgba(242, 234, 217, 0.22);
    border-radius: 4px;
  }

  textarea::placeholder,
  input::placeholder {
    color: ${({ $night }) => ($night ? "#8ea2bd" : "#647486")};
  }

  &[data-w-presentation-host="gamma"] textarea::placeholder,
  &[data-w-presentation-host="gamma"] input::placeholder {
    color: rgba(242, 234, 217, 0.52);
  }

  option {
    background: ${({ $night }) => ($night ? "#0d1726" : "#fff")};
    color: ${({ $night }) => ($night ? "#e8f0fb" : "#111")};
  }

  &[data-w-presentation-host="gamma"] option {
    background: #11110f;
    color: #f2ead9;
  }

  fieldset {
    color: ${({ $night }) => ($night ? "#dbe7f7" : "#10161e")};
  }

  &[data-w-presentation-host="gamma"] fieldset {
    color: #f2ead9;
  }

  legend {
    color: #10161e;
  }

  &[data-w-presentation-host="gamma"] legend {
    color: #00d2ff;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  p,
  label,
  li {
    color: ${({ $night }) => ($night ? "#dbe7f7" : "#10161e")};
  }

  &[data-w-presentation-host="gamma"] p,
  &[data-w-presentation-host="gamma"] label,
  &[data-w-presentation-host="gamma"] li {
    color: #f2ead9;
  }

  code {
    color: ${({ $night }) => ($night ? "#ffdcae" : "#4b2b00")};
  }

  &[data-w-presentation-host="gamma"] code {
    color: #d6ff3f;
  }

  a {
    color: ${({ $night }) => ($night ? "#9ec5ff" : "#0b4da6")};
  }

  &[data-w-presentation-host="gamma"] a {
    color: #00d2ff;
  }
`;

const HeaderBar = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;

  ${gammaWScope} & {
    border-bottom: 1px solid rgba(242, 234, 217, 0.18);
    margin-bottom: 10px;
    padding-bottom: 10px;
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const WBadge = styled.div<{ $night: boolean }>`
  width: 34px;
  height: 34px;
  border: 1px solid ${({ $night }) => ($night ? "#c7d3e5" : "#111")};
  background: ${({ $night }) => ($night ? "#050505" : "#111")};
  color: ${({ $night }) => ($night ? "#00ffbc" : "#fff")};
  font-weight: 700;
  font-size: 20px;
  line-height: 32px;
  text-align: center;
  font-family: "MS Sans Serif", "Segoe UI", Tahoma, sans-serif;
  box-shadow:
    inset 0 0 0 1px ${({ $night }) => ($night ? "#252525" : "#444")},
    3px 3px 0 ${({ $night }) => ($night ? "#6b4b1d" : "#c0c0c0")};

  ${gammaWScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.24);
    border-radius: 4px;
    box-shadow: none;
    color: #00d2ff;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  }
`;

const TitleWrap = styled.div`
  min-width: 0;
`;

const Title = styled.div`
  font-weight: 700;
  font-size: 17px;
  letter-spacing: 0;

  ${gammaWScope} & {
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
`;

const Subtitle = styled.div<{ $night: boolean }>`
  font-size: 11px;
  margin-top: 2px;
  color: ${({ $night }) => ($night ? "#aebfd8" : "#3f4b57")};

  ${gammaWScope} & {
    color: rgba(242, 234, 217, 0.68);
  }
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
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
  margin: 10px 0 12px;
  padding: 6px;
  border: 1px solid ${({ $night }) => ($night ? "#353535" : "#a8adaf")};
  background: ${({ $night }) => ($night ? "#0a0a0a" : "#ece9de")};

  ${gammaWScope} & {
    background: #11110f;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
  }
`;

const MainSurface = styled.div<{ $night: boolean }>`
  border: 1px solid ${({ $night }) => ($night ? "#242424" : "#c9cfd4")};
  border-radius: 8px;
  background: ${({ $night }) =>
    $night ? "rgba(8, 10, 12, 0.90)" : "rgba(255, 255, 255, 0.88)"};
  padding: 12px;
  min-height: 360px;
  box-shadow: ${({ $night }) =>
    $night ? "inset 0 0 0 1px #15191e" : "inset 0 0 0 1px #ffffff"};

  ${gammaWScope} & {
    background: #070706;
    background-image: none;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    box-shadow: none;
    color: #f2ead9;
  }
`;

const Small = styled.span<{ $night?: boolean }>`
  font-size: 11px;
  color: ${({ $night }) => ($night ? "#b8c5da" : "#3c4956")};

  ${gammaWScope} & {
    color: rgba(242, 234, 217, 0.68);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  }
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

  ${gammaWScope} & {
    background: #11110f;
    border: 1px solid rgba(242, 234, 217, 0.24);
    border-radius: 6px;
    color: #00d2ff;
  }
`;

function formatCount(value: number | null | undefined): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    Number(value || 0)
  );
}

export function WShell({
  accountsCount,
  activeView,
  adminToggle,
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
  const presentation = usePresentationShell();

  return (
    <AppWindow title="W">
      <Shell
        $night={nightMode}
        data-w-presentation-host={presentation.host}
        data-w-surface="w-shell"
      >
        <HeaderBar data-w-region="header">
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
              <Title data-w-region="title">W Tezos digest</Title>
              <Subtitle $night={nightMode}>
                {xProfile?.username
                  ? `@${xProfile.username}`
                  : "Read-only timeline from curated Tezos voices on X."}
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
          <Button size="sm" onClick={() => setNightMode((v) => !v)} title="Toggle theme">
            {nightMode ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
            {" "}
            {nightMode ? "Day" : "Night"}
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
          <div style={{ display: "flex", gap: 6 }}>
            {adminToggle ? (
              <Button
                size="sm"
                active={adminToggle.showAdmin}
                onClick={() => adminToggle.setShowAdmin((v) => !v)}
              >
                {adminToggle.label}
              </Button>
            ) : null}
            <Button size="sm" disabled={isFetching} onClick={() => refetch()}>
              <RefreshCcw size={14} aria-hidden="true" />
              {" "}
              {isFetching ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </Row>

        {diagnosticsMessage && (
          <p style={{ fontSize: 11, color: nightMode ? "#f5bc7b" : "#7a2f00", marginBottom: 10 }}>
            {diagnosticsMessage}
          </p>
        )}

        <ViewNav $night={nightMode} data-w-region="view-nav">
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

        <MainSurface $night={nightMode} data-w-region="main-surface">
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
