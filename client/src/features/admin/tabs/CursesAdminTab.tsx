import { useMemo, useState } from "react";
import { Ban, ShieldAlert, UserRoundSearch } from "lucide-react";
import styled from "styled-components";
import {
  WTF_CURSE_DEFINITIONS,
  normalizeWtfCurseStatuses,
  type WtfCurseDefinition,
  type WtfCurseKey,
  type WtfCurseStatus,
} from "@shared/curses";
import { UiButton, UiEmptyState, UiField, UiNotice, UiStatusPill } from "../../../components/wtfos-ui";
import type { AdminUser, UpdateUserCursePayload } from "../types";
import {
  AdminDetailHeader,
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

type CurseAssignment = {
  user: AdminUser;
  curse: WtfCurseStatus;
};

type CurseScopeRow = WtfCurseDefinition & {
  assignments: CurseAssignment[];
};

const Stack = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;
`;

const NativeSelect = styled.select`
  width: 100%;
  min-height: 36px;
  border: 1px solid var(--wtf-app-control-border, #808080);
  background: var(--wtf-app-control-bg, #fff);
  color: var(--wtf-app-text, #111);
  padding: 6px 8px;
  font: inherit;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 70px;
  resize: vertical;
  border: 1px solid var(--wtf-app-control-border, #808080);
  background: var(--wtf-app-control-bg, #fff);
  color: var(--wtf-app-text, #111);
  padding: 7px 8px;
  font: inherit;
`;

const DefinitionCard = styled.div`
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #fff);
  padding: var(--wtf-space-3, 12px);

  h4,
  p {
    margin: 0;
  }

  p {
    margin-top: 6px;
    color: var(--wtf-app-muted-text, #444);
    line-height: 1.4;
  }
`;

const NameButton = styled.button`
  border: 0;
  background: transparent;
  color: var(--wtf-app-link, #000080);
  padding: 0;
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
`;

function displayDate(value: string | Date | null | undefined) {
  if (!value) return "Not set";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function setCurseQueryParam(key: WtfCurseKey | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (key) url.searchParams.set("curse", key);
  else url.searchParams.delete("curse");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function initialCurseKey(): WtfCurseKey | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("curse");
  return WTF_CURSE_DEFINITIONS.some((curse) => curse.key === value)
    ? (value as WtfCurseKey)
    : null;
}

export function CursesAdminTab({
  allUsers,
  updateUserCurseMutation,
  onOpenUser,
}: {
  allUsers: AdminUser[];
  updateUserCurseMutation: AdminMutation<UpdateUserCursePayload>;
  onOpenUser: (userId: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<WtfCurseKey | null>(initialCurseKey);
  const [targetUserId, setTargetUserId] = useState("");
  const [reason, setReason] = useState("");

  const scopeRows = useMemo<CurseScopeRow[]>(
    () =>
      WTF_CURSE_DEFINITIONS.map((definition) => ({
        ...definition,
        assignments: allUsers.flatMap((user) => {
          const curse = normalizeWtfCurseStatuses(user.curses).find(
            (candidate) => candidate.key === definition.key
          );
          return curse ? [{ user, curse }] : [];
        }),
      })),
    [allUsers]
  );
  const selected = scopeRows.find((row) => row.key === selectedKey) ?? null;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredRows = scopeRows.filter((row) => {
    if (!normalizedSearch) return true;
    return [
      row.key,
      row.label,
      row.summary,
      row.effect,
      ...row.assignments.flatMap(({ user, curse }) => [
        user.username,
        user.displayName,
        user.email,
        curse.reason,
      ]),
    ].some((value) => String(value ?? "").toLocaleLowerCase().includes(normalizedSearch));
  });
  const affectedUserCount = new Set(
    scopeRows.flatMap((row) => row.assignments.map(({ user }) => user.id))
  ).size;
  const activeAssignmentCount = scopeRows.reduce(
    (sum, row) => sum + row.assignments.length,
    0
  );
  const expiringCount = scopeRows.reduce(
    (sum, row) => sum + row.assignments.filter(({ curse }) => curse.expiresAt).length,
    0
  );

  function selectCurse(row: CurseScopeRow) {
    setSelectedKey(row.key);
    setCurseQueryParam(row.key);
    setTargetUserId("");
    setReason("");
  }

  const columns = useMemo<AdminScopeColumn<CurseScopeRow>[]>(
    () => [
      {
        key: "curse",
        label: "Curse",
        width: "25%",
        sortValue: (row) => row.label,
        render: (row) => <strong>{row.label}</strong>,
      },
      {
        key: "key",
        label: "Canonical key",
        sortValue: (row) => row.key,
        render: (row) => <code>{row.key}</code>,
      },
      {
        key: "effect",
        label: "User-visible effect",
        sortValue: (row) => row.effect,
        render: (row) => row.effect,
      },
      {
        key: "assignments",
        label: "Active",
        width: "10%",
        align: "right",
        sortValue: (row) => row.assignments.length,
        render: (row) => (
          <UiStatusPill $tone={row.assignments.length ? "warning" : "neutral"}>
            {row.assignments.length}
          </UiStatusPill>
        ),
      },
    ],
    []
  );

  const assignmentColumns = useMemo<AdminScopeColumn<CurseAssignment>[]>(
    () => [
      {
        key: "user",
        label: "User",
        sortValue: ({ user }) => user.displayName || user.username,
        render: ({ user }) => (
          <NameButton
            type="button"
            aria-label={`Open WTF Passport for ${user.username}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpenUser(user.id);
            }}
          >
            {user.displayName || `@${user.username}`}
          </NameButton>
        ),
      },
      {
        key: "role",
        label: "Highest role",
        sortValue: ({ user }) => user.highestRole?.accessLevel ?? 0,
        render: ({ user }) => `${user.highestRole?.label ?? user.role} · L${user.highestRole?.accessLevel ?? 0}`,
      },
      {
        key: "reason",
        label: "Reason",
        sortValue: ({ curse }) => curse.reason,
        render: ({ curse }) => curse.reason || "Not recorded",
      },
      {
        key: "assigned",
        label: "Assigned",
        sortValue: ({ curse }) => curse.assignedAt ? new Date(curse.assignedAt) : null,
        render: ({ curse }) => displayDate(curse.assignedAt),
      },
      {
        key: "actions",
        label: "Action",
        render: ({ user }) => (
          <UiButton
            compact
            disabled={!selectedKey || updateUserCurseMutation.isPending}
            onClick={(event: any) => {
              event.stopPropagation();
              if (!selectedKey) return;
              updateUserCurseMutation.mutate({ id: user.id, curseKey: selectedKey, active: false });
            }}
          >
            Lift
          </UiButton>
        ),
      },
    ],
    [onOpenUser, selectedKey, updateUserCurseMutation]
  );

  const availableUsers = selected
    ? allUsers.filter(
        (user) => !selected.assignments.some((assignment) => assignment.user.id === user.id)
      )
    : [];

  return (
    <AdminScopeWorkspace
      detailOpen={selected != null}
      scope={
        <>
          <AdminScopeHeader
            title="Curse assignment scope"
            description="Broad curse review. Search curse definitions, effects, reasons, and affected accounts; sort the catalog before narrowing into one curse."
          />
          <AdminScopeSummaryGrid>
            <AdminScopeMetric><strong>{scopeRows.length}</strong><span>Curse types</span></AdminScopeMetric>
            <AdminScopeMetric><strong>{activeAssignmentCount}</strong><span>Active assignments</span></AdminScopeMetric>
            <AdminScopeMetric><strong>{affectedUserCount}</strong><span>Affected users</span></AdminScopeMetric>
            <AdminScopeMetric><strong>{expiringCount}</strong><span>With expiry</span></AdminScopeMetric>
          </AdminScopeSummaryGrid>
          <AdminScopeToolbar>
            <AdminScopeSearch label="Search curse scope" placeholder="Curse, effect, reason, or user…" value={search} onChange={setSearch} />
            {search ? <UiButton compact onClick={() => setSearch("")}>Clear search</UiButton> : null}
          </AdminScopeToolbar>
          <AdminScopeTable
            ariaLabel="Curse definitions and active user assignment counts"
            rows={filteredRows}
            columns={columns}
            rowKey={(row) => row.key}
            selectedKey={selectedKey}
            onSelect={selectCurse}
            defaultSortKey="assignments"
            defaultSortDirection="desc"
            emptyTitle="No curses match this search"
          />
        </>
      }
      detail={
        selected ? (
          <Stack data-admin-curse-detail={selected.key}>
            <AdminDetailHeader
              title={selected.label}
              description={`Acute management for ${selected.key}`}
              onBack={() => {
                setSelectedKey(null);
                setCurseQueryParam(null);
              }}
              actions={<UiStatusPill $tone={selected.assignments.length ? "warning" : "success"}>{selected.assignments.length} active</UiStatusPill>}
            />
            <DefinitionCard>
              <h4><Ban size={15} aria-hidden="true" /> What this curse does</h4>
              <p><strong>Summary:</strong> {selected.summary}</p>
              <p><strong>Effect:</strong> {selected.effect}</p>
            </DefinitionCard>
            <UiNotice tone="warning">
              <ShieldAlert size={15} aria-hidden="true" /> Applying or lifting a curse changes the user’s effective wtfOS behavior immediately and is recorded in the system log.
            </UiNotice>
            <DefinitionCard>
              <h4>Apply to another user</h4>
              <UiField label="User" hint={`${availableUsers.length} eligible accounts are not currently assigned this curse.`}>
                <NativeSelect aria-label={`User to assign ${selected.label}`} value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)}>
                  <option value="">Choose a user…</option>
                  {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.displayName || user.username} · @{user.username} · L{user.highestRole?.accessLevel ?? 0}</option>)}
                </NativeSelect>
              </UiField>
              <UiField label="Reason" hint="Explain the operator context so another admin can resolve the complaint later.">
                <TextArea aria-label={`Reason for assigning ${selected.label}`} value={reason} onChange={(event) => setReason(event.target.value)} />
              </UiField>
              <UiButton
                uiVariant="primary"
                disabled={!targetUserId || updateUserCurseMutation.isPending}
                onClick={() => {
                  const id = Number(targetUserId);
                  if (!Number.isInteger(id)) return;
                  updateUserCurseMutation.mutate({ id, curseKey: selected.key, active: true, reason });
                  setTargetUserId("");
                  setReason("");
                }}
              >
                Apply {selected.label}
              </UiButton>
            </DefinitionCard>
            <DefinitionCard>
              <h4>Affected users</h4>
              {selected.assignments.length ? (
                <AdminScopeTable
                  ariaLabel={`Users assigned ${selected.label}`}
                  rows={selected.assignments}
                  columns={assignmentColumns}
                  rowKey={({ user }) => user.id}
                  onSelect={({ user }) => onOpenUser(user.id)}
                  defaultSortKey="user"
                />
              ) : (
                <UiEmptyState title="No active assignments">
                  This curse exists in the catalog but currently affects no accounts.
                </UiEmptyState>
              )}
            </DefinitionCard>
            <UiButton compact onClick={() => onOpenUser(Number(targetUserId))} disabled={!targetUserId}>
              <UserRoundSearch size={14} aria-hidden="true" /> Preview selected user’s Passport
            </UiButton>
          </Stack>
        ) : (
          <UiEmptyState title="Choose a curse for acute management">
            The detail view shows every affected user and provides deliberate apply/lift controls.
          </UiEmptyState>
        )
      }
    />
  );
}
