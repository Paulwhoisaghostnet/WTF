import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { CID } from "multiformats/cid";
import { chromium } from "playwright";

import {
  authenticateMacaroniV1SubmittedCheckpointDocuments,
  authenticateMacaroniV1SubmittedCheckpointDocumentsAgainst,
  authenticateMacaroniPrewriteCheckpointDocumentsAgainst,
  authenticateExactMacaroniPrewriteCheckpointDocuments,
  assertExactMacaroniArchiveBytes,
  assertMacaroniCurrentRecoveryAllowed,
  assertMacaroniRecoveryCounterBoundary,
  assertMacaroniRecoveryTargetHistory,
  relevantMempoolOperations,
  MACARONI_CURRENT_RECOVERY_COLLECTOR,
  MACARONI_CURRENT_RECOVERY_CONTRACT,
  MACARONI_CURRENT_RECOVERY_CREATOR,
  MACARONI_CURRENT_RECOVERY_EXECUTE_FLAG,
  MACARONI_CURRENT_RECOVERY_PREFLIGHT_ONLY_FLAG,
  MACARONI_CURRENT_RECOVERY_PREWRITE_CHECKPOINT,
  MACARONI_CURRENT_RECOVERY_PREWRITE_RESUME_FLAG,
  MACARONI_CURRENT_RECOVERY_V1_SUBMITTED_RESUME_FLAG,
  MACARONI_CURRENT_RECOVERY_RUN_ID,
  MACARONI_V1_SUBMITTED_OPERATION_HASH,
  MACARONI_V1_SUBMITTED_CHECKPOINT_PHASES,
  MACARONI_RECOVERED_CONTENT,
  MACARONI_RECOVERED_OPERATIONS,
  readMacaroniCurrentRecoveryProjection,
  waitForMacaroniCollectorConnectHandler,
} from "./shadownet-macaroni-current-recovery";
import { deterministicJsonBytes, root } from "./shadownet-proof-kit";

const output = `/tmp/${MACARONI_CURRENT_RECOVERY_RUN_ID}`;
const MACARONI_FIXTURE_V2_REVEAL_OPERATION_HASH =
  "opL6Z2vJV1sFqozrZnhziL8T9uh6PfZjmiHNNpVe5eum7Kg2L2V";
const MACARONI_FIXTURE_V2_REVEAL_COUNTER = 23_833_861;

function fixtureSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixtureBytes(value: unknown): Buffer {
  return Buffer.from(deterministicJsonBytes(value));
}

function sanitizedCheckpointPayload(eventIndex: number): Record<string, unknown> {
  if (eventIndex === 7) {
    return {
      expectedCounter: MACARONI_FIXTURE_V2_REVEAL_COUNTER,
      operationHash: MACARONI_FIXTURE_V2_REVEAL_OPERATION_HASH,
    };
  }
  if (eventIndex === 8) {
    return {
      counter: MACARONI_FIXTURE_V2_REVEAL_COUNTER,
      operationHash: MACARONI_FIXTURE_V2_REVEAL_OPERATION_HASH,
    };
  }
  if (eventIndex === 10) {
    return {
      operationHash: MACARONI_FIXTURE_V2_REVEAL_OPERATION_HASH,
      revealCounter: MACARONI_FIXTURE_V2_REVEAL_COUNTER,
    };
  }
  if (eventIndex === 11) {
    return {
      expectedOperations: ["origination", "add_tokens", "set_stages", "mint"],
      recoveredV2MutationReplayPermitted: false,
    };
  }
  if (eventIndex === 20) {
    return {
      actor: "creator",
      entrypoints: [],
      operationSequence: 1,
      session: "creator-bootstrap",
      sha256: "ec4bc00a572715fc8bcff1b7fe6892f754de243fda4e190d2a5a654f46fac1f0",
    };
  }
  if (eventIndex === 21) {
    return {
      actor: "creator",
      entrypoints: [],
      operationHash: MACARONI_V1_SUBMITTED_OPERATION_HASH,
      operationSequence: 1,
      session: "creator-bootstrap",
    };
  }
  return { fixtureEventIndex: eventIndex };
}

