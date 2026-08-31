import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMacaroniRevealRegistrationMessage,
  verifyMacaroniRevealRegistrationProof,
  type MacaroniRevealProofDependencies,
} from "./reveal-auth";

const identity = {
  network: "shadownet" as const,
  contract: "KT1AABBCCDDEEFFGGHHJJKKLLMMNNooPPQQR",
  administrator: "tz1AABBCCDDEEFFGGHHJJKKLLMMNNooPPQQR",
};

function proofFor(message: string) {
  return {
    nonce: "ab".repeat(32),
    publicKey: "edpk-test-administrator",
    signature: `signed:${message}`,
  };
}

function proofHarness(): {
  dependencies: MacaroniRevealProofDependencies;
  consumed: Set<string>;
} {
  const consumed = new Set<string>();
  return {
    consumed,
    dependencies: {
      ownsPublicKey: (_address, publicKey) => publicKey === "edpk-test-administrator",
      consumeNonce: async (address, nonce) => {
        const key = `${address}:${nonce}`;
        if (consumed.has(key)) return false;
        consumed.add(key);
        return true;
      },
      verifiesSignature: (message, signature) => signature === `signed:${message}`,
    },
  };
}

test("Macaroni reveal registration accepts one purpose-bound administrator proof", async () => {
  const harness = proofHarness();
  const message = buildMacaroniRevealRegistrationMessage(identity, "ab".repeat(32));
  assert.match(message, /macaroni-v3-reveal-registration\.v1/);
  assert.match(message, /Network: shadownet/);
  assert.match(message, new RegExp(`Contract: ${identity.contract}`));
  assert.match(message, new RegExp(`Administrator: ${identity.administrator}`));

  await verifyMacaroniRevealRegistrationProof(identity, proofFor(message), harness.dependencies);
  await assert.rejects(
    verifyMacaroniRevealRegistrationProof(identity, proofFor(message), harness.dependencies),
    /invalid, expired, or already used/
  );
});

test("Macaroni reveal registration rejects administrator impersonation before consuming a nonce", async () => {
  const harness = proofHarness();
  const message = buildMacaroniRevealRegistrationMessage(identity, "ab".repeat(32));
  await assert.rejects(
    verifyMacaroniRevealRegistrationProof(
      identity,
      { ...proofFor(message), publicKey: "edpk-attacker" },
      harness.dependencies
    ),
    /does not control the contract administrator/
  );
  assert.equal(harness.consumed.size, 0);
});

test("Macaroni reveal registration binds network and contract into the signed message", async () => {
  for (const changedIdentity of [
    { ...identity, network: "mainnet" as const },
    { ...identity, contract: "KT1ZZYYXXWWVVUUTTSSRRQQPPooNNMMkkJJH" },
  ]) {
    const harness = proofHarness();
    const originalMessage = buildMacaroniRevealRegistrationMessage(identity, "ab".repeat(32));
    await assert.rejects(
      verifyMacaroniRevealRegistrationProof(
        changedIdentity,
        proofFor(originalMessage),
        harness.dependencies
      ),
      /wallet signature is invalid/
    );
  }
});

test("Macaroni reveal registration rejects signature mutation and invalid or expired challenges", async () => {
  const message = buildMacaroniRevealRegistrationMessage(identity, "ab".repeat(32));
  const invalidSignatureHarness = proofHarness();
  await assert.rejects(
    verifyMacaroniRevealRegistrationProof(
      identity,
      { ...proofFor(message), signature: "sig-mutated" },
      invalidSignatureHarness.dependencies
    ),
    /wallet signature is invalid/
  );

  const expiredHarness = proofHarness();
  expiredHarness.dependencies.consumeNonce = async () => false;
  await assert.rejects(
    verifyMacaroniRevealRegistrationProof(identity, proofFor(message), expiredHarness.dependencies),
    /invalid, expired, or already used/
  );
});
