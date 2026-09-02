import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TextInput } from "react95";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  UserRoundCog,
} from "lucide-react";
import styled from "styled-components";
import {
  DESKTOP_APPEARANCE_STYLES,
  DESKTOP_BACKGROUND_FITS,
  DESKTOP_CHAT_TYPOGRAPHY_PRESETS,
  DESKTOP_COLOR_SCHEMES,
  DESKTOP_CURSOR_LABELS,
  DESKTOP_CURSOR_STYLES,
  DESKTOP_GRAVITY_MODES,
} from "@shared/desktop";
import { LOCALE_METADATA, SUPPORTED_LOCALES } from "@shared/localization";
import {
  WTF_CURSE_DEFINITIONS,
  type WtfCurseKey,
} from "@shared/curses";
import { formatRoleLabel, type RoleDefinition, type UserRole } from "@shared/types";
import { WalletDossier } from "../../../components/WalletDossier";
import {
  UiButton,
  UiEmptyState,
  UiField,
  UiNotice,
  UiPanel,
  UiStatusPill,
  UiTabs,
} from "../../../components/wtfos-ui";
import { api } from "../../../lib/api";
import type {
  AdminUser,
  AdminUserDesktopSettings,
  AdminUserPassport as AdminUserPassportData,
  AssignUserRolePayload,
  AwardXpPayload,
  ClearUserSocialPayload,
  RemoveUserRolePayload,
  SetTempPasswordPayload,
  TempPasswordResult,
  UpdateIdentityPayload,
  UpdateUserCursePayload,
} from "../types";
import {
  AdminDetailHeader,
  AdminScopeMetric,
  AdminScopeSummaryGrid,
} from "./AdminScopeWorkspace";

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending: boolean;
};

type PassportTab = "summary" | "access" | "settings" | "recovery" | "assets";

const Stack = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;
`;

const TwoColumn = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--wtf-space-3, 12px);
  min-width: 0;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--wtf-space-2, 8px);
  min-width: 0;
`;

const ActionRow = styled.div`
  display: flex;
  align-items: center;
  gap: var(--wtf-space-2, 8px);
  flex-wrap: wrap;
  min-width: 0;
`;

const TokenRow = styled.div`
  display: flex;
  align-items: center;
  gap: var(--wtf-space-1, 4px);
  flex-wrap: wrap;
  min-width: 0;
`;

const NativeSelect = styled.select`
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--wtf-app-control-border, #808080);
  background: var(--wtf-app-control-bg, #fff);
  color: var(--wtf-app-text, #111);
  padding: 6px 8px;
  font: inherit;
`;

const CheckboxLabel = styled.label`
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--wtf-app-control-border, #808080);
  background: var(--wtf-app-control-bg, #fff);
  padding: 6px 8px;
  cursor: pointer;
`;

const DefinitionList = styled.dl`
  display: grid;
  grid-template-columns: minmax(130px, 0.42fr) minmax(0, 1fr);
  gap: 0;
  margin: 0;
  border: 1px solid var(--wtf-app-border, #808080);
  min-width: 0;

  dt,
  dd {
    margin: 0;
    padding: 7px 8px;
    border-bottom: 1px solid var(--wtf-app-border, #808080);
    overflow-wrap: anywhere;
  }

  dt {
    background: var(--wtf-app-surface, #f4f4f4);
    font-weight: 700;
  }

  dd {
    background: var(--wtf-app-surface-raised, #fff);
  }

  dt:last-of-type,
  dd:last-of-type {
    border-bottom: 0;
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;

    dt {
      border-bottom: 0;
    }
  }
`;

const ScrollList = styled.div`
  max-height: 310px;
  overflow: auto;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #fff);
  scrollbar-gutter: stable;
`;

const ListItem = styled.div`
  padding: 8px;
  border-bottom: 1px solid var(--wtf-app-border, #808080);
  overflow-wrap: anywhere;

  &:last-child {
    border-bottom: 0;
  }

  strong,
  small {
    display: block;
  }

  small {
    margin-top: 3px;
    color: var(--wtf-app-muted-text, #444);
  }
`;

const JsonBlock = styled.pre`
  margin: 0;
  max-height: 290px;
  overflow: auto;
  border: 1px solid var(--wtf-app-border, #808080);
  background: #15171a;
  color: #f7f7f7;
  padding: 10px;
  font: 12px/1.45 var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  scrollbar-gutter: stable;
`;

