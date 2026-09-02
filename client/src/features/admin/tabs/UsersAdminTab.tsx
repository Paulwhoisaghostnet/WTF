import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Eye, KeyRound, ShieldAlert, UserCheck, UsersRound } from "lucide-react";
import styled from "styled-components";
import { formatRoleLabel, type RoleDefinition } from "@shared/types";
import { normalizeWtfCurseStatuses } from "@shared/curses";
import { UiButton, UiStatusPill } from "../../../components/wtfos-ui";
import type {
  AdminUser,
  AssignUserRolePayload,
  AwardXpPayload,
  ClearUserSocialPayload,
  RemoveUserRolePayload,
  SetTempPasswordPayload,
  TempPasswordResult,
  UpdateIdentityPayload,
  UpdateUserCursePayload,
} from "../types";
import { AdminUserPassport } from "../components/AdminUserPassport";
import {
  AdminScopeHeader,
  AdminScopeMetric,
  AdminScopeSearch,
  AdminScopeSummaryGrid,
  AdminScopeTable,
  AdminScopeToolbar,
  AdminScopeWorkspace,
  type AdminScopeColumn,
} from "../components/AdminScopeWorkspace";

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending: boolean;
};

type UserStatusFilter = "all" | "attention" | "cursed" | "temporary-password" | "ready";

type UsersAdminTabProps = {
  allUsers: AdminUser[];
  userSearch: string;
  setUserSearch: Dispatch<SetStateAction<string>>;
  tempPwInputs: Record<number, { password: string; expiryHours: string }>;
  setTempPwInputs: Dispatch<SetStateAction<Record<number, { password: string; expiryHours: string }>>>;
  tempPwResults: Record<number, TempPasswordResult | null>;
  assignUserRoleMutation: AdminMutation<AssignUserRolePayload>;
  removeUserRoleMutation: AdminMutation<RemoveUserRolePayload>;
  updateUserCurseMutation: AdminMutation<UpdateUserCursePayload>;
  roleCatalog: RoleDefinition[] | undefined;
  awardXpMutation: AdminMutation<AwardXpPayload>;
  updateIdentityMutation: AdminMutation<UpdateIdentityPayload>;
  clearUserSocialMutation: AdminMutation<ClearUserSocialPayload>;
  deleteUserMutation: AdminMutation<number>;
  canDeleteUsers: boolean;
  setTempPasswordMutation: AdminMutation<SetTempPasswordPayload>;
  clearTempPasswordMutation: AdminMutation<number>;
};

const NameButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: var(--wtf-app-link, #000080);
  padding: 0;
  font: inherit;
  font-weight: 700;
  text-align: left;
  text-decoration: underline;
  cursor: pointer;
`;

const UserIdentity = styled.div`
  display: grid;
  gap: 2px;
  min-width: 0;

  small {
    color: var(--wtf-app-muted-text, #444);
    overflow-wrap: anywhere;
  }
`;

const NativeSelect = styled.select`
  min-height: 36px;
  border: 1px solid var(--wtf-app-control-border, #808080);
  background: var(--wtf-app-control-bg, #fff);
  color: var(--wtf-app-text, #111);
  padding: 6px 8px;
  font: inherit;
`;

const SignalStack = styled.div`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
`;

function setUserQueryParam(userId: number | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (userId == null) url.searchParams.delete("user");
  else url.searchParams.set("user", String(userId));
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function initialUserId() {
  if (typeof window === "undefined") return null;
  const value = Number(new URLSearchParams(window.location.search).get("user"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function userNeedsAttention(user: AdminUser) {
  return !user.welcomedToWtfOs || user.hasTemporaryPassword || user.curses.length > 0;
}

export function UsersAdminTab({
  allUsers,
  userSearch,
  setUserSearch,
  tempPwInputs,
  setTempPwInputs,
  tempPwResults,
  assignUserRoleMutation,
  removeUserRoleMutation,
  updateUserCurseMutation,
  roleCatalog,
  awardXpMutation,
  updateIdentityMutation,
  clearUserSocialMutation,
  deleteUserMutation,
  canDeleteUsers,
  setTempPasswordMutation,
  clearTempPasswordMutation,
}: UsersAdminTabProps) {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(initialUserId);
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const selectedUser = allUsers.find((user) => user.id === selectedUserId) ?? null;

  useEffect(() => {
    if (selectedUserId != null && allUsers.length > 0 && !selectedUser) {
      setSelectedUserId(null);
      setUserQueryParam(null);
    }
  }, [allUsers, selectedUser, selectedUserId]);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLocaleLowerCase();
    return allUsers.filter((user) => {
      const curses = normalizeWtfCurseStatuses(user.curses);
      const matchesFilter =
        statusFilter === "all" ||
        (statusFilter === "attention" && userNeedsAttention(user)) ||
        (statusFilter === "cursed" && curses.length > 0) ||
        (statusFilter === "temporary-password" && user.hasTemporaryPassword) ||
        (statusFilter === "ready" && !userNeedsAttention(user));
      if (!matchesFilter) return false;
      if (!query) return true;
      return [
        user.username,
        user.displayName,
        user.email,
        user.highestRole?.label,
        user.highestRole?.slug,
        user.xpTier?.label,
        ...curses.flatMap((curse) => [curse.label, curse.key, curse.reason]),
      ].some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
    });
  }, [allUsers, statusFilter, userSearch]);

  function selectUser(user: AdminUser) {
    setSelectedUserId(user.id);
    setUserQueryParam(user.id);
  }

  function clearSelection() {
    setSelectedUserId(null);
    setUserQueryParam(null);
  }

  const columns = useMemo<AdminScopeColumn<AdminUser>[]>(
    () => [
      {
        key: "user",
        label: "User",
        width: "29%",
        sortValue: (user) => user.displayName || user.username,
        render: (user) => (
          <UserIdentity>
            <NameButton
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                selectUser(user);
              }}
              aria-label={`Open WTF Passport for ${user.username}`}
            >
              {user.displayName || `@${user.username}`} <Eye size={13} aria-hidden="true" />
            </NameButton>
            <small>@{user.username} · #{user.id}</small>
          </UserIdentity>
        ),
      },
      {
        key: "role",
        label: "Highest role",
        sortValue: (user) => user.highestRole?.accessLevel ?? 0,
        render: (user) => (
          <UserIdentity>
            <strong>{user.highestRole?.label ?? formatRoleLabel(user.role)}</strong>
            <small>{user.roles.length} assigned</small>
          </UserIdentity>
        ),
      },
      {
        key: "level",
        label: "Level",
        width: "9%",
        align: "right",
        sortValue: (user) => user.highestRole?.accessLevel ?? 0,
        render: (user) => <strong>L{user.highestRole?.accessLevel ?? 0}</strong>,
      },
      {
        key: "experience",
        label: "EXP",
        sortValue: (user) => user.experiencePoints,
        render: (user) => (
          <UserIdentity>
            <strong>{user.xpTier?.label ?? "Unranked"}</strong>
            <small>{user.experiencePoints.toLocaleString()} EXP</small>
          </UserIdentity>
        ),
      },
      {
        key: "curses",
        label: "Curses",
        align: "right",
        sortValue: (user) => normalizeWtfCurseStatuses(user.curses).length,
        render: (user) => {
          const count = normalizeWtfCurseStatuses(user.curses).length;
          return <UiStatusPill $tone={count ? "warning" : "neutral"}>{count}</UiStatusPill>;
        },
      },
      {
        key: "signals",
        label: "Signals",
        sortValue: (user) => (userNeedsAttention(user) ? 1 : 0),
        render: (user) => (
          <SignalStack>
            {!user.welcomedToWtfOs ? <UiStatusPill $tone="warning">Setup</UiStatusPill> : null}
            {user.hasTemporaryPassword ? <UiStatusPill $tone="info"><KeyRound size={12} aria-hidden="true" /> Temp</UiStatusPill> : null}
            {normalizeWtfCurseStatuses(user.curses).length ? <UiStatusPill $tone="danger"><ShieldAlert size={12} aria-hidden="true" /> Cursed</UiStatusPill> : null}
            {!userNeedsAttention(user) ? <UiStatusPill $tone="success"><UserCheck size={12} aria-hidden="true" /> Ready</UiStatusPill> : null}
          </SignalStack>
        ),
      },
    ],
    []
  );

  const cursedCount = allUsers.filter((user) => normalizeWtfCurseStatuses(user.curses).length > 0).length;
  const attentionCount = allUsers.filter(userNeedsAttention).length;
  const tempPasswordCount = allUsers.filter((user) => user.hasTemporaryPassword).length;

  return (
    <AdminScopeWorkspace
      detailOpen={selectedUser != null}
      scope={
        <>
          <AdminScopeHeader
            title="User role review"
            description="Broad account scope. Search and sort every user, compare their highest assigned role and access level, then open the name for acute complaint resolution."
          />
          <AdminScopeSummaryGrid>
            <AdminScopeMetric><strong>{allUsers.length}</strong><span>Total users</span></AdminScopeMetric>
            <AdminScopeMetric><strong>{attentionCount}</strong><span>Needs review</span></AdminScopeMetric>
            <AdminScopeMetric><strong>{cursedCount}</strong><span>With curses</span></AdminScopeMetric>
            <AdminScopeMetric><strong>{tempPasswordCount}</strong><span>Recovery active</span></AdminScopeMetric>
          </AdminScopeSummaryGrid>
          <AdminScopeToolbar>
            <AdminScopeSearch label="Search user role review" placeholder="Name, email, role, tier, curse…" value={userSearch} onChange={setUserSearch} />
            <NativeSelect aria-label="Filter user status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as UserStatusFilter)}>
              <option value="all">All users</option>
              <option value="attention">Needs review</option>
              <option value="ready">Ready</option>
              <option value="cursed">Has curses</option>
              <option value="temporary-password">Temporary password</option>
            </NativeSelect>
            {(userSearch || statusFilter !== "all") ? <UiButton compact onClick={() => { setUserSearch(""); setStatusFilter("all"); }}>Clear filters</UiButton> : null}
          </AdminScopeToolbar>
          <AdminScopeTable
            ariaLabel="All users with highest assigned role and level"
            rows={filteredUsers}
            columns={columns}
            rowKey={(user) => user.id}
            selectedKey={selectedUserId}
            onSelect={selectUser}
            defaultSortKey="role"
            defaultSortDirection="desc"
            emptyTitle="No users match this scope"
            emptyDescription="Clear the search or status filter to return to the full role review."
          />
          <UiStatusPill $tone="neutral"><UsersRound size={13} aria-hidden="true" /> {filteredUsers.length} of {allUsers.length} users shown</UiStatusPill>
        </>
      }
      detail={
        <AdminUserPassport
          selectedUser={selectedUser}
          onBack={clearSelection}
          onDeleted={clearSelection}
          roleCatalog={roleCatalog}
          tempPasswordInput={selectedUser ? tempPwInputs[selectedUser.id] ?? { password: "", expiryHours: "24" } : { password: "", expiryHours: "24" }}
          setTempPasswordInput={(value) => {
            if (!selectedUser) return;
            setTempPwInputs((current) => ({ ...current, [selectedUser.id]: value }));
          }}
          tempPasswordResult={selectedUser ? tempPwResults[selectedUser.id] : null}
          assignUserRoleMutation={assignUserRoleMutation}
          removeUserRoleMutation={removeUserRoleMutation}
          updateUserCurseMutation={updateUserCurseMutation}
          awardXpMutation={awardXpMutation}
          updateIdentityMutation={updateIdentityMutation}
          clearUserSocialMutation={clearUserSocialMutation}
          deleteUserMutation={deleteUserMutation}
          canDeleteUsers={canDeleteUsers}
          setTempPasswordMutation={setTempPasswordMutation}
          clearTempPasswordMutation={clearTempPasswordMutation}
        />
      }
    />
  );
}
