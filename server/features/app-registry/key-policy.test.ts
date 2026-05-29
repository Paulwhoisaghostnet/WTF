import test from "node:test";
import assert from "node:assert/strict";
import {
  APP_KEY_PREFIX,
  appIdToKeySlug,
  createAppKeyMaterial,
  hashAppKey,
  isAppKeyValid,
  satisfiesKeyRequirement,
} from "./key-policy";

test("appIdToKeySlug normalizes namespaced ids", () => {
  assert.equal(appIdToKeySlug("desktop:hoard"), "desktop-hoard");
  assert.equal(appIdToKeySlug("creation-tool:particle-painter"), "creation-tool-particle-painter");
  assert.equal(appIdToKeySlug("installed:My App!!"), "installed-my-app");
});

test("createAppKeyMaterial mints wtfapp_<slug>_<rand> with hash + prefix", () => {
  const material = createAppKeyMaterial("desktop:hoard", () => "abc123");
  assert.equal(material.key, `${APP_KEY_PREFIX}_desktop-hoard_abc123`);
  assert.equal(material.prefix, material.key.slice(0, 24));
  assert.equal(material.hash, hashAppKey(material.key));
  assert.match(material.hash, /^[0-9a-f]{64}$/);
});

test("isAppKeyValid: valid only when not revoked, not disabled, fingerprint matches", () => {
  const fp = "fp-current";
  assert.equal(
    isAppKeyValid({ revokedAt: null, disabledAt: null, boundFingerprint: fp }, fp),
    true,
  );
  assert.equal(
    isAppKeyValid({ revokedAt: new Date(), disabledAt: null, boundFingerprint: fp }, fp),
    false,
  );
  assert.equal(
    isAppKeyValid({ revokedAt: null, disabledAt: new Date(), boundFingerprint: fp }, fp),
    false,
  );
  assert.equal(
    isAppKeyValid({ revokedAt: null, disabledAt: null, boundFingerprint: "old" }, fp),
    false,
  );
  assert.equal(
    isAppKeyValid({ revokedAt: null, disabledAt: null, boundFingerprint: null }, fp),
    false,
  );
});

test("satisfiesKeyRequirement: mandatory only when registry enabled", () => {
  // Flag off → legacy path, no key required.
  assert.equal(satisfiesKeyRequirement({ appRegistryEnabled: false, hasKey: false, keyValid: false }), true);
  // Flag on → a valid key is mandatory.
  assert.equal(satisfiesKeyRequirement({ appRegistryEnabled: true, hasKey: false, keyValid: false }), false);
  assert.equal(satisfiesKeyRequirement({ appRegistryEnabled: true, hasKey: true, keyValid: false }), false);
  assert.equal(satisfiesKeyRequirement({ appRegistryEnabled: true, hasKey: true, keyValid: true }), true);
});
