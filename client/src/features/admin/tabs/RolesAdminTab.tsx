import { useMemo, useState, type Dispatch, type ReactElement, type SetStateAction } from "react";
import {
  Button,
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
  ROLE_CATEGORIES,
  formatRoleLabel,
  type PermissionCategory,
  type PermissionKey,
  type RoleDefinition,
} from "@shared/types";
import type {
  ResetRoleSurfaceAccessPayload,
  ResetPermissionPayload,
  RoleAccessResponse,
  RolePermissionMatrix,
  ToggleRoleSurfaceAccessPayload,
  TogglePermissionPayload,
  UpsertRolePayload,
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
  roleCatalog: RoleDefinition[] | undefined;
  roleAccess: RoleAccessResponse | undefined;
  upsertRoleMutation: AdminMutation<UpsertRolePayload>;
  togglePermMutation: AdminMutation<TogglePermissionPayload>;
  resetPermMutation: AdminMutation<ResetPermissionPayload>;
  toggleRoleSurfaceAccessMutation: AdminMutation<ToggleRoleSurfaceAccessPayload>;
  resetRoleSurfaceAccessMutation: AdminMutation<ResetRoleSurfaceAccessPayload>;
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
  roleCatalog,
  roleAccess,
  upsertRoleMutation,
  togglePermMutation,
  resetPermMutation,
  toggleRoleSurfaceAccessMutation,
  resetRoleSurfaceAccessMutation,
  ConfirmButton,
}: RolesAdminTabProps) {
  const roles = useMemo(() => {
    const catalog = roleAccess?.roles ?? roleCatalog ?? [];
    if (catalog.length > 0) return catalog;
    const slugs = new Set<string>([
      ...Object.keys(rolePerms ?? {}),
      ...Object.keys(roleAccess?.matrix ?? {}),
    ]);
    return [...slugs].map((slug, index) => ({
      slug,
      label: formatRoleLabel(slug),
      category: "access",
      purpose: "Role catalog row has not been loaded yet.",
      accessLevel: 0,
      sortOrder: 1000 + index,
      defaultWtfOsAccess: false,
      isSystem: false,
      isAssignable: true,
    }));
  }, [roleAccess?.roles, roleAccess?.matrix, roleCatalog, rolePerms]);

  const [roleForm, setRoleForm] = useState({
    slug: "",
    label: "",
    category: "access",
    purpose: "",
    accessLevel: "0",
  });

  return (
    <>
      <h3>Roles & Permissions</h3>
      <p style={{ fontSize: 12, marginBottom: 8, color: "#444" }}>
        Roles are additive access keys. Categories and access levels explain
        intent; permissions and WTF OS access define what each key actually opens.
      </p>

      <h4 style={{ margin: "8px 0 6px" }}>Role Catalog</h4>
      {!roles.length ? (
        <Hourglass size={32} />
      ) : (
        <div style={{ overflowX: "auto", marginBottom: 10 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell style={{ minWidth: 150 }}>Role</TableHeadCell>
                <TableHeadCell style={{ minWidth: 100 }}>Category</TableHeadCell>
                <TableHeadCell style={{ minWidth: 80 }}>Level</TableHeadCell>
                <TableHeadCell style={{ minWidth: 360 }}>Purpose</TableHeadCell>
                <TableHeadCell style={{ minWidth: 90 }}>Default OS</TableHeadCell>
                <TableHeadCell style={{ minWidth: 90 }}>Assignable</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.slug}>
                  <TableDataCell>
                    <strong>{role.label}</strong>
                    <div style={{ fontSize: 9, color: "#666" }}>{role.slug}</div>
                  </TableDataCell>
                  <TableDataCell>{role.category}</TableDataCell>
                  <TableDataCell>{role.accessLevel}</TableDataCell>
                  <TableDataCell style={{ fontSize: 11 }}>{role.purpose}</TableDataCell>
                  <TableDataCell>{role.defaultWtfOsAccess ? "Yes" : "No"}</TableDataCell>
                  <TableDataCell>{role.isAssignable ? "Yes" : "No"}</TableDataCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ActionRow style={{ marginBottom: 14 }}>
        <input
          value={roleForm.slug}
          onChange={(e) =>
            setRoleForm((prev) => ({
              ...prev,
              slug: e.target.value.toLowerCase().replace(/\s+/g, "_"),
            }))
          }
          placeholder="role_slug"
          style={{ width: 118 }}
        />
        <input
          value={roleForm.label}
          onChange={(e) => setRoleForm((prev) => ({ ...prev, label: e.target.value }))}
          placeholder="Title"
          style={{ width: 130 }}
        />
        <Select
          value={roleForm.category}
          onChange={(e: any) => setRoleForm((prev) => ({ ...prev, category: e.value }))}
          options={ROLE_CATEGORIES.map((category) => ({ label: category, value: category }))}
          width={128}
        />
        <input
          value={roleForm.accessLevel}
          onChange={(e) =>
            setRoleForm((prev) => ({ ...prev, accessLevel: e.target.value }))
          }
          placeholder="Level"
          type="number"
          style={{ width: 58 }}
        />
        <input
          value={roleForm.purpose}
          onChange={(e) => setRoleForm((prev) => ({ ...prev, purpose: e.target.value }))}
          placeholder="Purpose"
          style={{ width: 300 }}
        />
        <Button
          size="sm"
          disabled={upsertRoleMutation.isPending}
          onClick={() =>
            upsertRoleMutation.mutate({
              slug: roleForm.slug,
              label: roleForm.label,
              category: roleForm.category,
              purpose: roleForm.purpose,
              accessLevel: Number(roleForm.accessLevel || 0),
              defaultWtfOsAccess: false,
              isAssignable: true,
            })
          }
        >
          Save Role
        </Button>
      </ActionRow>

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
        {roles.filter((r) => r.slug !== "admin").map((r) => (
          <ConfirmButton
            key={r.slug}
            label={`Reset ${r.label}`}
            confirmLabel={`Yes, Reset ${r.label}`}
            onConfirm={() => resetPermMutation.mutate({ role: r.slug })}
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
                {roles.map((role) => (
                  <TableHeadCell
                    key={role.slug}
                    style={{ textAlign: "center", minWidth: 90 }}
                  >
                    {role.label}
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
                        colSpan={roles.length + 1}
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
                        {roles.map((role) => {
                          const granted =
                            rolePerms[role.slug]?.[perm.key as PermissionKey] ?? false;
                          const isLocked = role.slug === "admin";

                          return (
                            <TableDataCell
                              key={role.slug}
                              style={{ textAlign: "center" }}
                            >
                              <input
                                type="checkbox"
                                checked={granted}
                                disabled={isLocked || togglePermMutation.isPending}
                                onChange={() =>
                                  togglePermMutation.mutate({
                                    role: role.slug,
                                    permissionKey: perm.key,
                                    granted: !granted,
                                  })
                                }
                                title={
                                  isLocked
                                    ? `${role.label} always has all permissions`
                                    : `${granted ? "Revoke" : "Grant"} ${perm.label} for ${role.label}`
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

      <h3 style={{ marginTop: 18 }}>WTF OS Access</h3>
      <p style={{ fontSize: 12, marginBottom: 8, color: "#444" }}>
        Grant registered apps, domains, tools, UI surfaces, routes, and
        automation handles by role. The Test Subject role defaults to UX Lab.
      </p>
      <ActionRow style={{ marginBottom: 10, flexWrap: "wrap" }}>
        <ConfirmButton
          label="Reset Access Defaults"
          confirmLabel="Yes, Reset Access"
          onConfirm={() => resetRoleSurfaceAccessMutation.mutate({})}
          disabled={resetRoleSurfaceAccessMutation.isPending}
        />
        {roles.filter((r) => r.slug !== "admin").map((r) => (
          <ConfirmButton
            key={r.slug}
            label={`Reset ${r.label} Access`}
            confirmLabel={`Yes, Reset ${r.label} Access`}
            onConfirm={() => resetRoleSurfaceAccessMutation.mutate({ role: r.slug })}
            disabled={resetRoleSurfaceAccessMutation.isPending}
          />
        ))}
      </ActionRow>
      {!roleAccess ? (
        <Hourglass size={32} />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell
                  style={{
                    minWidth: 260,
                    position: "sticky",
                    left: 0,
                    background: "#c0c0c0",
                    zIndex: 1,
                  }}
                >
                  Registered Surface
                </TableHeadCell>
                {roles.map((role) => (
                  <TableHeadCell
                    key={role.slug}
                    style={{ textAlign: "center", minWidth: 90 }}
                  >
                    {role.label}
                  </TableHeadCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(
                roleAccess.surfaces.reduce<Record<string, typeof roleAccess.surfaces>>(
                  (acc, surface) => {
                    acc[surface.domain] = [...(acc[surface.domain] ?? []), surface];
                    return acc;
                  },
                  {}
                )
              ).flatMap(([domain, surfaces]) => [
                <tr key={`domain-${domain}`}>
                  <td
                    colSpan={roles.length + 1}
                    style={{
                      background: "#000080",
                      color: "#fff",
                      fontWeight: "bold",
                      fontSize: 12,
                      padding: "4px 8px",
                    }}
                  >
                    {domain}
                  </td>
                </tr>,
                ...surfaces.map((surface) => (
                  <TableRow key={surface.id}>
                    <TableDataCell
                      style={{
                        fontSize: 11,
                        position: "sticky",
                        left: 0,
                        background: "#c0c0c0",
                        zIndex: 1,
                      }}
                      title={[
                        ...surface.routePatterns,
                        ...surface.nativeSettings,
                        ...surface.automationHandles,
                      ].join(" | ")}
                    >
                      <div>{surface.label}</div>
                      <div style={{ fontSize: 9, color: "#666", marginTop: 1 }}>
                        {surface.subdomain} · {surface.kind}
                      </div>
                      <div style={{ fontSize: 9, color: "#666", marginTop: 1 }}>
                        {surface.routePatterns.join(", ")}
                      </div>
                    </TableDataCell>
                    {roles.map((role) => {
                      const granted =
                        roleAccess.matrix[role.slug]?.[surface.id] ?? false;
                      const isLocked = role.slug === "admin";
                      return (
                        <TableDataCell key={role.slug} style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={granted}
                            disabled={isLocked || toggleRoleSurfaceAccessMutation.isPending}
                            onChange={() =>
                              toggleRoleSurfaceAccessMutation.mutate({
                                role: role.slug,
                                surfaceId: surface.id,
                                granted: !granted,
                              })
                            }
                            title={
                              isLocked
                                ? "Admin always has all WTF OS access"
                                : `${granted ? "Revoke" : "Grant"} ${surface.label} for ${role.label}`
                            }
                          />
                        </TableDataCell>
                      );
                    })}
                  </TableRow>
                )),
              ])}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
