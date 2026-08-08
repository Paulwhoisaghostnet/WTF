import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createBridgeRequest,
  decodePastaUiLiveValue,
  type PastaUiLiveBridgeRequest,
  type PastaUiLivePinProof,
} from "./pasta-ui-live-bridge-kit";
import {
  assertRavioliCurrentV3IdentityAddresses,
  createRavioliCurrentV3RestartInterceptor,
  loadRavioliCurrentV3Restart,
  RAVIOLI_CURRENT_V3_PRE_RESTART_FILE_COUNT,
  RAVIOLI_CURRENT_V3_RESTART_IDENTITY,
  ravioliCurrentV3RestartSnapshot,
  type RavioliCurrentV3PinRecord,
  type RavioliCurrentV3Restart,
} from "./shadownet-ravioli-current-v3-restart";
import { openRavioliUiLiveJournal } from "./shadownet-ravioli-ui-live-journal";
import { deterministicJsonBytes, root } from "./shadownet-proof-kit";

const JOURNAL_ROOT = path.join(
  root,
  "artifacts",
  "pasta-protocol-proof-runs",
  "pasta-alpha-proof-20260723a",
  "ravioli",
  "artifacts",
  "journal",
);
const APP_ROOT = path.dirname(path.dirname(JOURNAL_ROOT));

