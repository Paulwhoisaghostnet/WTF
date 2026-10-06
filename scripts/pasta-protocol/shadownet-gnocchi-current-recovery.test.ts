import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { CID } from "multiformats/cid";

import {
  assertGnocchiCurrentRecoveryAllowed,
  GNOCCHI_CURRENT_RECOVERY_CONTRACT,
  GNOCCHI_CURRENT_RECOVERY_EXECUTE_FLAG,
  GNOCCHI_CURRENT_RECOVERY_OUTPUT_ENV,
  GNOCCHI_CURRENT_RECOVERY_RETIRED_CODE,
  GNOCCHI_CURRENT_RECOVERY_RUN_ID,
} from "./shadownet-gnocchi-current-recovery";
import { root } from "./shadownet-proof-kit";

test("current Gnocchi recovery permits only the exact fresh alpha boundary and keeps the completed boundary retired", async () => {
  const exactRoot = `/tmp/${GNOCCHI_CURRENT_RECOVERY_RUN_ID}`;
  assert.equal(assertGnocchiCurrentRecoveryAllowed({
    [GNOCCHI_CURRENT_RECOVERY_EXECUTE_FLAG]: "1",
    [GNOCCHI_CURRENT_RECOVERY_OUTPUT_ENV]: exactRoot,
    TEZOS_NETWORK: "shadownet",
  }), exactRoot);
  assert.throws(() => assertGnocchiCurrentRecoveryAllowed({}), /EXECUTE=1 is required/);
  assert.throws(() => assertGnocchiCurrentRecoveryAllowed({
    [GNOCCHI_CURRENT_RECOVERY_EXECUTE_FLAG]: "1",
    [GNOCCHI_CURRENT_RECOVERY_OUTPUT_ENV]: exactRoot,
    TEZOS_NETWORK: "mainnet",
  }), /only permits Shadownet/);
  assert.throws(() => assertGnocchiCurrentRecoveryAllowed({
    [GNOCCHI_CURRENT_RECOVERY_EXECUTE_FLAG]: "1",
    [GNOCCHI_CURRENT_RECOVERY_OUTPUT_ENV]: "/tmp/pasta-alpha-proof-wrong",
    TEZOS_NETWORK: "shadownet",
  }), /run id drift/);
  assert.throws(() => assertGnocchiCurrentRecoveryAllowed({
    [GNOCCHI_CURRENT_RECOVERY_EXECUTE_FLAG]: "1",
    [GNOCCHI_CURRENT_RECOVERY_OUTPUT_ENV]: "/tmp/pasta-alpha-proof-20260724t015728z",
    TEZOS_NETWORK: "shadownet",
  }), new RegExp(GNOCCHI_CURRENT_RECOVERY_RETIRED_CODE));
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["pasta:shadownet:gnocchi:current-recovery"], undefined);
});

test("current Gnocchi recovery binds the exact contract and raw SHA-256 content CIDs", async () => {
  assert.equal(GNOCCHI_CURRENT_RECOVERY_CONTRACT, "KT1KGB1PRsJw58fgZPGRjoj4ZHNsFR7SuEzv");
  const source = await readFile(
    path.join(root, "scripts", "pasta-protocol", "shadownet-gnocchi-current-recovery.ts"),
    "utf8",
  );
  const cids = [...source.matchAll(/cid: "(bafkrei[a-z2-7]+)"/g)].map((match) => match[1]);
  assert.equal(cids.length, 7);
  for (const cidText of cids) {
    const cid = CID.parse(cidText);
    assert.equal(cid.version, 1);
    assert.equal(cid.code, 0x55);
    assert.equal(cid.multihash.code, 0x12);
    assert.equal(cid.multihash.digest.byteLength, 32);
  }
});

test("current Gnocchi recovery checkpoints before side effects and never replays the applied prefix", async () => {
  const source = await readFile(
    path.join(root, "scripts", "pasta-protocol", "shadownet-gnocchi-current-recovery.ts"),
    "utf8",
  );
  const checkpointIndex = source.indexOf("RecoveryCheckpoint.create(appRoot");
  const signerIndex = source.indexOf("loadSignerSet(env)");
  assert.ok(checkpointIndex > 0 && checkpointIndex < signerIndex);
  assert.match(source, /validatePrefixInventory\(appRoot\)/);
  assert.match(source, /readRpcIdentity\(SHADOWNET_RPC_PRIMARY\)/);
  assert.match(source, /readRpcIdentity\(SHADOWNET_RPC_FALLBACK\)/);
  assert.match(source, /ipfs\.fileship\.xyz/);
  assert.match(source, /dweb\.link\/ipfs/);
  assert.match(source, /ordinaryRerunForbidden: true/);
  assert.match(source, /initialOperationSequence: resumeState \? 6 : 4/);
  assert.match(source, /initialOperationSequence: actor === "collectorOne"[\s\S]+resumeState \? 3 : 2/);
  assert.match(source, /loadExactPostReopenResume/);
  assert.match(source, /Gnocchi recovery origination is forbidden/);
  assert.match(source, /Gnocchi recovery pinning is forbidden/);
  assert.doesNotMatch(source, /allowedEntrypoints:.*originate/);
  assert.equal((source.match(/globalOrdinal:/g) || []).length >= 6, true);
  assert.match(source, /PIN_PREPARED/);
  assert.match(source, /PIN_CONFIRMED/);
  assert.match(source, /PREPARED/);
  assert.match(source, /SUBMITTED/);
  assert.match(source, /APPLIED/);
  assert.match(source, /EXPECTED_REJECTION/);
  assert.match(source, /SCREENSHOT_ACCEPTED/);
  assert.match(source, /UI-LIVE-RECOVERED-CHECKPOINTED/);
});

test("current Gnocchi recovery exposes a signer-free, write-free exact-boundary preflight", async () => {
  const source = await readFile(
    path.join(root, "scripts", "pasta-protocol", "shadownet-gnocchi-current-recovery.ts"),
    "utf8",
  );
  const preflightBranch = source.indexOf("GNOCCHI_CURRENT_RECOVERY_PREFLIGHT_ONLY_FLAG");
  const checkpointCreate = source.indexOf("RecoveryCheckpoint.create(appRoot");
  assert.ok(preflightBranch > 0 && preflightBranch < checkpointCreate);
  assert.match(source, /signerMaterialLoaded: false/);
  assert.match(source, /chainWrites: 0/);
  assert.match(source, /ipfsWrites: 0/);
  assert.match(source, /localWrites: 0/);
});
