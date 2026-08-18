import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  EXPECTED_TARGET,
  PRODUCTS,
  validateReceipt,
} from "./pasta-desktop-alpha-handoff.mjs";

const gitSha = "0123456789abcdef0123456789abcdef01234567";
const product = PRODUCTS.find(({ key }) => key === "ravioli");
const expectedArtifact = Object.freeze({
  distribution: "zip",
  path: path.resolve("apps/ravioli-desktop/release/Ravioli-Studio-1.0.1-alpha.1-mac-universal.zip"),
  sha256: "a".repeat(64),
  executableSha256: "b".repeat(64),
  architectures: ["arm64", "x86_64"],
});

function validReceipt() {
  return {
    ok: true,
    app: product.key,
    origin: product.origin,
    executablePath: "/private/tmp/pasta-ravioli-artifact-smoke/zip/ravioli-studio.app/Contents/MacOS/ravioli-studio",
    stableOriginRelaunch: true,
    provenance: {
      app: product.packageName,
      version: "1.0.1-alpha.1",
      gitSha,
      dirty: true,
      sourceRevision: `${gitSha}-dirty`,
      target: EXPECTED_TARGET,
    },
    artifact: { ...expectedArtifact, architectures: [...expectedArtifact.architectures] },
  };
}

test("alpha handoff accepts a receipt bound to the independently inspected artifact", () => {
  assert.doesNotThrow(() => validateReceipt(validReceipt(), product, expectedArtifact, gitSha));
});

test("alpha handoff rejects archive substitution after smoke", () => {
  const receipt = validReceipt();
  receipt.artifact.sha256 = "c".repeat(64);
  assert.throws(
    () => validateReceipt(receipt, product, expectedArtifact, gitSha),
    /archive SHA-256 should match/,
  );
});

test("alpha handoff rejects executable substitution inside an artifact", () => {
  const receipt = validReceipt();
  receipt.artifact.executableSha256 = "d".repeat(64);
  assert.throws(
    () => validateReceipt(receipt, product, expectedArtifact, gitSha),
    /executable SHA-256 should match/,
  );
});

test("alpha handoff rejects missing, wrong-format, wrong-path, or cross-format receipt identity", () => {
  const missing = validReceipt();
  delete missing.artifact;
  assert.throws(
    () => validateReceipt(missing, product, expectedArtifact, gitSha),
    /artifact identity should be present/,
  );

  const wrongDistribution = validReceipt();
  wrongDistribution.artifact.distribution = "dmg";
  assert.throws(
    () => validateReceipt(wrongDistribution, product, expectedArtifact, gitSha),
    /artifact distribution should match/,
  );

  const wrongPath = validReceipt();
  wrongPath.artifact.path = path.resolve("substituted.zip");
  assert.throws(
    () => validateReceipt(wrongPath, product, expectedArtifact, gitSha),
    /artifact path should match/,
  );

  const malformedHash = validReceipt();
  malformedHash.artifact.sha256 = "not-a-sha";
  assert.throws(
    () => validateReceipt(malformedHash, product, expectedArtifact, gitSha),
    /archive SHA-256 should be exact/,
  );
});

test("alpha handoff rejects per-distribution architecture drift", () => {
  const receipt = validReceipt();
  receipt.artifact.architectures = ["arm64"];
  assert.throws(
    () => validateReceipt(receipt, product, expectedArtifact, gitSha),
    /architectures should match/,
  );

  assert.throws(
    () =>
      validateReceipt(
        validReceipt(),
        product,
        { ...expectedArtifact, architectures: ["x86_64"] },
        gitSha,
      ),
    /independently inspected executable should be universal/,
  );
});
