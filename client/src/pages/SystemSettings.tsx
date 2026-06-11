import { useEffect, useMemo } from "react";
import { Separator } from "react95";
import {
  Bell,
  Brush,
  Command,
  DatabaseBackup,
  FolderCog,
  Gauge,
  Globe2,
  IdCard,
  LifeBuoy,
  LockKeyhole,
  MonitorCog,
  Radio,
  Settings,
  ShieldCheck,
  TerminalSquare,
  WalletCards,
} from "lucide-react";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { UiButton, UiPanel } from "../components/wtfos-ui";
import {
  getInterfaceMode,
  setInterfaceMode,
} from "../features/wtfos-cli/interface-mode";
import { useAuth } from "../lib/auth-context";
import { logClientSystemEvent } from "../lib/system-log";

type SettingCard = {
  id: string;
  label: string;
  route: string;
  owner: string;
  detail: string;
  icon: typeof Settings;
  adminOnly?: boolean;
};

const Shell = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--wtf-space-2, 8px);

  @media (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 460px) {
    grid-template-columns: 1fr;
  }
`;

const StatusCell = styled.div`
  min-height: 58px;
  padding: var(--wtf-space-2, 8px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  color: var(--wtf-app-text, #111);
`;

const StatusLabel = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
  color: var(--wtf-app-muted-text, #384352);
  line-height: 1.25;
`;

const StatusValue = styled.div`
  margin-top: 4px;
  font-size: var(--wtf-type-body, 15px);
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--wtf-space-2, 8px);

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const Card = styled.div`
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  min-height: 72px;
  padding: var(--wtf-space-2, 8px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  color: var(--wtf-app-text, #111);
  min-width: 0;

  @media (max-width: 560px) {
    grid-template-columns: 32px minmax(0, 1fr);
  }
`;

const IconBox = styled.div`
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-control-bg, #ffffff);
  color: var(--wtf-app-text, #111);
`;

const CardTitle = styled.div`
  font-size: var(--wtf-type-body, 15px);
  font-weight: bold;
  overflow-wrap: anywhere;
  line-height: 1.25;
`;

const CardMeta = styled.div`
  margin-top: 2px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #384352);
  overflow-wrap: anywhere;
  line-height: 1.35;
`;

const OpenButton = styled(UiButton)`
  min-width: 116px;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: var(--wtf-type-caption, 13px);
  white-space: normal;

  @media (max-width: 560px) {
    grid-column: 1 / -1;
    width: 100%;
    min-height: 44px;
  }
`;

export function SystemSettings() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = user?.role === "admin";

  const settings = useMemo<SettingCard[]>(
    () => [
      {
        id: "profile",
        label: "Account Profile",
        route: "/profile",
        owner: "Identity",
        detail: "name, avatar, public profile, social links, password",
        icon: IdCard,
      },
      {
        id: "commands",
        label: "Command Palette",
        route: "/command-palette",
        owner: "Desktop OS",
        detail: "app launcher, route search, workflow commands",
        icon: Command,
      },
      {
        id: "appearance",
        label: "Theme Builder",
        route: "/theme-builder",
        owner: "Desktop OS",
        detail: "OS appearance, theme colors, wallpaper, cursor, physics mode",
        icon: Brush,
      },
      {
        id: "notifications",
        label: "Notifications",
        route: "/notification-center",
        owner: "Inbox",
        detail: "notification preferences, unread items, linked targets",
        icon: Bell,
      },
      {
        id: "files",
        label: "Files and Dwellings",
        route: "/file-manager",
        owner: "File Manager",
        detail: "Desktop, Projects, Media, Vault, Apps, Chain, Archives",
        icon: FolderCog,
      },
      {
        id: "wallet",
        label: "Wallet and Portfolio",
        route: "/dashboard",
        owner: "Cockpit",
        detail: "active wallet, holdings, balances, sync state",
        icon: WalletCards,
      },
      {
        id: "subdomains",
        label: "Subdomain Setup",
        route: "/wtf-subdomains/setup",
        owner: "WTF Domains",
        detail: "claim username.wtfos.me and prepare wtf.tez setup",
        icon: Globe2,
      },
      {
        id: "w",
        label: "W Social",
        route: "/w",
        owner: "W",
        detail: "scraped X timeline cache and read-only Gameshow chat",
        icon: Radio,
      },
      {
        id: "terminal",
        label: "Terminal",
        route: "/terminal",
        owner: "Desktop OS",
        detail: "embedded safe commands, health checks, jobs, access routes",
        icon: TerminalSquare,
      },
      {
        id: "cli",
        label: "CLI Shell",
        route: "/cli",
        owner: "Desktop OS",
        detail: "full-screen CLI/TUI using the same safe command kernel",
        icon: TerminalSquare,
      },
      {
        id: "recovery",
        label: "Recovery Mode",
        route: "/recovery-mode",
        owner: "Recovery",
        detail: "wallet disconnect, network reset, shell report export",
        icon: LifeBuoy,
      },
      {
        id: "admin",
        label: "Admin Panel",
        route: "/admin",
        owner: "Admin",
        detail: "permissions, app gates, users, logs, content",
        icon: LockKeyhole,
        adminOnly: true,
      },
      {
        id: "backup",
        label: "Backup Manager",
        route: "/backup-manager",
        owner: "Admin",
        detail: "restore proof, backup artifact, checksum, target safety",
        icon: DatabaseBackup,
        adminOnly: true,
      },
      {
        id: "control",
        label: "Control Board",
        route: "/control-board",
        owner: "Gameshow Admin",
        detail: "round operations, host actions, contestant state",
        icon: Gauge,
        adminOnly: true,
      },
    ],
    []
  );

  const visibleSettings = settings.filter((setting) => !setting.adminOnly || isAdmin);
  const visibleSettingIds = visibleSettings.map((setting) => setting.id).join(",");
  const interfaceMode = getInterfaceMode();

  useEffect(() => {
    logClientSystemEvent({
      eventType: "system_settings.viewed",
      metadata: {
        role: user?.role ?? null,
        visibleSettings: visibleSettingIds.split(",").filter(Boolean),
      },
    });
  }, [user?.role, visibleSettingIds]);

  function openSetting(setting: SettingCard) {
    logClientSystemEvent({
      eventType: "system_settings.opened",
      metadata: { setting: setting.id, route: setting.route },
    });
    setLocation(setting.route);
  }

  function chooseInterfaceMode(mode: "desktop" | "cli") {
    setInterfaceMode(mode);
    logClientSystemEvent({
      eventType: "system_settings.interface_mode_changed",
      metadata: { mode },
    });
    if (mode === "cli") {
      setLocation("/cli");
      return;
    }
    setLocation("/mission-control");
  }

  return (
    <AppWindow title="Settings">
      <Shell data-testid="system-settings">
        <StatusGrid>
          <StatusCell>
            <StatusLabel>Role</StatusLabel>
            <StatusValue>{user?.role ?? "session"}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Visible</StatusLabel>
            <StatusValue>{visibleSettings.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Admin</StatusLabel>
            <StatusValue>{isAdmin ? "enabled" : "hidden"}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Mode</StatusLabel>
            <StatusValue>{interfaceMode}</StatusValue>
          </StatusCell>
        </StatusGrid>

        <Separator />

        <UiPanel title="System settings" compact>
          <CardGrid>
            {visibleSettings.map((setting) => {
              const Icon = setting.icon;
              return (
                <Card key={setting.id}>
                  <IconBox>
                    <Icon size={17} aria-hidden />
                  </IconBox>
                  <div>
                    <CardTitle>{setting.label}</CardTitle>
                    <CardMeta>
                      {setting.owner} - {setting.detail}
                    </CardMeta>
                  </div>
                  <OpenButton onClick={() => openSetting(setting)}>
                    <MonitorCog size={14} aria-hidden />
                    Open {setting.label}
                  </OpenButton>
                </Card>
              );
            })}
          </CardGrid>
        </UiPanel>

        <UiPanel title="Interface" compact>
          <Card>
            <IconBox>
              <TerminalSquare size={17} aria-hidden />
            </IconBox>
            <div>
              <CardTitle>Choose your wtfOS interface</CardTitle>
              <CardMeta>
                Desktop is the default windowed experience. CLI is the full-screen safe
                command-line interface powered by the same kernel as Terminal.
              </CardMeta>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <OpenButton
                active={interfaceMode === "desktop"}
                onClick={() => chooseInterfaceMode("desktop")}
              >
                Use desktop
              </OpenButton>
              <OpenButton
                active={interfaceMode === "cli"}
                onClick={() => chooseInterfaceMode("cli")}
              >
                Use CLI
              </OpenButton>
            </div>
          </Card>
        </UiPanel>

        <UiPanel title="Boundary" compact tone="info">
          <Card>
            <IconBox>
              <ShieldCheck size={17} aria-hidden />
            </IconBox>
            <div>
              <CardTitle>Settings ownership stays with each app</CardTitle>
              <CardMeta>
                This hub routes to existing owner surfaces and does not bypass their permissions,
                wallet preflights, CSRF rules, or admin gates.
              </CardMeta>
            </div>
            <OpenButton
              onClick={() =>
                openSetting({
                  id: "mission",
                  label: "Mission Control",
                  route: "/mission-control",
                  owner: "Mission Control",
                  detail: "",
                  icon: Settings,
                })
              }
            >
              <Settings size={14} aria-hidden />
              Open Mission Control
            </OpenButton>
          </Card>
        </UiPanel>
      </Shell>
    </AppWindow>
  );
}
