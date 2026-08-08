import assert from "node:assert/strict";

// Historical current-v4 evidence only. The production runner rejects every
// current-v4 execution flag before filesystem or network work, and the active
// runner policy test owns that retirement boundary. Keep these frozen-byte
// checks out of wildcard unit discovery so a newer journal matrix can never
// reinterpret this retired mutation lane.
import {
  createCipheriv,
  createHash,
} from "node:crypto";
import {
  copyFile,
  cp,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import {
  createBridgeRequest,
  decodePastaUiLiveValue,
  type PastaUiLiveBridgeRequest,
  type PastaUiLivePinProof,
} from "./pasta-ui-live-bridge-kit";
import {
  computeRavioliRevealCommitment,
  type RavioliPinnedJsonMaterial,
} from "./shadownet-ravioli-blind-proof-verifier";
import {
  assertRavioliCurrentV4IdentityAddresses,
  auditRavioliCurrentV4CryptoInvalidPrecommit,
  createRavioliCurrentV4ResumeInterceptor,
  loadRavioliCurrentV4Resume,
  RAVIOLI_CURRENT_V4_INVENTORY_BOUNDARY,
  RAVIOLI_CURRENT_V4_REPLAY_STEP_COUNT,
  RAVIOLI_CURRENT_V4_RESUME_FILE_COUNT,
  RAVIOLI_CURRENT_V4_RESUME_IDENTITY,
  ravioliCurrentV4ResumeSnapshot,
  verifyRavioliCurrentV4CumulativeInventory,
  type RavioliCurrentV4PinRecord,
  type RavioliCurrentV4Resume,
} from "./shadownet-ravioli-current-v4-resume";
import { openRavioliUiLiveJournal } from "./shadownet-ravioli-ui-live-journal";
import {
  deterministicJsonBytes,
  root,
} from "./shadownet-proof-kit";

const LIVE_JOURNAL_ROOT = path.join(
  root,
  "artifacts",
  "pasta-protocol-proof-runs",
  "pasta-alpha-proof-20260723a",
  "ravioli",
  "artifacts",
  "journal",
);
const LIVE_APP_ROOT = path.dirname(path.dirname(LIVE_JOURNAL_ROOT));
const LIVE_OPEN_KIT_1_PATH = path.join(
  LIVE_APP_ROOT,
  "artifacts",
  "open-kits",
  "ravioli-open-kit-1.json",
);
const PRIVATE_BOUNDARY40_OPEN_KIT_1_PATH = path.join(
  os.homedir(),
  ".pasta-protocol-private-recovery",
  "pasta-alpha-proof-20260723a",
  "boundary40-open-kit-1",
  "ravioli-open-kit-1.json",
);
const BOUNDARY40_OPEN_KIT_1_SHA256 =
  "e93e4aa455ee76a2350e3006aa1fc99261252dc175b4725d66e0f4698c9287be";
const BOUNDARY40_PROGRESS_SHA256 =
  "8e14107dcaf452d9e378cf4da607ea265b044025076971e1a218482f074fb4f8";
let boundary40FixtureRoot: string | null = null;
let boundary40FixturePromise: Promise<string | null> | null = null;

const FRESH_SALT = "12".repeat(32);
const FRESH_NONCES = [
  "ab".repeat(32),
  "cd".repeat(32),
  "ef".repeat(32),
] as const;
const FRESH_OFFSET = 1;
const FRESH_IV = Buffer.from("000102030405060708090a0b", "hex");
const FIXED_NOW = Date.parse("2026-07-24T10:00:00.000Z");

async function json(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function createBoundary40Fixture(): Promise<string | null> {
  try {
    await stat(path.join(LIVE_JOURNAL_ROOT, "intent.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const liveOpenKitBytes = await readFile(LIVE_OPEN_KIT_1_PATH);
  const liveOpenKitSha256 = digest(liveOpenKitBytes);
  let historicalOpenKitPath = LIVE_OPEN_KIT_1_PATH;
  if (liveOpenKitSha256 !== BOUNDARY40_OPEN_KIT_1_SHA256) {
    try {
      const privateBytes = await readFile(PRIVATE_BOUNDARY40_OPEN_KIT_1_PATH);
      assert.equal(
        digest(privateBytes),
        BOUNDARY40_OPEN_KIT_1_SHA256,
        "private historical boundary-40 open kit drifted",
      );
      historicalOpenKitPath = PRIVATE_BOUNDARY40_OPEN_KIT_1_PATH;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  const liveProgressPath = path.join(
    LIVE_APP_ROOT,
    "artifacts",
    "open-kits",
    "open-kit-capture-progress.json",
  );
  const liveProgressBytes = await readFile(liveProgressPath);
  const boundary40ProgressBytes = Buffer.from(
    liveProgressBytes.toString("utf8").replace(
      liveOpenKitSha256,
      BOUNDARY40_OPEN_KIT_1_SHA256,
    ),
    "utf8",
  );
  assert.equal(
    digest(boundary40ProgressBytes),
    BOUNDARY40_PROGRESS_SHA256,
    "historical boundary-40 progress cannot be reconstructed from the immutable append-only lane",
  );
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "ravioli-current-v4-boundary40-"));
  const appRoot = path.join(temporaryRoot, "ravioli");
  const artifactsRoot = path.join(appRoot, "artifacts");
  const journalRoot = path.join(artifactsRoot, "journal");
  const sourceArtifactsRoot = path.join(LIVE_APP_ROOT, "artifacts");
  const sourceJournalRoot = path.join(sourceArtifactsRoot, "journal");
  const sourceEventRoot = path.join(sourceJournalRoot, "events");
  const sourcePinRoot = path.join(sourceJournalRoot, "pins");
  const sourceScreenshotRoot = path.join(LIVE_APP_ROOT, "screenshots");
  await Promise.all([
    mkdir(path.join(journalRoot, "events"), { recursive: true }),
    mkdir(path.join(journalRoot, "pins"), { recursive: true }),
    mkdir(path.join(artifactsRoot, "open-kits"), { recursive: true }),
    mkdir(path.join(artifactsRoot, "pins"), { recursive: true }),
    mkdir(path.join(appRoot, "screenshots"), { recursive: true }),
  ]);
  const [eventNames, pinNames, screenshotNames, sidecarNames] = await Promise.all([
    readdir(sourceEventRoot).then((names) =>
      names.filter((name) => /^\d{6}-[a-z0-9_-]+\.json$/.test(name)).sort().slice(0, 40)),
    readdir(sourcePinRoot).then((names) =>
      names.filter((name) => /^\d{6}\.bin$/.test(name)).sort().slice(0, 12)),
    readdir(sourceScreenshotRoot).then((names) =>
      names.filter((name) => /^\d{3}-.*\.png$/.test(name)).sort().slice(0, 8)),
    readdir(sourceArtifactsRoot).then((names) =>
      names.filter((name) => /^screenshot-\d{3}-.*\.json$/.test(name)).sort().slice(0, 8)),
  ]);
  assert.equal(eventNames.length, 40, "historical boundary-40 event prefix is unavailable");
  assert.equal(pinNames.length, 12, "historical boundary-40 pin prefix is unavailable");
  assert.equal(screenshotNames.length, 8, "historical boundary-40 screenshot prefix is unavailable");
  assert.equal(sidecarNames.length, 8, "historical boundary-40 screenshot sidecar prefix is unavailable");
  await Promise.all([
    copyFile(path.join(sourceJournalRoot, "intent.json"), path.join(journalRoot, "intent.json")),
    ...eventNames.map((name) =>
      copyFile(path.join(sourceEventRoot, name), path.join(journalRoot, "events", name))),
    ...pinNames.map((name) =>
      copyFile(path.join(sourcePinRoot, name), path.join(journalRoot, "pins", name))),
    copyFile(
      path.join(sourceArtifactsRoot, "open-kits", "ravioli-open-kit-0.json"),
      path.join(artifactsRoot, "open-kits", "ravioli-open-kit-0.json"),
    ),
    copyFile(
      historicalOpenKitPath,
      path.join(artifactsRoot, "open-kits", "ravioli-open-kit-1.json"),
    ),
    writeFile(
      path.join(artifactsRoot, "open-kits", "open-kit-capture-progress.json"),
      boundary40ProgressBytes,
    ),
    ...screenshotNames.map((name) =>
      copyFile(path.join(sourceScreenshotRoot, name), path.join(appRoot, "screenshots", name))),
    ...sidecarNames.map((name) =>
      copyFile(path.join(sourceArtifactsRoot, name), path.join(artifactsRoot, name))),
  ]);
  boundary40FixtureRoot = temporaryRoot;
  return appRoot;
}

async function exactBoundary40AppRoot(): Promise<string | null> {
  boundary40FixturePromise ||= createBoundary40Fixture();
  return boundary40FixturePromise;
}

async function exactBoundary40OpenKitOnePath(): Promise<string | null> {
  const appRoot = await exactBoundary40AppRoot();
  return appRoot
    ? path.join(appRoot, "artifacts", "open-kits", "ravioli-open-kit-1.json")
    : null;
}

after(async () => {
  if (boundary40FixtureRoot) {
    await rm(boundary40FixtureRoot, { recursive: true, force: true });
  }
});

async function loadFixture(
  journalRoot?: string,
): Promise<RavioliCurrentV4Resume | null> {
  if (!journalRoot) {
    const appRoot = await exactBoundary40AppRoot();
    if (!appRoot) return null;
    journalRoot = path.join(appRoot, "artifacts", "journal");
  }
  try {
    await stat(path.join(journalRoot, "intent.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const journal = await openRavioliUiLiveJournal(journalRoot);
  const {
    tzktBaseline: _tzktBaseline,
    ...dependencyHashes
  } = journal.intent.dependencyHashes;
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
  return loadRavioliCurrentV4Resume({
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

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalBytes(value: unknown): Uint8Array {
  return deterministicJsonBytes(value);
}

function base32(bytes: Uint8Array): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let buffer = 0;
  let bits = 0;
  let output = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31];
  return output;
}

function rawCid(bytes: Uint8Array): string {
  const hash = createHash("sha256").update(bytes).digest();
  return `b${base32(Uint8Array.from([0x01, 0x55, 0x12, 0x20, ...hash]))}`;
}

function hex(value: string): string {
  return Buffer.from(value, "utf8").toString("hex");
}

function pinRequest(pin: RavioliCurrentV4PinRecord): PastaUiLiveBridgeRequest {
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

function operationRequest(
  resume: RavioliCurrentV4Resume,
  index: number,
): PastaUiLiveBridgeRequest {
  const operation = resume.operations[index];
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

function replayRequests(
  resume: RavioliCurrentV4Resume,
): PastaUiLiveBridgeRequest[] {
  return [
    pinRequest(resume.activePins[0]),
    pinRequest(resume.activePins[1]),
    pinRequest(resume.activePins[2]),
    operationRequest(resume, 0),
    operationRequest(resume, 1),
    operationRequest(resume, 2),
    pinRequest(resume.activePins[3]),
    pinRequest(resume.activePins[4]),
    pinRequest(resume.activePins[5]),
    operationRequest(resume, 3),
    operationRequest(resume, 4),
    operationRequest(resume, 5),
    operationRequest(resume, 6),
    operationRequest(resume, 7),
    pinRequest(resume.activePins[6]),
    operationRequest(resume, 8),
  ];
}

function freshPinProof(
  request: PastaUiLiveBridgeRequest,
  ordinal: number,
): PastaUiLivePinProof {
  assert.equal(request.action, "pin_json");
  const payload = request.payload as any;
  const value = decodePastaUiLiveValue(payload.value);
  const bytes = canonicalBytes(value);
  assert.ok(ordinal >= 1 && ordinal <= 3, `unexpected fresh pin ordinal ${ordinal}`);
  const uri = `ipfs://${rawCid(bytes)}`;
  const cid = uri.slice("ipfs://".length);
  return {
    cid,
    uri,
    fileName: payload.fileName,
    mimeType: "application/json",
    byteLength: bytes.byteLength,
    sha256: digest(bytes),
    localGatewayUrl: `http://127.0.0.1:8080/ipfs/${cid}`,
    publicGatewayUrl: `https://ipfs.io/ipfs/${cid}`,
    publicGatewayVerified: true,
    verificationAttempts: 1,
  };
}

function pinMaterial(pin: RavioliCurrentV4PinRecord): RavioliPinnedJsonMaterial {
  assert.notEqual(pin.value, undefined);
  return {
    value: pin.value,
    bytes: pin.bytes,
    proof: {
      cid: pin.proof.cid,
      uri: pin.proof.uri,
      fileName: pin.proof.fileName,
      mimeType: pin.proof.mimeType,
      byteLength: pin.proof.byteLength,
      sha256: pin.proof.sha256,
      publicGatewayVerified: true,
    },
  };
}

type FreshFixture = Readonly<{
  manifest: Record<string, unknown>;
  manifestUri: string;
  envelope: Record<string, unknown>;
  envelopeUri: string;
  tokenMetadata: Record<string, unknown>;
  tokenUri: string;
  openKit: Record<string, unknown>;
  operationTenPayload: Record<string, unknown>;
}>;

function freshFixture(resume: RavioliCurrentV4Resume): FreshFixture {
  const wrapperSaleEnd = "2026-07-24T10:12:00.000Z";
  const revealDeadline = "2026-07-24T11:12:00.000Z";
  const openDeadline = "2026-07-24T12:12:00.000Z";
  const editionPolicy = {
    earliestChildEnd: null,
    openDeadline,
    requiresLimitedWrapper: false,
    revealDeadline,
    wrapperEditionClass: "limited-edition",
    wrapperSaleEnd,
    wrapperSaleStart: null,
  };
  const manifest = {
    assignmentPolicy: "precommitted-salted-cyclic-rotation",
    blindSecurity: "commit-reveal-ui-hidden-chain-public",
    description: "Fresh canonical Shadownet blind funded-pool proof.",
    editionPolicy: {
      afterOpenDeadline:
        "refund-only; expiry credits the holder, who withdraws separately",
      childPolicySummary: {
        limitedEditionResources: 0,
        referencedResources: 0,
        requiredCapacity: 0,
      },
      ...editionPolicy,
      transferExpiry:
        "reveal-deadline-if-unrevealed-or-open-deadline-if-revealed",
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
  const manifestUri = `ipfs://${rawCid(canonicalBytes(manifest))}`;
  const recipes = [
    {
      actions: [{
        amount: 1,
        fa2: resume.identity.gnocchiAddress,
        kind: "escrow",
        tokenId: 0,
      }],
      nonce: FRESH_NONCES[0],
      serial: 0,
    },
    {
      actions: [{
        amount: 1,
        fa2: resume.identity.gnocchiAddress,
        kind: "escrow",
        tokenId: 1,
      }],
      nonce: FRESH_NONCES[1],
      serial: 1,
    },
    {
      actions: [{
        amount: 1,
        fa2: resume.identity.gnocchiAddress,
        kind: "escrow",
        tokenId: 1,
      }],
      nonce: FRESH_NONCES[2],
      serial: 2,
    },
  ];
  const publicKit = {
    blindSecurity: "commit-reveal-ui-hidden-chain-public",
    contract: resume.routerAddress,
    editionPolicy,
    manifestUri,
    mode: "blind_funded_pool",
    network: "shadownet",
    recipes,
    schema: "pasta-ravioli-open-kit@3",
    tokenId: 1,
    warning: "Keep the reveal salt and all three recipe nonces private until reveal.",
  };
  const publicReveal = {
    contract: resume.routerAddress,
    itemCount: 1,
    manifestUri,
    maxSupply: 3,
    mode: "blind_funded_pool",
    network: "shadownet",
    openKit: publicKit,
    schema: "pasta-ravioli-public-reveal@1",
    tokenId: 1,
  };
  const aad = {
    contract: resume.routerAddress,
    manifestUri,
    network: "shadownet",
    schema: "pasta-ravioli-sealed-reveal@1",
    tokenId: 1,
  };
  const key = createHash("sha256")
    .update(Buffer.from("pasta-ravioli-sealed-reveal@1\0", "utf8"))
    .update(Buffer.from(FRESH_SALT, "hex"))
    .digest();
  const cipher = createCipheriv(
    "aes-256-gcm",
    key,
    FRESH_IV,
    { authTagLength: 16 },
  );
  cipher.setAAD(Buffer.from(JSON.stringify(aad), "utf8"));
  const authenticatedCiphertext = Buffer.concat([
    cipher.update(Buffer.from(canonicalBytes(publicReveal))),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const envelope = {
    aad,
    cipher: "AES-256-GCM",
    ciphertext: authenticatedCiphertext.toString("base64"),
    iv: FRESH_IV.toString("base64"),
    keyDerivation:
      "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)",
    schema: "pasta-ravioli-sealed-reveal@1",
  };
  const envelopeUri = `ipfs://${rawCid(canonicalBytes(envelope))}`;
  const openKit = {
    ...publicKit,
    sealedReveal: {
      contentsUri: envelopeUri,
      envelopeSha256: digest(canonicalBytes(envelope)),
      offset: FRESH_OFFSET,
      salt: FRESH_SALT,
      schema: "pasta-ravioli-sealed-reveal-reference@1",
    },
  };
  const revealCommitment = computeRavioliRevealCommitment(
    envelopeUri,
    FRESH_SALT,
    FRESH_OFFSET,
  );
  const wrapperUri = resume.activePins[6].proof.uri;
  const tokenMetadata = {
    artifactUri: wrapperUri,
    creators: [resume.identity.creatorAddress],
    decimals: 0,
    description: "Fresh canonical Shadownet blind funded-pool proof.",
    displayUri: wrapperUri,
    formats: [{ mimeType: "image/png", uri: wrapperUri }],
    isBooleanAmount: false,
    minter: resume.identity.creatorAddress,
    name: "Ravioli UI-LIVE Blind Funded Pool",
    ravioli: {
      assignmentPolicy: "precommitted-salted-cyclic-rotation",
      blindSecurity: "authenticated-ciphertext-until-reveal",
      editionPolicy,
      fulfillment: "atomic-router-controller",
      generativeOutputAuthority: null,
      itemCount: 1,
      manifestUri,
      maxSupply: 3,
      mode: "blind_funded_pool",
      postDeadlineAction: "refund-only; credit-holder-then-pull-withdraw",
      revealCommitment,
      sealedContentsUri: envelopeUri,
      transferExpiry:
        "reveal-deadline-if-unrevealed-or-open-deadline-if-revealed",
      version: 3,
      wrapperEditionClass: "limited-edition",
    },
    symbol: "RVUI",
    tags: ["ravioli", "blind_funded_pool", "ui-live", "shadownet"],
    thumbnailUri: wrapperUri,
  };
  const tokenUri = `ipfs://${rawCid(canonicalBytes(tokenMetadata))}`;
  const tokenInfo = [
    ["", hex(tokenUri)],
    ["decimals", hex("0")],
    ["name", hex("Ravioli UI-LIVE Blind Funded Pool")],
    ["pasta:editionClass", hex("limited-edition")],
    ["pasta:fulfillment", hex("atomic")],
    ["pasta:packMode", hex("blind_funded_pool")],
    [
      "pasta:transferExpiry",
      hex("reveal/open deadline; refund-only afterward"),
    ],
    ["symbol", hex("RVUI")],
  ];
  const operationTenPayload = {
    config: {
      blind: true,
      cancelled: false,
      child_expiry: null,
      committed_recipes: 0,
      contents_uri: null,
      finalized: false,
      item_count: 1,
      manifest_uri: hex(manifestUri),
      max_supply: 3,
      mode: 1,
      open_deadline: openDeadline,
      reveal_commitment: revealCommitment,
      reveal_deadline: revealDeadline,
      wrapper_sale_end: null,
    },
    expected_token_id: 1,
    token_info: { $map: tokenInfo },
  };
  return {
    manifest,
    manifestUri,
    envelope,
    envelopeUri,
    tokenMetadata,
    tokenUri,
    openKit,
    operationTenPayload,
  };
}

test("current-v4 authenticates boundary 40 and quarantines invalid pins from replay", async (t) => {
  const resume = await loadFixture();
  if (!resume) {
    t.skip("the exact July-23 Ravioli boundary-40 lane is not present");
    return;
  }
  assertRavioliCurrentV4IdentityAddresses();
  assert.equal(RAVIOLI_CURRENT_V4_RESUME_IDENTITY.eventCount, 40);
  assert.equal(RAVIOLI_CURRENT_V4_RESUME_IDENTITY.pinCount, 12);
  assert.equal(RAVIOLI_CURRENT_V4_RESUME_IDENTITY.operationCount, 9);
  assert.equal(RAVIOLI_CURRENT_V4_RESUME_IDENTITY.fileCount, 72);
  assert.equal(RAVIOLI_CURRENT_V4_RESUME_IDENTITY.screenshots.length, 8);
  assert.equal(
    RAVIOLI_CURRENT_V4_RESUME_IDENTITY.finalEventSha256,
    "b3080c18ee631685a940fc0ecec5d003a5a9ebd7d0684b1acc84786d0e08be5e",
  );
  assert.equal(RAVIOLI_CURRENT_V4_RESUME_FILE_COUNT, 72);
  assert.equal(RAVIOLI_CURRENT_V4_REPLAY_STEP_COUNT, 16);
  assert.equal(resume.journalPins.length, 12);
  assert.equal(resume.activePins.length, 7);
  assert.equal(resume.replayPins.length, 7);
  assert.deepEqual(
    resume.replayPins.map((pin) => pin.proof.sha256),
    resume.activePins.map((pin) => pin.proof.sha256),
  );
  assert.equal(resume.supersededPrecommitPins.length, 2);
  assert.equal(resume.cryptoInvalidPrecommitPins.length, 3);
  assert.equal(resume.operations.length, 9);
  assert.equal(resume.writeReceipts.length, 9);
  assert.equal(
    resume.cryptoInvalidAudit.disposition,
    "SUPERSEDED_CRYPTO_INVALID_PRECOMMIT",
  );
  assert.equal(resume.cryptoInvalidAudit.canonicalAadDecryptable, false);
  assert.equal(
    resume.cryptoInvalidAudit.pinnedEnvelopeSha256,
    "42f5265b0b2be0e686edd32b579928977bac7cf565ae4e45f6b74dd6bd25d32b",
  );
  assert.equal(
    resume.cryptoInvalidAudit.producerEnvelopeSha256,
    "564b9dd97f6384b7438223a36e0de7170326c24dd34becf2eabed2f593474e9e",
  );
  assert.ok(
    resume.cryptoInvalidPrecommitPins.every(
      (pin) => !resume.replayPins.includes(pin),
    ),
  );

  const openKitOnePath = await exactBoundary40OpenKitOnePath();
  assert.ok(openKitOnePath);
  const oldOpenKit = await json(openKitOnePath);
  const snapshotText = JSON.stringify(ravioliCurrentV4ResumeSnapshot(resume));
  assert.doesNotMatch(snapshotText, /recipeNoncesHex|entropy/i);
  assert.ok(!snapshotText.includes(oldOpenKit.sealedReveal.salt));
  for (const recipe of oldOpenKit.recipes) {
    assert.ok(!snapshotText.includes(recipe.nonce));
  }
});

test("current-v4 independently proves the old precommit invalid and fails closed on mutation", async (t) => {
  const resume = await loadFixture();
  if (!resume) {
    t.skip("the exact July-23 Ravioli boundary-40 lane is not present");
    return;
  }
  const openKitOnePath = await exactBoundary40OpenKitOnePath();
  assert.ok(openKitOnePath);
  const openKit = await json(openKitOnePath);
  const openKitBytes = await readFile(openKitOnePath);
  const input = {
    expected: {
      network: "shadownet" as const,
      contract: resume.routerAddress,
      tokenId: 1 as const,
      creatorAddress: resume.identity.creatorAddress,
      escrowContract: resume.identity.gnocchiAddress,
      wrapperUri: resume.activePins[6].proof.uri,
    },
    openKit: {
      value: openKit,
      bytes: Uint8Array.from(openKitBytes),
    },
    manifest: pinMaterial(resume.cryptoInvalidPrecommitPins[0]),
    envelope: pinMaterial(resume.cryptoInvalidPrecommitPins[1]),
    tokenMetadata: pinMaterial(resume.cryptoInvalidPrecommitPins[2]),
  };
  const audit = auditRavioliCurrentV4CryptoInvalidPrecommit(input);
  assert.equal(audit.canonicalAadDecryptable, false);
  assert.equal(
    audit.publicRevealCanonicalSha256,
    "2bfda5338c85f7157defeba8491b8d4e45da04cc9fc1c899c8c0999f906b0733",
  );

  const mutated = structuredClone(openKit);
  mutated.sealedReveal.salt = "34".repeat(32);
  await assert.rejects(
    async () => auditRavioliCurrentV4CryptoInvalidPrecommit({
      ...input,
      openKit: {
        value: mutated,
        bytes: canonicalBytes(mutated),
      },
    }),
    /authentication or decryption failed/,
  );
});

test("current-v4 cumulative inventory rejects the old distribution and accepts only 0x1 plus 1x2", async (t) => {
  const resume = await loadFixture();
  if (!resume) {
    t.skip("the exact July-23 Ravioli boundary-40 lane is not present");
    return;
  }
  const openKitOnePath = await exactBoundary40OpenKitOnePath();
  assert.ok(openKitOnePath);
  const oldOpenKit = await json(openKitOnePath);
  assert.throws(
    () => verifyRavioliCurrentV4CumulativeInventory(
      RAVIOLI_CURRENT_V4_INVENTORY_BOUNDARY,
      oldOpenKit,
    ),
    /fresh token 0 requirement exceeds creator inventory/,
  );
  const fixture = freshFixture(resume);
  const proof = verifyRavioliCurrentV4CumulativeInventory(
    RAVIOLI_CURRENT_V4_INVENTORY_BOUNDARY,
    fixture.openKit,
  );
  assert.deepEqual(proof.freshRequirements, [
    { tokenId: 0, amount: 1 },
    { tokenId: 1, amount: 2 },
  ]);
  assert.deepEqual(proof.cumulativeRequirements, [
    { tokenId: 0, amount: 2 },
    { tokenId: 1, amount: 2 },
  ]);
  assert.deepEqual(proof.controlledInventory, [
    { tokenId: 0, amount: 2 },
    { tokenId: 1, amount: 2 },
  ]);
});

test("current-v4 uses one stable replay then gates fresh canonical op10 with private proof and inventory", async (t) => {
  const resume = await loadFixture();
  if (!resume) {
    t.skip("the exact July-23 Ravioli boundary-40 lane is not present");
    return;
  }
  const fresh = freshFixture(resume);
  const delegated: PastaUiLiveBridgeRequest[] = [];
  let pinOrdinal = 0;
  let privateLoads = 0;
  let predelegateChecks = 0;
  const interceptor = createRavioliCurrentV4ResumeInterceptor({
    resume,
    now: () => FIXED_NOW,
    minimumSaleWindowMs: 5 * 60 * 1_000,
    delegate: async (request) => {
      delegated.push(request);
      if (request.action === "pin_json") {
        return { pin: freshPinProof(request, ++pinOrdinal) };
      }
      return {
        operationHash: "ooFakeOperationHashForFocusedTestOnly",
        confirmationLevel: 1,
      };
    },
    loadFreshPrivatePrecommit: async (context) => {
      privateLoads += 1;
      assert.deepEqual(
        [
          context.manifest.proof.uri,
          context.envelope.proof.uri,
          context.tokenMetadata.proof.uri,
        ],
        [fresh.manifestUri, fresh.envelopeUri, fresh.tokenUri],
      );
      const invalidHashes = new Set(
        resume.cryptoInvalidPrecommitPins.map((pin) => pin.proof.sha256),
      );
      assert.ok(!invalidHashes.has(context.manifest.proof.sha256));
      assert.ok(!invalidHashes.has(context.envelope.proof.sha256));
      assert.ok(!invalidHashes.has(context.tokenMetadata.proof.sha256));
      return {
        openKit: fresh.openKit,
        inventory: RAVIOLI_CURRENT_V4_INVENTORY_BOUNDARY,
      };
    },
    beforeDelegateOperationTen: async (context) => {
      predelegateChecks += 1;
      assert.equal(context.privateProof.manifestUri, fresh.manifestUri);
      assert.equal(context.privateProof.envelopeUri, fresh.envelopeUri);
      assert.equal(context.privateProof.tokenMetadataUri, fresh.tokenUri);
      assert.deepEqual(context.inventoryProof.freshRequirements, [
        { tokenId: 0, amount: 1 },
        { tokenId: 1, amount: 2 },
      ]);
    },
  });
  assert.equal(interceptor.continuationStage(), "replay-prefix");
  assert.equal("beginFreshRestart" in interceptor, false);

  for (const request of replayRequests(resume)) {
    await interceptor.handle(request);
  }
  assert.equal(interceptor.isReplayComplete(), true);
  assert.equal(interceptor.getCompletedReplayStepCount(), 16);
  assert.equal(interceptor.getRemainingReplayStepCount(), 0);
  assert.equal(interceptor.continuationStage(), "fresh-mode1-manifest");
  assert.equal(delegated.length, 0);

  for (const pin of [
    ...resume.supersededPrecommitPins,
    ...resume.cryptoInvalidPrecommitPins,
  ]) {
    await assert.rejects(
      () => interceptor.handle(pinRequest(pin)),
      /refusing (superseded private precommit artifact|duplicate recovered side effect)/,
    );
  }
  assert.equal(delegated.length, 0);

  await interceptor.handle(createBridgeRequest("pin_json", {
    fileName: "ravioli-pack-manifest.json",
    value: fresh.manifest,
  }));
  assert.equal(interceptor.continuationStage(), "fresh-mode1-envelope");
  await interceptor.handle(createBridgeRequest("pin_json", {
    fileName: "ravioli-sealed-reveal-1.json",
    value: fresh.envelope,
  }));
  assert.equal(interceptor.continuationStage(), "fresh-mode1-token");
  await interceptor.handle(createBridgeRequest("pin_json", {
    fileName: "token.json",
    value: fresh.tokenMetadata,
  }));
  assert.equal(interceptor.continuationStage(), "fresh-operation-10");
  assert.deepEqual(
    delegated.map((request) => request.action),
    ["pin_json", "pin_json", "pin_json"],
  );
  assert.equal(
    delegated.filter((request) => request.action === "call").length,
    0,
  );

  const driftedPayload = structuredClone(fresh.operationTenPayload) as any;
  driftedPayload.config.reveal_commitment = "00".repeat(32);
  await assert.rejects(
    () => interceptor.handle(createBridgeRequest("call", {
      call: {
        contractAddress: resume.routerAddress,
        entrypoint: "create_pack",
        payload: driftedPayload,
      },
      sendOptions: {},
    })),
    /operation 10 reveal commitment drift/,
  );
  assert.equal(
    delegated.filter((request) => request.action === "call").length,
    0,
  );
  assert.equal(predelegateChecks, 0);

  await interceptor.handle(createBridgeRequest("call", {
    call: {
      contractAddress: resume.routerAddress,
      entrypoint: "create_pack",
      payload: fresh.operationTenPayload,
    },
    sendOptions: {},
  }));
  assert.equal(privateLoads, 2);
  assert.equal(predelegateChecks, 1);
  assert.equal(interceptor.continuationStage(), "continued");
  assert.equal(
    delegated.filter((request) => request.action === "call").length,
    1,
  );
  const context = interceptor.operationTenContext();
  assert.ok(context);
  const contextText = JSON.stringify(context);
  assert.ok(!contextText.includes(FRESH_SALT));
  for (const nonce of FRESH_NONCES) {
    assert.ok(!contextText.includes(nonce));
  }
});

test("current-v4 rejects replay drift before any side-effect delegation", async (t) => {
  const resume = await loadFixture();
  if (!resume) {
    t.skip("the exact July-23 Ravioli boundary-40 lane is not present");
    return;
  }
  const delegated: PastaUiLiveBridgeRequest[] = [];
  const interceptor = createRavioliCurrentV4ResumeInterceptor({
    resume,
    delegate: async (request) => {
      delegated.push(request);
      return {};
    },
    loadFreshPrivatePrecommit: async () => {
      throw new Error("must not load a private precommit during replay");
    },
    beforeDelegateOperationTen: async () => {
      throw new Error("must not authorize operation 10 during replay");
    },
  });
  await assert.rejects(
    () => interceptor.handle(operationRequest(resume, 0)),
    /expected stable replay step 1/,
  );
  assert.equal(delegated.length, 0);
  assert.equal(interceptor.getCompletedReplayStepCount(), 0);
});

test("current-v4 can prime the authenticated mode-0 prefix without browser entropy or side effects", async (t) => {
  const resume = await loadFixture();
  if (!resume) {
    t.skip("the exact July-23 Ravioli boundary-40 lane is not present");
    return;
  }
  let delegated = 0;
  const interceptor = createRavioliCurrentV4ResumeInterceptor({
    resume,
    delegate: async () => {
      delegated += 1;
      return {};
    },
    loadFreshPrivatePrecommit: async () => {
      throw new Error("must not load a private precommit while priming recovered mode 0");
    },
    beforeDelegateOperationTen: async () => {
      throw new Error("must not authorize operation 10 while priming recovered mode 0");
    },
  });
  interceptor.primeAuthenticatedMode0Prefix();
  assert.equal(interceptor.getCompletedReplayStepCount(), 14);
  assert.equal(interceptor.getRemainingReplayStepCount(), 2);
  assert.equal(interceptor.continuationStage(), "replay-prefix");
  assert.equal(delegated, 0);
  assert.throws(
    () => interceptor.primeAuthenticatedMode0Prefix(),
    /may only be primed once/,
  );
  for (const request of replayRequests(resume).slice(14)) {
    await interceptor.handle(request);
  }
  assert.equal(interceptor.isReplayComplete(), true);
  assert.equal(interceptor.continuationStage(), "fresh-mode1-manifest");
  assert.equal(delegated, 0);
});

test("current-v4 loader rejects extra files and symlinks in the frozen 72-file lane", async (t) => {
  const sourceAppRoot = await exactBoundary40AppRoot();
  if (!sourceAppRoot) {
    t.skip("the exact July-23 Ravioli boundary-40 lane is not present");
    return;
  }
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "ravioli-current-v4-"),
  );
  t.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  const temporaryAppRoot = path.join(temporaryRoot, "ravioli");
  await cp(sourceAppRoot, temporaryAppRoot, { recursive: true });
  const temporaryJournalRoot = path.join(
    temporaryAppRoot,
    "artifacts",
    "journal",
  );

  const unexpectedFile = path.join(
    temporaryAppRoot,
    "artifacts",
    "pins",
    "unexpected.bin",
  );
  await writeFile(unexpectedFile, Buffer.from([0]));
  await assert.rejects(
    () => loadFixture(temporaryJournalRoot),
    /Ravioli retained-pin lane inventory drift/,
  );
  await unlink(unexpectedFile);

  const screenshotSeven = path.join(
    temporaryAppRoot,
    "screenshots",
    "007-compose-five-atomic-pack-modes-deterministic-vault-funded-and-issued.png",
  );
  const screenshotEight = path.join(
    temporaryAppRoot,
    "screenshots",
    "008-compose-five-atomic-pack-modes-blind-funded-pool-reconfigured-after-superseded-private-precommit.png",
  );
  await unlink(screenshotEight);
  await symlink(screenshotSeven, screenshotEight);
  await assert.rejects(
    () => loadFixture(temporaryJournalRoot),
    /must be a regular non-symlink file/,
  );
});
