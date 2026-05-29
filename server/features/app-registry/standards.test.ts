import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveRegistryKind,
  validateAppManifest,
  type WtfAppManifest,
} from "./standards";

function validManifest(): WtfAppManifest {
  return {
    id: "installed:demo",
    key: "demo",
    label: "Demo App",
    kind: "installed-app",
    domain: { label: "WTF OS", guide: "docs/domains/wtf-os.md" },
    routeEvidence: ["/apps/demo"],
    provenance: { owner: "Creator", source: "github:creator/demo", evidence: ["README.md"] },
    permissionSummary: {
      userAccess: "Authenticated browser session.",
      adminAccess: "Admin observability via registry.",
      dataTouched: [],
      externalSystems: [],
    },
    rollback: { method: "Disable the registration.", evidence: ["registry"] },
    uninstall: { method: "Disable and archive.", preservesUserData: true, evidence: ["registry"] },
  };
}

test("a complete manifest passes validation", () => {
  const result = validateAppManifest(validManifest());
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test("missing required fields are reported", () => {
  const m = validManifest();
  delete m.label;
  const result = validateAppManifest(m);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("label")));
});

test("uninstall must preserve user data", () => {
  const m = validManifest();
  m.uninstall = { method: "delete everything", preservesUserData: false, evidence: ["x"] };
  const result = validateAppManifest(m);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("preservesUserData")));
});

test("domain must be an accepted doctrine domain with matching guide", () => {
  const m = validManifest();
  m.domain = { label: "Bogus Domain", guide: "docs/domains/bogus.md" };
  const bad = validateAppManifest(m);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.includes("accepted doctrine domain")));

  const mismatch = validManifest();
  mismatch.domain = { label: "WTF OS", guide: "docs/domains/identity-and-social.md" };
  const mismatched = validateAppManifest(mismatch);
  assert.equal(mismatched.ok, false);
  assert.ok(mismatched.errors.some((e) => e.includes("docs/domains/wtf-os.md")));
});

test("domain guide must match docs/domains/<name>.md", () => {
  const m = validManifest();
  m.domain = { label: "WTF OS", guide: "not/a/doc.txt" };
  const result = validateAppManifest(m);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("docs/domains")));
});

test("routeEvidence and provenance evidence must be non-empty arrays", () => {
  const m = validManifest();
  m.routeEvidence = [];
  m.provenance = { owner: "x", source: "y", evidence: [] };
  const result = validateAppManifest(m);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("routeEvidence")));
  assert.ok(result.errors.some((e) => e.includes("provenance.evidence")));
});

test("invalid kind is rejected; resolveRegistryKind falls back to installed-app", () => {
  const m = validManifest();
  m.kind = "totally-made-up";
  const result = validateAppManifest(m);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("kind must be one of")));
  assert.equal(resolveRegistryKind(m), "installed-app");
  assert.equal(resolveRegistryKind({ ...m, kind: "desktop-app" }), "desktop-app");
});
