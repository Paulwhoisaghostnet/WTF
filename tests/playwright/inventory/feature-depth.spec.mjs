import { test, expect } from "@playwright/test";
import { ALL_ADMIN_SURFACES } from "../../../client/src/features/admin-os/admin-surface-registry";
import { CORE_BEHAVIOR_ASSERTIONS } from "../../e2e/inventory/behavior-assertions.mjs";
import {
  assertCoverageLayerReport,
  buildCoverageLayerReport,
} from "../../e2e/inventory/coverage-layers.mjs";
import { DOMAIN_WORKFLOWS } from "../../e2e/inventory/domain-workflows.mjs";
import { parseInteractionInventory } from "../../e2e/inventory/parser.mjs";
import { ROUTE_FIXTURES } from "../../e2e/inventory/route-fixtures.mjs";

test.describe("interaction inventory — feature depth accounting", () => {
  test("coverage report distinguishes skeleton coverage from full feature behavior", async () => {
    const report = buildCoverageLayerReport({
      inventoryRows: parseInteractionInventory(),
      routeFixtures: ROUTE_FIXTURES,
      domainWorkflows: DOMAIN_WORKFLOWS,
      adminSurfaces: ALL_ADMIN_SURFACES,
    });

    expect(assertCoverageLayerReport(report)).toEqual([]);
    expect(report.claim.e2eSkeletonComplete).toBe(true);
    expect(report.claim.canExerciseEveryInventoryHandle).toBe(true);
    expect(report.claim.canSmokeEveryRegisteredRoute).toBe(true);
    expect(report.claim.canRunEveryDomainWorkflow).toBe(true);
    expect(report.claim.fullFeatureBehaviorComplete).toBe(false);
    expect(report.layers.find((entry) => entry.key === "live-puppet-core-behavior")).toMatchObject({
      status: "complete",
      covered: CORE_BEHAVIOR_ASSERTIONS.length,
      total: CORE_BEHAVIOR_ASSERTIONS.length,
    });
    expect(report.residualWork.length).toBeGreaterThan(0);
  });

  test("complete layers are actually complete", async () => {
    const report = buildCoverageLayerReport({
      inventoryRows: parseInteractionInventory(),
      routeFixtures: ROUTE_FIXTURES,
      domainWorkflows: DOMAIN_WORKFLOWS,
      adminSurfaces: ALL_ADMIN_SURFACES,
    });

    for (const layer of report.layers.filter((entry) => entry.status === "complete")) {
      expect(layer.covered, layer.key).toBe(layer.total);
    }
  });
});
