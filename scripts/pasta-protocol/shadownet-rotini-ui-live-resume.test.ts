import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { MichelsonMap } from "@taquito/taquito";

import { hashMichelsonScriptCode } from "./pasta-michelson-script-identity";
import { root, utf8ToHex } from "./shadownet-proof-kit";
import {
  ROTINI_UI_LIVE_GIF_RESUME_EXECUTE_FLAG,
  ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE_FLAG,
  ROTINI_UI_LIVE_RESUME_EXECUTE_FLAG,
  ROTINI_UI_LIVE_RESUME_OUTPUT_ENV,
  ROTINI_UI_LIVE_ZIP_RESUME_EXECUTE_FLAG,
  assertExactRotiniGifResumeChainState,
  assertExactRotiniPostSubmittedResumeChainState,
  assertExactRotiniResumeChainState,
  assertExactRotiniZipResumeChainState,
  assertRotiniUiLiveGifResumeAllowed,
  assertRotiniUiLivePostSubmittedResumeAllowed,
  assertRotiniUiLiveResumeAllowed,
  assertRotiniUiLiveZipResumeAllowed,
} from "./shadownet-rotini-ui-live-resume";

const CREATOR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const COLLECTOR = "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6";
const CONTRACT = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";

function pin(index: number) {
  const cid = `bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa${String(index).padStart(2, "0")}`;
  return {
    sequence: index + 1,
    actor: "creator" as const,
    fileName: `pin-${index}`,
    mimeType: "application/octet-stream",
    bytes: new Uint8Array([index]),
    proof: {
      cid,
      uri: `ipfs://${cid}`,
      fileName: `pin-${index}`,
      mimeType: "application/octet-stream",
      byteLength: 1,
      sha256: String(index).padStart(64, "0"),
      localGatewayUrl: `http://127.0.0.1:8080/ipfs/${cid}`,
      publicGatewayUrl: `https://proof.invalid/ipfs/${cid}`,
      publicGatewayVerified: true,
      verificationAttempts: 1,
    },
  };
}

async function exactFixture() {
  const scriptCode = JSON.parse(await readFile(path.join(
    root,
    "public",
    "creation-tools",
    "rotini",
    "contract",
    "pasta-generative-collection.contract.json",
  ), "utf8"));
  const pins = Array.from({ length: 13 }, (_, index) => pin(index));
  const projects = ["png", "gif", "zip"].map((mode, projectId) => ({
    active: true,
    output_mode: utf8ToHex(mode),
    price: projectId === 0 ? 0 : 1,
    max_supply: { Some: 4 },
    max_per_wallet: { Some: 4 },
    reservation_ttl: 3_600,
    minted: 0,
    reserved: projectId === 0 ? 1 : 0,
    treasury: CREATOR,
    generator_uri: utf8ToHex(pins[[3, 8, 12][projectId]].proof.uri),
    display_uri: utf8ToHex(pins[[0, 5, 9][projectId]].proof.uri),
  }));
  const projection = {
    next_project_id: 3,
    next_reservation_id: 1,
    next_token_id: 1,
    projects: Object.fromEntries(projects.map((project, index) => [String(index), project])),
    reservations: {
      "0": {
        owner: COLLECTOR,
        project_id: 0,
        token_id: 0,
        iteration: 0,
        seed: "a".repeat(64),
        price: 0,
        expires_at: "2030-01-01T00:20:00.000Z",
      },
    },
    latest_reservation: { [COLLECTOR]: 0 },
  };
  return {
    state: {
      projection,
      administrator: CREATOR,
      pendingAdministrator: null,
      projects,
      reservation: projection.reservations["0"],
      laterReservations: [undefined, undefined],
      latestReservation: 0,
      reservedBy: 1,
      tokenState: {
        token_metadata: undefined,
        total_supply: undefined,
        token_project: undefined,
        token_seed: undefined,
        token_artifact: undefined,
        ledger: undefined,
        minted_by: undefined,
      },
      scriptCode,
    },
    evidence: {
      creator: CREATOR,
      collector: COLLECTOR,
      pins,
      contractCanonicalSha256: hashMichelsonScriptCode(scriptCode),
    },
    nowMs: Date.parse("2030-01-01T00:00:00.000Z"),
  };
}