function sanitizedMacaroniCheckpointFixture() {
  const createdAt = "2026-08-08T00:00:00.000Z";
  const intentSeed = {
    schema: "pastaprotocol-macaroni-current-recovery-intent@1",
    status: "IMMUTABLE",
    createdAt,
    runId: MACARONI_CURRENT_RECOVERY_RUN_ID,
  };
  const checkpointId = fixtureSha256(fixtureBytes(intentSeed));
  const intentBytes = fixtureBytes({ ...intentSeed, checkpointId });
  let previousSha256 = fixtureSha256(intentBytes);
  const eventBytes = MACARONI_V1_SUBMITTED_CHECKPOINT_PHASES.map((phase, index) => {
    const eventIndex = index + 1;
    const eventSeed = {
      schema: "pastaprotocol-macaroni-current-recovery-event@1",
      checkpointId,
      eventIndex,
      phase,
      timestampUtc: `2026-08-08T00:00:${String(eventIndex).padStart(2, "0")}.000Z`,
      previousSha256,
      payload: sanitizedCheckpointPayload(eventIndex),
    };
    const bytes = fixtureBytes({
      ...eventSeed,
      eventSha256: fixtureSha256(fixtureBytes(eventSeed)),
    });
    previousSha256 = fixtureSha256(bytes);
    return bytes;
  });
  return {
    intentBytes,
    eventBytes,
    identity: {
      checkpointId,
      createdAt,
      intentSha256: fixtureSha256(intentBytes),
      recoveredPrefixEventSha256: fixtureSha256(eventBytes[0]),
      signersAuthenticatedEventSha256: fixtureSha256(eventBytes[1]),
      lastEventIndex: 2,
      v1SubmittedEventFileSha256: fixtureSha256(eventBytes[eventBytes.length - 1]),
    },
  };
}

test("Macaroni recovery compares authenticated archive content by bytes across Buffer transports", () => {
  const bytes = Buffer.from("exact Macaroni site bytes", "utf8");
  assert.doesNotThrow(() => assertExactMacaroniArchiveBytes(
    bytes,
    new Uint8Array(bytes),
    "css/theme.css",
  ));
  assert.throws(
    () => assertExactMacaroniArchiveBytes(
      bytes,
      new Uint8Array(Buffer.from("substituted Macaroni site bytes", "utf8")),
      "css/theme.css",
    ),
    /differs from authenticated ZIP/,
  );
});

test("Macaroni initial projection retries a transient read without invoking a mutation", async () => {
  let contractReads = 0;
  let mutations = 0;
  const emptyBigMap = { get: async () => undefined };
  const tezos = {
    contract: {
      at: async () => {
        contractReads += 1;
        if (contractReads === 1) {
          throw Object.assign(new Error("Shadownet projection returned HTTP 429"), { status: 429 });
        }
        return {
          methodsObject: new Proxy({}, {
            get: () => () => {
              mutations += 1;
              throw new Error("mutation must remain unreachable");
            },
          }),
          storage: async () => ({
            administrator: MACARONI_CURRENT_RECOVERY_CREATOR,
            treasury: MACARONI_CURRENT_RECOVERY_CREATOR,
            supply: 2,
            minted: 1,
            token_count: 1,
            locked: false,
            paused: false,
            delayed_reveal: true,
            placeholder_count: 2,
            reveal_cursor: 0,
            reveal_tail: 1,
            reveal_delay: 0,
            unrevealed_since: null,
            revealed: 0,
            minter_royalty_config: {},
            metadata: emptyBigMap,
            stages: emptyBigMap,
            pending_tokens: emptyBigMap,
            token_metadata: emptyBigMap,
            token_supply: emptyBigMap,
            token_minted: emptyBigMap,
            placeholder_pool: emptyBigMap,
            token_placeholder: emptyBigMap,
            reveal_queue: emptyBigMap,
            ledger: emptyBigMap,
            stage_minted: emptyBigMap,
          }),
        };
      },
    },
  };

  const projection = await readMacaroniCurrentRecoveryProjection(
    tezos as never,
    MACARONI_CURRENT_RECOVERY_CONTRACT,
    MACARONI_CURRENT_RECOVERY_COLLECTOR,
  );
  assert.equal(contractReads, 2);
  assert.equal(mutations, 0);
  assert.equal(projection.minted, 1);
  assert.equal(projection.revealed, 0);
});

