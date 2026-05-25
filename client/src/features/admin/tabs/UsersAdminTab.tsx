import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  Button,
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
  gap: 4px;
  margin-bottom: 8px;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

const SubSection = styled.div`
  margin-top: 12px;
  padding: 8px;
  border: 1px solid #888;
  background: #fff;
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
        <Button size={size} onClick={onConfirm} disabled={disabled}>
          {confirmLabel || `Yes, ${label}`}
        </Button>
        <Button size={size} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </ActionRow>
    );
  }
  return (
    <Button size={size} onClick={() => setConfirming(true)} disabled={disabled}>
      {label}
    </Button>
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
          placeholder="Search users by name or email..."
          value={userSearch}
          onChange={(e: any) => setUserSearch(e.target.value)}
          fullWidth
        />
      </Field>
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
                        <span
                          key={role}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            position: "relative",
                            padding: "3px 17px 3px 6px",
                            border: "1px solid #777",
                            background: "#fff",
                            fontSize: 11,
                            minHeight: 18,
                          }}
                        >
                          {roleLabels.get(role) ?? formatRoleLabel(role)}
                          {userRoles.length > 1 ? (
                            <button
                              type="button"
                              disabled={removeUserRoleMutation.isPending}
                              onClick={() =>
                                removeUserRoleMutation.mutate({ id: u.id, role })
                              }
                              title={`Remove ${roleLabels.get(role) ?? formatRoleLabel(role)}`}
                              style={{
                                position: "absolute",
                                top: -5,
                                right: -5,
                                width: 13,
                                height: 13,
                                border: "1px solid #7a0000",
                                background: "#c00000",
                                color: "#fff",
                                cursor: "pointer",
                                padding: 0,
                                lineHeight: "10px",
                                fontSize: 10,
                                fontWeight: 700,
                              }}
                            >
                              x
                            </button>
                          ) : null}
                        </span>
                      ))}
                    </ActionRow>
                    <Select
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
                      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 5 }}>
                        Curses
                      </div>
                      <ActionRow>
                        {activeCurses.length ? (
                          activeCurses.map((curse) => (
                            <span
                              key={curse.key}
                              title={curse.effect}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "2px 5px",
                                border: "1px solid #3a3a3a",
                                background: "#d6ffd6",
                                color: "#053b05",
                                fontSize: 11,
                              }}
                            >
                              {curse.label}
                              <button
                                type="button"
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
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: 11, color: "#555" }}>None</span>
                        )}
                      </ActionRow>
                      <ActionRow style={{ marginTop: 6 }}>
                        <Select
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
                        <Button
                          size="sm"
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
                          Curse
                        </Button>
                      </ActionRow>
                    </SubSection>
                  </div>
                </TableDataCell>
                <TableDataCell>{u.experiencePoints ?? 0}</TableDataCell>
                <TableDataCell>
                  <ActionRow>
                    <TextInput
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
                    <Button
                      size="sm"
                      disabled={updateIdentityMutation.isPending}
                      onClick={() =>
                        updateIdentityMutation.mutate({
                          id: u.id,
                          username: identityDraft.username,
                          displayName: identityDraft.displayName,
                        })
                      }
                    >
                      Save Names
                    </Button>
                    <Button
                      size="sm"
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
                      Clear X
                    </Button>
                    <Button
                      size="sm"
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
                      Clear Discord
                    </Button>
                    <TextInput
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
                    <Button
                      size="sm"
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
                      Award XP
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        setTempPwPanels((prev) => ({
                          ...prev,
                          [u.id]: !tempPwPanel,
                        }))
                      }
                    >
                      {tempPwPanel ? "▲ Temp PW" : "▼ Temp PW"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        setDossierPanels((prev) => ({
                          ...prev,
                          [u.id]: !dossierOpen,
                        }))
                      }
                    >
                      {dossierOpen ? "▲ Dossier" : "▼ Dossier"}
                    </Button>
                    <ConfirmButton
                      label="Delete"
                      confirmLabel="Confirm Delete"
                      onConfirm={() => deleteUserMutation.mutate(u.id)}
                      disabled={deleteUserMutation.isPending}
                    />
                  </ActionRow>

                  {tempPwPanel && (
                    <SubSection style={{ marginTop: 8 }}>
                      <p style={{ fontSize: 11, marginBottom: 6 }}>
                        <strong>Temporary password for {u.username}</strong>
                        <br />
                        The user can log in with either their real password or
                        the temp password until it expires. Leave the password
                        field blank to auto-generate a secure one.
                      </p>
                      {tempPwResult && (
                        <p
                          style={{
                            fontSize: 11,
                            padding: 6,
                            background: "#e8ffe8",
                            border: "1px solid #008000",
                            marginBottom: 6,
                            wordBreak: "break-all",
                          }}
                        >
                          <strong>Temp password (shown once):</strong>{" "}
                          <code
                            style={{
                              background: "#fff",
                              padding: "1px 4px",
                              userSelect: "all",
                            }}
                          >
                            {tempPwResult.password}
                          </code>
                          <br />
                          <span style={{ fontSize: 10, color: "#555" }}>
                            Expires:{" "}
                            {new Date(tempPwResult.expiresAt).toLocaleString()}
                          </span>
                        </p>
                      )}
                      <ActionRow style={{ flexWrap: "wrap" }}>
                        <TextInput
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
                        <Button
                          size="sm"
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
                            ? "Setting..."
                            : "Set Temp PW"}
                        </Button>
                        {tempPwResult && (
                          <Button
                            size="sm"
                            disabled={clearTempPasswordMutation.isPending}
                            onClick={() =>
                              clearTempPasswordMutation.mutate(u.id)
                            }
                          >
                            Revoke
                          </Button>
                        )}
                      </ActionRow>
                    </SubSection>
                  )}

                  {dossierOpen && (
                    <SubSection style={{ marginTop: 8 }}>
                      <p style={{ fontSize: 11, marginBottom: 6 }}>
                        <strong>On-Chain Dossier for {u.username}</strong>
                        <br />
                        Live wallet surveillance — pulled from TzKT and synced
                        every 5 minutes. Use Resync to force a fresh backfill.
                      </p>
                      <WalletDossier mode="admin-user" userId={u.id} />
                    </SubSection>
                  )}
                </TableDataCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {filteredUsers.length === 0 && <p>No users found.</p>}
    </>
  );
}
