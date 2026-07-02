import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Separator } from "react95";
import {
  Archive,
  Bot,
  Braces,
  Camera,
  Code2,
  DoorOpen,
  Globe2,
  LockKeyhole,
  Route,
  Settings,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { presentationRouteHref, usePresentationShell } from "../lib/presentation-shell";
import { logClientSystemEvent } from "../lib/system-log";

type AccessMode =
  | "public"
  | "browser-session"
  | "paired-mcp-agent"
  | "role-gated-session";

type ManifestRoute = {
  method?: string;
  path: string;
  title?: string;
  access: AccessMode;
  purpose: string;
  enabled?: boolean;
};

type AccessManifest = {
  ok: boolean;
  generatedAt: string;
  origin: string;
  guarantees: string[];
  browserRoutes: ManifestRoute[];
  apiRoutes: ManifestRoute[];
  mcp: {
    endpoint: string;
    tokenManagementApi: string;
    authentication: string;
    rateLimitPerMinute: number;
    scopes: Array<{ scope: string; purpose: string }>;
  };
};

const Shell = styled.div`
  display: grid;
  gap: 8px;
  min-width: 0;

  &[data-gamma-utility-presentation-host="gamma"] {
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }

  &[data-gamma-utility-presentation-host="gamma"],
  &[data-gamma-utility-presentation-host="gamma"] * {
    box-shadow: none;
    text-shadow: none;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region],
  &[data-gamma-utility-presentation-host="gamma"] fieldset {
    min-width: 0;
    background-image: none;
    border-radius: 6px;
  }

  &[data-gamma-utility-presentation-host="gamma"] fieldset,
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="status-cell"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="row"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="empty"] {
    border: 1px solid rgba(242, 234, 217, 0.16);
    background: #11110f;
    color: #f2ead9;
  }

  &[data-gamma-utility-presentation-host="gamma"] legend,
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="label"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="meta"] {
    color: rgba(242, 234, 217, 0.7);
  }

  &[data-gamma-utility-presentation-host="gamma"] legend,
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="label"] {
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="icon"],
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="tag"] {
    border: 1px solid rgba(0, 210, 255, 0.5);
    background: #070706;
    color: #00d2ff;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="button"] {
    border: 1px solid rgba(0, 210, 255, 0.58);
    border-radius: 4px;
    background: transparent;
    color: #00d2ff;
  }

  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="button"]:hover,
  &[data-gamma-utility-presentation-host="gamma"] [data-gamma-utility-region="button"]:focus-visible {
    border-color: #00d2ff;
    color: #f2ead9;
    outline: 1px solid #00d2ff;
    outline-offset: 2px;
  }
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 460px) {
    grid-template-columns: 1fr;
  }
`;

const StatusCell = styled.div`
  min-height: 62px;
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #eeeeee);
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
`;

const StatusLabel = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
  color: var(--wtf-app-muted, #4b5563);
`;

const StatusValue = styled.div`
  margin-top: 4px;
  font-size: var(--wtf-type-heading-sm, 18px);
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const PanelGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const Rows = styled.div`
  display: grid;
  gap: 6px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #9a9a9a);
  background: var(--wtf-app-surface, #f2f2f2);

  @media (max-width: 560px) {
    grid-template-columns: 28px minmax(0, 1fr);
  }
`;

const IconBox = styled.div`
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid #808080;
  background: #dfdfdf;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
`;

const RowTitle = styled.div`
  font-size: var(--wtf-type-body, 14px);
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const RowMeta = styled.div`
  margin-top: 3px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted, #4b5563);
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const OpenButton = styled(Button)`
  min-width: 86px;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: var(--wtf-type-caption, 13px);

  @media (max-width: 560px) {
    grid-column: 1 / -1;
    width: 100%;
  }
`;

const Tag = styled.span<{ $mode: AccessMode }>`
  display: inline-block;
  padding: 3px 6px;
  border: 1px solid #808080;
  background: ${(p) =>
    p.$mode === "public"
      ? "#d8f0d0"
      : p.$mode === "browser-session"
        ? "#d7e7ff"
        : p.$mode === "paired-mcp-agent"
          ? "#f5df9a"
          : "#f5b5b5"};
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
`;

const EmptyState = styled.div`
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-warning-surface, #ffffd6);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

function countByAccess(routes: ManifestRoute[], mode: AccessMode) {
  return routes.filter((route) => route.access === mode).length;
}

function modeLabel(mode: AccessMode) {
  if (mode === "browser-session") return "session";
  if (mode === "paired-mcp-agent") return "mcp";
  if (mode === "role-gated-session") return "role gate";
  return "public";
}

export function BrowserBoundaries() {
  const presentation = usePresentationShell();
  const [, setLocation] = useLocation();
  const manifestQuery = useQuery({
    queryKey: ["browser-boundaries", "access"],
    queryFn: () => api.get<AccessManifest>("/api/access"),
  });

  const manifest = manifestQuery.data;
  const browserRoutes = manifest?.browserRoutes ?? [];
  const apiRoutes = manifest?.apiRoutes ?? [];
  const mcp = manifest?.mcp;
  const mcpScopeCount = mcp?.scopes?.length ?? 0;
  const sessionRoutes = useMemo(
    () => browserRoutes.filter((route) => route.access !== "public").slice(0, 8),
    [browserRoutes]
  );
  const publicRoutes = useMemo(
    () => browserRoutes.filter((route) => route.access === "public").slice(0, 8),
    [browserRoutes]
  );
  const boundaryRows = useMemo(
    () => [
      {
        id: "csrf",
        label: "Cookie writes",
        detail: "same-origin API writes carry CSRF tokens through the browser fetch boundary",
        icon: ShieldCheck,
      },
      {
        id: "csp",
        label: "Frames",
        detail: "app frames default to self; wallet and game/tool exceptions stay path scoped",
        icon: DoorOpen,
      },
      {
        id: "mcp",
        label: "Paired agents",
        detail: "/mcp uses bearer tokens and ignores browser session cookies",
        icon: Bot,
      },
      {
        id: "public",
        label: "Public data",
        detail: "anonymous APIs expose public or public-derived rows only",
        icon: Globe2,
      },
    ],
    []
  );
  const browserModeRows = useMemo(
    () => [
      {
        id: "normal-browsing",
        label: "Normal browsing",
        detail: "public and session routes stay inside the standard browser session boundary",
        path: "/dashboard",
        action: "Dashboard",
        icon: Globe2,
      },
      {
        id: "wallet-safe-mode",
        label: "Wallet-safe mode",
        detail: "wallet and chain flows stay in signed-in surfaces with scoped frame allowances",
        path: "/mission-control",
        action: "Wallet state",
        icon: Wallet,
      },
      {
        id: "local-development",
        label: "Local development",
        detail: "operator checks run through allowlisted OS commands instead of arbitrary shell execution",
        path: "/terminal",
        action: "Terminal",
        icon: Code2,
      },
      {
        id: "media-capture",
        label: "Media capture",
        detail: "uploads, captures, and generated assets return to owned media/project dwellings",
        path: "/file-manager",
        action: "Files",
        icon: Camera,
      },
      {
        id: "archive-save-to-project",
        label: "Archive/save-to-project",
        detail: "exports, bundles, provenance, and IPFS preparation land in the archive/project map",
        path: "/file-manager",
        action: "Projects",
        icon: Archive,
      },
      {
        id: "admin-surfaces",
        label: "Admin surfaces",
        detail: "admin tools remain role-gated and visible only through explicit admin routes",
        path: "/admin",
        action: "Admin",
        icon: Settings,
      },
    ],
    []
  );
  const openBoundaryAction = useCallback(
    (path: string, action: string) => {
      logClientSystemEvent({
        eventType: "browser_boundaries.action_opened",
        metadata: { path, action },
      });
      setLocation(presentationRouteHref(path, presentation.host));
    },
    [presentation.host, setLocation]
  );

  useEffect(() => {
    logClientSystemEvent({
      eventType: "browser_boundaries.viewed",
      metadata: {
        browserRoutes: browserRoutes.length,
        apiRoutes: apiRoutes.length,
        mcpScopes: mcpScopeCount,
      },
    });
  }, [apiRoutes.length, browserRoutes.length, mcpScopeCount]);

  if (manifestQuery.isLoading) {
    return (
      <AppWindow title="Browser Boundaries">
        <EmptyState
          data-gamma-utility-surface="browser-boundaries"
          data-gamma-utility-presentation-host={presentation.host}
          data-gamma-utility-region="empty"
        >
          <Hourglass size={16} /> Loading access map...
        </EmptyState>
      </AppWindow>
    );
  }

  return (
    <AppWindow title="Browser Boundaries">
      <Shell
        data-testid="browser-boundaries"
        data-gamma-utility-surface="browser-boundaries"
        data-gamma-utility-presentation-host={presentation.host}
        data-gamma-utility-region="surface"
      >
        <StatusGrid data-gamma-utility-region="status-grid">
          <StatusCell data-gamma-utility-region="status-cell">
            <StatusLabel data-gamma-utility-region="label">Public Routes</StatusLabel>
            <StatusValue>{countByAccess(browserRoutes, "public")}</StatusValue>
          </StatusCell>
          <StatusCell data-gamma-utility-region="status-cell">
            <StatusLabel data-gamma-utility-region="label">Session Routes</StatusLabel>
            <StatusValue>{countByAccess(browserRoutes, "browser-session")}</StatusValue>
          </StatusCell>
          <StatusCell data-gamma-utility-region="status-cell">
            <StatusLabel data-gamma-utility-region="label">Role Gates</StatusLabel>
            <StatusValue>{countByAccess(browserRoutes, "role-gated-session")}</StatusValue>
          </StatusCell>
          <StatusCell data-gamma-utility-region="status-cell">
            <StatusLabel data-gamma-utility-region="label">API Routes</StatusLabel>
            <StatusValue>{apiRoutes.length}</StatusValue>
          </StatusCell>
        </StatusGrid>

        <Separator />

        <GroupBox label="Boundary Guarantees">
          <Rows>
            {boundaryRows.map((row) => {
              const Icon = row.icon;
              return (
                <Row key={row.id} data-gamma-utility-region="row">
                  <IconBox data-gamma-utility-region="icon">
                    <Icon size={17} aria-hidden />
                  </IconBox>
                  <div>
                    <RowTitle>{row.label}</RowTitle>
                    <RowMeta data-gamma-utility-region="meta">{row.detail}</RowMeta>
                  </div>
                  <OpenButton
                    data-gamma-utility-region="button"
                    onClick={() => openBoundaryAction("/recovery-mode", row.id)}
                  >
                    <ShieldCheck size={14} aria-hidden />
                    Check boundary health
                  </OpenButton>
                </Row>
              );
            })}
          </Rows>
        </GroupBox>

        <GroupBox label="Browser Modes">
          <Rows>
            {browserModeRows.map((row) => {
              const Icon = row.icon;
              return (
                <Row key={row.id} data-gamma-utility-region="row">
                  <IconBox data-gamma-utility-region="icon">
                    <Icon size={17} aria-hidden />
                  </IconBox>
                  <div>
                    <RowTitle>{row.label}</RowTitle>
                    <RowMeta data-gamma-utility-region="meta">{row.detail}</RowMeta>
                  </div>
                  <OpenButton data-gamma-utility-region="button" onClick={() => openBoundaryAction(row.path, row.id)}>
                    <Route size={14} aria-hidden />
                    Open {row.action}
                  </OpenButton>
                </Row>
              );
            })}
          </Rows>
        </GroupBox>

        <PanelGrid>
          <GroupBox label="Public Browser Routes">
            <Rows>
              {publicRoutes.map((route) => (
                <Row key={route.path} data-gamma-utility-region="row">
                  <IconBox data-gamma-utility-region="icon">
                    <Globe2 size={17} aria-hidden />
                  </IconBox>
                  <div>
                    <RowTitle>{route.title ?? route.path}</RowTitle>
                    <RowMeta data-gamma-utility-region="meta">{route.path}</RowMeta>
                  </div>
                  <Tag $mode={route.access} data-gamma-utility-region="tag">{modeLabel(route.access)}</Tag>
                </Row>
              ))}
            </Rows>
          </GroupBox>

          <GroupBox label="Protected Browser Routes">
            <Rows>
              {sessionRoutes.map((route) => (
                <Row key={route.path} data-gamma-utility-region="row">
                  <IconBox data-gamma-utility-region="icon">
                    {route.access === "role-gated-session" ? (
                      <LockKeyhole size={17} aria-hidden />
                    ) : (
                      <Route size={17} aria-hidden />
                    )}
                  </IconBox>
                  <div>
                    <RowTitle>{route.title ?? route.path}</RowTitle>
                    <RowMeta data-gamma-utility-region="meta">{route.path}</RowMeta>
                  </div>
                  <Tag $mode={route.access} data-gamma-utility-region="tag">{modeLabel(route.access)}</Tag>
                </Row>
              ))}
            </Rows>
          </GroupBox>
        </PanelGrid>

        <GroupBox label="Agent Boundary">
          <Row data-gamma-utility-region="row">
            <IconBox data-gamma-utility-region="icon">
              <Braces size={17} aria-hidden />
            </IconBox>
            <div>
              <RowTitle>{mcp?.endpoint ?? "/mcp"}</RowTitle>
              <RowMeta data-gamma-utility-region="meta">
                {mcpScopeCount} scopes, {mcp?.rateLimitPerMinute ?? 0}
                /min, token API {mcp?.tokenManagementApi ?? "/api/mcp/tokens"}
              </RowMeta>
            </div>
            <OpenButton
              data-gamma-utility-region="button"
              onClick={() => openBoundaryAction("/desktop-settings", "agent-tokens")}
            >
              <Bot size={14} aria-hidden />
              Open agent tokens
            </OpenButton>
          </Row>
        </GroupBox>

        {manifestQuery.isError && (
          <EmptyState data-gamma-utility-region="empty">Access manifest unavailable. Use Recovery Mode for current health.</EmptyState>
        )}
      </Shell>
    </AppWindow>
  );
}