function origination() {
  const expected = MACARONI_RECOVERED_OPERATIONS[0];
  return {
    hash: expected.hash,
    counter: expected.counter,
    level: expected.level,
    status: "applied",
    sender: { address: MACARONI_CURRENT_RECOVERY_CREATOR },
    originatedContract: {
      address: MACARONI_CURRENT_RECOVERY_CONTRACT,
      kind: "asset",
      tzips: ["fa2"],
      codeHash: -2085531756,
      typeHash: -1198466749,
    },
  };
}

function prefixTransactions() {
  return MACARONI_RECOVERED_OPERATIONS.slice(1).map((expected) => ({
    hash: expected.hash,
    counter: expected.counter,
    level: expected.level,
    status: "applied",
    sender: { address: expected.sender },
    target: { address: MACARONI_CURRENT_RECOVERY_CONTRACT },
    amount: expected.entrypoint === "mint" ? 1_000 : 0,
    parameter: {
      entrypoint: expected.entrypoint,
      value: expected.entrypoint === "add_tokens_v2"
        ? [{
            quantity: "2",
            token_id: "0",
            token_info: {
              "": "697066733a2f2f6261666b726569653234696537363564697474333468796d717832667664776934796e737176787a3771616d3335376874766f7733686264657375",
            },
          }]
        : expected.entrypoint === "set_stages"
          ? {
              "0": {
                price: "1000",
                start: "2026-07-24T13:12:00Z",
                use_allowlist: false,
                max_per_wallet: "1",
              },
            }
          : "1",
    },
  }));
}

function internalTreasuryTransfer() {
  const mint = MACARONI_RECOVERED_OPERATIONS[3];
  return {
    hash: mint.hash,
    counter: mint.counter,
    level: mint.level,
    status: "applied",
    nonce: 1,
    initiator: { address: MACARONI_CURRENT_RECOVERY_COLLECTOR },
    sender: { address: MACARONI_CURRENT_RECOVERY_CONTRACT },
    target: { address: MACARONI_CURRENT_RECOVERY_CREATOR },
    amount: 1_000,
  };
}

