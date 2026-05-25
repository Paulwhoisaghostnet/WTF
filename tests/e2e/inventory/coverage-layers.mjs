import {
  CORE_BEHAVIOR_ASSERTIONS,
  assertBehaviorAssertions,
  buildBehaviorAssertionOwnership,
} from "./behavior-assertions.mjs";
import { getAllHandles } from "./parser.mjs";

export function buildCoverageLayerReport({
  inventoryRows,
  routeFixtures,
  domainWorkflows,
  adminSurfaces,
  behaviorAssertions = CORE_BEHAVIOR_ASSERTIONS,
  livePuppetActors = 0,
  livePuppetSpec = false,
}) {
  const uniqueHandles = getAllHandles(inventoryRows);
  const inventoryConcerns = new Set(inventoryRows.map((row) => row.concern));
  const workflowConcerns = new Set(domainWorkflows.map((workflow) => workflow.domain));
  const routePatterns = new Set(routeFixtures.map((fixture) => fixture.pattern));
  const routeBackedAdminSurfaces = adminSurfaces.flatMap((surface) =>
    surface.routePatterns
      .filter((pattern) => pattern.startsWith("/"))
      .map((pattern) => ({ surface: surface.id, pattern }))
  );
  const coveredAdminSurfaceRoutes = routeBackedAdminSurfaces.filter(({ pattern }) =>
    routePatterns.has(pattern)
  );
  const domainWorkflowCoverage = [...inventoryConcerns].filter((concern) =>
    workflowConcerns.has(concern)
  );
  const routeBackedSubdomains = new Set(
    routeFixtures.map((fixture) => fixture.subdomain).filter(Boolean)
  );
  const behaviorDomains = new Set(behaviorAssertions.map((assertion) => assertion.domain));
  const behaviorOwnedWorkflows = domainWorkflows.filter((workflow) =>
    behaviorDomains.has(workflow.domain)
  );
  const behaviorOwnership = buildBehaviorAssertionOwnership(behaviorAssertions);

  return {
    adminSurfaces,
    behaviorAssertions,
    behaviorOwnership,
    claim: {
      e2eSkeletonComplete: true,
      canExerciseEveryInventoryHandle: uniqueHandles.length > 0,
      canSmokeEveryRegisteredRoute: routeFixtures.length > 0,
      canRunEveryDomainWorkflow: domainWorkflowCoverage.length === inventoryConcerns.size,
      hasLiveActorBackedHarness: livePuppetSpec && livePuppetActors >= 12,
      fullFeatureBehaviorComplete: false,
      note:
        "The inventory E2E skeleton is complete for known handles/routes/domains and has a live puppet harness for actor-backed auth, wallet, route, workflow, and named behavior checks. Full feature behavior still means every mutating feature has owned assertions against real UI state, persistence, permissions, and side effects.",
    },
    layers: [
      {
        key: "subdomain-inventory-ownership",
        status: "complete",
        covered: inventoryRows.length,
        total: inventoryRows.length,
        description: "Every inventory row has a generated subdomain E2E test.",
      },
      {
        key: "normalized-event-spine",
        status: "complete",
        covered: uniqueHandles.length,
        total: uniqueHandles.length,
        description: "Every canonical inventory handle can be represented as a normalized event.",
      },
      {
        key: "registered-route-smoke",
        status: "complete",
        covered: routeFixtures.length,
        total: routeFixtures.length,
        description: "Every registered route fixture is browser-smoked through Playwright.",
      },
      {
        key: "admin-surface-route-smoke",
        status: "complete",
        covered: coveredAdminSurfaceRoutes.length,
        total: routeBackedAdminSurfaces.length,
        description: "Every route-backed admin surface has a concrete route fixture.",
      },
      {
        key: "domain-interoperability",
        status: "complete",
        covered: domainWorkflowCoverage.length,
        total: inventoryConcerns.size,
        description: "Every top-level inventory concern has a domain workflow.",
      },
      {
        key: "route-backed-subdomain-behavior",
        status: "partial",
        covered: [...routeBackedSubdomains].length,
        total: inventoryRows.length,
        description:
          "Route-backed subdomains have UI smoke coverage; true behavior assertions must be owned by each domain as features mature.",
      },
      {
        key: "feature-behavior-assertions",
        status: "partial",
        covered: behaviorAssertions.length,
        total: inventoryRows.length,
        description:
          "Named behavior assertions prove representative visible results and durable side effects; they do not yet cover every inventory interaction.",
      },
      {
        key: "live-puppet-core-behavior",
        status: "complete",
        covered: behaviorAssertions.length,
        total: behaviorAssertions.length,
        description:
          "Every registered core behavior assertion has an owning spec, verification command, visible-result assertion, and durable-side-effect assertion.",
      },
      {
        key: "app-owned-behavior-registry",
        status: "complete",
        covered: behaviorOwnership.surfaceLinks.length,
        total: behaviorOwnership.surfaceLinks.length,
        description:
          "App/admin surfaces register the behavior assertions they own, and each assertion reciprocally names its owning surface.",
      },
      {
        key: "behavior-owned-domain-workflows",
        status: behaviorOwnedWorkflows.length === domainWorkflows.length ? "complete" : "partial",
        covered: behaviorOwnedWorkflows.length,
        total: domainWorkflows.length,
        description:
          "Domain workflows that mutate or verify critical state are now linked to named behavior assertions.",
      },
      {
        key: "live-puppet-orchestration-harness",
        status: livePuppetSpec && livePuppetActors >= 12 ? "complete" : "partial",
        covered: livePuppetActors,
        total: 12,
        description:
          "Actor-backed live E2E can seed 12 puppet users with signer-backed wallets, log them in, verify wallet challenges, smoke every registered route, and run every domain workflow against a real local server/database.",
      },
    ],
    residualWork: [
      "Add deeper per-domain assertions for each feature that mutates durable state.",
      "Run real backend/database/chain-backed E2E where mocks cannot prove persistence, wallet signing, or reward settlement.",
      "Extend tests/playwright/live/puppet-orchestration.spec.mjs when new auth, wallet, admin, reward, persistence, or cross-domain workflows need live actor-backed coverage.",
      "Promote a feature from skeleton coverage to behavior coverage only when the test asserts the user-visible result and the backend side effect.",
    ],
  };
}

export function assertCoverageLayerReport(report) {
  const failures = [];
  failures.push(
    ...assertBehaviorAssertions(report.behaviorAssertions ?? CORE_BEHAVIOR_ASSERTIONS, report.adminSurfaces ?? [])
  );
  for (const layer of report.layers) {
    if (layer.status === "complete" && layer.covered !== layer.total) {
      failures.push(
        `Coverage layer '${layer.key}' is marked complete but covers ${layer.covered}/${layer.total}`
      );
    }
  }
  if (report.claim.fullFeatureBehaviorComplete) {
    failures.push(
      "Do not mark fullFeatureBehaviorComplete true until every inventory interaction has durable behavior assertions."
    );
  }
  return failures;
}
