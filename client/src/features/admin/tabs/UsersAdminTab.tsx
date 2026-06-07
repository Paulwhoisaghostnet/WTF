import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  TextInput,
  Select,
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableDataCell,
  TableBody,
} from "react95";
import styled from "styled-components";
import { UserLink } from "../../../components/UserLink";
import { WalletDossier } from "../../../components/WalletDossier";
import { UiButton, UiEmptyState, UiStatusPill } from "../../../components/wtfos-ui";
import { formatRoleLabel, type RoleDefinition, type UserRole } from "@shared/types";
import {
  WTF_CURSE_DEFINITIONS,
  normalizeWtfCurseStatuses,
  type WtfCurseKey,
  type WtfCurseStatus,
} from "@shared/curses";
import type {
  AssignUserRolePayload,
  AwardXpPayload,
  ClearUserSocialPayload,
  RemoveUserRolePayload,
  SetTempPasswordPayload,
  TempPasswordResult,
  UpdateIdentityPayload,
  UpdateUserCursePayload,
} from "../types";

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--wtf-space-1, 4px);
  margin-bottom: var(--wtf-space-2, 8px);
`;

const ActionRow = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
`;

const SubSection = styled.div`
  margin-top: var(--wtf-space-3, 12px);
  padding: var(--wtf-space-2, 8px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
`;

const TableWrap = styled.div`
  min-width: 0;
  overflow-x: auto;
`;

const RoleToken = styled.span`
  display: inline-flex;
  align-items: center;
  position: relative;
  min-height: 24px;
  padding: 3px 24px 3px 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
`;

const RemoveTokenButton = styled.button`
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border: 1px solid var(--wtf-app-danger, #b42318);
  background: var(--wtf-app-danger, #b42318);
  color: #fff;
  cursor: pointer;
  padding: 0;
  line-height: 16px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
`;

const MetaText = styled.p`
  margin: 0 0 var(--wtf-space-2, 8px);
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
`;

const ResultNotice = styled.p`
  margin: 0 0 var(--wtf-space-2, 8px);
  padding: var(--wtf-space-2, 8px);
  background: var(--wtf-app-success-bg, #e8ffe8);
  border: 1px solid var(--wtf-app-success, #176b38);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
  word-break: break-all;
`;

const SmallCode = styled.code`
  background: var(--wtf-app-surface-raised, #ffffff);
  padding: 1px 4px;
  user-select: all;
`;

const ExpiryText = styled.span`
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
`;

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending: boolean;
};

type XpInputs = Record<number, { amount: string; reason: string }>;
type IdentityInputs = Record<number, { username: string; displayName: string }>;
type TempPasswordInputs = Record<
  number,
  { password: string; expiryHours: string }
>;
type TempPasswordResults = Record<number, TempPasswordResult | null>;
type PanelState = Record<number, boolean>;
type CurseInputs = Record<number, { curseKey: WtfCurseKey | ""; reason: string }>;

type UsersAdminTabProps = {
  filteredUsers: any[];
  userSearch: string;
  setUserSearch: Dispatch<SetStateAction<string>>;
  xpInputs: XpInputs;
  setXpInputs: Dispatch<SetStateAction<XpInputs>>;
  identityInputs: IdentityInputs;
  setIdentityInputs: Dispatch<SetStateAction<IdentityInputs>>;
  tempPwPanels: PanelState;
  setTempPwPanels: Dispatch<SetStateAction<PanelState>>;
  tempPwInputs: TempPasswordInputs;
  setTempPwInputs: Dispatch<SetStateAction<TempPasswordInputs>>;
  tempPwResults: TempPasswordResults;
  dossierPanels: PanelState;
  setDossierPanels: Dispatch<SetStateAction<PanelState>>;
  assignUserRoleMutation: AdminMutation<AssignUserRolePayload>;
  removeUserRoleMutation: AdminMutation<RemoveUserRolePayload>;
  updateUserCurseMutation: AdminMutation<UpdateUserCursePayload>;
  roleCatalog: RoleDefinition[] | undefined;
  awardXpMutation: AdminMutation<AwardXpPayload>;
  updateIdentityMutation: AdminMutation<UpdateIdentityPayload>;
  clearUserSocialMutation: AdminMutation<ClearUserSocialPayload>;
  deleteUserMutation: AdminMutation<number>;
  setTempPasswordMutation: AdminMutation<SetTempPasswordPayload>;
  clearTempPasswordMutation: AdminMutation<number>;
};