test("Macaroni recovery guard runs before filesystem, network, or signer work", () => {
  assert.throws(
    () => assertMacaroniCurrentRecoveryAllowed({}),
    new RegExp(MACARONI_CURRENT_RECOVERY_EXECUTE_FLAG),
  );
  assert.throws(
    () => assertMacaroniCurrentRecoveryAllowed({
      [MACARONI_CURRENT_RECOVERY_EXECUTE_FLAG]: "1",
      [MACARONI_CURRENT_RECOVERY_PREFLIGHT_ONLY_FLAG]: "1",
      PASTA_PROOF_RUN_DIR: output,
    }),
    /mutually exclusive/,
  );
  assert.throws(
    () => assertMacaroniCurrentRecoveryAllowed({
      [MACARONI_CURRENT_RECOVERY_EXECUTE_FLAG]: "1",
      PASTA_PROOF_RUN_DIR: output,
      TEZOS_NETWORK: "mainnet",
    }),
    /Shadownet/,
  );
  assert.throws(
    () => assertMacaroniCurrentRecoveryAllowed({
      [MACARONI_CURRENT_RECOVERY_EXECUTE_FLAG]: "1",
      PASTA_PROOF_RUN_DIR: "/tmp/not-the-bound-run",
      TEZOS_NETWORK: "shadownet",
    }),
    /exact interrupted run/,
  );
  assert.equal(
    assertMacaroniCurrentRecoveryAllowed({
      [MACARONI_CURRENT_RECOVERY_PREFLIGHT_ONLY_FLAG]: "1",
      PASTA_PROOF_RUN_DIR: output,
      TEZOS_NETWORK: "shadownet",
    }),
    output,
  );
  assert.throws(
    () => assertMacaroniCurrentRecoveryAllowed({
      [MACARONI_CURRENT_RECOVERY_EXECUTE_FLAG]: "1",
      [MACARONI_CURRENT_RECOVERY_PREWRITE_RESUME_FLAG]: "true",
      PASTA_PROOF_RUN_DIR: output,
    }),
    /must be exactly 1 or unset/,
  );
  assert.throws(
    () => assertMacaroniCurrentRecoveryAllowed({
      [MACARONI_CURRENT_RECOVERY_PREWRITE_RESUME_FLAG]: "1",
      PASTA_PROOF_RUN_DIR: output,
    }),
    /explicit execute or preflight-only flag/,
  );
  assert.equal(
    assertMacaroniCurrentRecoveryAllowed({
      [MACARONI_CURRENT_RECOVERY_EXECUTE_FLAG]: "1",
      [MACARONI_CURRENT_RECOVERY_PREWRITE_RESUME_FLAG]: "1",
      PASTA_PROOF_RUN_DIR: output,
      TEZOS_NETWORK: "shadownet",
    }),
    output,
  );
  assert.equal(
    assertMacaroniCurrentRecoveryAllowed({
      [MACARONI_CURRENT_RECOVERY_PREFLIGHT_ONLY_FLAG]: "1",
      [MACARONI_CURRENT_RECOVERY_PREWRITE_RESUME_FLAG]: "1",
      PASTA_PROOF_RUN_DIR: output,
      TEZOS_NETWORK: "shadownet",
    }),
    output,
  );
  assert.throws(
    () => assertMacaroniCurrentRecoveryAllowed({
      [MACARONI_CURRENT_RECOVERY_EXECUTE_FLAG]: "1",
      [MACARONI_CURRENT_RECOVERY_V1_SUBMITTED_RESUME_FLAG]: "true",
      PASTA_PROOF_RUN_DIR: output,
    }),
    /must be exactly 1 or unset/,
  );
  assert.throws(
    () => assertMacaroniCurrentRecoveryAllowed({
      [MACARONI_CURRENT_RECOVERY_EXECUTE_FLAG]: "1",
      [MACARONI_CURRENT_RECOVERY_PREWRITE_RESUME_FLAG]: "1",
      [MACARONI_CURRENT_RECOVERY_V1_SUBMITTED_RESUME_FLAG]: "1",
      PASTA_PROOF_RUN_DIR: output,
    }),
    /mutually exclusive/,
  );
  assert.equal(
    assertMacaroniCurrentRecoveryAllowed({
      [MACARONI_CURRENT_RECOVERY_PREFLIGHT_ONLY_FLAG]: "1",
      [MACARONI_CURRENT_RECOVERY_V1_SUBMITTED_RESUME_FLAG]: "1",
      PASTA_PROOF_RUN_DIR: output,
      TEZOS_NETWORK: "shadownet",
    }),
    output,
  );
});

