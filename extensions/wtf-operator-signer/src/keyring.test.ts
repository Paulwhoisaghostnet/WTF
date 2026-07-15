import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { SignerEnv } from "./env";
import { PlatformWalletKeyring } from "./keyring";

function keyringEnv(keyringPath: string): SignerEnv {
  return {
    WTF_OPERATOR_SIGNER_RPC: "https://tezos-shadownet.octez.io/",
    WTF_OPERATOR_SIGNER_SOCKET: "/tmp/wtf-operator-signer.sock",
    WTF_OPERATOR_SIGNER_AUTH_TOKEN: "test-auth-token",
    WTF_OPERATOR_SIGNER_SECRET: "",
    WTF_OPERATOR_SIGNER_DEFAULT_WALLET_ID: "operator",
    WTF_PLATFORM_KEYRING_PATH: keyringPath,
    WTF_PLATFORM_KEYRING_MASTER_KEY:
      "test-master-key-for-platform-keyring-network-retargeting",
    WTF_PLATFORM_KEYRING_MASTER_KEY_FILE: "",
    WTF_PLATFORM_KEYRING_CREATE_ENABLED: 1,
    WTF_OPERATOR_SIGNER_CONTRACT_ALLOWLIST: [],
    WTF_OPERATOR_SIGNER_DISBURSE_ASSETS: [
      "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD:0",
    ],
    WTF_OPERATOR_SIGNER_MAX_XTZ_MUTEZ: 100_000_000,
    WTF_OPERATOR_SIGNER_MAX_RECIPIENTS: 200,
    WTF_OPERATOR_SIGNER_ALLOW_CUSTOM: 0,
    WTF_OPERATOR_SIGNER_ALLOW_ORIGINATION: 0,
    WTF_OPERATOR_SIGNER_MAX_ORIGINATION_BYTES: 750_000,
    WTF_OPERATOR_SIGNER_AUDIT_LOG: "/tmp/operator-signer.log",
  };
}

test("keyring can retarget stored wallet network metadata without rotating the signer", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("named-network keyring metadata must not depend on live RPC reads");
  }) as typeof fetch;

  const dir = await mkdtemp(join(tmpdir(), "wtf-keyring-network-"));
  try {
    const keyring = new PlatformWalletKeyring(keyringEnv(join(dir, "keyring.json")));
    const mainnetWallet = await keyring.createWallet({
      id: "bert-puppet",
      label: "Bert Puppet",
      role: "testing",
      network: "mainnet",
    });

    assert.equal(mainnetWallet.network, "mainnet");
    assert.equal(mainnetWallet.chainId, "NetXdQprcVkpaWU");

    const shadownetWallet = await keyring.retargetWalletNetwork({
      id: "bert-puppet",
      network: "shadownet",
    });

    assert.equal(shadownetWallet.address, mainnetWallet.address);
    assert.equal(shadownetWallet.publicKey, mainnetWallet.publicKey);
    assert.equal(shadownetWallet.network, "shadownet");
    assert.equal(shadownetWallet.chainId, "NetXsqzbfFenSTS");
    assert.equal(
      shadownetWallet.did,
      `did:pkh:tezos:NetXsqzbfFenSTS:${mainnetWallet.address}`
    );

    const signerHandle = await keyring.getSigner("bert-puppet");
    assert.equal(await signerHandle.signer.publicKeyHash(), mainnetWallet.address);
    assert.equal(signerHandle.wallet.network, "shadownet");
    assert.equal(signerHandle.wallet.chainId, "NetXsqzbfFenSTS");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});
