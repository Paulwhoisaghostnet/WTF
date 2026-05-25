import { readFileSync } from "node:fs";
import { PAGE_DEFS } from "../../../client/src/routes/page-defs";
import {
  ALL_ADMIN_SURFACES,
  getAdminSurfaceDoctrineDomain,
} from "../../../client/src/features/admin-os/admin-surface-registry";
import { START_MENU_APP_GATES } from "../../../client/src/components/layout/start-menu-app-gates";
import { DEFAULT_DESKTOP_APP_CONFIG } from "../../../shared/desktop-apps";
import { DESKTOP_APPS } from "../../../shared/types";
import { WTF_DESKTOP_APP_PACKAGE_ACCEPTANCE } from "../../../shared/wtf-app-packages";
import {
  assertInventoryShape,
  parseInteractionInventory,
} from "./parser.mjs";
import { ROUTE_FIXTURES } from "./route-fixtures.mjs";
import { DOMAIN_WORKFLOWS } from "./domain-workflows.mjs";
import {
  assertCoverageLayerReport,
  buildCoverageLayerReport,
} from "./coverage-layers.mjs";
import { PUPPET_ACTOR_COUNT } from "../puppets/registry.mjs";

function fail(message: string): never {
  throw new Error(message);
}

const inventoryRows = parseInteractionInventory();
const shapeFailures = assertInventoryShape(inventoryRows);
if (shapeFailures.length > 0) {
  fail(`Interaction inventory shape failures:\n${shapeFailures.join("\n")}`);
}

const pagePatterns = new Set(PAGE_DEFS.map((def) => def.pattern));
const fixturePatterns = new Set(ROUTE_FIXTURES.map((fixture) => fixture.pattern));
const inventoryMarkdown = readFileSync(".agents/docs/live/user-interaction-inventory.md", "utf8");
const routeBackedAdminSurfaces = ALL_ADMIN_SURFACES.flatMap((surface) =>
  surface.routePatterns
    .filter((pattern) => pattern.startsWith("/"))
    .map((pattern) => ({ surface: surface.id, pattern }))
);
const adminSurfacePatterns = new Set(routeBackedAdminSurfaces.map(({ pattern }) => pattern));
const missingRouteFixtures = [...pagePatterns].filter((pattern) => !fixturePatterns.has(pattern));
if (missingRouteFixtures.length > 0) {
  fail(`Missing E2E route fixtures for PAGE_DEFS patterns:\n${missingRouteFixtures.join("\n")}`);
}

const extraRouteFixtures = [...fixturePatterns].filter(
  (pattern) => !pagePatterns.has(pattern) && !adminSurfacePatterns.has(pattern)
);
if (extraRouteFixtures.length > 0) {
  fail(`E2E route fixtures do not match PAGE_DEFS patterns:\n${extraRouteFixtures.join("\n")}`);
}

const missingAdminSurfaceRoutes = routeBackedAdminSurfaces.filter(
  ({ pattern }) => !fixturePatterns.has(pattern)
);
if (missingAdminSurfaceRoutes.length > 0) {
  fail(
    `Missing E2E route fixtures for admin surface routes:\n${missingAdminSurfaceRoutes
      .map(({ surface, pattern }) => `${surface}: ${pattern}`)
      .join("\n")}`
  );
}

const inventoryConcerns = new Set(inventoryRows.map((row) => row.concern));
const workflowConcerns = new Set(DOMAIN_WORKFLOWS.map((workflow) => workflow.domain));
const missingDomainWorkflows = [...inventoryConcerns].filter(
  (concern) => !workflowConcerns.has(concern)
);
if (missingDomainWorkflows.length > 0) {
  fail(`Missing domain interoperability workflows:\n${missingDomainWorkflows.join("\n")}`);
}

const duplicatePatterns = ROUTE_FIXTURES.map((fixture) => fixture.pattern).filter(
  (pattern, index, list) => list.indexOf(pattern) !== index
);
if (duplicatePatterns.length > 0) {
  fail(`Duplicate E2E route fixture patterns:\n${[...new Set(duplicatePatterns)].join("\n")}`);
}

const desktopAppKeys = [...DESKTOP_APPS];
const defaultConfigKeys = Object.keys(DEFAULT_DESKTOP_APP_CONFIG).sort();
const sortedDesktopAppKeys = [...desktopAppKeys].sort();
if (JSON.stringify(defaultConfigKeys) !== JSON.stringify(sortedDesktopAppKeys)) {
  fail(
    `Desktop app config keys do not match DESKTOP_APPS:\nconfig=${defaultConfigKeys.join(", ")}\napps=${sortedDesktopAppKeys.join(", ")}`
  );
}

