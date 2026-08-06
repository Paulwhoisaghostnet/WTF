import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeJson,
  computeBundleHash,
  computeFingerprint,
  computeIntegrityFingerprint,
  computeManifestHash,
  fingerprintMatches,
  type BundleFile,
} from "./fingerprint";

test("canonicalizeJson is key-order independent", () => {
  const a = canonicalizeJson({ b: 1, a: { d: 4, c: 3 } });
  const b = canonicalizeJson({ a: { c: 3, d: 4 }, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":{"c":3,"d":4},"b":1}');
});

test("manifest hash is deterministic and order independent", () => {
  const h1 = computeManifestHash({ id: "x", label: "X", nested: [1, 2, 3] });
  const h2 = computeManifestHash({ label: "X", nested: [1, 2, 3], id: "x" });
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test("manifest hash changes when structure/code changes", () => {
  const base = computeManifestHash({ id: "x", routeEvidence: ["/a"] });
  const changed = computeManifestHash({ id: "x", routeEvidence: ["/a", "/b"] });
  assert.notEqual(base, changed);
});

test("bundle hash is order independent and stable", () => {
  const files1: BundleFile[] = [
    { path: "a.js", sha256: "11" },
    { path: "b.js", sha256: "22" },
  ];
  const files2: BundleFile[] = [
    { path: "b.js", sha256: "22" },
    { path: "a.js", sha256: "11" },
  ];
  assert.equal(computeBundleHash(files1), computeBundleHash(files2));
  assert.match(computeBundleHash(files1), /^[0-9a-f]{64}$/);
});

test("bundle hash changes when a file content hash changes", () => {
  const before = computeBundleHash([{ path: "a.js", sha256: "11" }]);
  const after = computeBundleHash([{ path: "a.js", sha256: "99" }]);
  assert.notEqual(before, after);
});

test("empty bundle is the deterministic zero root", () => {
  assert.equal(computeBundleHash([]), "0".repeat(64));
});

test("integrity fingerprint combines all three legs", () => {
  const fp = computeIntegrityFingerprint("aa", "bb", "cc");
  assert.match(fp, /^[0-9a-f]{64}$/);
  // Changing any leg changes the fingerprint.
  assert.notEqual(fp, computeIntegrityFingerprint("aa", "bb", "cd"));
  assert.notEqual(fp, computeIntegrityFingerprint("aa", "bc", "cc"));
  assert.notEqual(fp, computeIntegrityFingerprint("ab", "bb", "cc"));
});

test("computeFingerprint is fully deterministic for the same inputs", () => {
  const input = {
    manifest: { id: "desktop:arcade", label: "WTF Arcade" },
    bundleFiles: [{ path: "index.js", sha256: "deadbeef" }],
    buildHash: "pkg:1.0.0",
  };
  const a = computeFingerprint(input);
  const b = computeFingerprint(input);
  assert.deepEqual(a, b);
  assert.equal(a.fingerprintAlgo, "sha256");
});

test("fingerprintMatches requires both present and equal", () => {
  assert.equal(fingerprintMatches("abc", "abc"), true);
  assert.equal(fingerprintMatches("abc", "abd"), false);
  assert.equal(fingerprintMatches(null, "abc"), false);
  assert.equal(fingerprintMatches("abc", null), false);
  assert.equal(fingerprintMatches(null, null), false);
});
