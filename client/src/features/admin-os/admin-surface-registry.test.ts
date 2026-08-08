import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { DESKTOP_APPS } from "@shared/types";
import {
  ALL_ADMIN_SURFACES,
  ADMIN_SURFACES,
  DOCTRINE_DOMAIN_GUIDES,
  findAdminSurfaceForPath,
  getAdminSurfaceDoctrineDomain,
} from "./admin-surface-registry";

function surfaceById(id: string) {
  return ADMIN_SURFACES.find((surface) => surface.id === id);
}

test("admin registry includes every canonical Phase 4 shell surface", () => {
  for (const id of [
    "mission-control",
    "command-palette",
    "notifications",
    "recovery-mode",
    "backup-manager",
    "desktop-appearance",
    "system-settings",
    "browser-boundaries",
    "agent",
    "terminal",
    "cli",
    "file-manager",
  ]) {
    assert(surfaceById(id), `${id} should be registered for admin observability`);
  }
});

test("admin registry resolves Mission Control and Recovery Mode routes", () => {
  assert.equal(findAdminSurfaceForPath("/mission-control")?.id, "mission-control");
  assert.equal(findAdminSurfaceForPath("/recovery-mode")?.id, "recovery-mode");
  assert.equal(findAdminSurfaceForPath("/browser-boundaries")?.id, "browser-boundaries");
  assert.equal(findAdminSurfaceForPath("/agent")?.id, "agent");
  assert.equal(findAdminSurfaceForPath("/digest")?.id, "digest");
  assert.equal(findAdminSurfaceForPath("/wtf-subdomains")?.id, "wtf-domains");
  assert.equal(findAdminSurfaceForPath("/wtf-subdomains/setup")?.id, "wtf-domains");
});

test("admin registry tracks current shell event handles", () => {
  assert(surfaceById("mission-control")?.automationHandles.includes("mission_control.action_opened"));
  assert(surfaceById("recovery-mode")?.automationHandles.includes("recovery_mode.action_opened"));
  assert(surfaceById("recovery-mode")?.automationHandles.includes("recovery_mode.filesystem_checked"));
  assert(surfaceById("browser-boundaries")?.automationHandles.includes("browser_boundaries.action_opened"));
  assert(surfaceById("agent")?.automationHandles.includes("agent.chat.sent"));
  assert(surfaceById("agent")?.automationHandles.includes("agent.git.committed"));
  assert(surfaceById("notifications")?.automationHandles.includes("notification_center.viewed"));
});

test("admin panel registry exposes the broad-to-acute suite and help contracts", () => {
  const surface = surfaceById("admin-panel");
  assert(surface, "admin-panel should be registered");
  for (const setting of [
    "task-first admin overview",
    "sortable user highest-role and level review",
    "user WTF Passport acute account controls",
    "curse catalog and assignment scope",
    "exhaustive human and agent help index",
  ]) {
    assert(surface?.nativeSettings.includes(setting), `${setting} must remain indexed`);
  }
  for (const route of [
    "/api/admin/users/:id/passport",
    "/api/admin/users/:id/passport/desktop-settings",
    "/api/admin/help-index",
  ]) {
    assert(surface?.adminRoutes?.includes(route), `${route} must remain agent-discoverable`);
  }
  assert(surface?.behaviorAssertionIds?.includes("admin.broad-acute-control-suite"));
  assert(surface?.behaviorAssertionIds?.includes("admin.help-index-coverage"));
});

test("admin registry covers every desktop app key", () => {
  for (const appKey of DESKTOP_APPS) {
    const surface = ALL_ADMIN_SURFACES.find((candidate) => candidate.desktopAppKey === appKey);
    assert(surface, `${appKey} should have admin observability`);
    assert(surface.routePatterns.length > 0, `${appKey} should have route patterns`);
    assert(surface.nativeSettings.length > 0, `${appKey} should have native settings`);
  }
});

