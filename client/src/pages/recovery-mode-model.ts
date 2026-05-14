import { isAdmin as isAdminRole, type UserRole } from "@shared/types";

export type RecoverySeverity = "ok" | "notice" | "warn" | "critical";

export interface RecoveryHealthSummary {
  ok?: boolean;
  status?: string | null;
  db?: { ok?: boolean | null } | null;
  chain?: {
    ok?: boolean | null;
    network?: string | null;
    tezosRpcUrl?: string | null;
    missing?: string[] | null;
  } | null;
  jobs?: {
    ok?: boolean | null;
    running?: number | null;
    recentErrors?: number | null;
    registered?: number | null;
  } | null;
}

export interface RecoveryDiskSummary {
  ok?: boolean;
  status?: string | null;
  tvCache?: {
    files?: number | null;
    bytes?: number | null;
    budgetBytes?: number | null;
    utilization?: number | null;
  } | null;
}

export interface RecoveryModeInput {
  health?: RecoveryHealthSummary | null;
  disk?: RecoveryDiskSummary | null;
  tezosWalletConnected: boolean;
  etherlinkWalletConnected: boolean;
  tezosNetwork: string | null;
  etherlinkNetwork: string | null;
  windowSessionPresent: boolean;
  role: UserRole | null;
}

export interface RecoveryIncident {
  id: string;
  title: string;
  severity: RecoverySeverity;
  detail: string;
  actionId: string;
}

export interface RecoveryAction {
  id: string;
  label: string;
  detail: string;
  operatorOnly?: boolean;
  enabled: boolean;
}

export interface RecoveryModeStatus {
  severity: RecoverySeverity;
  incidents: RecoveryIncident[];
  actions: RecoveryAction[];
  operatorActions: RecoveryAction[];
}

const SEVERITY_RANK: Record<RecoverySeverity, number> = {
  ok: 0,
  notice: 1,
  warn: 2,
  critical: 3,
};

function highestSeverity(items: RecoveryIncident[]): RecoverySeverity {
  return items.reduce<RecoverySeverity>(
    (current, item) =>
      SEVERITY_RANK[item.severity] > SEVERITY_RANK[current] ? item.severity : current,
    "ok"
  );
}

function normalizedNetwork(value: string | null): string {
  return (value || "mainnet").trim().toLowerCase();
}

export function recoveryOperatorActionRoute(actionId: string): string {
  if (actionId === "restore-proof") return "/backup-manager";
  return "/admin";
}

export function deriveRecoveryModeStatus(input: RecoveryModeInput): RecoveryModeStatus {
  const incidents: RecoveryIncident[] = [];
  const health = input.health;
  const disk = input.disk;
  const isAdmin = input.role ? isAdminRole(input.role) : false;

  if (health && health.ok === false) {
    incidents.push({
      id: "system-health",
      title: "System health is degraded",
      severity: health.status === "error" || health.db?.ok === false ? "critical" : "warn",
      detail: [
        health.db?.ok === false ? "database" : "",
        health.chain?.ok === false ? "chain contracts" : "",
        health.jobs?.ok === false ? "jobs" : "",
      ].filter(Boolean).join(", ") || "one or more health checks failed",
      actionId: "open-mission-control",
    });
  }

  if (disk && disk.ok === false) {
    incidents.push({
      id: "disk-cache",
      title: "Media cache needs attention",
      severity: disk.status === "crit" || disk.status === "error" ? "critical" : "warn",
      detail:
        typeof disk.tvCache?.utilization === "number"
          ? `TV cache is ${(disk.tvCache.utilization * 100).toFixed(1)}% of budget`
          : `Disk status is ${disk.status || "not ok"}`,
      actionId: "open-mission-control",
    });
  }

  if (!input.tezosWalletConnected && !input.etherlinkWalletConnected) {
    incidents.push({
      id: "wallet-disconnected",
      title: "No wallet is active",
      severity: "notice",
      detail: "Wallet-bound writes will require a fresh connection before they can continue.",
      actionId: "open-profile",
    });
  }

  if (normalizedNetwork(input.tezosNetwork) !== "mainnet") {
    incidents.push({
      id: "tezos-network-override",
      title: "Tezos network override is active",
      severity: "warn",
      detail: `Current local Tezos network is ${input.tezosNetwork}.`,
      actionId: "reset-networks",
    });
  }

  if (normalizedNetwork(input.etherlinkNetwork) !== "mainnet") {
    incidents.push({
      id: "etherlink-network-override",
      title: "Etherlink network override is active",
      severity: "warn",
      detail: `Current local Etherlink network is ${input.etherlinkNetwork}.`,
      actionId: "reset-networks",
    });
  }

  if (input.windowSessionPresent) {
    incidents.push({
      id: "window-session",
      title: "Desktop session can be reset",
      severity: "notice",
      detail: "A saved window layout exists and can be cleared if the shell is stuck.",
      actionId: "clear-window-session",
    });
  }

  const actions: RecoveryAction[] = [
    {
      id: "disconnect-wallets",
      label: "Disconnect wallets",
      detail: "Clear local Tezos and Etherlink wallet sessions before reconnecting.",
      enabled: input.tezosWalletConnected || input.etherlinkWalletConnected,
    },
    {
      id: "reset-networks",
      label: "Reset chain networks",
      detail: "Remove local Tezos and Etherlink network overrides so mainnet is used.",
      enabled:
        normalizedNetwork(input.tezosNetwork) !== "mainnet" ||
        normalizedNetwork(input.etherlinkNetwork) !== "mainnet",
    },
    {
      id: "clear-window-session",
      label: "Clear shell session",
      detail: "Forget the saved desktop windows and reload into Recovery Mode.",
      enabled: input.windowSessionPresent,
    },
    {
      id: "export-report",
      label: "Export recovery report",
      detail: "Download local health, wallet, network, shell, and browser state as JSON.",
      enabled: true,
    },
    {
      id: "check-filesystem",
      label: "Check filesystem",
      detail: "Refresh health and media-cache probes used to detect filesystem pressure.",
      enabled: true,
    },
    {
      id: "open-emergency-shell",
      label: "Emergency shell",
      detail: "Open the allowlisted Terminal for health, job, access, and route checks.",
      enabled: true,
    },
  ];

  const operatorActions: RecoveryAction[] = [
    {
      id: "permissions-reset",
      label: "Permissions reset",
      detail: "Admin-only identity repair remains behind the Admin surface.",
      operatorOnly: true,
      enabled: isAdmin,
    },
    {
      id: "app-rollback",
      label: "App rollback",
      detail: "Admin-only app gate changes stay in the registered Admin surface.",
      operatorOnly: true,
      enabled: isAdmin,
    },
    {
      id: "restore-proof",
      label: "Backup restore proof",
      detail: "Restore proof is operator-gated and must be verified before safety claims.",
      operatorOnly: true,
      enabled: isAdmin,
    },
    {
      id: "disable-drivers",
      label: "Disable drivers",
      detail: "Driver and app-gate quarantine stays in the registered Admin surface.",
      operatorOnly: true,
      enabled: isAdmin,
    },
  ];

  return {
    severity: highestSeverity(incidents),
    incidents,
    actions,
    operatorActions,
  };
}