async function exactPostSubmittedFixture() {
  const fixture = await exactFixture();
  const mediaPin = pin(13);
  const metadataPin = pin(14);
  fixture.evidence.pins.push(mediaPin, metadataPin);
  fixture.state.projects[0].minted = 1;
  fixture.state.projects[0].reserved = 0;
  fixture.state.projection.reservations = {};
  fixture.state.projection.latest_reservation = {};
  fixture.state.reservation = undefined as any;
  fixture.state.latestReservation = 0;
  fixture.state.reservedBy = undefined;
  fixture.state.tokenState = {
    token_metadata: {
      token_id: 0,
      token_info: {
        "": utf8ToHex(metadataPin.proof.uri),
        artifactUri: utf8ToHex(mediaPin.proof.uri),
        displayUri: utf8ToHex(mediaPin.proof.uri),
        thumbnailUri: utf8ToHex(mediaPin.proof.uri),
      },
    },
    total_supply: 1,
    token_project: 0,
    token_seed: "b".repeat(64),
    token_artifact: {
      artifact_uri: utf8ToHex(mediaPin.proof.uri),
      display_uri: utf8ToHex(mediaPin.proof.uri),
      thumbnail_uri: utf8ToHex(mediaPin.proof.uri),
      mime_type: utf8ToHex("image/png"),
      artifact_hash: mediaPin.proof.sha256,
    },
    ledger: 1,
    minted_by: 1,
  };
  return fixture;
}

function finalizedTokenState(input: {
  tokenId: number;
  projectId: number;
  mediaPin: ReturnType<typeof pin>;
  metadataPin: ReturnType<typeof pin>;
  mimeType: string;
}) {
  return {
    token_metadata: {
      token_id: input.tokenId,
      token_info: {
        "": utf8ToHex(input.metadataPin.proof.uri),
        artifactUri: utf8ToHex(input.mediaPin.proof.uri),
        displayUri: utf8ToHex(input.mediaPin.proof.uri),
        thumbnailUri: utf8ToHex(input.mediaPin.proof.uri),
      },
    },
    total_supply: 1,
    token_project: input.projectId,
    token_seed: String(input.tokenId + 1).repeat(64),
    token_artifact: {
      artifact_uri: utf8ToHex(input.mediaPin.proof.uri),
      display_uri: utf8ToHex(input.mediaPin.proof.uri),
      thumbnail_uri: utf8ToHex(input.mediaPin.proof.uri),
      mime_type: utf8ToHex(input.mimeType),
      artifact_hash: input.mediaPin.proof.sha256,
    },
    ledger: 1,
    minted_by: 1,
  };
}

async function exactZipResumeFixture() {
  const fixture: any = await exactPostSubmittedFixture();
  const gifPin = pin(15);
  const gifMetadata = pin(16);
  fixture.evidence.pins.push(gifPin, gifMetadata);
  fixture.state.projects[1].minted = 1;
  fixture.state.projects[2].reserved = 1;
  fixture.state.projection.next_reservation_id = 3;
  fixture.state.projection.next_token_id = 3;
  const reservation = {
    owner: COLLECTOR,
    project_id: 2,
    token_id: 2,
    iteration: 0,
    seed: "c".repeat(64),
    price: 1,
    expires_at: "2030-01-01T00:20:00.000Z",
  };
  fixture.state.projection.reservations = { "2": reservation };
  fixture.state.projection.latest_reservation = { [COLLECTOR]: 2 };
  fixture.state.reservationsById = [undefined, undefined, reservation];
  fixture.state.reservedByProject = [undefined, undefined, 1];
  fixture.state.tokenStatesById = [
    finalizedTokenState({
      tokenId: 0,
      projectId: 0,
      mediaPin: fixture.evidence.pins[13],
      metadataPin: fixture.evidence.pins[14],
      mimeType: "image/png",
    }),
    finalizedTokenState({
      tokenId: 1,
      projectId: 1,
      mediaPin: gifPin,
      metadataPin: gifMetadata,
      mimeType: "image/gif",
    }),
    {
      token_metadata: undefined,
      total_supply: undefined,
      token_project: undefined,
      token_seed: undefined,
      token_artifact: undefined,
      ledger: undefined,
      minted_by: undefined,
    },
  ];
  fixture.state.latestReservation = 2;
  return fixture;
}

