import { useEffect, useMemo } from "react";
import { Button, GroupBox, Separator } from "react95";
import {
  Bell,
  Brush,
  Command,
  DatabaseBackup,
  FolderCog,
  Gauge,
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
  gap: 8px;
  min-width: 0;
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
  min-height: 58px;
  padding: 7px;
  border: 1px solid #808080;
  background: #eeeeee;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
`;

const StatusLabel = styled.div`
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  color: #404040;
`;

const StatusValue = styled.div`
  margin-top: 4px;
  font-size: 14px;
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const Card = styled.div`
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 68px;
  padding: 7px;
  border: 1px solid #9a9a9a;
  background: #f2f2f2;

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

const CardTitle = styled.div`
  font-size: 12px;
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const CardMeta = styled.div`
  margin-top: 2px;
  font-size: 11px;
  color: #404040;
  overflow-wrap: anywhere;
`;

const OpenButton = styled(Button)`
  min-width: 88px;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 11px;

  @media (max-width: 560px) {
    grid-column: 1 / -1;
    width: 100%;
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
        detail: "theme colors, wallpaper, cursor, physics mode",
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
        id: "w",
        label: "W Social",
        route: "/w",
        owner: "W",
        detail: "X connection, stream rules, groupchat, Spaces",
        icon: Radio,
      },
      {
        id: "terminal",
        label: "Terminal",
        route: "/terminal",
        owner: "Desktop OS",
        detail: "safe commands, health checks, jobs, access routes",
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
            <StatusValue>route hub</StatusValue>
          </StatusCell>
        </StatusGrid>

        <Separator />

        <GroupBox label="System Settings">
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
                    Open
                  </OpenButton>
                </Card>
              );
            })}
          </CardGrid>
        </GroupBox>

        <GroupBox label="Boundary">
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
              Status
            </OpenButton>
          </Card>
        </GroupBox>
      </Shell>
    </AppWindow>
  );
}
