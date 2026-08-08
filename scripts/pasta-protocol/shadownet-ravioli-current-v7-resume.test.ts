import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { Signer } from "@taquito/core";
import { TezosToolkit } from "@taquito/taquito";

import {
  openRavioliUiLiveJournal,
} from "./shadownet-ravioli-ui-live-journal";
import {
  assertOfficialLimitedEditionDependencyMismatchRejected,
  buildRavioliRotiniCapacityExpectation,
  preflightRavioliRotiniCapacity,
  validateRavioliDependencies,
  type PackKit,
} from "./shadownet-ravioli-ui-live";
import {
  loadRavioliCurrentV7Resume,
  RAVIOLI_CURRENT_V7_RESUME_IDENTITY,
  validateRavioliCurrentV7BoundaryEvent,
} from "./shadownet-ravioli-current-v7-resume";
import {
  SHADOWNET_RPC_PRIMARY,
} from "./shadownet-proof-kit";

const LIVE_TEST_FLAG = "PASTA_SHADOWNET_RAVIOLI_CURRENT_V7_READONLY_LIVE_TEST";
const PRIVATE_ROOT_ENV = "PASTA_RAVIOLI_PRIVATE_RECOVERY_DIR";
const SOURCE_APP_ROOT = path.resolve(
  "artifacts",
  "pasta-protocol-proof-runs",
  RAVIOLI_CURRENT_V7_RESUME_IDENTITY.runId,
  "ravioli",
);
const GNOCCHI_RUN_RECEIPT = path.resolve(
  SOURCE_APP_ROOT,
  "..",
  "gnocchi",
  "artifacts",
  "gnocchi-ui-live-run.json",
);

test("current-v7 binds the exact immutable event-86 counter boundary", async () => {
  const eventPath = path.join(
    SOURCE_APP_ROOT,
    "artifacts",
    "journal",
    "events",
    "000086-counter_advance-creator.json",
  );
  const bytes = await readFile(eventPath);
  const value = validateRavioliCurrentV7BoundaryEvent(bytes);
  assert.equal(value.eventIndex, 86);
  assert.equal(value.nextGlobalOrdinal, 24);
  const mutated = Buffer.from(bytes);
  mutated[mutated.length - 2] ^= 1;
  assert.throws(
    () => validateRavioliCurrentV7BoundaryEvent(mutated),
    /event-86 digest drift/,
  );
});