async function json(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function hasExactCurrentV3Boundary(journalRoot = JOURNAL_ROOT): Promise<boolean> {
  try {
    const events = (await readdir(path.join(journalRoot, "events")))
      .filter((name) => name.endsWith(".json"))
      .sort();
    return events.length === 37 && events.at(-1)?.startsWith("000037-") === true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function loadFixture(journalRoot = JOURNAL_ROOT): Promise<RavioliCurrentV3Restart | null> {
  if (!(await hasExactCurrentV3Boundary(journalRoot))) return null;
  const journal = await openRavioliUiLiveJournal(journalRoot);
  const { tzktBaseline: _tzktBaseline, ...dependencyHashes } = journal.intent.dependencyHashes;
  const controllerArtifact = await json(path.join(
    root,
    "public",
    "creation-tools",
    "ravioli",
    "contract",
    "pasta-blind-pack-controller.contract.json",
  ));
  const routerArtifact = await json(path.join(
    root,
    "public",
    "creation-tools",
    "ravioli",
    "contract",
    "pasta-bundle.contract.json",
  ));
  return loadRavioliCurrentV3Restart({
    journal,
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
      controllerArtifact,
      routerArtifact,
    },
  });
}

function pinRequest(pin: RavioliCurrentV3PinRecord): PastaUiLiveBridgeRequest {
  return pin.identity.mimeType === "application/json"
    ? createBridgeRequest("pin_json", {
        fileName: pin.proof.fileName,
        value: pin.value,
      })
    : createBridgeRequest("pin_blob", {
        dataBase64: Buffer.from(pin.bytes).toString("base64"),
        fileName: pin.proof.fileName,
        mimeType: pin.proof.mimeType,
      });
}

function operationRequest(replay: RavioliCurrentV3Restart, index: number): PastaUiLiveBridgeRequest {
  const operation = replay.operations[index];
  if (operation.descriptor.kind === "originate") {
    return createBridgeRequest("originate", {
      code: operation.descriptor.code,
      storage: operation.descriptor.storage,
    });
  }
  if (operation.descriptor.kind !== "call") {
    throw new Error(`unexpected replay descriptor kind ${operation.descriptor.kind}`);
  }
  return createBridgeRequest("call", {
    call: operation.descriptor.call,
    sendOptions: operation.descriptor.sendOptions,
  });
}

function replayRequests(replay: RavioliCurrentV3Restart): PastaUiLiveBridgeRequest[] {
  return [
    pinRequest(replay.activePins[0]),
    pinRequest(replay.activePins[1]),
    pinRequest(replay.activePins[2]),
    operationRequest(replay, 0),
    operationRequest(replay, 1),
    operationRequest(replay, 2),
    pinRequest(replay.activePins[3]),
    pinRequest(replay.activePins[4]),
    pinRequest(replay.activePins[5]),
    operationRequest(replay, 3),
    operationRequest(replay, 4),
    operationRequest(replay, 5),
    operationRequest(replay, 6),
    operationRequest(replay, 7),
    pinRequest(replay.activePins[6]),
    operationRequest(replay, 8),
  ];
}

function pinProof(request: PastaUiLiveBridgeRequest, ordinal: number): PastaUiLivePinProof {
  assert.equal(request.action, "pin_json");
  const payload = request.payload as any;
  const value = decodePastaUiLiveValue(payload.value);
  const bytes = deterministicJsonBytes(value);
  const digest = awaitlessSha256(bytes);
  const cid = `fresh-${ordinal}-${digest.slice(0, 16)}`;
  return {
    cid,
    uri: `ipfs://${cid}`,
    fileName: payload.fileName,
    mimeType: "application/json",
    byteLength: bytes.byteLength,
    sha256: digest,
    localGatewayUrl: `http://127.0.0.1:8080/ipfs/${cid}`,
    publicGatewayUrl: `https://ipfs.io/ipfs/${cid}`,
    publicGatewayVerified: true,
    verificationAttempts: 1,
  };
}

function awaitlessSha256(bytes: Uint8Array): string {
  // Keep the focused fixture independent of network/IPFS while matching the
  // production bridge's exact deterministic JSON digest.
  return createHash("sha256").update(bytes).digest("hex");
}

test("current-v3 identity freezes the exact 37-event, nine-pin, nine-operation boundary", () => {
  assertRavioliCurrentV3IdentityAddresses();
  assert.equal(RAVIOLI_CURRENT_V3_RESTART_IDENTITY.finalEventSha256, "2e8e6bb8f61c5163c9ea64fc67035b204e457bd88a2144c49d6b47dd077f8391");
  assert.equal(RAVIOLI_CURRENT_V3_RESTART_IDENTITY.pins.length, 9);
  assert.equal(RAVIOLI_CURRENT_V3_RESTART_IDENTITY.operations.length, 9);
  assert.equal(RAVIOLI_CURRENT_V3_RESTART_IDENTITY.operations[8].operationHash, "onhP2YFTpzcpg66wPz1j2aX93dSwqeb6J1zJfaN4qCUFxrGZ62L");
  assert.equal(RAVIOLI_CURRENT_V3_RESTART_IDENTITY.operations[8].descriptorSha256, "bd81403364251349a8072b66056020548cef80f2769465e3a5eafc4822efea82");
  assert.equal(RAVIOLI_CURRENT_V3_PRE_RESTART_FILE_COUNT, 61);
  assert.deepEqual(
    RAVIOLI_CURRENT_V3_RESTART_IDENTITY.screenshots.map(
      ({ stem, pngSha256, sidecarSha256 }) => [stem, pngSha256, sidecarSha256],
    ),
    [
      [
        "001-compose-five-atomic-pack-modes-same-run-dependencies-entered",
        "94d9ea8f9bdcfb39042aba7cd040febc56eba9977f59e739ebf1d6a6e7764a82",
        "87bcffb05e5cec4fc568e947783cbe920ea44f033b14e294cb3119fe7ff97f22",
      ],
      [
        "002-compose-five-atomic-pack-modes-creator-connected-on-shadownet",
        "9be6837c865cf4aeeb7c35a9efc2958c50d78474ced764103a82c51b45fee399",
        "8d845335152450c2fc0db48cc93de80ec2b39c2e5b94a1ff245bdc982d05a166",
      ],
      [
        "003-limited-edition-expiry-deconfliction-le-wrapper-outliving-child-rejected-before-pins-or-writes",
        "bb01f2dcab3c16c5750bf906e62911a4d055147b5cb6f45fd2a55a72de85bb9c",
        "07e3fd68984d038a623bd15a7b2795b93d34395b2634bc7646e684f8a1bb0acd",
      ],
      [
        "004-compose-five-atomic-pack-modes-deterministic-vault-configured",
        "1e2f7c8677a0586e31166c8cf3678c0a798d8891e92410b6a6714fa6b45172ec",
        "3e2caee366c6d367429f1de6d760e18fe4e4c525e06fdfc28b49726cfbcea5b6",
      ],
      [
        "005-compose-five-atomic-pack-modes-deterministic-vault-funded-and-issued",
        "a32481ba31e3a5fce3767541ec3fc27f008182da9e83140e575442d85b33c639",
        "c20483f6ee961eb22853458199857eb06007692ce43fe77e9e1d9ed81550cd19",
      ],
      [
        "006-compose-five-atomic-pack-modes-blind-funded-pool-configured",
        "5c5a142188d63d99907ee698be29f61db18b26d31738395a9a7ac8578976a0e3",
        "17d7b00389e71bef4a01a0b1bd82d1736d1dc2ba92a429d702a65ff3d9972734",
      ],
    ],
  );
  assert.equal(
    RAVIOLI_CURRENT_V3_RESTART_IDENTITY.openKitSha256,
    "6b956fa9b8722b98f367f92bc4cad43f158c00f98c4b20ae11e8971ee78a2ff1",
  );
  assert.equal(
    RAVIOLI_CURRENT_V3_RESTART_IDENTITY.openKitProgressSha256,
    "0c2167bcd7f44ac08eff3e35c6447112a5458b570010908d2b4fc4276d05e7e7",
  );
  assert.deepEqual(
    RAVIOLI_CURRENT_V3_RESTART_IDENTITY.pins.map((pin) => pin.disposition),
    ["ACTIVE", "ACTIVE", "ACTIVE", "ACTIVE", "ACTIVE", "ACTIVE", "ACTIVE", "SUPERSEDED_PRIVATE_PRECOMMIT", "SUPERSEDED_PRIVATE_PRECOMMIT"],
  );
});

test("current-v3 loader authenticates the real boundary and partitions active from superseded pins", async (t) => {
  const replay = await loadFixture();
  if (!replay) {
    t.skip("the exact July-23 Ravioli journal is not present");
    return;
  }
  const second = await loadFixture();
  assert.ok(second);
  assert.deepEqual(ravioliCurrentV3RestartSnapshot(second), ravioliCurrentV3RestartSnapshot(replay));
  assert.equal(replay.appRoot, APP_ROOT);
  assert.equal(replay.preRestartFileCount, 61);
  assert.equal(replay.journalPins.length, 9);
  assert.equal(replay.activePins.length, 7);
  assert.equal(replay.supersededPrecommitPins.length, 2);
  assert.deepEqual(replay.supersededPrecommitPins.map((pin) => pin.proof.sha256), [
    "89d7bbaf0f64845a3f20fb006abf012daa4fd65272d5b09247316bc4c0083db5",
    "44e0d2e670361c1894f14e3be0fbbaace94341f21c884836a3844ed55d564711",
  ]);
  assert.deepEqual(
    new Set(replay.journalPins.map((pin) => pin.proof.sha256)),
    new Set([
      ...replay.activePins.map((pin) => pin.proof.sha256),
      ...replay.supersededPrecommitPins.map((pin) => pin.proof.sha256),
    ]),
  );
  assert.equal(replay.operations.length, 9);
  assert.equal(replay.operatorApprovalLevel, 4_321_347);
});

test("current-v3 loader rejects unexpected files and symlinks in the frozen 61-file lane", async (t) => {
  if (!(await hasExactCurrentV3Boundary())) {
    t.skip("the local proof journal has advanced beyond the retired 37-event current-v3 boundary");
    return;
  }

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "ravioli-current-v3-"));
  t.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  const temporaryAppRoot = path.join(temporaryRoot, "ravioli");
  await cp(APP_ROOT, temporaryAppRoot, { recursive: true });
  const temporaryJournalRoot = path.join(temporaryAppRoot, "artifacts", "journal");

  const unexpectedFile = path.join(temporaryAppRoot, "artifacts", "pins", "unexpected.bin");
  await writeFile(unexpectedFile, Buffer.from([0]));
  await assert.rejects(
    () => loadFixture(temporaryJournalRoot),
    /Ravioli retained-pin lane inventory drift/,
  );
  await unlink(unexpectedFile);

  const screenshotFive = path.join(
    temporaryAppRoot,
    "screenshots",
    "005-compose-five-atomic-pack-modes-deterministic-vault-funded-and-issued.png",
  );
  const screenshotSix = path.join(
    temporaryAppRoot,
    "screenshots",
    "006-compose-five-atomic-pack-modes-blind-funded-pool-configured.png",
  );
  await unlink(screenshotSix);
  await symlink(screenshotFive, screenshotSix);
  await assert.rejects(
    () => loadFixture(temporaryJournalRoot),
    /must be a regular non-symlink file/,
  );
});

