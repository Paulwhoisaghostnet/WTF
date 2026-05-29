import type { DesktopAppKey } from "./types";
import type { WtfAppPackageAcceptance, WtfAppPackageKind, WtfAppPackageState } from "./wtf-app-packages";

export const WTFOS_INTERFACE_SCHEMA_VERSION = "wtfos.inventory.v1" as const;

export type WtfOsArtifactKind = "app" | "service" | "project" | "tool" | "plugin" | "package";

export type WtfOsPathwayKind =
  | "browser"
  | "api"
  | "mcp"
  | "admin"
  | "websocket"
  | "build"
  | "audit"
  | "event";

export interface WtfOsPathwayMap {
  browser: readonly string[];
  api: readonly string[];
  mcp: readonly string[];
  admin: readonly string[];
  websocket: readonly string[];
  build: readonly string[];
  audit: readonly string[];
  event: readonly string[];
}

export interface WtfOsArtifactCapability {
  handle: string;
  summary: string;
  pathways: readonly WtfOsPathwayKind[];
  userAccess: string;
  adminAccess: string;
  dataTouched: readonly string[];
  externalSystems: readonly string[];
}

export interface WtfOsArtifactInventory {
  schemaVersion: typeof WTFOS_INTERFACE_SCHEMA_VERSION;
  id: string;
  key: string;
  label: string;
  kind: WtfOsArtifactKind;
  state: WtfAppPackageState;
  enabled: boolean;
  domain: {
    label: string;
    guide: string;
  };
  appGate?: DesktopAppKey;
  summary: string;
  pathways: WtfOsPathwayMap;
  capabilities: readonly WtfOsArtifactCapability[];
  permissions: {
    userAccess: string;
    adminAccess: string;
  };
  dataTouched: readonly string[];
  externalSystems: readonly string[];
  routeEvidence: readonly string[];
  provenance: {
    owner: string;
    source: string;
    evidence: readonly string[];
  };
  rollback: {
    method: string;
    evidence: readonly string[];
  };
  uninstall: {
    method: string;
    preservesUserData: boolean;
    evidence: readonly string[];
  };
  witness: {
    preview: string | null;
    audit: string | null;
    publishedArtifact: string | null;
  };
  format: {
    human: "markdown";
    machine: "json";
  };
}

export interface WtfOsInventorySummary {
  totalArtifacts: number;
  enabledArtifacts: number;
  kindCounts: Record<WtfOsArtifactKind, number>;
  pathwayCounts: Record<WtfOsPathwayKind, number>;
  discoveryTools: readonly string[];
}

export interface WtfOsInventoryDocument {
  schemaVersion: typeof WTFOS_INTERFACE_SCHEMA_VERSION;
  generatedAt: string;
  origin: string;
  mcpEndpoint: string;
  discoveryTools: readonly string[];
  summary: WtfOsInventorySummary;
  artifacts: readonly WtfOsArtifactInventory[];
}

const ARTIFACT_KIND_BY_PACKAGE_KIND: Record<WtfAppPackageKind, WtfOsArtifactKind> = {
  "desktop-app": "app",
  "creation-tool": "tool",
  "console-stock-cartridges": "package",
  "project-bundle": "project",
  "integration-plugin": "plugin",
};

const PATHWAY_KINDS: readonly WtfOsPathwayKind[] = [
  "browser",
  "api",
  "mcp",
  "admin",
  "websocket",
  "build",
  "audit",
  "event",
];

export function artifactKindFromPackageKind(kind: WtfAppPackageKind): WtfOsArtifactKind {
  return ARTIFACT_KIND_BY_PACKAGE_KIND[kind];
}

export function classifyWtfOsPathway(value: string): WtfOsPathwayKind {
  const trimmed = value.trim();
  if (trimmed.startsWith("/api/")) return "api";
  if (trimmed.startsWith("/mcp")) return "mcp";
  if (trimmed === "/admin" || trimmed.startsWith("/admin/")) return "admin";
  if (trimmed === "/control-board" || trimmed.startsWith("/control-board/")) return "admin";
  if (trimmed === "/backup-manager" || trimmed.startsWith("/backup-manager/")) return "admin";
  if (trimmed.startsWith("/")) return "browser";
  if (trimmed.startsWith("client/") || trimmed.startsWith("server/") || trimmed.startsWith("shared/")) {
    return "build";
  }
  if (trimmed.startsWith("public/") || trimmed.startsWith("scripts/")) {
    return "build";
  }
  if (trimmed.startsWith("docs/") || trimmed.startsWith(".agents/")) {
    return "audit";
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return "audit";
  }
  return "build";
}

export function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function buildWtfOsPathwayMap(values: readonly string[]): WtfOsPathwayMap {
  const buckets = new Map<WtfOsPathwayKind, string[]>();
  for (const pathwayKind of PATHWAY_KINDS) {
    buckets.set(pathwayKind, []);
  }

  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (!trimmed) continue;
    const kind = classifyWtfOsPathway(trimmed);
    buckets.get(kind)!.push(trimmed);
  }

  return {
    browser: dedupeStrings(buckets.get("browser") || []),
    api: dedupeStrings(buckets.get("api") || []),
    mcp: dedupeStrings(buckets.get("mcp") || []),
    admin: dedupeStrings(buckets.get("admin") || []),
    websocket: dedupeStrings(buckets.get("websocket") || []),
    build: dedupeStrings(buckets.get("build") || []),
    audit: dedupeStrings(buckets.get("audit") || []),
    event: dedupeStrings(buckets.get("event") || []),
  };
}

export function summarizeWtfOsPathwayMap(pathways: WtfOsPathwayMap): Record<WtfOsPathwayKind, number> {
  return {
    browser: pathways.browser.length,
    api: pathways.api.length,
    mcp: pathways.mcp.length,
    admin: pathways.admin.length,
    websocket: pathways.websocket.length,
    build: pathways.build.length,
    audit: pathways.audit.length,
    event: pathways.event.length,
  };
}

