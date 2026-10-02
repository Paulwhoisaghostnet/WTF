import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWallet } from "../src/custody.mts";

test("dedicated encrypted custody persists identity and rejects other wallets and networks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wtfos-alea-custody-test-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify("NetXsqzbfFenSTS"));
  const options = {
    keyringPath: join(directory, "keyring.json"),
    masterKeyFile: join(directory, "master.key"),
    walletId: "render-test",
    network: "shadownet" as const,
    rpcUrl: "https://tezos-shadownet.octez.io/",
    exclusive: true,
  };
  try {
    const created = await loadWallet({ ...options, create: true });
    const saved = await readFile(options.keyringPath, "utf8");
    assert.equal(saved.includes(await created.signer.secretKey()), false);
    assert.equal((await stat(options.keyringPath)).mode & 0o777, 0o600);
    assert.equal((await stat(options.masterKeyFile)).mode & 0o777, 0o600);
    const loaded = await loadWallet(options);
    assert.equal(loaded.wallet.address, created.wallet.address);
    assert.equal(await readFile(options.keyringPath, "utf8"), saved);
    await assert.rejects(loadWallet({ ...options, network: "mainnet" }), /network mismatch/);
    await assert.rejects(loadWallet({ ...options, walletId: "another", create: true }), /another wallet/);
    assert.equal(await readFile(options.keyringPath, "utf8"), saved);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