test("current-v3 replays 16 active steps locally, rejects superseded pins, and gates a fresh mode-1 precommit", async (t) => {
  const replay = await loadFixture();
  if (!replay) {
    t.skip("the exact July-23 Ravioli journal is not present");
    return;
  }
  const delegated: PastaUiLiveBridgeRequest[] = [];
  let pinOrdinal = 0;
  let precommitChecks = 0;
  const interceptor = createRavioliCurrentV3RestartInterceptor({
    replay,
    now: () => Date.parse("2026-07-24T10:00:00.000Z"),
    minimumSaleWindowMs: 5 * 60 * 1_000,
    delegate: async (request) => {
      delegated.push(request);
      if (request.action === "pin_json") return { pin: pinProof(request, ++pinOrdinal) };
      return { operationHash: "ooFakeOperationHashForFocusedTestOnly", confirmationLevel: 1 };
    },
    beforeDelegateOperationTen: async (context) => {
      precommitChecks += 1;
      assert.equal(context.manifest.value.mode, "blind_funded_pool");
      assert.equal(context.envelope.value.aad.manifestUri, context.manifest.proof.uri);
      assert.equal(context.tokenMetadata.value.ravioli.sealedContentsUri, context.envelope.proof.uri);
      assert.equal(context.operationTen.call.entrypoint, "create_pack");
    },
  });

  for (const request of replayRequests(replay)) await interceptor.handle(request);
  assert.equal(interceptor.isReplayComplete(), true);
  assert.equal(interceptor.getCompletedReplayStepCount(), 16);
  assert.equal(interceptor.getRemainingReplayStepCount(), 0);
  assert.equal(interceptor.continuationStage(), "fresh-mode1-manifest");
  assert.equal(delegated.length, 0, "historical pins and writes must replay without delegation");

  await assert.rejects(
    () => interceptor.handle(pinRequest(replay.supersededPrecommitPins[0])),
    /refusing superseded private precommit artifact/,
  );
  await assert.rejects(
    () => interceptor.handle(pinRequest(replay.supersededPrecommitPins[1])),
    /refusing superseded private precommit artifact/,
  );
  assert.equal(delegated.length, 0);

  const saleEnd = "2026-07-24T10:12:00.000Z";
  const revealDeadline = "2026-07-24T11:12:00.000Z";
  const openDeadline = "2026-07-24T12:12:00.000Z";
  const manifest = {
    assignmentPolicy: "precommitted-salted-cyclic-rotation",
    blindSecurity: "commit-reveal-ui-hidden-chain-public",
    description: "Actual Shadownet UI proof for blind_funded_pool.",
    editionPolicy: {
      afterOpenDeadline: "refund-only; expiry credits the holder, who withdraws separately",
      childPolicySummary: { limitedEditionResources: 0, referencedResources: 0, requiredCapacity: 0 },
      earliestChildEnd: null,
      openDeadline,
      requiresLimitedWrapper: false,
      reservedChildPolicy: null,
      revealDeadline,
      transferExpiry: "reveal-deadline-if-unrevealed-or-open-deadline-if-revealed",
      wrapperEditionClass: "limited-edition",
      wrapperSaleEnd: saleEnd,
      wrapperSaleStart: null,
    },
    fulfillment: "atomic-router-controller-and-typed-adapters",
    funding: "fully-reserved-before-wrapper-issuance",
    generativeAuthenticity: null,
    itemCount: 1,
    maxSupply: 3,
    members: [],
    mode: "blind_funded_pool",
    mystery: true,
    name: "Ravioli UI-LIVE Blind Funded Pool",
    schemaVersion: "wtfos.pasta.pack-manifest.v2",
  };
  await interceptor.handle(createBridgeRequest("pin_json", {
    fileName: "ravioli-pack-manifest.json",
    value: manifest,
  }));
  assert.equal(interceptor.continuationStage(), "fresh-mode1-envelope");
  const manifestUri = `ipfs://fresh-1-${awaitlessSha256(deterministicJsonBytes(manifest)).slice(0, 16)}`;

  const envelope = {
    aad: {
      contract: replay.routerAddress,
      manifestUri,
      network: "shadownet",
      schema: "pasta-ravioli-sealed-reveal@1",
      tokenId: 1,
    },
    cipher: "AES-256-GCM",
    ciphertext: Buffer.alloc(64, 7).toString("base64"),
    iv: Buffer.alloc(12, 5).toString("base64"),
    keyDerivation: "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)",
    schema: "pasta-ravioli-sealed-reveal@1",
  };
  await interceptor.handle(createBridgeRequest("pin_json", {
    fileName: "ravioli-sealed-reveal-1.json",
    value: envelope,
  }));
  assert.equal(interceptor.continuationStage(), "fresh-mode1-token");
  const envelopeUri = `ipfs://fresh-2-${awaitlessSha256(deterministicJsonBytes(envelope)).slice(0, 16)}`;

  const revealCommitment = "ab".repeat(32);
  const wrapperUri = replay.activePins[6].proof.uri;
  const tokenMetadata = {
    artifactUri: wrapperUri,
    creators: [replay.identity.creatorAddress],
    decimals: 0,
    description: "Actual Shadownet UI proof for blind_funded_pool.",
    displayUri: wrapperUri,
    formats: [{ mimeType: "image/png", uri: wrapperUri }],
    isBooleanAmount: false,
    minter: replay.identity.creatorAddress,
    name: "Ravioli UI-LIVE Blind Funded Pool",
    ravioli: {
      assignmentPolicy: "precommitted-salted-cyclic-rotation",
      blindSecurity: "authenticated-ciphertext-until-reveal",
      editionPolicy: {
        childPolicySummary: { limitedEditionResources: 0, referencedResources: 0, requiredCapacity: 0 },
        earliestChildEnd: null,
        openDeadline,
        requiresLimitedWrapper: false,
        revealDeadline,
        wrapperEditionClass: "limited-edition",
        wrapperSaleEnd: saleEnd,
        wrapperSaleStart: null,
      },
      fulfillment: "atomic-router-controller",
      generativeOutputAuthority: null,
      itemCount: 1,
      manifestUri,
      maxSupply: 3,
      mode: "blind_funded_pool",
      postDeadlineAction: "refund-only; credit-holder-then-pull-withdraw",
      revealCommitment,
      sealedContentsUri: envelopeUri,
      transferExpiry: "reveal-deadline-if-unrevealed-or-open-deadline-if-revealed",
      version: 3,
      wrapperEditionClass: "limited-edition",
    },
    symbol: "RVUI",
    tags: ["ravioli", "blind_funded_pool", "ui-live", "shadownet"],
    thumbnailUri: wrapperUri,
  };
  await interceptor.handle(createBridgeRequest("pin_json", {
    fileName: "token.json",
    value: tokenMetadata,
  }));
  assert.equal(interceptor.continuationStage(), "matrix-operation-10");
  const tokenUri = `ipfs://fresh-3-${awaitlessSha256(deterministicJsonBytes(tokenMetadata)).slice(0, 16)}`;

  const operationTenPayload = {
    expected_token_id: 1,
    token_info: {
      $map: [
        ["", Buffer.from(tokenUri, "utf8").toString("hex")],
        ["name", Buffer.from("Ravioli UI-LIVE Blind Funded Pool", "utf8").toString("hex")],
      ],
    },
    config: {
      mode: 1,
      blind: true,
      item_count: 1,
      max_supply: 3,
      committed_recipes: 0,
      finalized: false,
      cancelled: false,
      contents_uri: null,
      manifest_uri: Buffer.from(manifestUri, "utf8").toString("hex"),
      child_expiry: null,
      wrapper_sale_end: null,
      reveal_deadline: revealDeadline,
      open_deadline: openDeadline,
      reveal_commitment: revealCommitment,
    },
  };
  const driftedOperationTen = createBridgeRequest("call", {
    call: {
      contractAddress: replay.routerAddress,
      entrypoint: "create_pack",
      payload: {
        ...operationTenPayload,
        config: { ...operationTenPayload.config, reveal_commitment: "cd".repeat(32) },
      },
    },
    sendOptions: {},
  });
  await assert.rejects(
    () => interceptor.handle(driftedOperationTen),
    /matrix operation 10 reveal commitment drift/,
  );
  assert.equal(delegated.filter((request) => request.action === "call").length, 0);
  assert.equal(precommitChecks, 0);

  await interceptor.handle(createBridgeRequest("call", {
    call: {
      contractAddress: replay.routerAddress,
      entrypoint: "create_pack",
      payload: operationTenPayload,
    },
    sendOptions: {},
  }));
  assert.equal(interceptor.continuationStage(), "continued");
  assert.equal(delegated.length, 4);
  assert.deepEqual(delegated.map((request) => request.action), ["pin_json", "pin_json", "pin_json", "call"]);
  assert.equal(precommitChecks, 1);
  assert.ok(interceptor.freshRestartContext());
});