async function exactGifResumeFixture() {
  const fixture: any = await exactPostSubmittedFixture();
  fixture.state.projects[1].reserved = 1;
  fixture.state.projection.next_reservation_id = 2;
  fixture.state.projection.next_token_id = 2;
  const reservation = {
    owner: COLLECTOR,
    project_id: 1,
    token_id: 1,
    iteration: 0,
    seed: "c".repeat(64),
    price: 1,
    expires_at: "2030-01-01T00:20:00.000Z",
  };
  fixture.state.projection.reservations = { "1": reservation };
  fixture.state.projection.latest_reservation = { [COLLECTOR]: 1 };
  fixture.state.reservationsById = [undefined, reservation, undefined];
  fixture.state.reservedByProject = [undefined, 1, undefined];
  fixture.state.tokenStatesById = [
    finalizedTokenState({
      tokenId: 0,
      projectId: 0,
      mediaPin: fixture.evidence.pins[13],
      metadataPin: fixture.evidence.pins[14],
      mimeType: "image/png",
    }),
    {
      token_metadata: undefined,
      total_supply: undefined,
      token_project: undefined,
      token_seed: undefined,
      token_artifact: undefined,
      ledger: undefined,
      minted_by: undefined,
    },
    {
      token_metadata: undefined,
      total_supply: undefined,
      token_project: undefined,
      token_seed: undefined,
      token_artifact: undefined,
      ledger: undefined,
      minted_by: undefined,
    },
  ];
  fixture.state.reservation = undefined;
  fixture.state.laterReservations = [reservation, undefined];
  fixture.state.latestReservation = 1;
  fixture.state.reservedBy = undefined;
  return fixture;
}

test("Rotini UI-live resume is separately gated, Shadownet-only, and rejects fresh/override flags", () => {
  assert.throws(() => assertRotiniUiLiveResumeAllowed({}), /explicit Rotini UI-live resume flag is required/);
  assert.throws(() => assertRotiniUiLiveResumeAllowed({
    [ROTINI_UI_LIVE_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]: "/tmp/run",
    TEZOS_NETWORK: "mainnet",
  }), /only permits Shadownet/);
  assert.throws(() => assertRotiniUiLiveResumeAllowed({
    [ROTINI_UI_LIVE_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]: "/tmp/run",
    TEZOS_NETWORK: "shadownet",
    PASTA_SHADOWNET_ROTINI_UI_LIVE_EXECUTE: "1",
  }), /refuses fresh-run or contract override flags/);
  assert.doesNotThrow(() => assertRotiniUiLiveResumeAllowed({
    [ROTINI_UI_LIVE_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]: "/tmp/run",
    TEZOS_NETWORK: "shadownet",
  }));
  assert.throws(() => assertRotiniUiLiveResumeAllowed({
    [ROTINI_UI_LIVE_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]: "/tmp/run",
  }), /mutually exclusive/);
});

test("post-submitted continuation is separately gated, Shadownet-only, and mutually exclusive", () => {
  assert.throws(() => assertRotiniUiLivePostSubmittedResumeAllowed({}), /post-submitted continuation flag is required/);
  assert.throws(() => assertRotiniUiLivePostSubmittedResumeAllowed({
    [ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]: "/tmp/run",
    TEZOS_NETWORK: "mainnet",
  }), /only permits Shadownet/);
  assert.throws(() => assertRotiniUiLivePostSubmittedResumeAllowed({
    [ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]: "/tmp/run",
  }), /mutually exclusive/);
  assert.doesNotThrow(() => assertRotiniUiLivePostSubmittedResumeAllowed({
    [ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]: "/tmp/run",
    TEZOS_NETWORK: "shadownet",
  }));
});

test("ZIP reservation recovery is separately gated, Shadownet-only, and mutually exclusive", () => {
  assert.throws(() => assertRotiniUiLiveZipResumeAllowed({}), /ZIP reservation recovery flag is required/);
  assert.throws(() => assertRotiniUiLiveZipResumeAllowed({
    [ROTINI_UI_LIVE_ZIP_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]: "/tmp/run",
    TEZOS_NETWORK: "mainnet",
  }), /only permits Shadownet/);
  assert.throws(() => assertRotiniUiLiveZipResumeAllowed({
    [ROTINI_UI_LIVE_ZIP_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]: "/tmp/run",
  }), /mutually exclusive/);
  assert.doesNotThrow(() => assertRotiniUiLiveZipResumeAllowed({
    [ROTINI_UI_LIVE_ZIP_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]: "/tmp/run",
    TEZOS_NETWORK: "shadownet",
  }));
});

