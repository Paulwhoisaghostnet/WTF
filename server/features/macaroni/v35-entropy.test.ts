import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptMacaroniV35EntropyWithKeyring,
  encryptMacaroniV35EntropySeed,
  generateMacaroniV35EntropyChain,
  parseMacaroniV35VersionedKeyring,
  regenerateMacaroniV35EntropyChain,
} from "./v35-entropy";

test("entropy recovery regenerates the exact committed reverse chain", () => {
  const seed = Buffer.alloc(32, 0x41);
  const first = regenerateMacaroniV35EntropyChain({ seed, length: 17 });
  const second = regenerateMacaroniV35EntropyChain({ seed, length: 17 });
  assert.deepEqual(second, first);
  assert.equal(first.preimages.length, 17);
});

test("versioned keyring keeps old recovery material during rotation", () => {
  const chain = generateMacaroniV35EntropyChain({
    physicalSupply: 9,
    random: () => Buffer.alloc(32, 0x29),
  });
  const encrypted = encryptMacaroniV35EntropySeed({
    seed: chain.seed,
    head: chain.head,
    length: chain.length,
    keyMaterial: "old-key-material-that-is-at-least-thirty-two-bytes",
    keyVersion: "v1",
  });
  const keyring = parseMacaroniV35VersionedKeyring({
    serialized: JSON.stringify({
      v1: "old-key-material-that-is-at-least-thirty-two-bytes",
      v2: "new-key-material-that-is-at-least-thirty-two-bytes",
    }),
    activeVersion: "v2",
    label: "test",
  });
  const recovered = decryptMacaroniV35EntropyWithKeyring({
    encrypted,
    keyring,
    expectedHead: chain.head,
    expectedLength: chain.length,
  });
  assert.equal(recovered.keyVersion, "v1");
  assert.equal(recovered.head, chain.head);
  assert.deepEqual(recovered.preimages, chain.preimages);
  recovered.seed.fill(0);
});

test("entropy recovery fails closed on a different head or missing historical key", () => {
  const chain = generateMacaroniV35EntropyChain({
    physicalSupply: 3,
    random: () => Buffer.alloc(32, 0x11),
  });
  const encrypted = encryptMacaroniV35EntropySeed({
    seed: chain.seed,
    head: chain.head,
    length: chain.length,
    keyMaterial: "recovery-key-material-that-is-at-least-thirty-two",
    keyVersion: "backup-v1",
  });
  const keyring = parseMacaroniV35VersionedKeyring({
    serialized: JSON.stringify({ current: "current-key-material-that-is-at-least-thirty-two" }),
    activeVersion: "current",
    label: "test",
  });
  assert.throws(() => decryptMacaroniV35EntropyWithKeyring({
    encrypted,
    keyring,
    expectedHead: chain.head,
    expectedLength: chain.length,
  }), /unavailable/);
});