const UserLinkButton = styled.button`
  border: 0;
  background: transparent;
  color: var(--wtf-app-link, #000080);
  padding: 0;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
`;

function displayDate(value: string | Date | null | undefined): string {
  if (!value) return "Not set";
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
}

function statusLabel(value: boolean) {
  return value ? "Yes" : "No";
}

function ConfirmAction({
  label,
  confirmLabel,
  onConfirm,
  disabled,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <UiButton compact disabled={disabled} onClick={() => setConfirming(true)}>
        {label}
      </UiButton>
    );
  }
  return (
    <ActionRow>
      <UiButton compact uiVariant="danger" disabled={disabled} onClick={onConfirm}>
        {confirmLabel}
      </UiButton>
      <UiButton compact onClick={() => setConfirming(false)}>
        Cancel
      </UiButton>
    </ActionRow>
  );
}

export type AdminUserPassportProps = {
  selectedUser: AdminUser | null;
  onBack: () => void;
  onDeleted: () => void;
  roleCatalog: RoleDefinition[] | undefined;
  tempPasswordInput: { password: string; expiryHours: string };
  setTempPasswordInput: (value: { password: string; expiryHours: string }) => void;
  tempPasswordResult: TempPasswordResult | null | undefined;
  assignUserRoleMutation: AdminMutation<AssignUserRolePayload>;
  removeUserRoleMutation: AdminMutation<RemoveUserRolePayload>;
  updateUserCurseMutation: AdminMutation<UpdateUserCursePayload>;
  awardXpMutation: AdminMutation<AwardXpPayload>;
  updateIdentityMutation: AdminMutation<UpdateIdentityPayload>;
  clearUserSocialMutation: AdminMutation<ClearUserSocialPayload>;
  deleteUserMutation: AdminMutation<number>;
  canDeleteUsers: boolean;
  setTempPasswordMutation: AdminMutation<SetTempPasswordPayload>;
  clearTempPasswordMutation: AdminMutation<number>;
};