test("admin registry exact app routes resolve to their owning app surface", () => {
  for (const surface of ADMIN_SURFACES) {
    if (surface.kind !== "app" && surface.kind !== "public-surface") continue;
    for (const routePattern of surface.routePatterns) {
      if (!routePattern.startsWith("/") || routePattern.includes(":")) continue;
      assert.equal(
        findAdminSurfaceForPath(routePattern)?.id,
        surface.id,
        `${routePattern} should resolve to ${surface.id}`
      );
    }
  }
});

test("WTF Domains owns the subdomain route and desktop app gate", () => {
  const surface = surfaceById("wtf-domains");
  assert(surface, "WTF Domains should be registered for admin observability");
  assert.equal(surface?.desktopAppKey, "wtf-subdomains");
  assert.deepEqual(surface?.routePatterns, ["/wtf-subdomains", "/wtf-subdomains/setup"]);
  assert.equal(getAdminSurfaceDoctrineDomain(surface!), DOCTRINE_DOMAIN_GUIDES.tezosPlatform);
});

test("CH-EASE owns its package routes and Macaroni source audit handles", () => {
  const surface = surfaceById("ch-ease");
  assert(surface, "CH-EASE should be registered for admin observability");
  assert.equal(surface?.desktopAppKey, "ch-ease");
  assert.deepEqual(surface?.routePatterns, ["/tools/ch-ease", "/tools/macaroni-packager"]);
  assert.equal(findAdminSurfaceForPath("/tools/ch-ease")?.id, "ch-ease");
  assert.equal(findAdminSurfaceForPath("/tools/macaroni-packager")?.id, "ch-ease");
  assert.equal(getAdminSurfaceDoctrineDomain(surface!), DOCTRINE_DOMAIN_GUIDES.mediaTvStudio);
  assert(surface?.automationHandles.includes("macaroni.package_created"));
  assert(surface?.automationHandles.includes("macaroni.package_drop_config_updated"));
  assert(surface?.automationHandles.includes("macaroni.package_export_downloaded"));
  assert(surface?.automationHandles.includes("macaroni.package_source_loaded"));
  assert(surface?.automationHandles.includes("macaroni.package_handoff_opened"));
  assert(surface?.behaviorAssertionIds?.includes("macaroni.wtfos-package-source"));
});

