import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  openRavioliUiLiveJournal,
} from "./shadownet-ravioli-ui-live-journal";
import {
  loadRavioliCurrentV6Resume,
  RAVIOLI_CURRENT_V6_RESUME_IDENTITY,
} from "./shadownet-ravioli-current-v6-resume";

const LIVE_TEST_FLAG = "PASTA_SHADOWNET_RAVIOLI_CURRENT_V6_READONLY_LIVE_TEST";
const PRIVATE_ROOT_ENV = "PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR";

test("current-v6 exact boundary appends one local counter event on a disposable copy and reopens without replay", {
  skip: process.env[LIVE_TEST_FLAG] !== "1",
  timeout: 120_000,
}, async (t) => {
  const privateRecoveryRoot = process.env[PRIVATE_ROOT_ENV]?.trim();
  assert.ok(privateRecoveryRoot, `${PRIVATE_ROOT_ENV} is required for the read-only current-v6 loader test`);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "ravioli-current-v6-loader-"));
  t.after(async () => rm(temporaryRoot, { recursive: true, force: true }));
  const sourceAppRoot = path.resolve(
    "artifacts",
    "pasta-protocol-proof-runs",
    RAVIOLI_CURRENT_V6_RESUME_IDENTITY.runId,
    "ravioli",
  );
  const copiedRunRoot = path.join(temporaryRoot, RAVIOLI_CURRENT_V6_RESUME_IDENTITY.runId);
  const copiedAppRoot = path.join(copiedRunRoot, "ravioli");
  await cp(sourceAppRoot, copiedAppRoot, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });

  const load = async () => {
    const journal = await openRavioliUiLiveJournal(
      path.join(copiedAppRoot, "artifacts", "journal"),
    );
    const { tzktBaseline: _tzktBaseline, ...dependencyHashes } = journal.intent.dependencyHashes;
    const resume = await loadRavioliCurrentV6Resume({
      journal,
      privateRecoveryRoot,
      ipfs: {
        localGatewayUrl: "http://127.0.0.1:8080/ipfs",
        publicGatewayUrl: "https://ipfs.io/ipfs",
      },
      expected: {
        creatorAddress: journal.intent.actors.creator.signerAddress,
        collectorOneAddress: journal.intent.actors.collector1.signerAddress,
        collectorTwoAddress: journal.intent.actors.collector2.signerAddress,
        dependencyAddresses: journal.intent.dependencyAddresses,
        dependencyHashes,
        artifactHashes: journal.intent.artifactHashes,
      },
    });
    return { journal, resume };
  };

  const first = await load();
  assert.equal(first.resume.operations.length, 23);
  assert.equal(first.resume.activePins.length, 15);
  assert.equal(first.resume.openKits.length, 3);
  assert.equal(first.journal.getEventCount(), 86);
  assert.equal(first.journal.getCompletedOperationCount(), 23);
  assert.equal(first.journal.getCounterOffset("creator"), 3);
  assert.equal(first.journal.getCounterOffset("collector1"), 1);
  assert.equal(first.journal.getCounterOffset("collector2"), 0);

  const reopened = await load();
  assert.equal(reopened.journal.getEventCount(), 86);
  assert.equal(reopened.journal.getCompletedOperationCount(), 23);
  assert.equal(reopened.journal.hasCounterAdvance(), true);
  assert.deepEqual(reopened.resume.operations, first.resume.operations);
  assert.deepEqual(
    reopened.resume.activePins.map((pin) => pin.proof),
    first.resume.activePins.map((pin) => pin.proof),
  );
});
