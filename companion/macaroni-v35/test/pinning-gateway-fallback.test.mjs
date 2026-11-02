import assert from "node:assert/strict";
import test from "node:test";

import { ExternalCarPinningAdapter } from "../src/adapters/pinning.mjs";

test("public CAR verification uses FileShip's canonical URL before fallback gateways", async () => {
  const requested = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    return new Response(Uint8Array.from([0]), { status: 206 });
  };
  try {
    const adapter = new ExternalCarPinningAdapter("https://pin.example.test", "token", "https://ipfs.fileship.xyz");
    assert.deepEqual(
      await adapter.verifyPublishedCid("bafybeigdyrztfixturecid"),
      { cid: "bafybeigdyrztfixturecid", public: true },
    );
    assert.deepEqual(requested, ["https://ipfs.fileship.xyz/bafybeigdyrztfixturecid"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public CAR verification advances to an independent gateway after FileShip failure", async () => {
  const requested = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (requested.length === 1) return new Response(null, { status: 504 });
    return new Response(Uint8Array.from([0]), { status: 206 });
  };
  try {
    const adapter = new ExternalCarPinningAdapter("https://pin.example.test", "token", "https://ipfs.fileship.xyz");
    await adapter.verifyPublishedCid("bafybeigdyrztfixturecid");
    assert.deepEqual(requested, [
      "https://ipfs.fileship.xyz/bafybeigdyrztfixturecid",
      "https://nftstorage.link/ipfs/bafybeigdyrztfixturecid",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
