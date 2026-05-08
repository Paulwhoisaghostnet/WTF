import { PAGE_DEFS } from "../../../client/src/routes/page-defs";
import { ALL_ADMIN_SURFACES } from "../../../client/src/features/admin-os/admin-surface-registry";
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
const missingRouteFixtures = [...pagePatterns].filter((pattern) => !fixturePatterns.has(pattern));
if (missingRouteFixtures.length > 0) {
  fail(`Missing E2E route fixtures for PAGE_DEFS patterns:\n${missingRouteFixtures.join("\n")}`);
}

const extraRouteFixtures = [...fixturePatterns].filter((pattern) => !pagePatterns.has(pattern));
if (extraRouteFixtures.length > 0) {
  fail(`E2E route fixtures do not match PAGE_DEFS patterns:\n${extraRouteFixtures.join("\n")}`);
}

const routeBackedAdminSurfaces = ALL_ADMIN_SURFACES.flatMap((surface) =>
  surface.routePatterns
    .filter((pattern) => pattern.startsWith("/"))
    .map((pattern) => ({ surface: surface.id, pattern }))
);
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