const startMenuGateRoutes = Object.keys(START_MENU_APP_GATES);
const startMenuGateAppKeys = [...new Set(Object.values(START_MENU_APP_GATES))].sort();
const invalidStartMenuGateAppKeys = startMenuGateAppKeys.filter(
  (key) => !desktopAppKeys.includes(key)
);
if (invalidStartMenuGateAppKeys.length > 0) {
  fail(`Start Menu gates reference unknown desktop app keys:\n${invalidStartMenuGateAppKeys.join("\n")}`);
}

const missingStartMenuGateAppKeys = desktopAppKeys.filter(
  (key) => !startMenuGateAppKeys.includes(key)
);
if (missingStartMenuGateAppKeys.length > 0) {
  fail(`Desktop app keys missing Start Menu app gates:\n${missingStartMenuGateAppKeys.join("\n")}`);
}

const unknownStartMenuGateRoutes = startMenuGateRoutes.filter(
  (pattern) => !pagePatterns.has(pattern)
);
if (unknownStartMenuGateRoutes.length > 0) {
  fail(`Start Menu gates reference unknown PAGE_DEFS routes:\n${unknownStartMenuGateRoutes.join("\n")}`);
}

const desktopAdminSurfaceEntries = ALL_ADMIN_SURFACES.filter(
  (surface) => surface.desktopAppKey
);
const desktopAdminSurfaceCounts = new Map<string, number>();
for (const surface of desktopAdminSurfaceEntries) {
  desktopAdminSurfaceCounts.set(
    surface.desktopAppKey!,
    (desktopAdminSurfaceCounts.get(surface.desktopAppKey!) ?? 0) + 1
  );
}
const missingDesktopAdminSurfaces = desktopAppKeys.filter(
  (key) => !desktopAdminSurfaceCounts.has(key)
);
if (missingDesktopAdminSurfaces.length > 0) {
  fail(`Desktop app keys missing admin surface bindings:\n${missingDesktopAdminSurfaces.join("\n")}`);
}
const duplicateDesktopAdminSurfaces = [...desktopAdminSurfaceCounts.entries()]
  .filter(([, count]) => count > 1)
  .map(([key]) => key);
if (duplicateDesktopAdminSurfaces.length > 0) {
  fail(`Desktop app keys have multiple admin surface bindings:\n${duplicateDesktopAdminSurfaces.join("\n")}`);
}

const packageByDesktopApp = new Map(
  WTF_DESKTOP_APP_PACKAGE_ACCEPTANCE.map((entry) => [entry.appKey, entry])
);
const missingDesktopPackages = desktopAppKeys.filter(
  (key) => !packageByDesktopApp.has(key)
);
if (missingDesktopPackages.length > 0) {
  fail(`Desktop app keys missing package acceptance:\n${missingDesktopPackages.join("\n")}`);
}

const packageDomainMismatches = desktopAdminSurfaceEntries.flatMap((surface) => {
  const pkg = packageByDesktopApp.get(surface.desktopAppKey!);
  if (!pkg) return [];
  const doctrine = getAdminSurfaceDoctrineDomain(surface);
  if (pkg.domain.label === doctrine.label && pkg.domain.guide === doctrine.guide) return [];
  return [
    `${surface.desktopAppKey}: package=${pkg.domain.label} (${pkg.domain.guide}) admin=${doctrine.label} (${doctrine.guide})`,
  ];
});
if (packageDomainMismatches.length > 0) {
  fail(`Desktop app package domains do not match admin surface doctrine domains:\n${packageDomainMismatches.join("\n")}`);
}

const missingInventoryRouteMentions = [...pagePatterns].filter(
  (pattern) => !inventoryMarkdown.includes(`\`${pattern}\``)
);
if (missingInventoryRouteMentions.length > 0) {
  fail(`PAGE_DEFS routes missing exact mentions in interaction inventory:\n${missingInventoryRouteMentions.join("\n")}`);
}

const handleCount = new Set(inventoryRows.flatMap((row) => row.handles)).size;
const coverageReport = buildCoverageLayerReport({
  inventoryRows,
  routeFixtures: ROUTE_FIXTURES,
  domainWorkflows: DOMAIN_WORKFLOWS,
  adminSurfaces: ALL_ADMIN_SURFACES,
  livePuppetActors: PUPPET_ACTOR_COUNT,
  livePuppetSpec: true,
});
const coverageLayerFailures = assertCoverageLayerReport(coverageReport);
if (coverageLayerFailures.length > 0) {
  fail(`Interaction inventory coverage-layer failures:\n${coverageLayerFailures.join("\n")}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      coverageClaim: coverageReport.claim,
      coverageLayers: coverageReport.layers,
      inventoryRows: inventoryRows.length,
      uniqueHandles: handleCount,
      routeFixtures: ROUTE_FIXTURES.length,
      domainWorkflows: DOMAIN_WORKFLOWS.length,
      adminSurfaces: ALL_ADMIN_SURFACES.length,
    },
    null,
    2
  )
);