export function AdminUserPassport({
  selectedUser,
  onBack,
  onDeleted,
  roleCatalog,
  tempPasswordInput,
  setTempPasswordInput,
  tempPasswordResult,
  assignUserRoleMutation,
  removeUserRoleMutation,
  updateUserCurseMutation,
  awardXpMutation,
  updateIdentityMutation,
  clearUserSocialMutation,
  deleteUserMutation,
  canDeleteUsers,
  setTempPasswordMutation,
  clearTempPasswordMutation,
}: AdminUserPassportProps) {
  const queryClient = useQueryClient();
  const userId = selectedUser?.id ?? null;
  const passportQuery = useQuery({
    queryKey: ["admin", "user-passport", userId],
    queryFn: () => api.get<AdminUserPassportData>(`/api/admin/users/${userId}/passport`),
    enabled: userId != null,
  });
  const passport = passportQuery.data;
  const [activeTab, setActiveTab] = useState<PassportTab>("summary");
  const [identityDraft, setIdentityDraft] = useState({ username: "", displayName: "" });
  const [roleToAdd, setRoleToAdd] = useState<UserRole | "">("");
  const [curseDraft, setCurseDraft] = useState<{ key: WtfCurseKey | ""; reason: string }>({
    key: "",
    reason: "",
  });
  const [xpDraft, setXpDraft] = useState({ amount: "", reason: "" });
  const [settingsDraft, setSettingsDraft] = useState<AdminUserDesktopSettings | null>(null);

  useEffect(() => {
    setActiveTab("summary");
  }, [userId]);

  useEffect(() => {
    if (!passport) return;
    setIdentityDraft({
      username: passport.user.username,
      displayName: passport.user.displayName ?? "",
    });
    setSettingsDraft(structuredClone(passport.desktopSettings));
  }, [passport]);

  const desktopSettingsMutation = useMutation({
    mutationFn: (settings: AdminUserDesktopSettings) =>
      api.put<AdminUserDesktopSettings>(
        `/api/admin/users/${userId}/passport/desktop-settings`,
        settings
      ),
    onSuccess: (settings) => {
      setSettingsDraft(structuredClone(settings));
      queryClient.invalidateQueries({ queryKey: ["admin", "user-passport", userId] });
    },
  });

  const assignableRoles = useMemo(
    () => (roleCatalog ?? []).filter((role) => role.isAssignable),
    [roleCatalog]
  );
  const grantedPermissions = useMemo(
    () =>
      Object.entries(passport?.effectivePermissions ?? {})
        .filter(([, granted]) => granted)
        .map(([permission]) => permission)
        .sort(),
    [passport?.effectivePermissions]
  );

  if (!selectedUser) {
    return (
      <UiEmptyState title="Choose a user to open their WTF Passport">
        The passport is the acute account view for identity, access, curses, wtfOS settings,
        recovery controls, wallets, domains, and recent activity.
      </UiEmptyState>
    );
  }

  if (passportQuery.isLoading) {
    return <UiNotice>Loading the complete WTF Passport for @{selectedUser.username}…</UiNotice>;
  }

  if (passportQuery.isError || !passport) {
    return (
      <UiEmptyState
        title="The WTF Passport could not be loaded"
        action={
          <UiButton compact onClick={() => passportQuery.refetch()}>
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </UiButton>
        }
      >
        The roster remains available. Retry before changing account state so the acute view is
        based on current data.
      </UiEmptyState>
    );
  }

  const user = passport.user;
  const activeCurseKeys = new Set(passport.curses.map((curse) => curse.key));
  const settingsChanged =
    settingsDraft != null &&
    JSON.stringify(settingsDraft) !== JSON.stringify(passport.desktopSettings);

  return (
    <Stack data-admin-user-passport data-admin-user-id={user.id}>
      <AdminDetailHeader
        title={`${user.displayName || user.username} · WTF Passport`}
        description={`@${user.username} · User #${user.id} · Generated ${displayDate(passport.generatedAt)}`}
        onBack={onBack}
        actions={
          <UiButton compact onClick={() => passportQuery.refetch()} disabled={passportQuery.isFetching}>
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </UiButton>
        }
      />

      <AdminScopeSummaryGrid>
        <AdminScopeMetric>
          <strong>{passport.highestRole?.label ?? formatRoleLabel(selectedUser.role)}</strong>
          <span>Highest role · level {passport.highestRole?.accessLevel ?? 0}</span>
        </AdminScopeMetric>
        <AdminScopeMetric>
          <strong>{passport.xpTier.label}</strong>
          <span>{user.experiencePoints.toLocaleString()} EXP</span>
        </AdminScopeMetric>
        <AdminScopeMetric>
          <strong>{passport.curses.length}</strong>
          <span>Active curses</span>
        </AdminScopeMetric>
        <AdminScopeMetric>
          <strong>{grantedPermissions.length}</strong>
          <span>Effective permissions</span>
        </AdminScopeMetric>
        <AdminScopeMetric>
          <strong>{passport.wallets.length}</strong>
          <span>Linked wallets</span>
        </AdminScopeMetric>
      </AdminScopeSummaryGrid>

      <UiTabs
        aria-label="WTF Passport sections"
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as PassportTab)}
        tabs={[
          { id: "summary", label: "Account" },
          { id: "access", label: "Access & curses" },
          { id: "settings", label: "wtfOS settings" },
          { id: "recovery", label: "Recovery" },
          { id: "assets", label: "Wallets & activity" },
        ]}
      />

      {activeTab === "summary" ? (
        <Stack role="tabpanel">
          <TwoColumn>
            <UiPanel compact title="Identity" tone="info">
              <DefinitionList>
                <dt>Username</dt><dd>@{user.username}</dd>
                <dt>Display name</dt><dd>{user.displayName || "Not set"}</dd>
                <dt>Email</dt><dd>{user.email || "Not set"}</dd>
                <dt>Bio</dt><dd>{user.bio || "Not set"}</dd>
                <dt>Created</dt><dd>{displayDate(user.createdAt)}</dd>
                <dt>Updated</dt><dd>{displayDate(user.updatedAt)}</dd>
              </DefinitionList>
            </UiPanel>
            <UiPanel compact title="Account health" tone="success">
              <DefinitionList>
                <dt>wtfOS welcomed</dt><dd>{statusLabel(user.welcomedToWtfOs)}</dd>
                <dt>Password configured</dt><dd>{statusLabel(user.hasPassword)}</dd>
                <dt>Temporary password</dt><dd>{user.hasTemporaryPassword ? `Active until ${displayDate(user.tempPasswordExpiresAt)}` : "Inactive"}</dd>
                <dt>Google linked</dt><dd>{statusLabel(user.googleLinked)}</dd>
                <dt>GitHub linked</dt><dd>{statusLabel(user.githubLinked)}</dd>
                <dt>Last GM welcome</dt><dd>{displayDate(user.gmWelcomeLastSeenAt)}</dd>
              </DefinitionList>
            </UiPanel>
          </TwoColumn>
          <UiPanel compact title="Social profile visibility">
            <DefinitionList>
              <dt>X / Twitter</dt><dd>{user.twitterHandle ? `@${user.twitterHandle}` : "Not linked"} · {user.twitterVerified ? "verified" : "not verified"} · {user.twitterPublic ? "public" : "private"}</dd>
              <dt>Discord</dt><dd>{user.discordHandle || "Not linked"} · {user.discordVerified ? "verified" : "not verified"} · {user.discordPublic ? "public" : "private"}</dd>
              <dt>Email visibility</dt><dd>{user.emailPublic ? "Public" : "Private"}</dd>
              <dt>Profile NFT</dt><dd>{user.pfpTokenContract && user.pfpTokenId ? `${user.pfpTokenContract} / ${user.pfpTokenId}` : "Not selected"}</dd>
            </DefinitionList>
          </UiPanel>
        </Stack>
      ) : null}

      {activeTab === "access" ? (
        <Stack role="tabpanel">
          <TwoColumn>
            <UiPanel compact title="Assigned roles" tone="info">
              <Stack>
                <TokenRow>
                  {passport.roles.map((role) => (
                    <UiStatusPill key={role.slug} $tone={role.slug === passport.highestRole?.slug ? "success" : "neutral"}>
                      {role.label} · L{role.accessLevel}
                      {passport.roles.length > 1 ? (
                        <UserLinkButton
                          type="button"
                          disabled={removeUserRoleMutation.isPending}
                          aria-label={`Remove ${role.label} role`}
                          onClick={() => removeUserRoleMutation.mutate({ id: user.id, role: role.slug })}
                        >
                          remove
                        </UserLinkButton>
                      ) : null}
                    </UiStatusPill>
                  ))}
                </TokenRow>
                <FieldGrid>
                  <UiField label="Add role" hint="The highest access-level role becomes the roster summary.">
                    <NativeSelect aria-label="Add assigned role" value={roleToAdd} onChange={(event) => setRoleToAdd(event.target.value as UserRole | "")}>
                      <option value="">Choose a role…</option>
                      {assignableRoles
                        .filter((role) => !passport.roles.some((assigned) => assigned.slug === role.slug))
                        .map((role) => <option key={role.slug} value={role.slug}>{role.label} · level {role.accessLevel}</option>)}
                    </NativeSelect>
                  </UiField>
                </FieldGrid>
                <UiButton
                  compact
                  disabled={!roleToAdd || assignUserRoleMutation.isPending}
                  onClick={() => {
                    if (!roleToAdd) return;
                    assignUserRoleMutation.mutate({ id: user.id, role: roleToAdd });
                    setRoleToAdd("");
                  }}
                >
                  <ShieldCheck size={14} aria-hidden="true" /> Assign role
                </UiButton>
              </Stack>
            </UiPanel>

            <UiPanel compact title="Active curses" tone={passport.curses.length ? "warning" : "success"}>
              <Stack>
                {passport.curses.length ? (
                  <ScrollList>
                    {passport.curses.map((curse) => (
                      <ListItem key={curse.key}>
                        <strong>{curse.label}</strong>
                        <small>{curse.effect}</small>
                        <small>Reason: {curse.reason || "No reason recorded"} · assigned {displayDate(curse.assignedAt)}</small>
                        <UiButton compact disabled={updateUserCurseMutation.isPending} onClick={() => updateUserCurseMutation.mutate({ id: user.id, curseKey: curse.key, active: false })}>
                          Lift curse
                        </UiButton>
                      </ListItem>
                    ))}
                  </ScrollList>
                ) : <UiNotice tone="success"><CheckCircle2 size={15} aria-hidden="true" /> No active curses.</UiNotice>}
                <FieldGrid>
                  <UiField label="Apply curse">
                    <NativeSelect aria-label="Apply curse" value={curseDraft.key} onChange={(event) => setCurseDraft((current) => ({ ...current, key: event.target.value as WtfCurseKey | "" }))}>
                      <option value="">Choose a curse…</option>
                      {WTF_CURSE_DEFINITIONS.filter((curse) => !activeCurseKeys.has(curse.key)).map((curse) => <option key={curse.key} value={curse.key}>{curse.label}</option>)}
                    </NativeSelect>
                  </UiField>
                  <UiField label="Reason" hint="Recorded with the assignment for later complaint resolution.">
                    <TextInput aria-label="Curse assignment reason" fullWidth value={curseDraft.reason} onChange={(event: any) => setCurseDraft((current) => ({ ...current, reason: String(event.target.value || "") }))} />
                  </UiField>
                </FieldGrid>
                <UiButton
                  compact
                  disabled={!curseDraft.key || updateUserCurseMutation.isPending}
                  onClick={() => {
                    if (!curseDraft.key) return;
                    updateUserCurseMutation.mutate({ id: user.id, curseKey: curseDraft.key, active: true, reason: curseDraft.reason });
                    setCurseDraft({ key: "", reason: "" });
                  }}
                >
                  Apply curse
                </UiButton>
              </Stack>
            </UiPanel>
          </TwoColumn>

          <TwoColumn>
            <UiPanel compact title={`Effective permissions (${grantedPermissions.length})`}>
              <ScrollList>
                {grantedPermissions.map((permission) => <ListItem key={permission}><code>{permission}</code></ListItem>)}
              </ScrollList>
            </UiPanel>
            <UiPanel compact title="Effective wtfOS access">
              <DefinitionList>
                <dt>Surfaces</dt><dd>{passport.wtfOsAccess.surfaceIds.length ? passport.wtfOsAccess.surfaceIds.join(", ") : "None"}</dd>
                <dt>Routes</dt><dd>{passport.wtfOsAccess.routePatterns.length ? passport.wtfOsAccess.routePatterns.join(", ") : "None"}</dd>
                <dt>Admin panels</dt><dd>{passport.wtfOsAccess.adminPanelTabs.length ? passport.wtfOsAccess.adminPanelTabs.join(", ") : "None"}</dd>
                <dt>Agent handles</dt><dd>{passport.wtfOsAccess.automationHandles.length ? passport.wtfOsAccess.automationHandles.join(", ") : "None"}</dd>
              </DefinitionList>
            </UiPanel>
          </TwoColumn>
        </Stack>
      ) : null}

      {activeTab === "settings" && settingsDraft ? (
        <Stack role="tabpanel">
          <UiNotice tone="warning">
            <UserRoundCog size={15} aria-hidden="true" /> These are the user’s durable wtfOS desktop settings. Saves are concurrency-protected and audited. Refresh if another operator changed them.
          </UiNotice>
          <UiPanel compact title="Common complaint fixes" tone="info">
            <FieldGrid>
              <UiField label="Desktop style">
                <NativeSelect aria-label="Desktop style" value={settingsDraft.appearance.appearanceStyleKey} onChange={(event) => setSettingsDraft((current) => current ? ({ ...current, appearance: { ...current.appearance, appearanceStyleKey: event.target.value as typeof current.appearance.appearanceStyleKey } }) : current)}>
                  {DESKTOP_APPEARANCE_STYLES.map((style) => <option key={style.key} value={style.key}>{style.label}</option>)}
                </NativeSelect>
              </UiField>
              <UiField label="Color scheme">
                <NativeSelect aria-label="Color scheme" value={settingsDraft.appearance.colorSchemeKey} onChange={(event) => {
                  const scheme = DESKTOP_COLOR_SCHEMES.find((candidate) => candidate.key === event.target.value);
                  if (!scheme) return;
                  setSettingsDraft((current) => current ? ({ ...current, appearance: { ...current.appearance, ...scheme, colorSchemeKey: scheme.key } }) : current);
                }}>
                  {DESKTOP_COLOR_SCHEMES.map((scheme) => <option key={scheme.key} value={scheme.key}>{scheme.label}</option>)}
                </NativeSelect>
              </UiField>
              <UiField label="Cursor">
                <NativeSelect aria-label="Cursor" value={settingsDraft.appearance.cursorStyle} onChange={(event) => setSettingsDraft((current) => current ? ({ ...current, appearance: { ...current.appearance, cursorStyle: event.target.value as typeof current.appearance.cursorStyle } }) : current)}>
                  {DESKTOP_CURSOR_STYLES.map((cursor) => <option key={cursor} value={cursor}>{DESKTOP_CURSOR_LABELS[cursor]}</option>)}
                </NativeSelect>
              </UiField>
              <UiField label="Chat typography">
                <NativeSelect aria-label="Chat typography" value={settingsDraft.appearance.chatTypographyPresetKey} onChange={(event) => {
                  const preset = DESKTOP_CHAT_TYPOGRAPHY_PRESETS.find((candidate) => candidate.key === event.target.value);
                  if (!preset) return;
                  setSettingsDraft((current) => current ? ({ ...current, appearance: { ...current.appearance, chatTypographyPresetKey: preset.key, wimChatStyle: { ...preset.wim }, wtfLiveChatStyle: { ...preset.wtfLive } } }) : current);
                }}>
                  {DESKTOP_CHAT_TYPOGRAPHY_PRESETS.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
                </NativeSelect>
              </UiField>
              <UiField label="Wallpaper fit">
                <NativeSelect aria-label="Wallpaper fit" value={settingsDraft.appearance.backgroundFit} onChange={(event) => setSettingsDraft((current) => current ? ({ ...current, appearance: { ...current.appearance, backgroundFit: event.target.value as typeof current.appearance.backgroundFit } }) : current)}>
                  {DESKTOP_BACKGROUND_FITS.map((fit) => <option key={fit} value={fit}>{fit}</option>)}
                </NativeSelect>
              </UiField>
              <UiField label="Desktop gravity">
                <NativeSelect aria-label="Desktop gravity" value={settingsDraft.appearance.desktopGravityMode} onChange={(event) => setSettingsDraft((current) => current ? ({ ...current, appearance: { ...current.appearance, desktopGravityMode: event.target.value as typeof current.appearance.desktopGravityMode } }) : current)}>
                  {DESKTOP_GRAVITY_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </NativeSelect>
              </UiField>
              <UiField label="Locale">
                <NativeSelect aria-label="Locale" value={settingsDraft.localization.locale} onChange={(event) => {
                  const locale = event.target.value as typeof settingsDraft.localization.locale;
                  setSettingsDraft((current) => current ? ({ ...current, localization: { locale, region: LOCALE_METADATA[locale].defaultRegion } }) : current);
                }}>
                  {SUPPORTED_LOCALES.map((locale) => <option key={locale} value={locale}>{LOCALE_METADATA[locale].englishName}</option>)}
                </NativeSelect>
              </UiField>
              <UiField label="Region code">
                <TextInput aria-label="Region code" fullWidth value={settingsDraft.localization.region} onChange={(event: any) => setSettingsDraft((current) => current ? ({ ...current, localization: { ...current.localization, region: String(event.target.value || "").toUpperCase().slice(0, 2) } }) : current)} />
              </UiField>
            </FieldGrid>
            <ActionRow>
              <CheckboxLabel><input type="checkbox" checked={settingsDraft.appearance.desktopPhysicsEnabled} onChange={(event) => setSettingsDraft((current) => current ? ({ ...current, appearance: { ...current.appearance, desktopPhysicsEnabled: event.target.checked } }) : current)} /> Desktop physics</CheckboxLabel>
              <CheckboxLabel><input type="checkbox" checked={settingsDraft.appearance.desktopPetEnabled} onChange={(event) => setSettingsDraft((current) => current ? ({ ...current, appearance: { ...current.appearance, desktopPetEnabled: event.target.checked } }) : current)} /> Desktop pet</CheckboxLabel>
              <UiButton compact disabled={!settingsDraft.appearance.backgroundImageUrl} onClick={() => setSettingsDraft((current) => current ? ({ ...current, appearance: { ...current.appearance, backgroundImageUrl: null } }) : current)}>Clear wallpaper</UiButton>
              <UiButton compact disabled={Object.keys(settingsDraft.iconLayout).length === 0} onClick={() => setSettingsDraft((current) => current ? ({ ...current, iconLayout: {} }) : current)}>Reset icon layout</UiButton>
            </ActionRow>
            <ActionRow>
              <UiButton uiVariant="primary" disabled={!settingsChanged || desktopSettingsMutation.isPending} onClick={() => desktopSettingsMutation.mutate(settingsDraft)}>
                {desktopSettingsMutation.isPending ? "Saving settings…" : "Save wtfOS settings"}
              </UiButton>
              <UiButton disabled={!settingsChanged} onClick={() => setSettingsDraft(structuredClone(passport.desktopSettings))}>Discard changes</UiButton>
            </ActionRow>
            {desktopSettingsMutation.isError ? <UiNotice tone="danger">The settings save conflicted or failed. Refresh the passport before trying again.</UiNotice> : null}
          </UiPanel>
          <UiPanel compact title="Complete settings snapshot" actions={<UiStatusPill $tone="neutral">Read every assigned value</UiStatusPill>}>
            <JsonBlock>{JSON.stringify(settingsDraft, null, 2)}</JsonBlock>
          </UiPanel>
        </Stack>
      ) : null}

      {activeTab === "recovery" ? (
        <Stack role="tabpanel">
          <UiPanel compact title="Correct identity" tone="info">
            <FieldGrid>
              <UiField label="Username">
                <TextInput aria-label="Username" fullWidth value={identityDraft.username} onChange={(event: any) => setIdentityDraft((current) => ({ ...current, username: String(event.target.value || "").toLowerCase().replace(/\s+/g, "") }))} />
              </UiField>
              <UiField label="Display name">
                <TextInput aria-label="Display name" fullWidth value={identityDraft.displayName} onChange={(event: any) => setIdentityDraft((current) => ({ ...current, displayName: String(event.target.value || "") }))} />
              </UiField>
            </FieldGrid>
            <UiButton compact disabled={updateIdentityMutation.isPending || !identityDraft.username} onClick={() => updateIdentityMutation.mutate({ id: user.id, ...identityDraft })}>Save identity</UiButton>
          </UiPanel>

          <TwoColumn>
            <UiPanel compact title="Manual EXP correction">
              <FieldGrid>
                <UiField label="Amount" hint="Use a negative amount to reverse an incorrect award.">
                  <TextInput aria-label="EXP adjustment amount" fullWidth type="number" value={xpDraft.amount} onChange={(event: any) => setXpDraft((current) => ({ ...current, amount: String(event.target.value || "") }))} />
                </UiField>
                <UiField label="Reason" hint="Required context for the XP audit log.">
                  <TextInput aria-label="EXP adjustment reason" fullWidth value={xpDraft.reason} onChange={(event: any) => setXpDraft((current) => ({ ...current, reason: String(event.target.value || "") }))} />
                </UiField>
              </FieldGrid>
              <UiButton compact disabled={!Number(xpDraft.amount) || awardXpMutation.isPending} onClick={() => {
                const amount = Number.parseInt(xpDraft.amount, 10);
                if (!amount) return;
                awardXpMutation.mutate({ id: user.id, amount, reason: xpDraft.reason || "manual_admin_adjustment" });
                setXpDraft({ amount: "", reason: "" });
              }}>Apply EXP adjustment</UiButton>
            </UiPanel>

            <UiPanel compact title="Social connection reset">
              <Stack>
                <UiNotice>Clear only the affected provider. The user can reconnect it from their profile.</UiNotice>
                <ActionRow>
                  <UiButton compact disabled={clearUserSocialMutation.isPending || (!user.twitterHandle && !user.twitterVerified)} onClick={() => clearUserSocialMutation.mutate({ id: user.id, provider: "twitter" })}>Clear X connection</UiButton>
                  <UiButton compact disabled={clearUserSocialMutation.isPending || (!user.discordHandle && !user.discordVerified)} onClick={() => clearUserSocialMutation.mutate({ id: user.id, provider: "discord" })}>Clear Discord connection</UiButton>
                </ActionRow>
              </Stack>
            </UiPanel>
          </TwoColumn>

          <UiPanel compact title="Temporary sign-in password" tone="warning">
            <UiNotice tone="warning"><KeyRound size={15} aria-hidden="true" /> The real password remains valid. A generated password is shown once and expires automatically.</UiNotice>
            {tempPasswordResult ? <UiNotice tone="success"><strong>Temporary password:</strong> <code>{tempPasswordResult.password}</code><br />Expires {displayDate(tempPasswordResult.expiresAt)}</UiNotice> : null}
            <FieldGrid>
              <UiField label="Custom password" hint="Leave blank to generate a secure password.">
                <TextInput aria-label="Custom temporary password" fullWidth type="password" value={tempPasswordInput.password} onChange={(event: any) => setTempPasswordInput({ ...tempPasswordInput, password: String(event.target.value || "") })} />
              </UiField>
              <UiField label="Expiry">
                <NativeSelect aria-label="Temporary password expiry" value={tempPasswordInput.expiryHours} onChange={(event) => setTempPasswordInput({ ...tempPasswordInput, expiryHours: event.target.value })}>
                  <option value="1">1 hour</option><option value="4">4 hours</option><option value="24">24 hours</option><option value="48">48 hours</option><option value="168">7 days</option>
                </NativeSelect>
              </UiField>
            </FieldGrid>
            <ActionRow>
              <UiButton compact disabled={setTempPasswordMutation.isPending} onClick={() => setTempPasswordMutation.mutate({ id: user.id, password: tempPasswordInput.password, expiryHours: Number(tempPasswordInput.expiryHours) || 24 })}>Set temporary password</UiButton>
              <UiButton compact disabled={clearTempPasswordMutation.isPending || (!tempPasswordResult && !user.hasTemporaryPassword)} onClick={() => clearTempPasswordMutation.mutate(user.id)}>Revoke temporary password</UiButton>
            </ActionRow>
          </UiPanel>

          {canDeleteUsers ? (
            <UiPanel compact title="Delete account" tone="danger">
              <UiNotice tone="danger"><AlertTriangle size={15} aria-hidden="true" /> Permanent account deletion removes the user and related account records. Use only after less destructive recovery paths fail.</UiNotice>
              <ConfirmAction label="Review permanent deletion" confirmLabel={`Permanently delete @${user.username}`} disabled={deleteUserMutation.isPending} onConfirm={() => {
                deleteUserMutation.mutate(user.id);
                onDeleted();
              }} />
            </UiPanel>
          ) : (
            <UiPanel compact title="Account deletion restricted" tone="warning">
              <UiNotice tone="warning"><AlertTriangle size={15} aria-hidden="true" /> Your role can support this account, but permanent deletion requires the separate Delete Users permission.</UiNotice>
            </UiPanel>
          )}
        </Stack>
      ) : null}

      {activeTab === "assets" ? (
        <Stack role="tabpanel">
          <TwoColumn>
            <UiPanel compact title={`Linked wallets (${passport.wallets.length})`}>
              {passport.wallets.length ? <ScrollList>{passport.wallets.map((wallet) => <ListItem key={wallet.id}><strong>{wallet.tezDomain || wallet.walletAddress}</strong><small>{wallet.walletAddress}</small><small>{wallet.isPrimary ? "Primary" : "Secondary"} · last activity {displayDate(wallet.lastActivityAt)}</small></ListItem>)}</ScrollList> : <UiEmptyState title="No linked wallets" />}
            </UiPanel>
            <UiPanel compact title={`WTF domains (${passport.subdomains.length})`}>
              {passport.subdomains.length ? <ScrollList>{passport.subdomains.map((domain) => <ListItem key={domain.id}><strong>{domain.fullName}</strong><small>Status: {domain.status} · Wallet: {domain.walletAddress || "not assigned"}</small><small>{domain.notes || "No admin notes"}</small></ListItem>)}</ScrollList> : <UiEmptyState title="No WTF domains" />}
            </UiPanel>
          </TwoColumn>
          <UiPanel compact title={`Recent EXP activity (${passport.recentXpEvents.length})`}>
            {passport.recentXpEvents.length ? <ScrollList>{passport.recentXpEvents.map((event) => <ListItem key={event.id}><strong>{event.amount > 0 ? "+" : ""}{event.amount.toLocaleString()} EXP · {event.reason}</strong><small>{displayDate(event.createdAt)} · awarded by {event.awardedBy ? `user #${event.awardedBy}` : "system"}</small></ListItem>)}</ScrollList> : <UiEmptyState title="No recent EXP events" />}
          </UiPanel>
          <UiPanel compact title="On-chain wallet dossier" actions={<UserLinkButton type="button" onClick={() => window.open(`/profile/${user.username}`, "_blank", "noopener")}>Public profile <ExternalLink size={12} aria-hidden="true" /></UserLinkButton>}>
            <WalletDossier mode="admin-user" userId={user.id} />
          </UiPanel>
        </Stack>
      ) : null}
    </Stack>
  );
}
