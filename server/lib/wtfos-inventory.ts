import { buildWtfAccessManifest } from "./wtf-access";
import type { DesktopAppConfig } from "./desktop-apps";
import {
  artifactKindFromPackageKind,
  buildWtfOsPathwayMap,
  dedupeStrings,
  summarizeWtfOsPathwayMap,
  type WtfOsArtifactInventory,
  type WtfOsInventoryDocument,
  type WtfOsInventorySummary,
} from "../../shared/wtfos-interface";
import {
  WTF_APP_PACKAGE_ACCEPTANCE,
  type WtfAppPackageAcceptance,
} from "../../shared/wtf-app-packages";

const DEFAULT_DISCOVERY_TOOLS = [
  "wtf_get_capabilities",
  "wtf_get_access_manifest",
  "wtf_get_registered_inventory",
] as const;

function isEnabledPackage(entry: WtfAppPackageAcceptance, apps: DesktopAppConfig): boolean {
  if (entry.state === "blocked") return false;
  if (entry.state === "disabled-by-default") return false;
  if (entry.appKey) return apps[entry.appKey] !== false;
  return true;
}

function browserRoutesForEntry(
  entry: WtfAppPackageAcceptance,
  manifestBrowserRoutes: Array<{ path: string; appGate?: string; enabled?: boolean }>
): string[] {
  const liveRoutes =
    entry.appKey === undefined
      ? []
      : manifestBrowserRoutes
          .filter((route) => route.appGate === entry.appKey && route.enabled !== false)
          .map((route) => route.path);

  return dedupeStrings([...liveRoutes, ...entry.routeEvidence]);
}

function apiRoutesForEntry(
  entry: WtfAppPackageAcceptance,
  manifestApiRoutes: Array<{ path: string; appGate?: string; enabled?: boolean }>
): string[] {
  const liveRoutes =
    entry.appKey === undefined
      ? []
      : manifestApiRoutes
          .filter((route) => route.appGate === entry.appKey && route.enabled !== false)
          .map((route) => route.path);

  return dedupeStrings([...liveRoutes, ...entry.routeEvidence]);
}

function buildArtifactInventory(
  entry: WtfAppPackageAcceptance,
  apps: DesktopAppConfig,
  manifestBrowserRoutes: Array<{ path: string; appGate?: string; enabled?: boolean }>,
  manifestApiRoutes: Array<{ path: string; appGate?: string; enabled?: boolean }>
): WtfOsArtifactInventory {
  const browserRoutes = browserRoutesForEntry(entry, manifestBrowserRoutes);
  const apiRoutes = apiRoutesForEntry(entry, manifestApiRoutes);
  const pathwayMap = buildWtfOsPathwayMap([
    ...browserRoutes,
    ...apiRoutes,
    ...entry.routeEvidence,
    ...entry.provenance.evidence,
    ...entry.rollback.evidence,
    ...entry.uninstall.evidence,
  ]);
  const pathwayKinds = [
    pathwayMap.browser.length > 0 ? "browser" : null,
    pathwayMap.api.length > 0 ? "api" : null,
    pathwayMap.mcp.length > 0 ? "mcp" : null,
    pathwayMap.admin.length > 0 ? "admin" : null,
    pathwayMap.websocket.length > 0 ? "websocket" : null,
    pathwayMap.build.length > 0 ? "build" : null,
    pathwayMap.audit.length > 0 ? "audit" : null,
    pathwayMap.event.length > 0 ? "event" : null,
  ].filter(Boolean) as Array<"browser" | "api" | "mcp" | "admin" | "websocket" | "build" | "audit" | "event">;
  const previewPath = pathwayMap.browser[0] ?? null;
  const auditPath = pathwayMap.audit[0] ?? pathwayMap.admin[0] ?? pathwayMap.build[0] ?? null;
  const publishedArtifact = pathwayMap.build[0] ?? pathwayMap.audit[0] ?? null;

  return {
    schemaVersion: "wtfos.inventory.v1",
    id: entry.id,
    key: entry.key,
    label: entry.label,
    kind: artifactKindFromPackageKind(entry.kind),
    state: entry.state,
    enabled: isEnabledPackage(entry, apps),
    domain: entry.domain,
    appGate: entry.appKey,
    summary: `${entry.label} registered on WTFOS.`,
    pathways: pathwayMap,
    capabilities: [
      {
        handle: entry.key,
        summary: `Operate and inspect the registered ${entry.label} surface through the current WTFOS pathways.`,
        pathways: pathwayKinds,
        userAccess: entry.permissionSummary.userAccess,
        adminAccess: entry.permissionSummary.adminAccess,
        dataTouched: entry.permissionSummary.dataTouched,
        externalSystems: entry.permissionSummary.externalSystems,
      },
    ],
    permissions: {
      userAccess: entry.permissionSummary.userAccess,
      adminAccess: entry.permissionSummary.adminAccess,
    },
    dataTouched: entry.permissionSummary.dataTouched,
    externalSystems: entry.permissionSummary.externalSystems,
    routeEvidence: entry.routeEvidence,
    provenance: entry.provenance,
    rollback: entry.rollback,
    uninstall: entry.uninstall,
    witness: {
      preview: previewPath,
      audit: auditPath,
      publishedArtifact,
    },
    format: {
      human: "markdown",
      machine: "json",
    },
  };
}

export function buildWtfOsRegisteredInventory(input: {
  origin: string;
  mcpEndpoint: string;
  apps: DesktopAppConfig;
  now?: Date;
  discoveryTools?: readonly string[];
}): WtfOsInventoryDocument {
  const now = input.now ?? new Date();
  const discoveryTools = dedupeStrings([
    ...(input.discoveryTools || DEFAULT_DISCOVERY_TOOLS),
  ]);
  const accessManifest = buildWtfAccessManifest({
    origin: input.origin,
    mcpEndpoint: input.mcpEndpoint,
    apps: input.apps,
    now,
  });
  const artifacts = WTF_APP_PACKAGE_ACCEPTANCE.map((entry) =>
    buildArtifactInventory(entry, input.apps, accessManifest.browserRoutes, accessManifest.apiRoutes)
  );

  const summary: WtfOsInventorySummary = {
    totalArtifacts: artifacts.length,
    enabledArtifacts: artifacts.filter((artifact) => artifact.enabled).length,
    kindCounts: artifacts.reduce(
      (counts, artifact) => {
        counts[artifact.kind] += 1;
        return counts;
      },
      {
        app: 0,
        service: 0,
        project: 0,
        tool: 0,
        plugin: 0,
        package: 0,
      } as WtfOsInventorySummary["kindCounts"]
    ),
    pathwayCounts: artifacts.reduce(
      (counts, artifact) => {
        const pathwayCounts = summarizeWtfOsPathwayMap(artifact.pathways);
        for (const [kind, count] of Object.entries(pathwayCounts) as Array<
          [keyof WtfOsInventorySummary["pathwayCounts"], number]
        >) {
          counts[kind] += count;
        }
        return counts;
      },
      {
        browser: 0,
        api: 0,
        mcp: 0,
        admin: 0,
        websocket: 0,
        build: 0,
        audit: 0,
        event: 0,
      } as WtfOsInventorySummary["pathwayCounts"]
    ),
    discoveryTools,
  };

  return {
    schemaVersion: "wtfos.inventory.v1",
    generatedAt: now.toISOString(),
    origin: input.origin,
    mcpEndpoint: input.mcpEndpoint,
    discoveryTools,
    summary,
    artifacts,
  };
}