test("Macaroni restart authenticates only the exact two-event pre-write checkpoint", () => {
  const fixture = sanitizedMacaroniCheckpointFixture();
  const [recoveredPrefixEventBytes, signersAuthenticatedEventBytes] = fixture.eventBytes;
  const authenticated = authenticateMacaroniPrewriteCheckpointDocumentsAgainst({
    intentBytes: fixture.intentBytes,
    recoveredPrefixEventBytes,
    signersAuthenticatedEventBytes,
  }, fixture.identity);
  assert.equal(authenticated.intent.checkpointId, fixture.identity.checkpointId);
  assert.equal(authenticated.recoveredPrefixEvent.eventIndex, 1);
  assert.equal(authenticated.signersAuthenticatedEvent.eventIndex, 2);
  assert.equal(
    authenticated.lastEventFileSha256,
    fixture.identity.signersAuthenticatedEventSha256,
  );
  assert.notEqual(fixture.identity.checkpointId, MACARONI_CURRENT_RECOVERY_PREWRITE_CHECKPOINT.checkpointId);
  assert.throws(
    () => authenticateExactMacaroniPrewriteCheckpointDocuments({
      intentBytes: fixture.intentBytes,
      recoveredPrefixEventBytes,
      signersAuthenticatedEventBytes,
    }),
    /intent file hash drift/,
  );

  const drifted = Buffer.from(signersAuthenticatedEventBytes);
  drifted[drifted.length - 2] = drifted[drifted.length - 2] === 0x7d ? 0x20 : 0x7d;
  assert.throws(
    () => authenticateMacaroniPrewriteCheckpointDocumentsAgainst({
      intentBytes: fixture.intentBytes,
      recoveredPrefixEventBytes,
      signersAuthenticatedEventBytes: drifted,
    }, fixture.identity),
    /signer-authentication event file hash drift/,
  );
});

test("Macaroni V1-submitted restart authenticates the complete 21-event chain", () => {
  const fixture = sanitizedMacaroniCheckpointFixture();
  const authenticated = authenticateMacaroniV1SubmittedCheckpointDocumentsAgainst({
    intentBytes: fixture.intentBytes,
    eventBytes: fixture.eventBytes,
  }, fixture.identity);
  assert.equal(authenticated.events.length, 21);
  assert.equal(authenticated.events[6].payload.operationHash, MACARONI_FIXTURE_V2_REVEAL_OPERATION_HASH);
  assert.equal(authenticated.events[20].payload.operationHash, "ons68f9ucj5uFfZKdmLdgA93c2RRmsyBkLLwGFBXppahbqyGQoV");
  assert.equal(authenticated.lastEventFileSha256, fixture.identity.v1SubmittedEventFileSha256);
  assert.throws(
    () => authenticateMacaroniV1SubmittedCheckpointDocuments({
      intentBytes: fixture.intentBytes,
      eventBytes: fixture.eventBytes,
    }),
    /intent file hash drift/,
  );

  const drifted = fixture.eventBytes.map((bytes) => Buffer.from(bytes));
  drifted[20][drifted[20].length - 2] = drifted[20][drifted[20].length - 2] === 0x7d ? 0x20 : 0x7d;
  assert.throws(
    () => authenticateMacaroniV1SubmittedCheckpointDocumentsAgainst({
      intentBytes: fixture.intentBytes,
      eventBytes: drifted,
    }, fixture.identity),
    /event 21|event prefix hash drift|canonical JSON bytes|JSON/,
  );
});

test("Macaroni V1-submitted resume proves the exact origination before later mutations", async () => {
  const source = await readFile(
    path.join(root, "scripts", "pasta-protocol", "shadownet-macaroni-current-recovery.ts"),
    "utf8",
  );
  const resumeLane = source.indexOf("resumeOrigination: {");
  const appliedBoundary = source.indexOf('await checkpoint.append("V1_APPLIED"', resumeLane);
  const laterMutationJournal = source.indexOf("await appendV1LaneCheckpointEvent(checkpoint, event)", appliedBoundary);
  assert.ok(resumeLane > 0 && appliedBoundary > resumeLane && laterMutationJournal > appliedBoundary);
  assert.match(source, /submitted manager group must contain exactly one operation/);
  assert.match(source, /submitted target history[\s\S]*post-origination contract mutation/);
  assert.match(source, /recoveredOriginationReplayed: false/);
});

