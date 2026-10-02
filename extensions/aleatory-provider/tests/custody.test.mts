import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentWallet, loadWallet, operatorWallet } from "../src/custody.mts";
import type { ProviderConfig } from "../src/config.mts";

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

test("established operator custody permits 0640 while dedicated agent custody remains private", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wtfos-alea-custody-modes-"));
  const options = {
    keyringPath: join(directory, "operator-keyring.json"),
    masterKeyFile: join(directory, "operator-master.key"),
    walletId: "operator-test",
    network: "mainnet" as const,
    rpcUrl: "https://tezos-mainnet.octez.io/",
  };
  const environment = {
    WTF_ALEATORY_OPERATOR_KEYRING: options.keyringPath,
    WTF_ALEATORY_OPERATOR_MASTER_KEY_FILE: options.masterKeyFile,
    WTF_ALEATORY_OPERATOR_WALLET_ID: options.walletId,
    WTF_ALEATORY_AGENT_KEYRING: options.keyringPath,
    WTF_ALEATORY_AGENT_MASTER_KEY_FILE: options.masterKeyFile,
    WTF_ALEATORY_AGENT_WALLET_ID: options.walletId,
  };
  const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  try {
    const created = await loadWallet({ ...options, create: true });
    const saved = await readFile(options.keyringPath, "utf8");
    const config: ProviderConfig = {
      network: options.network, chainId: "NetXdQprcVkpaWU", rpcUrl: options.rpcUrl,
      tzktApi: "https://api.tzkt.io", router: "KT1HTY5RFTUai5K2Bh2LVySQvSid9Mx2dP4J",
      registry: "KT1E7wraYc1cgywqDQX2KGMNF4TbCADsHVL9", stateDir: directory,
      operatorAddress: created.wallet.address,
    };
    Object.assign(process.env, environment);
    await chmod(options.masterKeyFile, 0o640);
    const loaded = await operatorWallet(config);
    assert.equal(loaded.wallet.address, created.wallet.address);
    assert.equal(await readFile(options.keyringPath, "utf8"), saved);
    assert.equal((await stat(options.masterKeyFile)).mode & 0o777, 0o640);
    await assert.rejects(agentWallet(config), /private \(0600\)/);
    await assert.rejects(loadWallet(options), /private \(0600\)/);

    for (const mode of [0o660, 0o650, 0o644]) {
      await chmod(options.masterKeyFile, mode);
      await assert.rejects(operatorWallet(config), /Custody file/);
    }
    await chmod(options.masterKeyFile, 0o600);
    await chmod(options.keyringPath, 0o640);
    assert.equal((await operatorWallet(config)).wallet.address, created.wallet.address);
    await assert.rejects(agentWallet(config), /private \(0600\)/);
    await chmod(options.keyringPath, 0o600);
    const agentConfig = { ...config, operatorAddress: "tz1burnburnburnburnburnburnburjAYjjX" };
    assert.equal((await agentWallet(agentConfig)).wallet.address, created.wallet.address);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