test("Pasta Protocol owns Colander and static publisher routes", () => {
  const surface = surfaceById("pasta-protocol");
  assert(surface, "Pasta Protocol should be registered for admin observability");
  assert.equal(surface?.desktopAppKey, "pasta-protocol");
  assert.deepEqual(surface?.routePatterns, [
    "/tools/colander",
    "/tools/spaghetti",
    "/tools/gnocchi",
    "/tools/ravioli",
    "/tools/rotini",
    "/tools/penne",
    "/tools/lasagna",
  ]);
  assert.equal(findAdminSurfaceForPath("/tools/colander")?.id, "pasta-protocol");
  assert.equal(findAdminSurfaceForPath("/tools/spaghetti")?.id, "pasta-protocol");
  assert.equal(getAdminSurfaceDoctrineDomain(surface!), DOCTRINE_DOMAIN_GUIDES.pastaProtocol);
  assert(surface?.automationHandles.includes("chease.package_handoff_opened"));
  assert(surface?.automationHandles.includes("chease.installer_manifest.viewed"));
  assert(surface?.automationHandles.includes("colander.handoff_opened"));
  assert(surface?.automationHandles.includes("colander.contract_action_submitted"));
  assert(surface?.automationHandles.includes("penne.distribution_configured"));
  assert(surface?.automationHandles.includes("gnocchi.site_exported"));
  assert(surface?.automationHandles.includes("lasagna.site_exported"));
  assert(surface?.automationHandles.includes("pasta_protocol.draft_saved"));
  assert(surface?.automationHandles.includes("pasta_protocol.draft_imported"));
  assert(surface?.automationHandles.includes("pasta_protocol.contract_recorded"));
  assert(surface?.automationHandles.includes("pasta_protocol.contract_verified"));
  assert(surface?.automationHandles.includes("pasta_protocol.contract_resumed"));
  assert(surface?.automationHandles.includes("pasta_protocol.contract_forgotten"));
  assert(surface?.behaviorAssertionIds?.includes("pasta-protocol.sandbox-safe-feedback"));
  assert(surface?.behaviorAssertionIds?.includes("pasta-protocol.chease-handoff"));
  assert(surface?.behaviorAssertionIds?.includes("pasta-protocol.studio-draft-recovery"));
  assert(surface?.behaviorAssertionIds?.includes("pasta-protocol.ravioli-limited-edition-expiry-deconfliction"));
  assert(surface?.behaviorAssertionIds?.includes("pasta-protocol.ravioli-rotini-generated-at-open"));
  assert(surface?.behaviorAssertionIds?.includes("pasta-protocol.contract-resume-ledger"));
  assert(surface?.behaviorAssertionIds?.includes("pasta-protocol.native-colander-lifecycle"));
  assert(surface?.behaviorAssertionIds?.includes("pasta-protocol.portable-chease-preparation"));
  assert(surface?.behaviorAssertionIds?.includes("pasta-protocol.self-hosted-site-exports"));
  assert(surface?.behaviorAssertionIds?.includes("pasta-protocol.colander-project-workspace"));
  assert(surface?.behaviorAssertionIds?.includes("pasta-protocol.colander-context-handoff"));
  assert(surface?.behaviorAssertionIds?.includes("pasta-protocol.wtfme-hosted-pages"));
  assert(surface?.behaviorAssertionIds?.includes("pasta-protocol.pinning-recovery"));
});

test("IPFS Pinning Manager owns Pasta project-bundle recovery publish API", () => {
  const surface = surfaceById("ipfs-pinning");
  assert(surface, "IPFS Pinning Manager should be registered for admin observability");
  assert(surface?.adminRoutes?.includes("/api/ipfs-pinning/pasta-protocol/publish"));
  assert(surface?.automationHandles.includes("ipfs_pinning.restore_proof.created"));
  assert(surface?.behaviorAssertionIds?.includes("pasta-protocol.pinning-recovery"));
});

test("desktop app admin surface bindings are one-to-one", () => {
  const counts = new Map<string, number>();
  for (const surface of ALL_ADMIN_SURFACES) {
    if (!surface.desktopAppKey) continue;
    counts.set(surface.desktopAppKey, (counts.get(surface.desktopAppKey) ?? 0) + 1);
  }

  for (const appKey of DESKTOP_APPS) {
    assert.equal(counts.get(appKey), 1, `${appKey} should have exactly one admin surface`);
  }
});

test("admin registry maps every surface to a doctrine domain guide", () => {
  for (const surface of ALL_ADMIN_SURFACES) {
    const doctrine = getAdminSurfaceDoctrineDomain(surface);
    assert(doctrine.label.length > 0, `${surface.id} needs a doctrine domain`);
    assert.match(doctrine.guide, /^docs\/domains\/.+\.md$/, `${surface.id} needs a doctrine guide`);
    assert.equal(existsSync(doctrine.guide), true, `${surface.id} doctrine guide must exist`);
  }

  assert.equal(getAdminSurfaceDoctrineDomain(surfaceById("w")!).label, "Identity And Social");
  assert.equal(getAdminSurfaceDoctrineDomain(surfaceById("tv")!).label, "Media, TV, And Studio");
  assert.equal(getAdminSurfaceDoctrineDomain(surfaceById("operator-tools")!).label, "Operations");
  assert.equal(getAdminSurfaceDoctrineDomain(surfaceById("profile")!).label, "Identity And Social");
  assert.equal(getAdminSurfaceDoctrineDomain(surfaceById("pasta-protocol")!).label, "Pasta Protocol");
});