test("GIF reservation recovery is separately gated, Shadownet-only, and mutually exclusive", () => {
  assert.throws(() => assertRotiniUiLiveGifResumeAllowed({}), /GIF reservation recovery flag is required/);
  assert.throws(() => assertRotiniUiLiveGifResumeAllowed({
    [ROTINI_UI_LIVE_GIF_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]: "/tmp/run",
    TEZOS_NETWORK: "mainnet",
  }), /only permits Shadownet/);
  assert.throws(() => assertRotiniUiLiveGifResumeAllowed({
    [ROTINI_UI_LIVE_GIF_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_POST_SUBMITTED_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]: "/tmp/run",
  }), /mutually exclusive/);
  assert.doesNotThrow(() => assertRotiniUiLiveGifResumeAllowed({
    [ROTINI_UI_LIVE_GIF_RESUME_EXECUTE_FLAG]: "1",
    [ROTINI_UI_LIVE_RESUME_OUTPUT_ENV]: "/tmp/run",
    TEZOS_NETWORK: "shadownet",
  }));
});

test("exact partial Rotini state accepts only the sole live reservation and refuses capacity/token/expiry drift", async () => {
  const fixture = await exactFixture();
  assert.doesNotThrow(() => assertExactRotiniResumeChainState(fixture as any));

  const missingReservedBy = structuredClone(fixture);
  missingReservedBy.state.reservedBy = undefined;
  assert.throws(() => assertExactRotiniResumeChainState(missingReservedBy as any), /reserved count/);

  const laterReservation = structuredClone(fixture);
  laterReservation.state.laterReservations[0] = { owner: COLLECTOR };
  assert.throws(() => assertExactRotiniResumeChainState(laterReservation as any), /unexpected later reservation/);

  const alreadyMinted = structuredClone(fixture);
  alreadyMinted.state.tokenState.total_supply = 1;
  assert.throws(() => assertExactRotiniResumeChainState(alreadyMinted as any), /already contains token 0 total_supply/);

  const expired = structuredClone(fixture);
  expired.state.reservation.expires_at = "2030-01-01T00:09:59.999Z";
  assert.throws(() => assertExactRotiniResumeChainState(expired as any), /ten minutes of safe recovery headroom/);

  const wrongCounter = structuredClone(fixture);
  wrongCounter.state.projection.next_token_id = 0;
  assert.throws(() => assertExactRotiniResumeChainState(wrongCounter as any), /Expected values to be strictly deep-equal/);
});

test("post-submitted state requires one finalized PNG token and no open or later reservation", async () => {
  const fixture = await exactPostSubmittedFixture();
  const tokenInfo = new MichelsonMap<string, string>();
  for (const [key, value] of Object.entries(fixture.state.tokenState.token_metadata.token_info)) tokenInfo.set(key, value);
  fixture.state.tokenState.token_metadata.token_info = tokenInfo;
  assert.doesNotThrow(() => assertExactRotiniPostSubmittedResumeChainState(fixture as any));

  const stillReserved = await exactPostSubmittedFixture();
  stillReserved.state.projects[0].reserved = 1;
  assert.throws(
    () => assertExactRotiniPostSubmittedResumeChainState(stillReserved as any),
    /project 0 reserved/,
  );

  const missingToken = await exactPostSubmittedFixture();
  missingToken.state.tokenState.total_supply = undefined;
  assert.throws(
    () => assertExactRotiniPostSubmittedResumeChainState(missingToken as any),
    /total supply/,
  );

  const wrongMedia = await exactPostSubmittedFixture();
  wrongMedia.state.tokenState.token_artifact.artifact_uri = utf8ToHex("ipfs://wrong");
  assert.throws(
    () => assertExactRotiniPostSubmittedResumeChainState(wrongMedia as any),
    /Expected values to be strictly equal/,
  );

  const laterReservation = await exactPostSubmittedFixture();
  laterReservation.state.laterReservations[0] = { owner: COLLECTOR };
  assert.throws(
    () => assertExactRotiniPostSubmittedResumeChainState(laterReservation as any),
    /later reservation/,
  );
});

