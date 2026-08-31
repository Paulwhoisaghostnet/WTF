import assert from "node:assert/strict";
import test from "node:test";
import { packDataBytes } from "@taquito/michel-codec";
import {
  WTF_BUYBACK_CONTRACT_ARTIFACT,
  WTF_BUYBACK_PROOF_VERSION,
  buildBuybackLeaf,
  buildBuybackMerkleTree,
  decodeBuybackProof,
  encodeBuybackProof,
  fromHex,
  packMichelsonAddress,
  toHex,
  verifyBuybackProof,
} from "./merkle";

const WALLETS = [
  "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
  "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6",
  "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
].sort((left, right) => left.localeCompare(right));

const SMARTPY_VECTOR = {
  root: "037e4927a3e9393d5f929b63df9d006ee36aead7012c1d5e4012d642ff7dbec1",
  proofs: [
    [
      { sibling: "08269418284a8b2d92427cd4cc0e20cc491f4f4c4721cd9ac3846f7c83121fe5", right: true },
      { sibling: "0cc95654191e0b5ad828e485f7449aa1c185ea6513121c9a8f08488efb63afdd", right: true },
    ],
    [
      { sibling: "6e24c27e3dc1410097cf53547ac50019048b306fbe62deb0c9e59475bc221b7a", right: false },
      { sibling: "0cc95654191e0b5ad828e485f7449aa1c185ea6513121c9a8f08488efb63afdd", right: true },
    ],
    [
      { sibling: "dc917f5ef4e7e5e6555f62e73d38b8b877a13a31b0fb94dc0f5695aede4e8448", right: true },
      { sibling: "37d328ad57d73cc597bc03b9e6ccee9b660763d1ee08c04eb2ab6b4daf2e5c9a", right: false },
    ],
  ],
};

test("buyback leaf bytes equal Taquito's Michelson address packer", () => {
  for (const wallet of WALLETS) {
    const oracle = packDataBytes({ string: wallet }, { prim: "address" }).bytes;
    assert.equal(toHex(packMichelsonAddress(wallet)), oracle);
  }
});

test("directional buyback proofs verify for every wallet, including an odd leaf", () => {
  const leaves = WALLETS.map(buildBuybackLeaf);
  const { root, proofs } = buildBuybackMerkleTree(leaves);

  assert.equal(root.length, 32);
  assert.equal(toHex(root), SMARTPY_VECTOR.root);
  assert.equal(proofs.length, WALLETS.length);
  for (let index = 0; index < WALLETS.length; index += 1) {
    assert.equal(verifyBuybackProof(leaves[index], proofs[index], root), true);
    const encoded = encodeBuybackProof(proofs[index]);
    assert.equal(encoded.version, WTF_BUYBACK_PROOF_VERSION);
    assert.equal(encoded.contractArtifact, WTF_BUYBACK_CONTRACT_ARTIFACT);
    assert.deepEqual(encoded.steps, SMARTPY_VECTOR.proofs[index]);
    assert.deepEqual(decodeBuybackProof(encoded), proofs[index]);
  }
});

test("wallet, sibling, direction, root, and proof-version mutations are rejected", () => {
  const leaves = WALLETS.map(buildBuybackLeaf);
  const { root, proofs } = buildBuybackMerkleTree(leaves);
  const proof = proofs[0];

  assert.equal(verifyBuybackProof(leaves[1], proof, root), false);

  const siblingMutation = proof.map((step) => ({
    sibling: step.sibling.slice(),
    right: step.right,
  }));
  siblingMutation[0].sibling[0] ^= 0x01;
  assert.equal(verifyBuybackProof(leaves[0], siblingMutation, root), false);

  const directionMutation = proof.map((step, index) => ({
    sibling: step.sibling,
    right: index === 0 ? !step.right : step.right,
  }));
  assert.equal(verifyBuybackProof(leaves[0], directionMutation, root), false);

  const rootMutation = root.slice();
  rootMutation[0] ^= 0x01;
  assert.equal(verifyBuybackProof(leaves[0], proof, rootMutation), false);

  const encoded = encodeBuybackProof(proof);
  assert.equal(decodeBuybackProof({ ...encoded, version: "legacy" }), null);
  assert.equal(decodeBuybackProof(proof.map((step) => toHex(step.sibling))), null);
  assert.equal(decodeBuybackProof({ ...encoded, steps: [{ sibling: "00", right: true }] }), null);
  assert.equal(fromHex(toHex(root)).length, 32);
});

test("a single-wallet allowlist uses the contract's valid empty proof", () => {
  const leaf = buildBuybackLeaf(WALLETS[0]);
  const { root, proofs } = buildBuybackMerkleTree([leaf]);
  assert.deepEqual(root, leaf);
  assert.deepEqual(proofs, [[]]);
  assert.equal(verifyBuybackProof(leaf, proofs[0], root), true);
});