test("Macaroni collector restart waits for the connect handler's owned-token terminal state", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`<!doctype html>
    <button id="btnConnect" aria-busy="false" aria-label="Connect wallet">Connect wallet</button>
    <div id="supplyText">1 / 2 minted</div>
    <div id="walletBalance"></div>
    <div id="walletLimitStatus"></div>
    <div id="ownedMintStatus"></div>
    <div id="mintStatus"></div>
    <section id="revealSection" style="display:none"><div id="revealGrid"></div></section>`);
  await page.addScriptTag({ content: `(() => {
    const collector = ${JSON.stringify(MACARONI_CURRENT_RECOVERY_COLLECTOR)};
    let account = "";
    let ownedMintLoadSequence = 0;
    window.__loadCalls = 0;
    window.MD = { getAccount: () => account };
    window.loadOwnedMints = async () => {
      const sequence = ++ownedMintLoadSequence;
      window.__loadCalls += 1;
      document.getElementById("ownedMintStatus").textContent = "Checking this wallet's drop tokens...";
      await new Promise((resolve) => setTimeout(resolve, 40));
      if (sequence !== ownedMintLoadSequence) return;
      document.getElementById("ownedMintStatus").textContent = "This wallet minted 1 token and still owns 1.";
      document.getElementById("revealSection").style.display = "";
      document.getElementById("revealGrid").innerHTML =
        '<article data-token-id="0" class="token-card sealed">token #1 · unrevealed</article>';
    };
    document.getElementById("btnConnect").addEventListener("click", async () => {
      const button = document.getElementById("btnConnect");
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      account = collector;
      document.getElementById("walletBalance").textContent = "Wallet balance: 7.0 tez · connected";
      document.getElementById("walletLimitStatus").textContent = "you used this stage's wallet limit (1/1)";
      await window.loadOwnedMints();
      button.textContent = "tz1MgZr…DBjej";
      button.setAttribute("aria-label", "Connected wallet " + collector);
      button.setAttribute("aria-busy", "false");
    });
  })();` });

  await page.click("#btnConnect");
  const snapshot = await waitForMacaroniCollectorConnectHandler({
    page,
    monitor: { list: () => [] },
    expectedAddress: MACARONI_CURRENT_RECOVERY_COLLECTOR,
  });
  assert.equal(await page.evaluate(() => (window as any).__loadCalls), 1);
  assert.equal(snapshot.tokenCards.length, 1);
  assert.match(snapshot.tokenCards[0].className, /sealed/);
  assert.match(snapshot.ownedMintStatus, /minted 1 token/);
});

test("Macaroni collector restart reports exact DOM and monitor state on terminal failure", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`<!doctype html>
    <button id="btnConnect" disabled aria-busy="false" aria-label="Connect wallet">Connect wallet</button>
    <div id="supplyText">1 / 2 minted</div>
    <div id="walletBalance">Could not refresh wallet balance: offline</div>
    <div id="walletLimitStatus">1/1</div>
    <div id="ownedMintStatus">Could not load wallet drop tokens: gateway failed</div>
    <div id="mintStatus">wallet connect cancelled or failed: gateway failed</div>
    <section id="revealSection" style="display:none"><div id="revealGrid"></div></section>`);
  await assert.rejects(
    () => waitForMacaroniCollectorConnectHandler({
      page,
      monitor: { list: () => [{ kind: "console.error", message: "gateway failed" }] },
      expectedAddress: MACARONI_CURRENT_RECOVERY_COLLECTOR,
    }),
    (error: any) => {
      assert.match(error.message, /terminated without the exact recovered wallet state/);
      assert.match(error.message, /Could not load wallet drop tokens: gateway failed/);
      assert.match(error.message, /console\.error/);
      assert.match(error.message, /tokenCards/);
      return true;
    },
  );
});

test("Macaroni recovery binds the exact raw-SHA256 content CIDs", () => {
  assert.equal(MACARONI_CURRENT_RECOVERY_CONTRACT, "KT1WVXyTLXniTtPaH7AfRsbGVKoG6YLXrBxP");
  assert.equal(MACARONI_RECOVERED_CONTENT.length, 6);
  for (const content of MACARONI_RECOVERED_CONTENT) {
    const cid = CID.parse(content.cid);
    assert.equal(cid.version, 1);
    assert.equal(cid.code, 0x55);
    assert.equal(cid.multihash.code, 0x12);
    assert.equal(Buffer.from(cid.multihash.digest).toString("hex"), content.sha256);
  }
});