test("current-v7 exact boundary reopens at event 86 without appending or replaying", {
  skip: process.env[LIVE_TEST_FLAG] !== "1",
  timeout: 120_000,
}, async (t) => {
  const privateRecoveryRoot = process.env[PRIVATE_ROOT_ENV]?.trim();
  assert.ok(privateRecoveryRoot, `${PRIVATE_ROOT_ENV} is required for the read-only current-v7 loader test`);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "ravioli-current-v7-loader-"));
  t.after(async () => rm(temporaryRoot, { recursive: true, force: true }));
  const copiedRunRoot = path.join(temporaryRoot, RAVIOLI_CURRENT_V7_RESUME_IDENTITY.runId);
  const copiedAppRoot = path.join(copiedRunRoot, "ravioli");
  await cp(SOURCE_APP_ROOT, copiedAppRoot, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });

  const load = async () => {
    const journal = await openRavioliUiLiveJournal(
      path.join(copiedAppRoot, "artifacts", "journal"),
    );
    const { tzktBaseline: _tzktBaseline, ...dependencyHashes } = journal.intent.dependencyHashes;
    const resume = await loadRavioliCurrentV7Resume({
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
  assert.equal(first.journal.getEventCount(), 86);
  assert.equal(first.resume.operations.length, 23);
  assert.equal(first.resume.activePins.length, 15);
  assert.equal(first.resume.openKits.length, 3);
  assert.equal(first.resume.fileCount, 128);
  assert.equal(first.resume.planExtensionBoundary, null);
  assert.equal(first.resume.v7Identity.boundaryFinalEventSha256,
    RAVIOLI_CURRENT_V7_RESUME_IDENTITY.boundaryFinalEventSha256);

  const reopened = await load();
  assert.equal(reopened.journal.getEventCount(), 86);
  assert.equal(reopened.journal.getCompletedOperationCount(), 23);
  assert.deepEqual(reopened.resume.operations, first.resume.operations);
  assert.deepEqual(
    reopened.resume.activePins.map((pin) => pin.proof),
    first.resume.activePins.map((pin) => pin.proof),
  );

  const extension =
    await reopened.journal.appendAuthenticatedPostEvent86PlanExtension(
      "2026-07-24T21:00:00.000Z",
    );
  assert.equal(extension.appended, true);
  assert.equal(extension.eventIndex, 87);

  const restarted = await load();
  assert.equal(restarted.journal.getEventCount(), 87);
  assert.equal(restarted.journal.getCompletedOperationCount(), 23);
  assert.equal(restarted.journal.hasPlanExtension(), true);
  assert.equal(restarted.resume.fileCount, 129);
  assert.deepEqual(restarted.resume.planExtensionBoundary, {
    eventIndex: 87,
    path: "000087-plan_extension-creator.json",
    recordSha256: extension.recordSha256,
  });
  const idempotent =
    await restarted.journal.appendAuthenticatedPostEvent86PlanExtension();
  assert.equal(idempotent.appended, false);
  assert.equal(idempotent.recordSha256, extension.recordSha256);
});

test("current-v7 official LE mismatch probe reaches the Gnocchi target in live simulation", {
  skip: process.env[LIVE_TEST_FLAG] !== "1",
  timeout: 120_000,
}, async () => {
  const [kitBytes, gnocchiReceiptBytes] = await Promise.all([
    readFile(path.join(SOURCE_APP_ROOT, "artifacts", "open-kits", "ravioli-open-kit-2.json")),
    readFile(GNOCCHI_RUN_RECEIPT),
  ]);
  const kit = JSON.parse(kitBytes.toString("utf8")) as PackKit;
  const gnocchiReceipt = JSON.parse(gnocchiReceiptBytes.toString("utf8"));
  const actualChildEnd = String(
    gnocchiReceipt?.ravioliDependency?.limitedEdition?.policy?.end || "",
  );
  const tezos = new TezosToolkit(SHADOWNET_RPC_PRIMARY);
  const managerKey = await tezos.rpc.getManagerKey(
    RAVIOLI_CURRENT_V7_RESUME_IDENTITY.creatorAddress,
  );
  const publicKey = typeof managerKey === "string" ? managerKey : managerKey.key;
  assert.ok(publicKey, "current-v7 creator manager key is unavailable");
  const readOnlySigner: Signer = {
    publicKeyHash: async () => RAVIOLI_CURRENT_V7_RESUME_IDENTITY.creatorAddress,
    publicKey: async () => publicKey,
    secretKey: async () => undefined,
    sign: async () => {
      throw new Error("read-only Ravioli simulation attempted to sign");
    },
  };
  tezos.setSignerProvider(readOnlySigner);
  const evidence = await assertOfficialLimitedEditionDependencyMismatchRejected({
    tezos,
    routerAddress: RAVIOLI_CURRENT_V7_RESUME_IDENTITY.routerAddress,
    kit,
    actualChildEnd,
  });
  assert.match(evidence, /Official Router → Gnocchi adapter → Gnocchi target simulation rejected/);
});

test("current-v7 exact Rotini capacity preflight accepts the live Taquito Some BigNumber shape", {
  skip: process.env[LIVE_TEST_FLAG] !== "1",
  timeout: 180_000,
}, async () => {
  const tezos = new TezosToolkit(SHADOWNET_RPC_PRIMARY);
  const dependencies = await validateRavioliDependencies(
    path.dirname(SOURCE_APP_ROOT),
    RAVIOLI_CURRENT_V7_RESUME_IDENTITY.runId,
    RAVIOLI_CURRENT_V7_RESUME_IDENTITY.creatorAddress,
    tezos,
    {
      currentV6Resume: {
        routerAddress: RAVIOLI_CURRENT_V7_RESUME_IDENTITY.routerAddress,
        gnocchiAdapterAddress: RAVIOLI_CURRENT_V7_RESUME_IDENTITY.gnocchiAdapterAddress,
        mode0AppliedLevel: RAVIOLI_CURRENT_V7_RESUME_IDENTITY.mode0OperatorAppliedLevel,
        mode1AppliedLevel: RAVIOLI_CURRENT_V7_RESUME_IDENTITY.mode1OperatorAppliedLevel,
        minterAppliedLevel: 4_331_065,
        reservedMintAppliedLevel: 4_331_087,
      },
    },
  );
  const expectation = buildRavioliRotiniCapacityExpectation(dependencies, 0);
  assert.deepEqual(expectation, {
    contractAddress: RAVIOLI_CURRENT_V7_RESUME_IDENTITY.rotiniAddress,
    projectId: 0,
    maxSupply: 4,
    minted: 1,
    reserved: 0,
    nextProjectId: 3,
    nextTokenId: 3,
    generatedTokenCount: 3,
  });
  const result = await preflightRavioliRotiniCapacity(tezos, expectation);
  assert.deepEqual({
    chainId: result.chainId,
    contract: result.contract,
    projectId: result.projectId,
    maxSupply: result.maxSupply,
    minted: result.minted,
    reserved: result.reserved,
    nextProjectId: result.nextProjectId,
    nextTokenId: result.nextTokenId,
    remaining: result.remaining,
    stillNeeded: result.stillNeeded,
  }, {
    chainId: "NetXsqzbfFenSTS",
    contract: RAVIOLI_CURRENT_V7_RESUME_IDENTITY.rotiniAddress,
    projectId: 0,
    maxSupply: 4,
    minted: 1,
    reserved: 0,
    nextProjectId: 3,
    nextTokenId: 3,
    remaining: 3,
    stillNeeded: 3,
  });
});
