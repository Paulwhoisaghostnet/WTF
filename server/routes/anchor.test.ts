import assert from "node:assert/strict";
import test from "node:test";
import {
  ANCHOR_UPSTREAM,
  buildAnchorDownloadManifest,
  safeAnchorDownloadUrl,
  safeAnchorSha256,
} from "./anchor";

test("Anchor manifest pins the current upstream source release", () => {
  const manifest = buildAnchorDownloadManifest();

  assert.equal(manifest.version, "0.2.4");
  assert.equal(manifest.upstreamTag, "v0.2.4");
  assert.equal(manifest.upstreamCommit, ANCHOR_UPSTREAM.commit);
  assert.deepEqual(manifest.maintainers, ["zabuxx", "daggiedee"]);
  assert.equal(manifest.license, "AGPL-3.0-or-later");
  assert.equal(manifest.source.available, true);
  assert.match(manifest.source.url, /\/archive\/v0\.2\.4\/anchor-v0\.2\.4\.tar\.gz$/);
  assert.match(manifest.source.sha256, /^[0-9a-f]{64}$/);
  assert.equal(manifest.status, "beta");
});

test("Anchor appliance downloads fail closed without both HTTPS URL and SHA-256", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalUrl = process.env.ANCHOR_INSTALLER_ISO_X86_64_URL;
  const originalSha = process.env.ANCHOR_INSTALLER_ISO_X86_64_SHA256;

  try {
    process.env.NODE_ENV = "production";
    process.env.ANCHOR_INSTALLER_ISO_X86_64_URL = "http://downloads.example/anchor.iso";
    process.env.ANCHOR_INSTALLER_ISO_X86_64_SHA256 = "a".repeat(64);
    let item = buildAnchorDownloadManifest().appliances.find((entry) => entry.key === "iso-x86_64");
    assert.equal(item?.available, false);
    assert.equal(item?.url, null);

    process.env.ANCHOR_INSTALLER_ISO_X86_64_URL = "https://downloads.example/anchor.iso";
    delete process.env.ANCHOR_INSTALLER_ISO_X86_64_SHA256;
    item = buildAnchorDownloadManifest().appliances.find((entry) => entry.key === "iso-x86_64");
    assert.equal(item?.available, false);

    process.env.ANCHOR_INSTALLER_ISO_X86_64_SHA256 = `sha256:${"b".repeat(64)}`;
    item = buildAnchorDownloadManifest().appliances.find((entry) => entry.key === "iso-x86_64");
    assert.equal(item?.available, true);
    assert.equal(item?.sha256, "b".repeat(64));
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalUrl === undefined) delete process.env.ANCHOR_INSTALLER_ISO_X86_64_URL;
    else process.env.ANCHOR_INSTALLER_ISO_X86_64_URL = originalUrl;
    if (originalSha === undefined) delete process.env.ANCHOR_INSTALLER_ISO_X86_64_SHA256;
    else process.env.ANCHOR_INSTALLER_ISO_X86_64_SHA256 = originalSha;
  }
});

test("Anchor download sanitizers accept verified shapes only", () => {
  assert.equal(safeAnchorDownloadUrl("javascript:alert(1)"), "");
  assert.equal(safeAnchorDownloadUrl("//downloads.example/anchor.iso"), "");
  assert.equal(safeAnchorDownloadUrl("/downloads/anchor.iso\nSet-Cookie:x"), "");
  assert.equal(safeAnchorDownloadUrl("https://downloads.example/anchor.iso"), "https://downloads.example/anchor.iso");
  assert.equal(safeAnchorSha256("ABC"), "");
  assert.equal(safeAnchorSha256(`sha256:${"C".repeat(64)}`), "c".repeat(64));
});