test("target history accepts only the exact pre-reveal mutation tree", () => {
  const boundary = {
    originations: [origination()],
    transactions: prefixTransactions(),
    internalTransactions: [internalTreasuryTransfer()],
  };
  assert.doesNotThrow(() => assertMacaroniRecoveryTargetHistory(boundary, { phase: "pre-reveal" }));

  assert.throws(
    () => assertMacaroniRecoveryTargetHistory({
      ...boundary,
      transactions: [...boundary.transactions, {
        ...boundary.transactions[2],
        hash: "opAdditionalMutation1111111111111111111111111111111111111",
        counter: Number(boundary.transactions[2].counter) + 1,
        parameter: { entrypoint: "reveal", value: "1" },
      }],
    }, { phase: "pre-reveal" }),
    /exactly three/,
  );
  assert.throws(
    () => assertMacaroniRecoveryTargetHistory({
      ...boundary,
      transactions: boundary.transactions.map((row, index) =>
        index === 2 ? { ...row, sender: { address: MACARONI_CURRENT_RECOVERY_CREATOR } } : row),
    }, { phase: "pre-reveal" }),
    /sender/,
  );
  assert.throws(
    () => assertMacaroniRecoveryTargetHistory({
      ...boundary,
      internalTransactions: [],
    }, { phase: "pre-reveal" }),
    /internal treasury transfer/,
  );
});

test("post-reveal history requires the submitted hash and immediate pre-submit counter plus one", () => {
  const boundary = {
    originations: [origination()],
    transactions: prefixTransactions(),
    internalTransactions: [internalTreasuryTransfer()],
  };
  const preSubmitCollectorCounter = 23_900_000;
  const revealOperationHash = "ooJqjc7Zp7h2pP7N8tQF39byB2bgqH6SPrPyS4U26M6u5xC5wqK";
  const reveal = {
    hash: revealOperationHash,
    counter: preSubmitCollectorCounter + 1,
    level: 4_400_000,
    status: "applied",
    sender: { address: MACARONI_CURRENT_RECOVERY_COLLECTOR },
    target: { address: MACARONI_CURRENT_RECOVERY_CONTRACT },
    amount: 0,
    parameter: { entrypoint: "reveal", value: "1" },
  };
  assert.doesNotThrow(() => assertMacaroniRecoveryTargetHistory({
    ...boundary,
    transactions: [...boundary.transactions, reveal],
  }, {
    phase: "post-reveal",
    revealOperationHash,
    revealCounter: preSubmitCollectorCounter + 1,
  }));
  assert.throws(
    () => assertMacaroniRecoveryTargetHistory({
      ...boundary,
      transactions: [...boundary.transactions, { ...reveal, counter: preSubmitCollectorCounter + 2 }],
    }, {
      phase: "post-reveal",
      revealOperationHash,
      revealCounter: preSubmitCollectorCounter + 1,
    }),
    /reveal counter/,
  );
});

test("unrelated confirmed counter advances are tolerated but RPC disagreement and wrong reveal counters fail", () => {
  const current = { creator: 23_900_100, collector: 23_900_200 };
  assert.deepEqual(assertMacaroniRecoveryCounterBoundary(current, { ...current }), current);
  assert.throws(
    () => assertMacaroniRecoveryCounterBoundary(current, { ...current, collector: current.collector + 1 }),
    /counter disagreement/,
  );
  assert.throws(
    () => assertMacaroniRecoveryCounterBoundary(
      { creator: 23_831_583, collector: 23_833_860 },
      { creator: 23_831_583, collector: 23_833_860 },
    ),
    /creator counter.*floor/,
  );
});

