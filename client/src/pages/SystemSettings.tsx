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

  function chooseLocale(nextLocale: string) {
    setLocale(nextLocale);
    logClientSystemEvent({
      eventType: "system_settings.language_changed",
      metadata: { locale: nextLocale },
    });
  }

  return (
    <AppWindow title={t("systemSettings.title")}>
      <Shell data-testid="system-settings">
        <StatusGrid>
          <StatusCell>
            <StatusLabel>{t("systemSettings.status.role")}</StatusLabel>
            <StatusValue>{user?.role ?? "session"}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>{t("systemSettings.status.visible")}</StatusLabel>
            <StatusValue>{visibleSettings.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>{t("systemSettings.status.admin")}</StatusLabel>
            <StatusValue>
              {isAdmin ? t("systemSettings.admin.enabled") : t("systemSettings.admin.hidden")}
            </StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>{t("systemSettings.status.mode")}</StatusLabel>
            <StatusValue>{interfaceMode}</StatusValue>
          </StatusCell>
        </StatusGrid>

        <Separator />

        <UiPanel title={t("systemSettings.panel.system")} compact>
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
                    {t("systemSettings.openSetting", { label: setting.label })}
                  </OpenButton>
                </Card>
              );
            })}
          </CardGrid>
        </UiPanel>

        <UiPanel title={t("systemSettings.panel.language")} compact>
          <Card>
            <IconBox>
              <Globe2 size={17} aria-hidden />
            </IconBox>
            <div>
              <CardTitle>{t("systemSettings.language.title")}</CardTitle>
              <CardMeta>
                {t("systemSettings.language.detail")}
              </CardMeta>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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

        <UiPanel title={t("systemSettings.panel.interface")} compact>
          <Card>
            <IconBox>
              <TerminalSquare size={17} aria-hidden />
            </IconBox>
            <div>
              <CardTitle>{t("systemSettings.interface.title")}</CardTitle>
              <CardMeta>
                {t("systemSettings.interface.detail")}
              </CardMeta>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <OpenButton
                active={interfaceMode === "desktop"}
                onClick={() => chooseInterfaceMode("desktop")}
              >
                {t("systemSettings.interface.desktop")}
              </OpenButton>
              <OpenButton
                active={interfaceMode === "cli"}
                onClick={() => chooseInterfaceMode("cli")}
              >
                {t("systemSettings.interface.cli")}
              </OpenButton>
            </div>
          </Card>
        </UiPanel>

        <UiPanel title={t("systemSettings.panel.boundary")} compact tone="info">
          <Card>
            <IconBox>
              <ShieldCheck size={17} aria-hidden />
            </IconBox>
            <div>
              <CardTitle>{t("systemSettings.boundary.title")}</CardTitle>
              <CardMeta>
                {t("systemSettings.boundary.detail")}
              </CardMeta>
            </div>
            <OpenButton
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
