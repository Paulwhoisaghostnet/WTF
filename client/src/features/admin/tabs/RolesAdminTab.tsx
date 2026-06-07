import { useEffect, useMemo, useState, type Dispatch, type ReactElement, type SetStateAction } from "react";
import { Hourglass, Select } from "react95";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Ban,
  Boxes,
  Gauge,
  KeyRound,
  Layers,
  Lock,
  Network,
  RotateCcw,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserCog,
  Workflow,
} from "lucide-react";
import styled from "styled-components";
import { UiButton } from "../../../components/wtfos-ui";
import {
  PERMISSIONS,
  PERMISSION_CATEGORIES,
  ROLE_CATEGORIES,
  formatRoleLabel,
  type PermissionCategory,
  type PermissionKey,
  type RoleDefinition,
} from "@shared/types";
import type {
  AdminSurfaceAccess,
  ResetRoleSurfaceAccessPayload,
  ResetPermissionPayload,
  RoleAccessResponse,
  RolePermissionMatrix,
  ToggleRoleSurfaceAccessPayload,
  TogglePermissionPayload,
  UpsertRolePayload,
} from "../types";

const PERMISSION_CATEGORY_LABELS: Record<PermissionCategory, string> = {
  general: "General",
  game: "Game",
  social: "Social",
  market: "Market",
  moderation: "Moderation",
  admin: "Administration",
};

const ActionRow = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  flex-wrap: wrap;

  svg {
    vertical-align: -2px;
  }
`;

const RoleWorkspace = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;

  &,
  * {
    box-sizing: border-box;
  }
`;

const HeroPanel = styled.section`
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface, #f4f4f4);
  padding: var(--wtf-space-3, 12px);
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(260px, 1.15fr);
  gap: var(--wtf-space-3, 12px);
  min-width: 0;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`;

const HeroCopy = styled.div`
  min-width: 0;

  h3 {
    margin: 0;
    color: var(--wtf-app-text, #111);
    font-size: var(--wtf-type-title, 18px);
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  p {
    color: var(--wtf-app-muted-text, #444);
    font-size: var(--wtf-type-caption, 13px);
    line-height: 1.4;
    margin: var(--wtf-space-2, 8px) 0 0;
  }
`;

const RoleAccent = styled.span<{ $color?: string | null }>`
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: ${({ $color }) => $color || "#facc15"};
  margin-right: 7px;
`;

const HeroMeta = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  flex-wrap: wrap;
  margin-top: var(--wtf-space-2, 8px);
`;

const MetaChip = styled.span<{ $tone?: "good" | "warn" | "dark" | "plain" }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: ${({ $tone }) =>
    $tone === "good" ? "#bbf7d0" : $tone === "warn" ? "#fde68a" : $tone === "dark" ? "#202326" : "#ffffff"};
  color: ${({ $tone }) => ($tone === "dark" ? "#ffffff" : "#15171a")};
  min-height: 24px;
  padding: 3px 8px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  white-space: nowrap;
`;

const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  gap: var(--wtf-space-2, 8px);
  min-width: 0;

  @media (max-width: 720px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const MetricTile = styled.div`
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  padding: var(--wtf-space-2, 8px);
  min-width: 0;

  strong {
    display: block;
    font-size: var(--wtf-type-title, 18px);
    line-height: 1;
    overflow-wrap: anywhere;
  }

  span {
    display: block;
    margin-top: 4px;
    color: var(--wtf-app-muted-text, #444);
    font-size: var(--wtf-type-caption, 13px);
    letter-spacing: 0;
    text-transform: none;
    overflow-wrap: anywhere;
  }
`;

const ControlGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--wtf-space-3, 12px);
  align-items: start;