function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
  size = "sm",
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  size?: "sm" | "lg";
}) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <ActionRow>
        <UiButton compact={size === "sm"} uiVariant="danger" onClick={onConfirm} disabled={disabled}>
          {confirmLabel || `Yes, ${label}`}
        </UiButton>
        <UiButton compact={size === "sm"} onClick={() => setConfirming(false)}>
          Cancel action
        </UiButton>
      </ActionRow>
    );
  }
  return (
    <UiButton compact={size === "sm"} onClick={() => setConfirming(true)} disabled={disabled}>
      {label}
    </UiButton>
  );
}

export function UsersAdminTab({
  filteredUsers,
  userSearch,
  setUserSearch,
  xpInputs,
  setXpInputs,
  identityInputs,
  setIdentityInputs,
  tempPwPanels,
  setTempPwPanels,
  tempPwInputs,
  setTempPwInputs,
  tempPwResults,
  dossierPanels,
  setDossierPanels,
  assignUserRoleMutation,
  removeUserRoleMutation,
  updateUserCurseMutation,
  roleCatalog,
  awardXpMutation,
  updateIdentityMutation,
  clearUserSocialMutation,
  deleteUserMutation,
  setTempPasswordMutation,
  clearTempPasswordMutation,
}: UsersAdminTabProps) {
  const assignableRoleCatalog = useMemo(
    () => (roleCatalog ?? []).filter((role) => role.isAssignable),
    [roleCatalog]
  );
  const roleOptions = useMemo(
    () =>
      assignableRoleCatalog.map((role) => ({
        label: `${role.label} (${role.category})`,
        value: role.slug,
      })),
    [assignableRoleCatalog]
  );
  const roleLabels = useMemo(
    () => new Map((roleCatalog ?? []).map((role) => [role.slug, role.label])),
    [roleCatalog]
  );
  const [curseInputs, setCurseInputs] = useState<CurseInputs>({});

  return (
    <>
      <h3>Manage Users</h3>
      <Field>
        <TextInput
          aria-label="Search users by name or email"
          placeholder="Search users by name or email..."
          value={userSearch}
          onChange={(e: any) => setUserSearch(e.target.value)}
          fullWidth
        />
      </Field>
      <TableWrap>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeadCell>Username</TableHeadCell>
            <TableHeadCell>Display Name</TableHeadCell>
            <TableHeadCell>Roles</TableHeadCell>
            <TableHeadCell>XP</TableHeadCell>
            <TableHeadCell>Actions</TableHeadCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredUsers.map((u: any) => {
            const xpInput = xpInputs[u.id] || { amount: "", reason: "" };
            const identityDraft = identityInputs[u.id] || {
              username: u.username || "",
              displayName: u.displayName || "",
            };
            const tempPwPanel = tempPwPanels[u.id] ?? false;
            const tempPwInput = tempPwInputs[u.id] || {
              password: "",
              expiryHours: "24",
            };
            const tempPwResult = tempPwResults[u.id];
            const dossierOpen = dossierPanels[u.id] ?? false;
            const activeCurses = normalizeWtfCurseStatuses(u.curses) as WtfCurseStatus[];
            const curseInput = curseInputs[u.id] || { curseKey: "", reason: "" };
            const userRoles = Array.isArray(u.roles) && u.roles.length
              ? (u.roles as UserRole[])
              : [u.role as UserRole];
            return (
              <TableRow key={u.id}>
                <TableDataCell>
                  <UserLink username={u.username} />
                </TableDataCell>
                <TableDataCell>{u.displayName || "---"}</TableDataCell>
                <TableDataCell>
                  <div style={{ display: "grid", gap: 6, minWidth: 250 }}>
                    <ActionRow>
                      {userRoles.map((role) => (
                        <RoleToken
                          key={role}
                        >
                          {roleLabels.get(role) ?? formatRoleLabel(role)}
                          {userRoles.length > 1 ? (
                            <RemoveTokenButton
                              type="button"
                              aria-label={`Remove ${roleLabels.get(role) ?? formatRoleLabel(role)} role from ${u.username}`}
                              disabled={removeUserRoleMutation.isPending}
                              onClick={() =>
                                removeUserRoleMutation.mutate({ id: u.id, role })
                              }
                              title={`Remove ${roleLabels.get(role) ?? formatRoleLabel(role)}`}
                            >
                              x
                            </RemoveTokenButton>
                          ) : null}
                        </RoleToken>
                      ))}
                    </ActionRow>
                    <Select
                      aria-label={`Add role to ${u.username}`}
                      value=""
                      onChange={(e: any) => {
                        const role = e.value as UserRole;
                        if (!role || userRoles.includes(role)) return;
                        assignUserRoleMutation.mutate({ id: u.id, role });
                      }}
                      options={[
                        { label: "Add role...", value: "" },
                        ...roleOptions.filter((option) =>
                          !userRoles.includes(option.value as UserRole)
                        ),
                      ]}
                      width={180}
                    />
                    <SubSection style={{ marginTop: 2, padding: 6 }}>
                      <strong>
                        Curses
                      </strong>
                      <ActionRow>
                        {activeCurses.length ? (
                          activeCurses.map((curse) => (
                            <UiStatusPill
                              key={curse.key}
                              title={curse.effect}
                              $tone="success"
                            >
                              {curse.label}
                              <button
                                type="button"
                                aria-label={`Lift ${curse.label} curse from ${u.username}`}
                                disabled={updateUserCurseMutation.isPending}
                                onClick={() =>
                                  updateUserCurseMutation.mutate({
                                    id: u.id,
                                    curseKey: curse.key,
                                    active: false,
                                  })
                                }
                                title={`Lift ${curse.label}`}
                                style={{
                                  border: 0,
                                  background: "transparent",
                                  cursor: "pointer",
                                  padding: 0,
                                  lineHeight: 1,
                                }}
                              >
                                x
                              </button>
                            </UiStatusPill>
                          ))
                        ) : (
                          <span>None</span>
                        )}
                      </ActionRow>
                      <ActionRow style={{ marginTop: 6 }}>
                        <Select
                          aria-label={`Add curse to ${u.username}`}
                          value={curseInput.curseKey}
                          onChange={(e: any) =>
                            setCurseInputs((prev) => ({
                              ...prev,
                              [u.id]: {
                                ...curseInput,
                                curseKey: e.value as WtfCurseKey | "",
                              },
                            }))
                          }
                          options={[
                            { label: "Add curse...", value: "" },
                            ...WTF_CURSE_DEFINITIONS.filter(
                              (curse) => !activeCurses.some((active) => active.key === curse.key)
                            ).map((curse) => ({
                              label: curse.label,
                              value: curse.key,
                            })),
                          ]}
                          width={150}
                        />
                        <TextInput
                          aria-label={`Curse reason for ${u.username}`}
                          placeholder="reason"
                          value={curseInput.reason}
                          onChange={(e: any) =>
                            setCurseInputs((prev) => ({
                              ...prev,
                              [u.id]: {
                                ...curseInput,
                                reason: String(e.target.value || ""),
                              },
                            }))
                          }
                          style={{ width: 118 }}
                        />
                        <UiButton
                          compact
                          disabled={!curseInput.curseKey || updateUserCurseMutation.isPending}
                          onClick={() => {
                            if (!curseInput.curseKey) return;
                            updateUserCurseMutation.mutate({
                              id: u.id,
                              curseKey: curseInput.curseKey,
                              active: true,
                              reason: curseInput.reason,
                            });
                            setCurseInputs((prev) => ({
                              ...prev,
                              [u.id]: { curseKey: "", reason: "" },
                            }));
                          }}
                        >
                          Apply user curse
                        </UiButton>
                      </ActionRow>
                    </SubSection>
                  </div>
                </TableDataCell>
                <TableDataCell>{u.experiencePoints ?? 0}</TableDataCell>
                <TableDataCell>
                  <ActionRow>
                    <TextInput
                      aria-label={`Username for ${u.username}`}
                      placeholder="username"
                      value={identityDraft.username}
                      onChange={(e: any) =>
                        setIdentityInputs((prev) => ({
                          ...prev,
                          [u.id]: {
                            ...identityDraft,
                            username: String(e.target.value || "")
                              .toLowerCase()
                              .replace(/\s+/g, ""),
                          },
                        }))
                      }
                      style={{ width: 115 }}
                    />
                    <TextInput
                      aria-label={`Display name for ${u.username}`}
                      placeholder="display name"
                      value={identityDraft.displayName}
                      onChange={(e: any) =>
                        setIdentityInputs((prev) => ({
                          ...prev,
                          [u.id]: {
                            ...identityDraft,
                            displayName: e.target.value,
                          },
                        }))
                      }
                      style={{ width: 130 }}
                    />
                    <UiButton
                      compact
                      disabled={updateIdentityMutation.isPending}
                      onClick={() =>
                        updateIdentityMutation.mutate({
                          id: u.id,
                          username: identityDraft.username,
                          displayName: identityDraft.displayName,
                        })
                      }
                    >
                      Save user names
                    </UiButton>
                    <UiButton
                      compact
                      disabled={
                        clearUserSocialMutation.isPending ||
                        (!u.twitterHandle && !u.twitterVerified)
                      }
                      onClick={() =>
                        clearUserSocialMutation.mutate({
                          id: u.id,
                          provider: "twitter",
                        })
                      }
                    >
                      Clear X profile
                    </UiButton>
                    <UiButton
                      compact
                      disabled={
                        clearUserSocialMutation.isPending ||
                        (!u.discordHandle && !u.discordVerified)
                      }
                      onClick={() =>
                        clearUserSocialMutation.mutate({
                          id: u.id,
                          provider: "discord",
                        })
                      }
                    >
                      Clear Discord profile
                    </UiButton>
                    <TextInput
                      aria-label={`XP amount for ${u.username}`}
                      placeholder="XP"
                      value={xpInput.amount}
                      onChange={(e: any) =>
                        setXpInputs((prev) => ({
                          ...prev,
                          [u.id]: { ...xpInput, amount: e.target.value },
                        }))
                      }
                      style={{ width: 60 }}
                    />
                    <TextInput
                      aria-label={`XP reason for ${u.username}`}
                      placeholder="Reason"
                      value={xpInput.reason}
                      onChange={(e: any) =>
                        setXpInputs((prev) => ({
                          ...prev,
                          [u.id]: { ...xpInput, reason: e.target.value },
                        }))
                      }
                      style={{ width: 120 }}
                    />
                    <UiButton
                      compact
                      disabled={!xpInput.amount || awardXpMutation.isPending}
                      onClick={() => {
                        const amt = parseInt(xpInput.amount);
                        if (!amt) return;
                        awardXpMutation.mutate({
                          id: u.id,
                          amount: amt,
                          reason:
                            xpInput.reason || "manual_admin_adjustment",
                        });
                        setXpInputs((prev) => ({
                          ...prev,
                          [u.id]: { amount: "", reason: "" },
                        }));
                      }}
                    >
                      Award user XP
                    </UiButton>
                    <UiButton
                      compact
                      onClick={() =>
                        setTempPwPanels((prev) => ({
                          ...prev,
                          [u.id]: !tempPwPanel,
                        }))
                      }
                    >
                      {tempPwPanel ? "Hide temp password panel" : "Show temp password panel"}
                    </UiButton>
                    <UiButton
                      compact
                      onClick={() =>
                        setDossierPanels((prev) => ({
                          ...prev,
                          [u.id]: !dossierOpen,
                        }))
                      }
                    >
                      {dossierOpen ? "Hide wallet dossier" : "Show wallet dossier"}
                    </UiButton>
                    <ConfirmButton
                      label="Delete user"
                      confirmLabel="Confirm delete user"
                      onConfirm={() => deleteUserMutation.mutate(u.id)}
                      disabled={deleteUserMutation.isPending}
                    />
                  </ActionRow>

                  {tempPwPanel && (
                    <SubSection>
                      <MetaText>
                        <strong>Temporary password for {u.username}</strong>
                        <br />
                        The user can log in with either their real password or
                        the temp password until it expires. Leave the password
                        field blank to auto-generate a secure one.
                      </MetaText>
                      {tempPwResult && (
                        <ResultNotice>
                          <strong>Temp password (shown once):</strong>{" "}
                          <SmallCode>{tempPwResult.password}</SmallCode>
                          <br />
                          <ExpiryText>
                            Expires:{" "}
                            {new Date(tempPwResult.expiresAt).toLocaleString()}
                          </ExpiryText>
                        </ResultNotice>
                      )}
                      <ActionRow style={{ flexWrap: "wrap" }}>
                        <TextInput
                          aria-label={`Temporary password for ${u.username}`}
                          type="password"
                          placeholder="Custom temp password (optional)"
                          value={tempPwInput.password}
                          onChange={(e: any) =>
                            setTempPwInputs((prev) => ({
                              ...prev,
                              [u.id]: {
                                ...tempPwInput,
                                password: e.target.value,
                              },
                            }))
                          }
                          style={{ width: 220 }}
                        />
                        <Select
                          aria-label={`Temporary password expiry for ${u.username}`}
                          value={tempPwInput.expiryHours}
                          onChange={(e: any) =>
                            setTempPwInputs((prev) => ({
                              ...prev,
                              [u.id]: {
                                ...tempPwInput,
                                expiryHours: e.value,
                              },
                            }))
                          }
                          options={[
                            { label: "1 hour", value: "1" },
                            { label: "4 hours", value: "4" },
                            { label: "24 hours", value: "24" },
                            { label: "48 hours", value: "48" },
                            { label: "7 days", value: "168" },
                          ]}
                          width={120}
                        />
                        <UiButton
                          compact
                          disabled={setTempPasswordMutation.isPending}
                          onClick={() =>
                            setTempPasswordMutation.mutate({
                              id: u.id,
                              password: tempPwInput.password,
                              expiryHours:
                                Number(tempPwInput.expiryHours) || 24,
                            })
                          }
                        >
                          {setTempPasswordMutation.isPending
                            ? "Setting temp password..."
                            : "Set temp password"}
                        </UiButton>
                        {tempPwResult && (
                          <UiButton
                            compact
                            disabled={clearTempPasswordMutation.isPending}
                            onClick={() =>
                              clearTempPasswordMutation.mutate(u.id)
                            }
                          >
                            Revoke temp password
                          </UiButton>
                        )}
                      </ActionRow>
                    </SubSection>
                  )}

                  {dossierOpen && (
                    <SubSection>
                      <MetaText>
                        <strong>On-Chain Dossier for {u.username}</strong>
                        <br />
                        Live wallet surveillance, pulled from TzKT and synced
                        every 5 minutes. Use Resync to force a fresh backfill.
                      </MetaText>
                      <WalletDossier mode="admin-user" userId={u.id} />
                    </SubSection>
                  )}
                </TableDataCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </TableWrap>
      {filteredUsers.length === 0 && (
        <UiEmptyState title="No users found">
          Change the search text or clear the filter to inspect all users.
        </UiEmptyState>
      )}
    </>
  );
}
