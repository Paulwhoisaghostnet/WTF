import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Separator } from "react95";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import { useWallet } from "../lib/wallet-context";
import { useEtherlinkWallet } from "../lib/etherlink";
import { WALLET_SESSION_KEY } from "../lib/tezos";
import { ETHERLINK_SESSION_KEY } from "../lib/etherlink";
import { WINDOW_SESSION_STORAGE_KEY } from "../lib/window-state";
import { logClientSystemEvent } from "../lib/system-log";
import {
  deriveRecoveryModeStatus,
  recoveryOperatorActionRoute,
  type RecoveryDiskSummary,
  type RecoveryHealthSummary,
} from "./recovery-mode-model";

const TEZOS_NETWORK_KEY = "wtf:network";
const ETHERLINK_NETWORK_KEY = "wtf:etherlink-network";

const Shell = styled.div`
  display: grid;
  gap: 8px;
  min-width: 0;
`;

const HeaderGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const StatusBadge = styled.div<{ $severity: string }>`
  min-width: 104px;
  padding: 8px;
  border: 1px solid #808080;
  background: ${(p) =>
    p.$severity === "critical"
      ? "#f5b5b5"
      : p.$severity === "warn"
        ? "#f5df9a"
        : p.$severity === "notice"
          ? "#d7e7ff"
          : "#d8f0d0"};
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
  font-weight: bold;
  text-align: center;
  text-transform: uppercase;
`;

const Lead = styled.div`
  font-size: 12px;
  line-height: 1.45;
  color: #202020;
`;

const Grid = styled.div`
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
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 6px;
  border: 1px solid #9a9a9a;
  background: #eeeeee;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const Title = styled.div`
  font-size: 12px;
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const Detail = styled.div`
  margin-top: 2px;
  font-size: 11px;
  color: #404040;
  overflow-wrap: anywhere;
`;

const Actions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const ActionButton = styled(Button)`
  width: 100%;
  min-height: 30px;
  font-size: 11px;
`;

const MetaGrid = styled.div`
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

const Meta = styled.div`
  min-height: 64px;
  padding: 7px;
  border: 1px solid #9a9a9a;
  background: #f2f2f2;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #c0c0c0;
`;

const MetaLabel = styled.div`
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  color: #404040;
`;

const MetaValue = styled.div`
  margin-top: 4px;
  font-size: 12px;
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const Message = styled.div`
  padding: 6px;
  border: 1px solid #808080;
  background: #ffffd6;
  font-size: 11px;
  overflow-wrap: anywhere;
`;

async function fetchHealthJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (response.ok) return body as T;
  return {
    ok: false,
    status: response.status >= 500 ? "error" : "degraded",
    error: body?.error || response.statusText,
    ...body,
  } as T;
}

function readLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function shortAddress(address: string | null) {
  if (!address) return "disconnected";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatCache(disk: RecoveryDiskSummary | undefined) {
  const cache = disk?.tvCache;
  if (!cache) return disk?.status || "unknown";
  const utilization =
    typeof cache.utilization === "number" ? `${(cache.utilization * 100).toFixed(1)}%` : "n/a";
  return `${cache.files ?? 0} files, ${utilization}`;
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function RecoveryMode() {
  const { user } = useAuth();
  const wallet = useWallet();
  const etherlink = useEtherlinkWallet();
  const [, setLocation] = useLocation();
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const healthQuery = useQuery({
    queryKey: ["recovery-mode", "health"],
    queryFn: () => fetchHealthJson<RecoveryHealthSummary>("/api/health"),
    refetchInterval: 60_000,
  });

  const diskQuery = useQuery({
    queryKey: ["recovery-mode", "disk"],
    queryFn: () => fetchHealthJson<RecoveryDiskSummary>("/api/health/disk"),
    refetchInterval: 60_000,
  });

  const localState = useMemo(
    () => ({
      tezosNetwork: readLocalStorage(TEZOS_NETWORK_KEY) || "mainnet",
      etherlinkNetwork: readLocalStorage(ETHERLINK_NETWORK_KEY) || "mainnet",
      windowSessionPresent: Boolean(readLocalStorage(WINDOW_SESSION_STORAGE_KEY)),
      tezosSessionPresent: Boolean(readLocalStorage(WALLET_SESSION_KEY)),
      etherlinkSessionPresent: Boolean(readLocalStorage(ETHERLINK_SESSION_KEY)),
    }),
    [revision]
  );

  const status = useMemo(
    () =>
      deriveRecoveryModeStatus({
        health: healthQuery.data,
        disk: diskQuery.data,
        tezosWalletConnected: Boolean(wallet.address || localState.tezosSessionPresent),
        etherlinkWalletConnected: Boolean(etherlink.address || localState.etherlinkSessionPresent),
        tezosNetwork: localState.tezosNetwork,
        etherlinkNetwork: localState.etherlinkNetwork,
        windowSessionPresent: localState.windowSessionPresent,
        role: user?.role ?? null,
      }),
    [
      etherlink.address,
      healthQuery.data,
      diskQuery.data,
      localState,
      user?.role,
      wallet.address,
    ]
  );

  useEffect(() => {
    logClientSystemEvent({
      eventType: "recovery_mode.viewed",
      metadata: { severity: status.severity, incidents: status.incidents.map((row) => row.id) },
    });
  }, [status.incidents, status.severity]);

  function openRecoveryRoute(path: string, actionId: string) {
    logClientSystemEvent({
      eventType: "recovery_mode.action_opened",
      metadata: { actionId, path },
    });
    setLocation(path);
  }

  async function runAction(actionId: string) {
    setBusyAction(actionId);
    setMessage(null);
    try {
      if (actionId === "disconnect-wallets") {
        await Promise.allSettled([wallet.disconnect(), etherlink.disconnect()]);
        logClientSystemEvent({ eventType: "recovery_mode.wallets_disconnected" });
        setMessage("Wallet sessions were disconnected. Reconnect from Profile or a wallet-aware app.");
      } else if (actionId === "reset-networks") {
        window.localStorage.removeItem(TEZOS_NETWORK_KEY);
        window.localStorage.removeItem(ETHERLINK_NETWORK_KEY);
        logClientSystemEvent({ eventType: "recovery_mode.network_reset" });
        setMessage("Local chain network overrides were cleared. Mainnet is now the default.");
      } else if (actionId === "clear-window-session") {
        window.localStorage.removeItem(WINDOW_SESSION_STORAGE_KEY);
        logClientSystemEvent({ eventType: "recovery_mode.window_session_cleared" });
        setMessage("Saved desktop windows were cleared. Reload the OS to apply the reset.");
      } else if (actionId === "export-report") {
        downloadJson(`wtf-recovery-${new Date().toISOString()}.json`, {
          exportedAt: new Date().toISOString(),
          user: user
            ? { id: user.id, username: user.username, role: user.role }
            : { role: null },
          location: window.location.href,
          health: healthQuery.data ?? null,
          disk: diskQuery.data ?? null,
          wallet: {
            tezos: {
              connected: Boolean(wallet.address || localState.tezosSessionPresent),
              address: wallet.address,
              providerName: wallet.providerName,
            },
            etherlink: {
              connected: Boolean(etherlink.address || localState.etherlinkSessionPresent),
              address: etherlink.address,
              chainId: etherlink.chainId,
              network: etherlink.network,
              providerName: etherlink.providerName,
            },
          },
          localState,
          incidents: status.incidents,
          browser: {
            userAgent: navigator.userAgent,
            viewport: { width: window.innerWidth, height: window.innerHeight },
          },
        });
        logClientSystemEvent({ eventType: "recovery_mode.report_exported" });
        setMessage("Recovery report exported from local state.");
      } else if (actionId === "check-filesystem") {
        await Promise.allSettled([healthQuery.refetch(), diskQuery.refetch()]);
        logClientSystemEvent({ eventType: "recovery_mode.filesystem_checked" });
        setMessage("Health and filesystem probes were refreshed.");
      } else if (actionId === "open-emergency-shell") {
        openRecoveryRoute("/terminal", actionId);
      } else if (actionId === "open-profile") {
        openRecoveryRoute("/profile", actionId);
      } else if (actionId === "open-mission-control") {
        openRecoveryRoute("/mission-control", actionId);
      }
      setRevision((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      logClientSystemEvent({
        eventType: "recovery_mode.action_failed",
        severity: "warn",
        metadata: { actionId },
        error: err,
      });
    } finally {
      setBusyAction(null);
    }
  }

  const loading = healthQuery.isLoading || diskQuery.isLoading;

  return (
    <AppWindow title="Recovery Mode">
      <Shell data-testid="recovery-mode">
        <HeaderGrid>
          <Lead>
            Recovery Mode is the user-safe OS repair surface: clear broken local sessions,
            export evidence, and route operator-only repairs to admin gates without exposing
            privileged controls to regular accounts.
          </Lead>
          <StatusBadge $severity={status.severity} data-testid="recovery-severity">
            {loading ? <Hourglass size={18} /> : status.severity}
          </StatusBadge>
        </HeaderGrid>

        {message ? <Message data-testid="recovery-message">{message}</Message> : null}

        <MetaGrid>
          <Meta>
            <MetaLabel>Tezos wallet</MetaLabel>
            <MetaValue>{shortAddress(wallet.address)}</MetaValue>
          </Meta>
          <Meta>
            <MetaLabel>Etherlink wallet</MetaLabel>
            <MetaValue>{shortAddress(etherlink.address)}</MetaValue>
          </Meta>
          <Meta>
            <MetaLabel>Networks</MetaLabel>
            <MetaValue>
              {localState.tezosNetwork} / {localState.etherlinkNetwork}
            </MetaValue>
          </Meta>
          <Meta>
            <MetaLabel>TV cache</MetaLabel>
            <MetaValue>{formatCache(diskQuery.data)}</MetaValue>
          </Meta>
        </MetaGrid>

        <Grid>
          <GroupBox label="Incidents">
            <Rows>
              {status.incidents.length === 0 ? (
                <Row>
                  <div>
                    <Title>No recovery incidents detected</Title>
                    <Detail>Health, wallet, network, and shell checks are currently quiet.</Detail>
                  </div>
                </Row>
              ) : (
                status.incidents.map((incident) => (
                  <Row key={incident.id}>
                    <div>
                      <Title>{incident.title}</Title>
                      <Detail>
                        {incident.severity.toUpperCase()}: {incident.detail}
                      </Detail>
                    </div>
                    <ActionButton onClick={() => runAction(incident.actionId)}>
                      {incident.actionId === "open-profile"
                        ? "Profile"
                        : incident.actionId === "open-mission-control"
                          ? "Mission"
                          : "Repair"}
                    </ActionButton>
                  </Row>
                ))
              )}
            </Rows>
          </GroupBox>

          <GroupBox label="Local repairs">
            <Actions>
              {status.actions.map((action) => (
                <ActionButton
                  key={action.id}
                  disabled={!action.enabled || Boolean(busyAction)}
                  onClick={() => runAction(action.id)}
                  title={action.detail}
                >
                  {busyAction === action.id ? "Working..." : action.label}
                </ActionButton>
              ))}
              <ActionButton onClick={() => window.location.assign("/recovery-mode")}>
                Reload OS
              </ActionButton>
              <ActionButton
                onClick={() => openRecoveryRoute("/mission-control", "mission-control")}
              >
                Mission Control
              </ActionButton>
              <ActionButton onClick={() => openRecoveryRoute("/profile", "profile")}>
                Profile
              </ActionButton>
              <ActionButton
                onClick={() => openRecoveryRoute("/desktop-settings", "appearance")}
              >
                Appearance
              </ActionButton>
              <ActionButton onClick={() => openRecoveryRoute("/terminal", "terminal")}>
                Terminal
              </ActionButton>
            </Actions>
          </GroupBox>
        </Grid>

        <Separator />

        <GroupBox label="Operator-only repairs">
          <Rows>
            {status.operatorActions.map((action) => (
              <Row key={action.id}>
                <div>
                  <Title>{action.label}</Title>
                  <Detail>
                    {action.detail} {action.enabled ? "Current role can open Admin." : "Operator role required."}
                  </Detail>
                </div>
                <ActionButton
                  disabled={!action.enabled}
                  onClick={() =>
                    openRecoveryRoute(recoveryOperatorActionRoute(action.id), action.id)
                  }
                >
                  Open
                </ActionButton>
              </Row>
            ))}
          </Rows>
        </GroupBox>
      </Shell>
    </AppWindow>
  );
}