test("active Macaroni mempool guard normalizes tuple and object-map lanes", () => {
  const creatorOperation = {
    contents: [{ source: MACARONI_CURRENT_RECOVERY_CREATOR }],
  };
  const targetOperation = {
    contents: [{ source: "tz1-unrelated", destination: MACARONI_CURRENT_RECOVERY_CONTRACT }],
  };
  const ignoredRefusedOperation = {
    contents: [{ source: MACARONI_CURRENT_RECOVERY_COLLECTOR }],
  };
  assert.deepEqual(
    relevantMempoolOperations({
      applied: [],
      validated: [],
      branch_delayed: [["opTuple", creatorOperation]],
      unprocessed: { opMapped: targetOperation },
      refused: [["opRefused", ignoredRefusedOperation]],
      branch_refused: [],
      outdated: [],
    }),
    [creatorOperation, targetOperation],
  );
  assert.deepEqual(relevantMempoolOperations({
    applied: [{ contents: [{ source: "tz1-unrelated" }] }],
    validated: [],
    branch_delayed: [],
    unprocessed: {},
  }), []);
});

test("one-shot source checkpoints before signer loading and permits no recovered write replay", async () => {
  const source = await readFile(
    path.join(root, "scripts", "pasta-protocol", "shadownet-macaroni-current-recovery.ts"),
    "utf8",
  );
  const preflight = source.indexOf("validateMacaroniRecoveryPreflight");
  const checkpoint = source.indexOf("MacaroniRecoveryCheckpoint.create");
  const signer = source.indexOf("await loadSignerPair(");
  assert.ok(preflight > 0 && checkpoint > preflight && signer > checkpoint);
  assert.match(source, /allowedEntrypoints: new Set\(\["reveal"\]\)/);
  assert.match(source, /initialOperationSequence: 1/);
  assert.match(source, /beforeOperationSubmit/);
  assert.match(source, /onOperationSubmitted/);
  assert.match(source, /APPLIED/);
  assert.match(source, /routeRecoveredIpfsBytes/);
  assert.match(source, /ipfs\.fileship\.xyz/);
  assert.match(source, /dweb\.link\/ipfs/);
  assert.match(source, /walletLimitReadOnlySimulationRejected/);
  assert.match(source, /observer:\s*\{\s*onEvent:/);
  assert.match(source, /CONTINUATION_APPLIED_AWAITING_PACKAGE/);
  assert.doesNotMatch(source, /checkpoint\.terminal/);
  assert.doesNotMatch(source, /status:\s*"COMPLETED"/);
  assert.doesNotMatch(source, /methodsObject\\.mint\\(1\\)\\.send/);
  assert.doesNotMatch(source, /pinIpfsProof(?:Json|Bytes)/);
});

test("package exposes a check command and an explicitly flagged execution command", async () => {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(
    packageJson.scripts["pasta:shadownet:macaroni:ui-live"],
    "tsx scripts/pasta-protocol/shadownet-macaroni-ui-live.ts",
  );
  assert.equal(
    packageJson.scripts["pasta:shadownet:macaroni:ui-live:check"],
    "tsx --test scripts/pasta-protocol/shadownet-macaroni-ui-live.test.ts",
  );
  assert.equal(
    packageJson.scripts["pasta:shadownet:macaroni:current-recovery:check"],
    "tsx --test scripts/pasta-protocol/shadownet-macaroni-current-recovery.test.ts",
  );
  assert.equal(
    packageJson.scripts["pasta:shadownet:macaroni:current-recovery"],
    "tsx scripts/pasta-protocol/shadownet-macaroni-current-recovery.ts",
  );
});

test("ordinary Macaroni red-light checks simulate without submitting a forbidden mint", async () => {
  const source = await readFile(
    path.join(root, "scripts", "pasta-protocol", "shadownet-macaroni-ui-live.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /methodsObject\.mint\(1\)\.send/);
  assert.match(source, /tezos\.estimate\.transfer\(transferParams\)/);
  assert.match(source, /walletLimitReadOnlySimulationRejected: true/);
  assert.match(source, /soldOutReadOnlySimulationRejected: true/);
  assert.doesNotMatch(source, /operation\.contract\(\)/);
  assert.match(source, /resolveAppliedMacaroniOrigination/);
  assert.match(source, /signerAddress: creatorAddress/);
});