test("ZIP recovery requires exactly two finalized outputs and the sole live reservation 2", async () => {
  const fixture = await exactZipResumeFixture();
  assert.doesNotThrow(() => assertExactRotiniZipResumeChainState(fixture as any));

  const missingReservation = await exactZipResumeFixture();
  missingReservation.state.reservationsById[2] = undefined;
  assert.throws(() => assertExactRotiniZipResumeChainState(missingReservation as any), /reservation 2/);

  const alreadyMinted = await exactZipResumeFixture();
  alreadyMinted.state.tokenStatesById[2].total_supply = 1;
  assert.throws(() => assertExactRotiniZipResumeChainState(alreadyMinted as any), /already contains token 2 total_supply/);

  const wrongGif = await exactZipResumeFixture();
  wrongGif.state.tokenStatesById[1].token_artifact.artifact_uri = utf8ToHex("ipfs://wrong");
  assert.throws(() => assertExactRotiniZipResumeChainState(wrongGif as any), /Expected values to be strictly equal/);

  const expired = await exactZipResumeFixture();
  expired.state.reservationsById[2].expires_at = "2030-01-01T00:09:59.999Z";
  assert.throws(() => assertExactRotiniZipResumeChainState(expired as any), /ten minutes of safe recovery headroom/);
});

test("GIF recovery requires finalized PNG, the sole live reservation 1, and no later token", async () => {
  const fixture = await exactGifResumeFixture();
  assert.doesNotThrow(() => assertExactRotiniGifResumeChainState(fixture as any));

  const missingReservation = await exactGifResumeFixture();
  missingReservation.state.reservationsById[1] = undefined;
  assert.throws(() => assertExactRotiniGifResumeChainState(missingReservation as any), /reservation 1/);

  const alreadyMinted = await exactGifResumeFixture();
  alreadyMinted.state.tokenStatesById[1].total_supply = 1;
  assert.throws(() => assertExactRotiniGifResumeChainState(alreadyMinted as any), /already contains token 1 total_supply/);

  const wrongPng = await exactGifResumeFixture();
  wrongPng.state.tokenStatesById[0].token_artifact.artifact_uri = utf8ToHex("ipfs://wrong");
  assert.throws(() => assertExactRotiniGifResumeChainState(wrongPng as any), /Expected values to be strictly equal/);

  const laterReservation = await exactGifResumeFixture();
  laterReservation.state.reservationsById[2] = { owner: COLLECTOR };
  assert.throws(() => assertExactRotiniGifResumeChainState(laterReservation as any), /reservation 2 must be absent/);

  const expired = await exactGifResumeFixture();
  expired.state.reservationsById[1].expires_at = "2030-01-01T00:09:59.999Z";
  assert.throws(() => assertExactRotiniGifResumeChainState(expired as any), /ten minutes of safe recovery headroom/);
});

