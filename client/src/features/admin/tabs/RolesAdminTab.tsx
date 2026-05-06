import type { Dispatch, ReactElement, SetStateAction } from "react";
import {
  Hourglass,
  Select,
  Table,
  TableBody,
  TableDataCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from "react95";
import styled from "styled-components";
import {
  CATEGORY_LABELS,
  PERMISSIONS,
  PERMISSION_CATEGORIES,
  ROLE_LABELS,
  ROLE_ORDER,
  type PermissionCategory,
  type PermissionKey,
} from "@shared/types";
import type {
  ResetPermissionPayload,
  RolePermissionMatrix,
  TogglePermissionPayload,
} from "../types";

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending: boolean;
};

type RolesAdminTabProps = {
  permCategoryFilter: PermissionCategory | "";
  setPermCategoryFilter: Dispatch<SetStateAction<PermissionCategory | "">>;
  rolePerms: RolePermissionMatrix | undefined;
  togglePermMutation: AdminMutation<TogglePermissionPayload>;
  resetPermMutation: AdminMutation<ResetPermissionPayload>;
  ConfirmButton: (props: {
    label: string;
    confirmLabel?: string;
    onConfirm: () => void;
    disabled?: boolean;
    size?: "sm" | "lg";
  }) => ReactElement;
};

export function RolesAdminTab({
  permCategoryFilter,
  setPermCategoryFilter,
  rolePerms,
  togglePermMutation,
  resetPermMutation,
  ConfirmButton,
}: RolesAdminTabProps) {
  return (
    <>
      <h3>Roles & Permissions</h3>
      <p style={{ fontSize: 12, marginBottom: 8, color: "#444" }}>
        Toggle individual permissions for each role. Admin core permissions cannot be revoked.
      </p>

      <ActionRow style={{ marginBottom: 10, flexWrap: "wrap" }}>
        <Select
          value={permCategoryFilter}
          onChange={(e: any) => setPermCategoryFilter(e.value)}
          options={[
            { label: "All Categories", value: "" },
            ...PERMISSION_CATEGORIES.map((c) => ({
              label: CATEGORY_LABELS[c],
              value: c,
            })),
          ]}
          width={180}
        />
        <ConfirmButton
          label="Reset All to Defaults"
          confirmLabel="Yes, Reset All"
          onConfirm={() => resetPermMutation.mutate({})}
          disabled={resetPermMutation.isPending}
        />
        {ROLE_ORDER.filter((r) => r !== "admin").map((r) => (
          <ConfirmButton
            key={r}
            label={`Reset ${ROLE_LABELS[r]}`}
            confirmLabel={`Yes, Reset ${ROLE_LABELS[r]}`}
            onConfirm={() => resetPermMutation.mutate({ role: r })}
            disabled={resetPermMutation.isPending}
          />
        ))}
      </ActionRow>

      {!rolePerms ? (
        <Hourglass size={32} />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell
                  style={{
                    minWidth: 200,
                    position: "sticky",
                    left: 0,
                    background: "#c0c0c0",
                    zIndex: 1,
                  }}
                >
                  Permission
                </TableHeadCell>
                {ROLE_ORDER.map((role) => (
                  <TableHeadCell
                    key={role}
                    style={{ textAlign: "center", minWidth: 90 }}
                  >
                    {ROLE_LABELS[role]}
                  </TableHeadCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {PERMISSION_CATEGORIES
                .filter((cat) => !permCategoryFilter || cat === permCategoryFilter)
                .map((cat) => {
                  const catPerms = PERMISSIONS.filter((p) => p.category === cat);
                  if (catPerms.length === 0) return null;
                  return [
                    <tr key={`cat-${cat}`}>
                      <td
                        colSpan={ROLE_ORDER.length + 1}
                        style={{
                          background: "#000080",
                          color: "#fff",
                          fontWeight: "bold",
                          fontSize: 12,
                          padding: "4px 8px",
                        }}
                      >
                        {CATEGORY_LABELS[cat]}
                      </td>
                    </tr>,
                    ...catPerms.map((perm) => (
                      <TableRow key={perm.key}>
                        <TableDataCell
                          style={{
                            fontSize: 11,
                            position: "sticky",
                            left: 0,
                            background: "#c0c0c0",
                            zIndex: 1,
                          }}
                          title={perm.description}
                        >
                          <div>{perm.label}</div>
                          <div style={{ fontSize: 9, color: "#666", marginTop: 1 }}>
                            {perm.description}
                          </div>
                        </TableDataCell>
                        {ROLE_ORDER.map((role) => {
                          const granted =
                            rolePerms[role]?.[perm.key as PermissionKey] ?? false;
                          const isLocked = role === "admin" || role === "host";

                          return (
                            <TableDataCell
                              key={role}
                              style={{ textAlign: "center" }}
                            >
                              <input
                                type="checkbox"
                                checked={granted}
                                disabled={isLocked || togglePermMutation.isPending}
                                onChange={() =>
                                  togglePermMutation.mutate({
                                    role,
                                    permissionKey: perm.key,
                                    granted: !granted,
                                  })
                                }
                                title={
                                  isLocked
                                    ? `${ROLE_LABELS[role]} always has all permissions`
                                    : `${granted ? "Revoke" : "Grant"} ${perm.label} for ${ROLE_LABELS[role]}`
                                }
                                style={{
                                  cursor: isLocked ? "not-allowed" : "pointer",
                                }}
                              />
                            </TableDataCell>
                          );
                        })}
                      </TableRow>
                    )),
                  ];
                })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
