import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./buyback-windows.ts", import.meta.url), "utf8");

test("buyback allowlists are versioned and frozen before the immutable-root lifecycle begins", () => {
  assert.match(source, /window\.status !== "draft"/);
  assert.match(source, /WTF_BUYBACK_PROOF_VERSION/);
  assert.match(source, /WTF_BUYBACK_CONTRACT_ARTIFACT/);
  assert.match(source, /encodeBuybackProof\(proofs\[i\]\)/);
  assert.match(source, /every allowlist maxWtf must equal the window perSellerCapWtf/);
});

test("funding and opening fail closed unless every stored directional proof matches the root", () => {
  assert.match(source, /target === "funded" \|\| parsed\.data\.target === "open"/);
  assert.match(source, /decodeBuybackProof\(entry\.merkleProof\)/);
  assert.match(
    source,
    /verifyBuybackProof\(buildBuybackLeaf\(entry\.walletAddress\), proof, root\)/,
  );
  assert.match(source, /upload the complete allowlist again before funding or opening/);
});