`;

const Panel = styled.section`
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface, #f4f4f4);
  padding: var(--wtf-space-3, 12px);
  min-width: 0;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  border-bottom: 1px solid var(--wtf-app-border, #808080);
  padding-bottom: var(--wtf-space-2, 8px);
  margin-bottom: var(--wtf-space-2, 8px);
`;

const PanelTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;

  h4 {
    margin: 0;
    font-size: var(--wtf-type-body-strong, 15px);
    overflow-wrap: anywhere;
  }

  span {
    display: block;
    margin-top: 2px;
    color: var(--wtf-app-muted-text, #444);
    font-size: var(--wtf-type-caption, 13px);
    overflow-wrap: anywhere;
  }
`;

const IconBadge = styled.span<{ $color?: string }>`
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid var(--wtf-app-border, #808080);
  background: ${({ $color }) => $color || "#facc15"};
  flex: 0 0 auto;
`;

const RoleCardGrid = styled.div`
  display: grid;
  gap: var(--wtf-space-2, 8px);
`;

const RoleCard = styled.button<{ $active?: boolean; $color?: string | null }>`
  border: 1px solid ${({ $active, $color }) => ($active ? ($color || "var(--wtf-app-border, #808080)") : "var(--wtf-app-border, #808080)")};
  background: ${({ $active }) => ($active ? "var(--wtf-app-surface, #f4f4f4)" : "var(--wtf-app-surface-raised, #ffffff)")};
  display: grid;
  gap: var(--wtf-space-1, 4px);
  text-align: left;
  padding: var(--wtf-space-2, 8px);
  cursor: pointer;
  min-width: 0;

  &:hover {
    border-color: ${({ $color }) => $color || "var(--wtf-app-link, #000080)"};
  }
`;

const RoleCardTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
`;

const RoleName = styled.strong`
  font-size: var(--wtf-type-caption, 13px);
  overflow-wrap: anywhere;
`;

const RoleSlug = styled.span`
  color: var(--wtf-app-muted-text, #444);
  display: block;
  font-size: var(--wtf-type-caption, 13px);
  margin-top: 1px;
  overflow-wrap: anywhere;
`;

const RoleStatsLine = styled.div`
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
`;

const TinyChip = styled.span`
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  color: var(--wtf-app-text, #111);
  padding: 3px 8px;
  font-size: var(--wtf-type-caption, 13px);
  max-width: 100%;
  overflow-wrap: anywhere;
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--wtf-space-2, 8px);

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const FullSpan = styled.div`
  grid-column: 1 / -1;
`;

const FieldLabel = styled.label`
  display: grid;
  gap: var(--wtf-space-1, 4px);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  color: var(--wtf-app-text, #111);
`;

const TextInput = styled.input`
  border: 1px solid #8d949e;
  background: #ffffff;
  padding: 6px 7px;
  width: 100%;
  min-width: 0;
`;

const TextArea = styled.textarea`
  border: 1px solid #8d949e;
  background: #ffffff;
  padding: 6px 7px;
  width: 100%;
  min-width: 0;
  min-height: 68px;
  resize: vertical;
`;

const CheckboxLine = styled.label`
  display: inline-flex;
  align-items: center;
  gap: var(--wtf-space-1, 4px);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
`;

const CategoryRail = styled.div`
  display: flex;
  gap: var(--wtf-space-1, 4px);
  flex-wrap: wrap;
`;

const SegmentButton = styled.button<{ $active?: boolean }>`
  border: 1px solid ${({ $active }) => ($active ? "var(--wtf-app-link, #000080)" : "var(--wtf-app-border, #808080)")};
  background: ${({ $active }) => ($active ? "var(--wtf-app-link, #000080)" : "var(--wtf-app-control-bg, #ffffff)")};
  color: ${({ $active }) => ($active ? "var(--wtf-app-accent-text, #ffffff)" : "var(--wtf-app-text, #111)")};
  padding: 6px 8px;
  min-height: 32px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  cursor: pointer;
`;

const PermissionGroups = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
`;

const PermissionGroup = styled.div`
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
`;

const PermissionGroupHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--wtf-space-2, 8px);
  border-bottom: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface, #f4f4f4);
  padding: var(--wtf-space-2, 8px);
  font-weight: 700;
`;

const PermissionToggleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--wtf-space-2, 8px);
  padding: var(--wtf-space-2, 8px);
  min-width: 0;
`;

const PermissionToggle = styled.label<{ $active?: boolean; $locked?: boolean }>`
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: var(--wtf-space-2, 8px);
  align-items: start;
  border: 1px solid ${({ $active }) => ($active ? "var(--wtf-app-success, #176b38)" : "var(--wtf-app-border, #808080)")};
  background: ${({ $active }) => ($active ? "var(--wtf-app-success-bg, #ecfdf3)" : "var(--wtf-app-surface-raised, #ffffff)")};
  opacity: ${({ $locked }) => ($locked ? 0.78 : 1)};
  padding: var(--wtf-space-2, 8px);

  strong {
    display: block;
    font-size: var(--wtf-type-caption, 13px);
  }

  span {
    display: block;
    color: var(--wtf-app-muted-text, #444);
    font-size: var(--wtf-type-caption, 13px);
    margin-top: 2px;
  }
`;

const SurfaceToolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  margin-bottom: var(--wtf-space-2, 8px);

  > input {
    flex: 1 1 190px;
  }

  > div {
    flex: 1 1 136px;
    min-width: 0;
  }
`;

const SurfaceGroups = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
`;

const SurfaceDomain = styled.div`
  display: grid;
  gap: var(--wtf-space-2, 8px);
`;

const SurfaceDomainTitle = styled.div`
  display: flex;
  justify-content: space-between;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  border-bottom: 1px solid var(--wtf-app-border, #808080);
  padding-bottom: var(--wtf-space-1, 4px);
  font-weight: 800;
`;

const SurfaceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: var(--wtf-space-2, 8px);
  min-width: 0;
`;

const SurfaceCard = styled.div<{ $active?: boolean }>`
  border: 1px solid ${({ $active }) => ($active ? "var(--wtf-app-success, #176b38)" : "var(--wtf-app-border, #808080)")};
  background: ${({ $active }) => ($active ? "var(--wtf-app-success-bg, #f0fdf4)" : "var(--wtf-app-surface-raised, #ffffff)")};
  display: grid;
  gap: var(--wtf-space-2, 8px);
  padding: var(--wtf-space-2, 8px);
  min-width: 0;
`;

const SurfaceCardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
`;

const SurfaceName = styled.div`
  min-width: 0;

  strong {
    display: block;
    font-size: var(--wtf-type-caption, 13px);
    overflow-wrap: anywhere;
  }

  span {
    color: var(--wtf-app-muted-text, #444);
    display: block;
    font-size: var(--wtf-type-caption, 13px);
    margin-top: 1px;
    overflow-wrap: anywhere;
  }
`;

const SurfaceSignals = styled.div`
  display: grid;
  gap: var(--wtf-space-1, 4px);
`;

const SignalLine = styled.div`
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: var(--wtf-space-1, 4px);
  align-items: start;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #444);

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    white-space: normal;
    overflow-wrap: anywhere;
  }
`;

const EmptyState = styled.div`
  border: 1px dashed var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  padding: var(--wtf-space-3, 12px);
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
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

type RoleFormState = {
  slug: string;
  label: string;
  category: string;
  purpose: string;
  description: string;
  accessLevel: string;
  sortOrder: string;
  color: string;
  icon: string;
  defaultWtfOsAccess: boolean;
  isAssignable: boolean;
};

const EMPTY_ROLE_FORM: RoleFormState = {
  slug: "",
  label: "",
  category: "access",
  purpose: "",
  description: "",
  accessLevel: "0",
  sortOrder: "1000",
  color: "#facc15",
  icon: "",
  defaultWtfOsAccess: false,
  isAssignable: true,
};

const EMPTY_ROLE_ACCESS_MATRIX: RoleAccessResponse["matrix"] = {};
const EMPTY_ROLE_ACCESS_SURFACES: AdminSurfaceAccess[] = [];

const SURFACE_KIND_LABELS: Record<string, string> = {
  app: "App",
  tool: "Tool",
  "desktop-item": "Desktop item",
  "admin-tool": "Admin tool",
  "public-surface": "Public surface",
};

function countPermissionsForRole(role: string, rolePerms: RolePermissionMatrix | undefined): number {
  const perms = rolePerms?.[role];
  if (!perms) return 0;
  return PERMISSIONS.filter((permission) => perms[permission.key as PermissionKey]).length;
}

function countSurfacesForRole(role: string, roleAccess: RoleAccessResponse | undefined): number {
  if (!roleAccess) return 0;
  const matrix = roleAccess.matrix?.[role] ?? {};
  const surfaces = Array.isArray(roleAccess.surfaces) ? roleAccess.surfaces : EMPTY_ROLE_ACCESS_SURFACES;
  return surfaces.filter((surface) => matrix[surface.id]).length;
}

function summarizeList(items: string[], fallback: string) {
  const unique = [...new Set(items.filter(Boolean))];
  if (unique.length === 0) return fallback;
  const visible = unique.slice(0, 4);
  const suffix = unique.length > visible.length ? ` +${unique.length - visible.length}` : "";
  return `${visible.join(", ")}${suffix}`;
}

function groupSurfacesByDomain(surfaces: AdminSurfaceAccess[]) {
  return surfaces.reduce<Record<string, AdminSurfaceAccess[]>>((acc, surface) => {
    acc[surface.domain] = [...(acc[surface.domain] ?? []), surface];
    return acc;
  }, {});
}

function PanelLabel({
  icon: Icon,
  color,
  title,
  detail,
}: {
  icon: LucideIcon;
  color?: string;
  title: string;
  detail: string;
}) {
  return (
    <PanelTitle>
      <IconBadge $color={color}>
        <Icon size={15} strokeWidth={2.4} aria-hidden="true" />
      </IconBadge>
      <div>
        <h4>{title}</h4>
        <span>{detail}</span>
      </div>
    </PanelTitle>
  );
}

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
  const roleAccessRoles = Array.isArray(roleAccess?.roles) ? roleAccess.roles : undefined;
  const roleAccessMatrix =
    roleAccess?.matrix && typeof roleAccess.matrix === "object"
      ? roleAccess.matrix
      : EMPTY_ROLE_ACCESS_MATRIX;
  const roleAccessSurfaces = Array.isArray(roleAccess?.surfaces)
    ? roleAccess.surfaces
    : EMPTY_ROLE_ACCESS_SURFACES;

  const roles = useMemo<RoleDefinition[]>(() => {
    const catalog = roleAccessRoles ?? roleCatalog ?? [];
    if (catalog.length > 0) return catalog;
    const slugs = new Set<string>([
      ...Object.keys(rolePerms ?? {}),
      ...Object.keys(roleAccessMatrix),
    ]);
    return [...slugs].map((slug, index) => ({
      slug,
      label: formatRoleLabel(slug),
      category: "access",
      purpose: "Role catalog row has not been loaded yet.",
      description: null,
      accessLevel: 0,
      sortOrder: 1000 + index,
      color: null,
      icon: null,
      defaultWtfOsAccess: false,
      isSystem: false,
      isAssignable: true,
    }));
  }, [roleAccessRoles, roleAccessMatrix, roleCatalog, rolePerms]);

  const [selectedRoleSlug, setSelectedRoleSlug] = useState("admin");
  const [roleForm, setRoleForm] = useState<RoleFormState>(EMPTY_ROLE_FORM);
  const [surfaceDomainFilter, setSurfaceDomainFilter] = useState("");
  const [surfaceKindFilter, setSurfaceKindFilter] = useState("");
  const [surfaceSearch, setSurfaceSearch] = useState("");

  useEffect(() => {
    if (!roles.length) return;
    if (!roles.some((role) => role.slug === selectedRoleSlug)) {
      setSelectedRoleSlug(roles[0].slug);
    }
  }, [roles, selectedRoleSlug]);

  const selectedRole = roles.find((role) => role.slug === selectedRoleSlug) ?? roles[0];
  const selectedRolePerms = selectedRole ? rolePerms?.[selectedRole.slug] ?? {} : {};
  const selectedSurfaceMatrix = selectedRole && roleAccess
    ? roleAccessMatrix[selectedRole.slug] ?? {}
    : {};
  const selectedSurfaces = roleAccess
    ? roleAccessSurfaces.filter((surface) => selectedSurfaceMatrix[surface.id])
    : [];

  const selectedPermissionCount = selectedRole
    ? countPermissionsForRole(selectedRole.slug, rolePerms)
    : 0;
  const selectedSurfaceCount = selectedRole
    ? countSurfacesForRole(selectedRole.slug, roleAccess)
    : 0;
  const selectedDesktopAppCount = new Set(
    selectedSurfaces.map((surface) => surface.desktopAppKey).filter(Boolean)
  ).size;
  const selectedRouteCount = new Set(selectedSurfaces.flatMap((surface) => surface.routePatterns)).size;
  const selectedNativeSettingsCount = new Set(selectedSurfaces.flatMap((surface) => surface.nativeSettings)).size;
  const selectedAutomationCount = new Set(selectedSurfaces.flatMap((surface) => surface.automationHandles)).size;
  const selectedRoleLocked = selectedRole?.slug === "admin";

  const categoryPermissionCounts = useMemo(() => {
    return Object.fromEntries(
      PERMISSION_CATEGORIES.map((category) => {
        const categoryPerms = PERMISSIONS.filter((permission) => permission.category === category);
        const granted = categoryPerms.filter(
          (permission) => selectedRolePerms[permission.key as PermissionKey]
        ).length;
        return [category, { granted, total: categoryPerms.length }];
      })
    ) as Record<PermissionCategory, { granted: number; total: number }>;
  }, [selectedRolePerms]);

  const visiblePermissionCategories = PERMISSION_CATEGORIES.filter(
    (category) => !permCategoryFilter || category === permCategoryFilter
  );

  const surfaceDomains = useMemo(
    () => [...new Set(roleAccessSurfaces.map((surface) => surface.domain))].sort(),
    [roleAccessSurfaces]
  );
  const surfaceKinds = useMemo(
    () => [...new Set(roleAccessSurfaces.map((surface) => surface.kind))].sort(),
    [roleAccessSurfaces]
  );

  const filteredSurfaces = useMemo(() => {
    const query = surfaceSearch.trim().toLowerCase();
    return roleAccessSurfaces.filter((surface) => {
      if (surfaceDomainFilter && surface.domain !== surfaceDomainFilter) return false;
      if (surfaceKindFilter && surface.kind !== surfaceKindFilter) return false;
      if (!query) return true;
      return [
        surface.id,
        surface.label,
        surface.domain,
        surface.subdomain,
        surface.kind,
        surface.desktopAppKey,
        ...surface.routePatterns,
        ...surface.nativeSettings,
        ...surface.automationHandles,
      ].some((value) => String(value ?? "").toLowerCase().includes(query));
    });
  }, [roleAccessSurfaces, surfaceDomainFilter, surfaceKindFilter, surfaceSearch]);

  const groupedSurfaces = useMemo(() => groupSurfacesByDomain(filteredSurfaces), [filteredSurfaces]);

  function loadSelectedRoleIntoForm() {
    if (!selectedRole) return;
    setRoleForm({
      slug: selectedRole.slug,
      label: selectedRole.label,
      category: selectedRole.category,
      purpose: selectedRole.purpose,
      description: selectedRole.description ?? "",
      accessLevel: String(selectedRole.accessLevel ?? 0),
      sortOrder: String(selectedRole.sortOrder ?? 1000),
      color: selectedRole.color ?? "#facc15",
      icon: selectedRole.icon ?? "",
      defaultWtfOsAccess: selectedRole.defaultWtfOsAccess,
      isAssignable: selectedRole.isAssignable,
    });
  }

  function saveRole() {
    const slug = roleForm.slug.trim().toLowerCase().replace(/\s+/g, "_");
    if (!slug || !roleForm.label.trim()) return;
    setSelectedRoleSlug(slug);
    upsertRoleMutation.mutate({
      slug,
      label: roleForm.label.trim(),
      category: roleForm.category,
      purpose: roleForm.purpose.trim(),
      description: roleForm.description.trim() || null,
      accessLevel: Number(roleForm.accessLevel || 0),
      sortOrder: Number(roleForm.sortOrder || 1000),
      color: roleForm.color || null,
      icon: roleForm.icon.trim() || null,
      defaultWtfOsAccess: roleForm.defaultWtfOsAccess,
      isAssignable: roleForm.isAssignable,
    });
  }

  if (!selectedRole) {
    return <Hourglass size={32} />;
  }

  return (
    <RoleWorkspace>
      <HeroPanel>
        <HeroCopy>
          <h3>
            <RoleAccent $color={selectedRole.color} />
            {selectedRole.label}
          </h3>
          <p>{selectedRole.purpose || "No role purpose recorded."}</p>
          <HeroMeta>
            <MetaChip $tone={selectedRoleLocked ? "dark" : "plain"}>
              {selectedRoleLocked ? <Lock size={12} /> : <KeyRound size={12} />}
              {selectedRole.slug}
            </MetaChip>
            <MetaChip $tone="plain">
              <Gauge size={12} />
              Level {selectedRole.accessLevel}
            </MetaChip>
            <MetaChip $tone={selectedRole.defaultWtfOsAccess ? "good" : "warn"}>
              <Boxes size={12} />
              {selectedRole.defaultWtfOsAccess ? "Default OS access" : "Manual OS access"}
            </MetaChip>
            <MetaChip $tone={selectedRole.isAssignable ? "good" : "warn"}>
              <UserCog size={12} />
              {selectedRole.isAssignable ? "Assignable" : "System locked"}
            </MetaChip>
          </HeroMeta>
        </HeroCopy>

        <MetricGrid>
          <MetricTile>
            <strong>{rolePerms ? `${selectedPermissionCount}/${PERMISSIONS.length}` : "-"}</strong>
            <span>Permissions</span>
          </MetricTile>
          <MetricTile>
            <strong>{roleAccess ? `${selectedSurfaceCount}/${roleAccessSurfaces.length}` : "-"}</strong>
            <span>Surfaces</span>
          </MetricTile>
          <MetricTile>
            <strong>{roleAccess ? selectedDesktopAppCount : "-"}</strong>
            <span>Desktop apps</span>
          </MetricTile>
          <MetricTile>
            <strong>{roleAccess ? selectedRouteCount : "-"}</strong>
            <span>Routes</span>
          </MetricTile>
          <MetricTile>
            <strong>{roleAccess ? selectedNativeSettingsCount : "-"}</strong>
            <span>Native settings</span>
          </MetricTile>
          <MetricTile>
            <strong>{roleAccess ? selectedAutomationCount : "-"}</strong>
            <span>Automation</span>
          </MetricTile>
          <MetricTile>
            <strong>{roles.length}</strong>
            <span>Role keys</span>
          </MetricTile>
          <MetricTile>
            <strong>{selectedRole.category}</strong>
            <span>Category</span>
          </MetricTile>
        </MetricGrid>
      </HeroPanel>

      <ControlGrid>
        <div style={{ display: "grid", gap: 12 }}>
          <Panel>
            <PanelHeader>
              <PanelLabel icon={ShieldCheck} color="#facc15" title="Role catalog" detail="Access keys in the environment" />
            </PanelHeader>
            <RoleCardGrid>
              {roles.map((role) => {
                const rolePermissionCount = countPermissionsForRole(role.slug, rolePerms);
                const roleSurfaceCount = countSurfacesForRole(role.slug, roleAccess);
                return (
                  <RoleCard
                    key={role.slug}
                    $active={role.slug === selectedRole.slug}
                    $color={role.color}
                    onClick={() => setSelectedRoleSlug(role.slug)}
                    title={role.label}
                  >
                    <RoleCardTop>
                      <div>
                        <RoleName>{role.label}</RoleName>
                        <RoleSlug>{role.slug}</RoleSlug>
                      </div>
                      <MetaChip $tone={role.category === "restriction" ? "warn" : "plain"}>
                        {role.accessLevel}
                      </MetaChip>
                    </RoleCardTop>
                    <RoleStatsLine>
                      <TinyChip>{role.category}</TinyChip>
                      <TinyChip>{rolePermissionCount}/{PERMISSIONS.length} perms</TinyChip>
                      <TinyChip>{roleSurfaceCount} surfaces</TinyChip>
                      {role.defaultWtfOsAccess ? <TinyChip>default OS</TinyChip> : null}
                    </RoleStatsLine>
                  </RoleCard>
                );
              })}
            </RoleCardGrid>
          </Panel>

          <Panel>
            <PanelHeader>
              <PanelLabel icon={SlidersHorizontal} color="#bfdbfe" title="Role designer" detail="Catalog row and default access posture" />
              <UiButton compact onClick={loadSelectedRoleIntoForm}>
                Load selected role
              </UiButton>
            </PanelHeader>

            <FormGrid>
              <FieldLabel>
                Slug
                <TextInput
                  aria-label="Role slug"
                  value={roleForm.slug}
                  onChange={(event) =>
                    setRoleForm((prev) => ({
                      ...prev,
                      slug: event.target.value.toLowerCase().replace(/\s+/g, "_"),
                    }))
                  }
                  placeholder="role_slug"
                />
              </FieldLabel>
              <FieldLabel>
                Label
                <TextInput
                  aria-label="Role label"
                  value={roleForm.label}
                  onChange={(event) => setRoleForm((prev) => ({ ...prev, label: event.target.value }))}
                  placeholder="Display label"
                />
              </FieldLabel>
              <FieldLabel>
                Category
                <Select
                  aria-label="Role category"
                  value={roleForm.category}
                  onChange={(event: any) => setRoleForm((prev) => ({ ...prev, category: event.value }))}
                  options={ROLE_CATEGORIES.map((category) => ({ label: category, value: category }))}
                  width="100%"
                />
              </FieldLabel>
              <FieldLabel>
                Access level
                <TextInput
                  aria-label="Role access level"
                  value={roleForm.accessLevel}
                  onChange={(event) => setRoleForm((prev) => ({ ...prev, accessLevel: event.target.value }))}
                  type="number"
                />
              </FieldLabel>
              <FieldLabel>
                Sort order
                <TextInput
                  aria-label="Role sort order"
                  value={roleForm.sortOrder}
                  onChange={(event) => setRoleForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                  type="number"
                />
              </FieldLabel>
              <FieldLabel>
                Color
                <TextInput
                  aria-label="Role color"
                  value={roleForm.color}
                  onChange={(event) => setRoleForm((prev) => ({ ...prev, color: event.target.value }))}
                  type="color"
                />
              </FieldLabel>
              <FieldLabel>
                Icon key
                <TextInput
                  aria-label="Role icon key"
                  value={roleForm.icon}
                  onChange={(event) => setRoleForm((prev) => ({ ...prev, icon: event.target.value }))}
                  placeholder="shield"
                />
              </FieldLabel>
              <FullSpan>
                <FieldLabel>
                  Purpose
                  <TextInput
                    aria-label="Role purpose"
                    value={roleForm.purpose}
                    onChange={(event) => setRoleForm((prev) => ({ ...prev, purpose: event.target.value }))}
                    placeholder="What this role is for"
                  />
                </FieldLabel>
              </FullSpan>
              <FullSpan>
                <FieldLabel>
                  Description
                  <TextArea
                    aria-label="Role description"
                    value={roleForm.description}
                    onChange={(event) => setRoleForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Operator notes"
                  />
                </FieldLabel>
              </FullSpan>
              <FullSpan>
                <ActionRow>
                  <CheckboxLine>
                    <input
                      type="checkbox"
                      aria-label="Role default WTF OS access"
                      checked={roleForm.defaultWtfOsAccess}
                      onChange={(event) =>
                        setRoleForm((prev) => ({ ...prev, defaultWtfOsAccess: event.target.checked }))
                      }
                    />
                    Default WTF OS access
                  </CheckboxLine>
                  <CheckboxLine>
                    <input
                      type="checkbox"
                      aria-label="Role is assignable"
                      checked={roleForm.isAssignable}
                      onChange={(event) =>
                        setRoleForm((prev) => ({ ...prev, isAssignable: event.target.checked }))
                      }
                    />
                    Assignable
                  </CheckboxLine>
                </ActionRow>
              </FullSpan>
              <FullSpan>
                <ActionRow>
                  <UiButton compact disabled={upsertRoleMutation.isPending} onClick={saveRole}>
                    <BadgeCheck size={13} aria-hidden="true" /> Save role
                  </UiButton>
                  <UiButton compact onClick={() => setRoleForm(EMPTY_ROLE_FORM)}>
                    Clear role form
                  </UiButton>
                </ActionRow>
              </FullSpan>
            </FormGrid>
          </Panel>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <Panel>
            <PanelHeader>
              <PanelLabel icon={KeyRound} color="#bbf7d0" title="Permission levels" detail={`${selectedRole.label} capability toggles`} />
              <ActionRow>
                <ConfirmButton
                  label="Reset selected"
                  confirmLabel={`Reset ${selectedRole.label}`}
                  onConfirm={() => resetPermMutation.mutate({ role: selectedRole.slug })}
                  disabled={selectedRoleLocked || resetPermMutation.isPending}
                />
                <ConfirmButton
                  label="Reset all"
                  confirmLabel="Reset all permissions"
                  onConfirm={() => resetPermMutation.mutate({})}
                  disabled={resetPermMutation.isPending}
                />
              </ActionRow>
            </PanelHeader>

            <CategoryRail>
              <SegmentButton $active={!permCategoryFilter} onClick={() => setPermCategoryFilter("")}>
                All
              </SegmentButton>
              {PERMISSION_CATEGORIES.map((category) => {
                const count = categoryPermissionCounts[category];
                return (
                  <SegmentButton
                    key={category}
                    $active={permCategoryFilter === category}
                    onClick={() => setPermCategoryFilter(category)}
                  >
                    {PERMISSION_CATEGORY_LABELS[category]} {count.granted}/{count.total}
                  </SegmentButton>
                );
              })}
            </CategoryRail>

            {!rolePerms ? (
              <Hourglass size={32} />
            ) : (
              <PermissionGroups style={{ marginTop: 10 }}>
                {visiblePermissionCategories.map((category) => {
                  const categoryPerms = PERMISSIONS.filter((permission) => permission.category === category);
                  const count = categoryPermissionCounts[category];
                  return (
                    <PermissionGroup key={category}>
                      <PermissionGroupHeader>
                        <span>{PERMISSION_CATEGORY_LABELS[category]}</span>
                        <MetaChip $tone={count.granted === count.total ? "good" : count.granted > 0 ? "plain" : "warn"}>
                          {count.granted}/{count.total}
                        </MetaChip>
                      </PermissionGroupHeader>
                      <PermissionToggleGrid>
                        {categoryPerms.map((permission) => {
                          const granted = selectedRolePerms[permission.key as PermissionKey] ?? false;
                          return (
                            <PermissionToggle
                              key={permission.key}
                              $active={granted}
                              $locked={selectedRoleLocked}
                              title={permission.description}
                            >
                              <input
                                type="checkbox"
                                aria-label={`${granted ? "Revoke" : "Grant"} ${permission.label} for ${selectedRole.label}`}
                                checked={granted}
                                disabled={selectedRoleLocked || togglePermMutation.isPending}
                                onChange={() =>
                                  togglePermMutation.mutate({
                                    role: selectedRole.slug,
                                    permissionKey: permission.key,
                                    granted: !granted,
                                  })
                                }
                              />
                              <span>
                                <strong>{permission.label}</strong>
                                <span>{permission.description}</span>
                              </span>
                            </PermissionToggle>
                          );
                        })}
                      </PermissionToggleGrid>
                    </PermissionGroup>
                  );
                })}
              </PermissionGroups>
            )}
          </Panel>

          <Panel>
            <PanelHeader>
              <PanelLabel icon={Network} color="#bae6fd" title="WTF OS access map" detail="Apps, routes, native panels, automation handles" />
              <ActionRow>
                <ConfirmButton
                  label="Reset selected access"
                  confirmLabel={`Reset ${selectedRole.label} access`}
                  onConfirm={() => resetRoleSurfaceAccessMutation.mutate({ role: selectedRole.slug })}
                  disabled={selectedRoleLocked || resetRoleSurfaceAccessMutation.isPending}
                />
                <ConfirmButton
                  label="Reset all access"
                  confirmLabel="Reset all role access"
                  onConfirm={() => resetRoleSurfaceAccessMutation.mutate({})}
                  disabled={resetRoleSurfaceAccessMutation.isPending}
                />
              </ActionRow>
            </PanelHeader>

            <SurfaceToolbar>
              <TextInput
                aria-label="Search role access surfaces"
                value={surfaceSearch}
                onChange={(event) => setSurfaceSearch(event.target.value)}
                placeholder="Search apps, routes, settings, handles"
              />
              <Select
                aria-label="Filter role access surfaces by domain"
                value={surfaceDomainFilter}
                onChange={(event: any) => setSurfaceDomainFilter(event.value)}
                options={[
                  { label: "All domains", value: "" },
                  ...surfaceDomains.map((domain) => ({ label: domain, value: domain })),
                ]}
                width={150}
              />
              <Select
                aria-label="Filter role access surfaces by kind"
                value={surfaceKindFilter}
                onChange={(event: any) => setSurfaceKindFilter(event.value)}
                options={[
                  { label: "All kinds", value: "" },
                  ...surfaceKinds.map((kind) => ({ label: SURFACE_KIND_LABELS[kind] ?? kind, value: kind })),
                ]}
                width={150}
              />
            </SurfaceToolbar>

            {!roleAccess ? (
              <Hourglass size={32} />
            ) : filteredSurfaces.length === 0 ? (
              <EmptyState>No registered surfaces match the current filters.</EmptyState>
            ) : (
              <SurfaceGroups>
                {Object.entries(groupedSurfaces).map(([domain, surfaces]) => (
                  <SurfaceDomain key={domain}>
                    <SurfaceDomainTitle>
                      <span>{domain}</span>
                      <MetaChip $tone="plain">
                        {surfaces.filter((surface) => selectedSurfaceMatrix[surface.id]).length}/{surfaces.length}
                      </MetaChip>
                    </SurfaceDomainTitle>
                    <SurfaceGrid>
                      {surfaces.map((surface) => {
                        const granted = selectedSurfaceMatrix[surface.id] ?? false;
                        return (
                          <SurfaceCard key={surface.id} $active={granted}>
                            <SurfaceCardHeader>
                              <SurfaceName>
                                <strong>{surface.label}</strong>
                                <span>{surface.subdomain} / {SURFACE_KIND_LABELS[surface.kind] ?? surface.kind}</span>
                              </SurfaceName>
                              <CheckboxLine title={selectedRoleLocked ? "Admin always has all WTF OS access" : undefined}>
                                <input
                                  type="checkbox"
                                  aria-label={`${granted ? "Close" : "Open"} ${surface.label} access for ${selectedRole.label}`}
                                  checked={granted}
                                  disabled={selectedRoleLocked || toggleRoleSurfaceAccessMutation.isPending}
                                  onChange={() =>
                                    toggleRoleSurfaceAccessMutation.mutate({
                                      role: selectedRole.slug,
                                      surfaceId: surface.id,
                                      granted: !granted,
                                    })
                                  }
                                />
                                {granted ? "Open" : "Closed"}
                              </CheckboxLine>
                            </SurfaceCardHeader>

                            <RoleStatsLine>
                              <TinyChip>{surface.id}</TinyChip>
                              {surface.desktopAppKey ? <TinyChip>app:{surface.desktopAppKey}</TinyChip> : null}
                              {surface.adminPanelTabs.length ? <TinyChip>{surface.adminPanelTabs.length} panels</TinyChip> : null}
                            </RoleStatsLine>

                            <SurfaceSignals>
                              <SignalLine>
                                <Route size={13} />
                                <code>{summarizeList(surface.routePatterns, "No browser route")}</code>
                              </SignalLine>
                              <SignalLine>
                                <Layers size={13} />
                                <code>{summarizeList(surface.nativeSettings, "No native settings")}</code>
                              </SignalLine>
                              <SignalLine>
                                <Workflow size={13} />
                                <code>{summarizeList(surface.automationHandles, "No automation handles")}</code>
                              </SignalLine>
                              <SignalLine>
                                {granted ? <Sparkles size={13} /> : <Ban size={13} />}
                                <code>{granted ? "Visible to this role through the role surface matrix" : "Hidden unless another assigned role grants it"}</code>
                              </SignalLine>
                            </SurfaceSignals>
                          </SurfaceCard>
                        );
                      })}
                    </SurfaceGrid>
                  </SurfaceDomain>
                ))}
              </SurfaceGroups>
            )}
          </Panel>

          {selectedRoleLocked ? (
            <EmptyState>
              <Lock size={14} /> Admin is intentionally immutable: it always carries every permission and registered WTF OS surface.
            </EmptyState>
          ) : null}

          <ActionRow>
            <MetaChip $tone="dark">
              <RotateCcw size={12} />
              Changes refresh auth and role-access cache through the existing admin mutations.
            </MetaChip>
          </ActionRow>
        </div>
      </ControlGrid>
    </RoleWorkspace>
  );
}
