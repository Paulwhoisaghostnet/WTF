import assert from "node:assert/strict";
import { readFile, rm, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  encryptEntropyForKeyring,
  generateEntropyChain,
  recoverEntropyFromKeyring,
} from "../src/crypto-store.mjs";
import { stageToCar, verifyCar } from "../src/private-staging.mjs";
import { verifyCrossLanguageFixture } from "../src/protocol.mjs";

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "macaroni-v35-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("Companion reproduces the compiled SmartPy PACK/hash fixture", async () => {
  const template = JSON.parse(await readFile(new URL("../contract/macaroni-v35.template.json", import.meta.url), "utf8"));
  const result = verifyCrossLanguageFixture(template);
  assert.equal(result.ok, true);
  assert.equal(result.allocationHash, template.crossLanguageFixture.allocation.sha256Hex);
});

test("reverse hash-chain custody is encrypted, recoverable, and authenticated", async (t) => {
  const directory = await temporaryDirectory(t);
  const masterKeyFile = path.join(directory, "master.key");
  await writeFile(masterKeyFile, Buffer.alloc(32, 7), { mode: 0o600 });
  const chain = generateEntropyChain(3, () => Buffer.alloc(32, 11));
  const stored = await encryptEntropyForKeyring({
    chain,
    dropRef: "custody-test",
    privateAssetDir: directory,
    masterKeyFile,
    keyVersion: "master-key-v1",
  });
  const ciphertext = await readFile(stored.encryptedPath);
  assert.equal(ciphertext.includes(chain.seed), false);
  assert.equal(ciphertext.toString("utf8").includes(chain.preimages[0]), false);
  const recovered = await recoverEntropyFromKeyring({
    encryptedPath: stored.encryptedPath,
    masterKeyFile,
    expectedHead: chain.publicHead,
    expectedLength: chain.chainLength,
  });
  assert.deepEqual(recovered.preimages, chain.preimages);
  ciphertext[ciphertext.length - 1] ^= 1;
  await writeFile(stored.encryptedPath, ciphertext, { mode: 0o600 });
  await assert.rejects(() => recoverEntropyFromKeyring({
    encryptedPath: stored.encryptedPath,
    masterKeyFile,
    expectedHead: chain.publicHead,
    expectedLength: chain.chainLength,
  }));
});

test("the pinned CAR profile is deterministic and verifies its committed root", async (t) => {
  const directory = await temporaryDirectory(t);
  const firstPath = path.join(directory, "first.car");
  const secondPath = path.join(directory, "second.car");
  const bytes = Buffer.from("same artifact bytes produce the same reviewed CAR", "utf8");
  const first = await stageToCar({ source: bytes, carPath: firstPath });
  const second = await stageToCar({ source: bytes, carPath: secondPath });
  assert.equal(first.cid, second.cid);
  assert.deepEqual(await readFile(firstPath), await readFile(secondPath));
  assert.equal((await verifyCar(firstPath, first.cid)).valid, true);
});
