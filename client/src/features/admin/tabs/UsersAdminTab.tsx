import { useState, type Dispatch, type SetStateAction } from "react";
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
import type {
  AwardXpPayload,
  ClearUserSocialPayload,
  SetTempPasswordPayload,
  TempPasswordResult,
  UpdateIdentityPayload,
  UpdateRolePayload,
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

const ROLE_OPTIONS = [
  { label: "Admin", value: "admin" },
  { label: "Host", value: "host" },
  { label: "Cohost", value: "cohost" },
  { label: "Resident Wizard", value: "resident_wizard" },
  { label: "Contestant", value: "contestant" },
  { label: "Witness", value: "witness" },
];

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
  updateRoleMutation: AdminMutation<UpdateRolePayload>;
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
  updateRoleMutation,
  awardXpMutation,
  updateIdentityMutation,
  clearUserSocialMutation,
  deleteUserMutation,
  setTempPasswordMutation,
  clearTempPasswordMutation,
}: UsersAdminTabProps) {
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
            <TableHeadCell>Role</TableHeadCell>
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
            return (
              <TableRow key={u.id}>
                <TableDataCell>
                  <UserLink username={u.username} />
                </TableDataCell>
                <TableDataCell>{u.displayName || "---"}</TableDataCell>
                <TableDataCell>
                  <Select
                    value={u.role}
                    onChange={(e: any) =>
                      updateRoleMutation.mutate({ id: u.id, role: e.value })
                    }
                    options={ROLE_OPTIONS}
                    width={150}
                  />
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