test("resume source validates before signer access, continues through the real UI, fails visibly, and leaves manifest creation to finalizer", async () => {
  const source = await readFile(path.join(root, "scripts", "pasta-protocol", "shadownet-rotini-ui-live-resume.ts"), "utf8");
  const runStart = source.indexOf("async function runRotiniUiLiveResumePhase");
  const preflight = source.indexOf("const preflight = await performResumePreflight", runStart);
  const signer = source.indexOf("const env = await signerEnv", runStart);
  const screenshotGate = source.indexOf("assert.equal(screenshotNames.length, 9", runStart);
  const finalization = source.indexOf("checkpoint.finalize(new Date().toISOString())", runStart);
  assert.ok(runStart > 0 && preflight > runStart && signer > preflight, "all immutable/read-only preflight must precede signer access");
  assert.ok(finalization > screenshotGate, "checkpoint finalization must follow screenshots 7 through 9");
  assert.match(source, /initialOperationSequence: zipResume \? 5 : gifResume \? 3 : postSubmitted \? 2 : 1/);
  assert.match(source, /initialReceiptSequence: zipResume \? 16 : gifResume \? 8 : postSubmitted \? 8 : 3/);
  assert.match(source, /assertOperationApplied: appliedOperations\.assertOperationApplied/);
  assert.match(source, /appliedOperations\.bindReceipt\(receipt/);
  assert.match(source, /appliedOperations\.assertSettled\(\)/);
  assert.match(source, /resuming unfinalized reservation 0/);
  assert.match(source, /creation-tools\/rotini\/index\.html/);
  assert.match(source, /notice\.includes\("Iteration mint failed:"\)/);
  assert.match(source, /Promise\.all\(pins\.map/);
  assert.match(source, /Buffer\.from\(fetched\)[\s\S]*Buffer\.from\(pin\.bytes\)/);
  assert.match(source, /completedOperations: 5,[\s\S]*pins: 13,[\s\S]*nonOperationReceipts: 19/);
  assert.match(source, /completedOperations: 6,[\s\S]*pins: 15,[\s\S]*nonOperationReceipts: 23/);
  assert.match(source, /completedOperations: 7,[\s\S]*pins: 15,[\s\S]*nonOperationReceipts: 22/);
  assert.match(source, /completedOperations: 9,[\s\S]*pins: 17,[\s\S]*nonOperationReceipts: 28/);
  assert.match(source, /eventCount: 73,[\s\S]*confirmedOperations: 7,[\s\S]*pinCount: 15,[\s\S]*terminalReceiptSequence: 8/);
  assert.match(source, /pasta-alpha-proof-20260724t053947z/);
  assert.match(source, /ff7a9d6b097ab2ebefa05a1a3a67ef1a19b60a8080bc1bb11c872d7f7ef45c58/);
  assert.match(source, /KT1Ckw2WQ88vSzrVqeC2LnjmdspeFupTSpZt/);
  assert.match(source, /completedOperations: 10,[\s\S]*pins: 20,[\s\S]*nonOperationReceipts: expectedFinalNonOperationReceipts/);
  assert.match(source, /resuming unfinalized reservation 2/);
  assert.match(source, /resuming unfinalized reservation 1/);
  assert.match(source, /installExactZipCheckpointRoutes/);
  assert.match(source, /installExactGifCheckpointRoutes/);
  assert.match(source, /sequence: 7,[\s\S]*sequence: 8,[\s\S]*sequence: 9/);
  assert.match(source, /sequence: 11,[\s\S]*sequence: 12,[\s\S]*sequence: 13/);
  assert.match(source, /route\.request\(\)\.method\(\), "GET"/);
  assert.match(source, /body: Buffer\.from\(pin\.bytes\)/);
  assert.match(source, /"rotini-0\.png"[\s\S]*"rotini-0\.json"[\s\S]*"rotini-1\.gif"[\s\S]*"rotini-1\.json"[\s\S]*"rotini-2\.zip"[\s\S]*"rotini-2-cover\.png"[\s\S]*"rotini-2\.json"/);
  assert.doesNotMatch(source, /pastaprotocol-app-proof@1/);
  assert.doesNotMatch(source, /await writeFile|\.originate\(/);
  assert.match(source, /await assertAbsent\(path\.join\(preflight\.evidence\.appRoot, "manifest\.json"/);
  assert.equal(CONTRACT.startsWith("KT1"), true);

  const reconciliationCapture = source.slice(
    source.indexOf("async function capturePostSubmittedReconciliationStage"),
    source.indexOf("async function openBrowser"),
  );
  assert.match(reconciliationCapture, /capability: "collector reconcile PNG token"/);
  assert.match(reconciliationCapture, /stageName: "PNG token post-confirmation state reconciled"/);
  assert.match(reconciliationCapture, /#mintInfo[\s\S]*"PNG"[\s\S]*#mintInfo[\s\S]*"1 finalized"/);
  assert.match(reconciliationCapture, /#log[\s\S]*connected \$\{input\.collector\} on shadownet/);
  assert.doesNotMatch(reconciliationCapture, /#ppNotice|btnMintIteration|page\.evaluate|MD\.notify/);

  const postSubmittedReadOnlyStage = source.slice(
    source.indexOf("if (postSubmitted) {", source.indexOf("await opened.page.click(\"#btnConnect\")")),
    source.indexOf("for (let projectId = zipResume ? 2 : gifResume ? 1 : postSubmitted ? 1 : 0"),
  );
  assert.match(postSubmittedReadOnlyStage, /#mintProjectId", "0"/);
  assert.match(postSubmittedReadOnlyStage, /#btnLoadProject/);
  assert.match(postSubmittedReadOnlyStage, /capturePostSubmittedReconciliationStage/);
  assert.doesNotMatch(postSubmittedReadOnlyStage, /#btnMintIteration|finalized.*notify/i);
});
