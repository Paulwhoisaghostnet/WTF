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
import { useLocalization } from "../lib/localization";
import {
  getInterfaceMode,
  setInterfaceMode,
} from "../features/wtfos-cli/interface-mode";
import { useAuth } from "../lib/auth-context";
import {
  presentationRouteHref,
  usePresentationShell,
} from "../lib/presentation-shell";
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

  &[data-system-settings-presentation-host="gamma"] {
    color: var(--gamma-milk, #f2ead9);
    background: #070706;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }

  &[data-system-settings-presentation-host="gamma"],
  &[data-system-settings-presentation-host="gamma"] * {
    box-shadow: none;
    text-shadow: none;
  }

  &[data-system-settings-presentation-host="gamma"] [data-system-settings-region] {
    background-image: none;
    border-color: rgba(242, 234, 217, 0.18);
    border-radius: 6px;
  }

  &[data-system-settings-presentation-host="gamma"] [data-system-settings-region="panel"],
  &[data-system-settings-presentation-host="gamma"] [data-system-settings-region="card"],
  &[data-system-settings-presentation-host="gamma"] [data-system-settings-region="status-cell"] {
    color: var(--gamma-milk, #f2ead9);
    background: rgba(17, 17, 15, 0.86);
    border: 1px solid rgba(242, 234, 217, 0.18);
  }

  &[data-system-settings-presentation-host="gamma"] [data-system-settings-region="separator"] {
    height: 1px;
    overflow: hidden;
    border: 0;
    background: rgba(242, 234, 217, 0.18);
  }

  &[data-system-settings-presentation-host="gamma"] [data-system-settings-region="icon"] {
    color: var(--gamma-cyan, #00d2ff);
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.18);
  }

  &[data-system-settings-presentation-host="gamma"] [data-system-settings-region="actions"] {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  &[data-system-settings-presentation-host="gamma"] h2,
  &[data-system-settings-presentation-host="gamma"] [data-system-settings-region="card-title"],
  &[data-system-settings-presentation-host="gamma"] [data-system-settings-region="status-value"] {
    color: var(--gamma-milk, #f2ead9);
    letter-spacing: 0;
  }

  &[data-system-settings-presentation-host="gamma"] [data-system-settings-region="status-label"],
  &[data-system-settings-presentation-host="gamma"] [data-system-settings-region="card-meta"] {
    color: rgba(242, 234, 217, 0.68);
  }

  &[data-system-settings-presentation-host="gamma"] button {
    color: var(--gamma-cyan, #00d2ff);
    background: #070706;
    border: 1px solid rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  &[data-system-settings-presentation-host="gamma"] button[aria-pressed="true"],
  &[data-system-settings-presentation-host="gamma"] button[data-system-settings-active="true"] {
    color: #070706;
    background: var(--gamma-cyan, #00d2ff);
    border-color: var(--gamma-cyan, #00d2ff);
  }
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

const LanguageControl = styled.label`
  display: grid;
  gap: 4px;
  min-width: 180px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;

  select {
    min-height: 32px;
    padding: 4px 6px;
    border: 1px solid var(--wtf-app-border, #808080);
    background: var(--wtf-app-control-bg, #ffffff);
    color: var(--wtf-app-text, #111);
    font: inherit;
  }
`;

export function SystemSettings() {
  const { user } = useAuth();
  const {
    locale,
    localeOptions,
    setLocale,
    t,
  } = useLocalization();
  const [, setLocation] = useLocation();
  const presentation = usePresentationShell();
  const isAdmin = user?.role === "admin";

  const settings = useMemo<SettingCard[]>(
    () => [
      {
        id: "profile",
        label: t("settingsCard.profile.label"),
        route: "/profile",
        owner: t("settingsCard.profile.owner"),
        detail: t("settingsCard.profile.detail"),
        icon: IdCard,
      },
      {
        id: "commands",
        label: t("settingsCard.commands.label"),
        route: "/command-palette",
        owner: t("settingsCard.commands.owner"),
        detail: t("settingsCard.commands.detail"),
        icon: Command,
      },
      {
        id: "appearance",
        label: t("settingsCard.appearance.label"),
        route: "/theme-builder",
        owner: t("settingsCard.appearance.owner"),
        detail: t("settingsCard.appearance.detail"),
        icon: Brush,
      },
      {
        id: "notifications",
        label: t("settingsCard.notifications.label"),
        route: "/notification-center",
        owner: t("settingsCard.notifications.owner"),
        detail: t("settingsCard.notifications.detail"),
        icon: Bell,
      },
      {
        id: "files",
        label: t("settingsCard.files.label"),
        route: "/file-manager",
        owner: t("settingsCard.files.owner"),
        detail: t("settingsCard.files.detail"),
        icon: FolderCog,
      },
      {
        id: "wallet",
        label: t("settingsCard.wallet.label"),
        route: "/dashboard",
        owner: t("settingsCard.wallet.owner"),
        detail: t("settingsCard.wallet.detail"),
        icon: WalletCards,
      },
      {
        id: "subdomains",
        label: t("settingsCard.subdomains.label"),
        route: "/wtf-subdomains/setup",
        owner: t("settingsCard.subdomains.owner"),
        detail: t("settingsCard.subdomains.detail"),
        icon: Globe2,
      },
      {
        id: "w",
        label: t("settingsCard.w.label"),
        route: "/w",
        owner: t("settingsCard.w.owner"),
        detail: t("settingsCard.w.detail"),
        icon: Radio,
      },
      {
        id: "terminal",
        label: t("settingsCard.terminal.label"),
        route: "/terminal",
        owner: t("settingsCard.terminal.owner"),
        detail: t("settingsCard.terminal.detail"),
        icon: TerminalSquare,
      },
      {
        id: "cli",
        label: t("settingsCard.cli.label"),
        route: "/cli",
        owner: t("settingsCard.cli.owner"),
        detail: t("settingsCard.cli.detail"),
        icon: TerminalSquare,
      },
      {
        id: "recovery",
        label: t("settingsCard.recovery.label"),
        route: "/recovery-mode",
        owner: t("settingsCard.recovery.owner"),
        detail: t("settingsCard.recovery.detail"),
        icon: LifeBuoy,
      },
      {
        id: "admin",
        label: t("settingsCard.admin.label"),
        route: "/admin",
        owner: t("settingsCard.admin.owner"),
        detail: t("settingsCard.admin.detail"),
        icon: LockKeyhole,
        adminOnly: true,
      },
      {
        id: "backup",
        label: t("settingsCard.backup.label"),
        route: "/backup-manager",
        owner: t("settingsCard.backup.owner"),
        detail: t("settingsCard.backup.detail"),
        icon: DatabaseBackup,
        adminOnly: true,
      },
      {
        id: "control",
        label: t("settingsCard.control.label"),
        route: "/control-board",
        owner: t("settingsCard.control.owner"),
        detail: t("settingsCard.control.detail"),
        icon: Gauge,
        adminOnly: true,
      },
    ],
    [t]
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
    setLocation(presentationRouteHref(setting.route, presentation.host));
  }

  function chooseInterfaceMode(mode: "desktop" | "cli") {
    setInterfaceMode(mode);
    logClientSystemEvent({
      eventType: "system_settings.interface_mode_changed",
      metadata: { mode },
    });
    if (mode === "cli") {
      setLocation(presentationRouteHref("/cli", presentation.host));
      return;
    }
    setLocation(presentationRouteHref("/mission-control", presentation.host));
  }

  function chooseLocale(nextLocale: string) {
    setLocale(nextLocale);
    logClientSystemEvent({
      eventType: "system_settings.language_changed",
      metadata: { locale: nextLocale },
    });
  }

  return (
    <AppWindow title={t("systemSettings.title")}>
      <Shell
        data-testid="system-settings"
        data-system-settings-presentation-host={presentation.host}
        data-system-settings-surface="settings"
        data-system-settings-region="surface"
      >
        <StatusGrid data-system-settings-region="status-grid">
          <StatusCell data-system-settings-region="status-cell">
            <StatusLabel data-system-settings-region="status-label">{t("systemSettings.status.role")}</StatusLabel>
            <StatusValue data-system-settings-region="status-value">{user?.role ?? "session"}</StatusValue>
          </StatusCell>
          <StatusCell data-system-settings-region="status-cell">
            <StatusLabel data-system-settings-region="status-label">{t("systemSettings.status.visible")}</StatusLabel>
            <StatusValue data-system-settings-region="status-value">{visibleSettings.length}</StatusValue>
          </StatusCell>
          <StatusCell data-system-settings-region="status-cell">
            <StatusLabel data-system-settings-region="status-label">{t("systemSettings.status.admin")}</StatusLabel>
            <StatusValue data-system-settings-region="status-value">
              {isAdmin ? t("systemSettings.admin.enabled") : t("systemSettings.admin.hidden")}
            </StatusValue>
          </StatusCell>
          <StatusCell data-system-settings-region="status-cell">
            <StatusLabel data-system-settings-region="status-label">{t("systemSettings.status.mode")}</StatusLabel>
            <StatusValue data-system-settings-region="status-value">{interfaceMode}</StatusValue>
          </StatusCell>
        </StatusGrid>

        <div data-system-settings-region="separator">
          <Separator />
        </div>

        <UiPanel title={t("systemSettings.panel.system")} compact data-system-settings-region="panel">
          <CardGrid data-system-settings-region="card-grid">
            {visibleSettings.map((setting) => {
              const Icon = setting.icon;
              return (
                <Card key={setting.id} data-system-settings-region="card" data-system-settings-card={setting.id}>
                  <IconBox data-system-settings-region="icon">
                    <Icon size={17} aria-hidden />
                  </IconBox>
                  <div>
                    <CardTitle data-system-settings-region="card-title">{setting.label}</CardTitle>
                    <CardMeta data-system-settings-region="card-meta">
                      {setting.owner} - {setting.detail}
                    </CardMeta>
                  </div>
                  <OpenButton onClick={() => openSetting(setting)} data-system-settings-region="open-button">
                    <MonitorCog size={14} aria-hidden />
                    {t("systemSettings.openSetting", { label: setting.label })}
                  </OpenButton>
                </Card>
              );
            })}
          </CardGrid>
        </UiPanel>

        <UiPanel title={t("systemSettings.panel.language")} compact data-system-settings-region="panel" data-system-settings-panel="language">
          <Card data-system-settings-region="card" data-system-settings-card="language-region">
            <IconBox data-system-settings-region="icon">
              <Globe2 size={17} aria-hidden />
            </IconBox>
            <div>
              <CardTitle data-system-settings-region="card-title">{t("systemSettings.language.title")}</CardTitle>
              <CardMeta data-system-settings-region="card-meta">
                {t("systemSettings.language.detail")}
              </CardMeta>
            </div>
            <div data-system-settings-region="actions">
              <LanguageControl>
                <span>{t("systemSettings.language.label")}</span>
                <select
                  data-testid="language-region-display-language"
                  aria-label={t("systemSettings.language.label")}
                  value={locale}
                  onChange={(event) => chooseLocale(event.currentTarget.value)}
                >
                  {localeOptions.map((option) => (
                    <option key={option.locale} value={option.locale}>
                      {option.nativeName}
                      {option.testingOnly ? " (test)" : ""}
                    </option>
                  ))}
                </select>
              </LanguageControl>
            </div>
          </Card>
        </UiPanel>

        <UiPanel title={t("systemSettings.panel.interface")} compact data-system-settings-region="panel" data-system-settings-panel="interface">
          <Card data-system-settings-region="card" data-system-settings-card="interface">
            <IconBox data-system-settings-region="icon">
              <TerminalSquare size={17} aria-hidden />
            </IconBox>
            <div>
              <CardTitle data-system-settings-region="card-title">{t("systemSettings.interface.title")}</CardTitle>
              <CardMeta data-system-settings-region="card-meta">
                {t("systemSettings.interface.detail")}
              </CardMeta>
            </div>
            <div data-system-settings-region="actions">
              <OpenButton
                active={interfaceMode === "desktop"}
                aria-pressed={interfaceMode === "desktop"}
                data-system-settings-active={interfaceMode === "desktop" ? "true" : "false"}
                data-system-settings-region="mode-button"
                onClick={() => chooseInterfaceMode("desktop")}
              >
                {t("systemSettings.interface.desktop")}
              </OpenButton>
              <OpenButton
                active={interfaceMode === "cli"}
                aria-pressed={interfaceMode === "cli"}
                data-system-settings-active={interfaceMode === "cli" ? "true" : "false"}
                data-system-settings-region="mode-button"
                onClick={() => chooseInterfaceMode("cli")}
              >
                {t("systemSettings.interface.cli")}
              </OpenButton>
            </div>
          </Card>
        </UiPanel>

        <UiPanel title={t("systemSettings.panel.boundary")} compact tone="info" data-system-settings-region="panel" data-system-settings-panel="boundary">
          <Card data-system-settings-region="card" data-system-settings-card="boundary">
            <IconBox data-system-settings-region="icon">
              <ShieldCheck size={17} aria-hidden />
            </IconBox>
            <div>
              <CardTitle data-system-settings-region="card-title">{t("systemSettings.boundary.title")}</CardTitle>
              <CardMeta data-system-settings-region="card-meta">
                {t("systemSettings.boundary.detail")}
              </CardMeta>
            </div>
            <OpenButton
              data-system-settings-region="open-button"
              onClick={() =>
                openSetting({
                  id: "mission",
                  label: t("route.missionControl.title"),
                  route: "/mission-control",
                  owner: t("route.missionControl.title"),
                  detail: "",
                  icon: Settings,
                })
              }
            >
              <Settings size={14} aria-hidden />
              {t("systemSettings.boundary.openMissionControl")}
            </OpenButton>
          </Card>
        </UiPanel>
      </Shell>
    </AppWindow>
  );
}
