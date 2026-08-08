import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  selectRavioliDeadlineRevealRootOperation,
  type RavioliDeadlineRevealRootOperationExpectation,
} from "./shadownet-ravioli-deadline-reveal";
import {
  evaluateRavioliSettlementDeadline,
} from "./shadownet-ravioli-deadline-settlement";
import { root } from "./shadownet-proof-kit";

const ROUTER = "KT1L316ZdN8BEmDLcjNEtgXi8hMQ1Qz4aQkU";
const CONTROLLER = "KT1RCkFPpuUTQyLRP2Ux4KKPgTXwFhwnHVLn";
const CREATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
const ROOT_OPERATION_HASH = `o${"A".repeat(50)}`;
const OTHER_OPERATION_HASH = `o${"B".repeat(50)}`;
const RUN_ID = "pasta-alpha-proof-20260724t015728z";
const EXPIRED_DEADLINE = "2026-07-24T04:23:00.000Z";

const EXPECTED_ROOT: RavioliDeadlineRevealRootOperationExpectation = Object.freeze({
  operationHash: ROOT_OPERATION_HASH,
  signerAddress: CREATOR,
  contractAddress: ROUTER,
  entrypoint: "set_pack_contents",
});

function rootOperation(overrides: Record<string, unknown> = {}): Record<string, any> {
  return {
    hash: ROOT_OPERATION_HASH,
    status: "applied",
    sender: { address: CREATOR },
    target: { address: ROUTER },
    parameter: {
      entrypoint: "set_pack_contents",
      value: {
        token_id: 1,
        contents_uri: "697066733a2f2f6261666b72656974657374",
        salt: "ab".repeat(32),
        offset: 1,
      },
    },
    counter: 23831551,
    level: 4323000,
    timestamp: "2026-07-24T03:58:00Z",
    ...overrides,
  };
}

test("deadline reveal reconciliation selects only the exact applied root transaction", () => {
  const root = rootOperation();
  const rows = [
    {
      ...rootOperation(),
      sender: { address: ROUTER },
      target: { address: CONTROLLER },
      parameter: { entrypoint: "set_pack_contents", value: {} },
    },
    rootOperation({ hash: OTHER_OPERATION_HASH }),
    root,
  ];

  assert.equal(
    selectRavioliDeadlineRevealRootOperation(rows, EXPECTED_ROOT),
    root,
  );
});

test("deadline reveal reconciliation rejects missing, non-applied, wrong-hash, and ambiguous roots", async (t) => {
  const rejected = [
    {
      name: "missing root",
      rows: [
        {
          ...rootOperation(),
          sender: { address: ROUTER },
          target: { address: CONTROLLER },
        },
      ],
      count: 0,
    },
    {
      name: "non-applied root",
      rows: [rootOperation({ status: "failed" })],
      count: 0,
    },
    {
      name: "wrong operation hash",
      rows: [rootOperation({ hash: OTHER_OPERATION_HASH })],
      count: 0,
    },
    {
      name: "wrong signer",
      rows: [rootOperation({ sender: { address: ROUTER } })],
      count: 0,
    },
    {
      name: "wrong target",
      rows: [rootOperation({ target: { address: CONTROLLER } })],
      count: 0,
    },
    {
      name: "wrong entrypoint",
      rows: [rootOperation({ parameter: { entrypoint: "register_pack", value: {} } })],
      count: 0,
    },
    {
      name: "ambiguous duplicate roots",
      rows: [rootOperation(), rootOperation()],
      count: 2,
    },
  ] as const;

  for (const fixture of rejected) {
    await t.test(fixture.name, () => {
      assert.throws(
        () => selectRavioliDeadlineRevealRootOperation(fixture.rows, EXPECTED_ROOT),
        new RegExp(`requires exactly one root operation; found ${fixture.count}`),
      );
    });
  }

  assert.throws(
    () => selectRavioliDeadlineRevealRootOperation({}, EXPECTED_ROOT),
    /rows must be an array/,
  );
});

test("settlement deadline is open only strictly before the immutable cutoff", () => {
  const deadlineMs = Date.parse(EXPIRED_DEADLINE);
  assert.deepEqual(
    evaluateRavioliSettlementDeadline(EXPIRED_DEADLINE, deadlineMs - 1),
    {
      status: "OPEN",
      checkedAt: "2026-07-24T04:22:59.999Z",
      openDeadline: EXPIRED_DEADLINE,
      remainingMs: 1,
    },
  );
  assert.deepEqual(
    evaluateRavioliSettlementDeadline(EXPIRED_DEADLINE, deadlineMs),
    {
      status: "EXPIRED",
      checkedAt: EXPIRED_DEADLINE,
      openDeadline: EXPIRED_DEADLINE,
      remainingMs: 0,
    },
  );
  assert.deepEqual(
    evaluateRavioliSettlementDeadline(EXPIRED_DEADLINE, deadlineMs + 1),
    {
      status: "EXPIRED",
      checkedAt: "2026-07-24T04:23:00.001Z",
      openDeadline: EXPIRED_DEADLINE,
      remainingMs: -1,
    },
  );
  assert.throws(
    () => evaluateRavioliSettlementDeadline("not-a-deadline", deadlineMs),
    /open deadline is invalid/,
  );
  assert.throws(
    () => evaluateRavioliSettlementDeadline(EXPIRED_DEADLINE, Number.NaN),
    /clock is invalid/,
  );
});

type CliResult = Readonly<{
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}>;

async function runExpiredSettlement(runRoot: string): Promise<CliResult> {
  const scriptPath = path.join(
    root,
    "scripts",
    "pasta-protocol",
    "shadownet-ravioli-deadline-settlement.ts",
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", scriptPath],
      {
        cwd: root,
        env: {
          ...process.env,
          PASTA_SHADOWNET_E2E_EXECUTE: "1",
          PASTA_RAVIOLI_DEADLINE_SETTLEMENT_EXECUTE: "1",
          PASTA_RAVIOLI_DEADLINE_SETTLEMENT_RUN_ROOT: runRoot,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("expired Ravioli settlement did not fail closed within 15 seconds"));
    }, 15_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      resolve({ exitCode, signal, stdout, stderr });
    });
  });
}

test("expired settlement emits one append-only BLOCKED_BEFORE_WRITE artifact and never enters mutation setup", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "ravioli-expired-settlement-"));
  const runRoot = path.join(temporaryRoot, RUN_ID);
  const openKitRoot = path.join(runRoot, "ravioli", "artifacts", "open-kits");
  const evidenceRoot = path.join(runRoot, "ravioli", "artifacts", "deadline-settlement");
  const blockedPath = path.join(evidenceRoot, "blocked-before-write.json");
  try {
    await mkdir(openKitRoot, { recursive: true });
    await writeFile(
      path.join(openKitRoot, "ravioli-open-kit-1.json"),
      JSON.stringify({
        contract: ROUTER,
        tokenId: 1,
        editionPolicy: { openDeadline: EXPIRED_DEADLINE },
      }),
      { mode: 0o600 },
    );

    const first = await runExpiredSettlement(runRoot);
    assert.equal(first.signal, null);
    assert.equal(first.exitCode, 1);
    assert.match(first.stderr, /settlement refused before write/);
    const firstBytes = await readFile(blockedPath);
    const blocked = JSON.parse(firstBytes.toString("utf8"));
    assert.equal(blocked.schema, "pastaprotocol-ravioli-deadline-settlement-blocked@1");
    assert.equal(blocked.status, "BLOCKED_BEFORE_WRITE");
    assert.equal(blocked.classification, "UI-LIVE-IMMUTABLE-DEADLINE-EXPIRED");
    assert.equal(blocked.runId, RUN_ID);
    assert.equal(blocked.router, ROUTER);
    assert.equal(blocked.controller, CONTROLLER);
    assert.equal(blocked.tokenId, 1);
    assert.equal(blocked.deadlinePreflight.status, "EXPIRED");
    assert.equal(blocked.deadlinePreflight.openDeadline, EXPIRED_DEADLINE);
    assert.deepEqual(blocked.mutationBoundary, {
      signerConfigurationLoaded: false,
      actorCountersRead: false,
      browserBridgeStarted: false,
      holderOperationsPrepared: 0,
      holderOperationsSubmitted: 0,
      holderOperationsApplied: 0,
    });
    assert.deepEqual(await readdir(evidenceRoot), ["blocked-before-write.json"]);

    const second = await runExpiredSettlement(runRoot);
    assert.equal(second.signal, null);
    assert.equal(second.exitCode, 1);
    assert.match(second.stderr, /settlement refused before write/);
    assert.deepEqual(
      await readFile(blockedPath),
      firstBytes,
      "expired settlement must not overwrite its first immutable block record",
    );
    assert.deepEqual(await readdir(evidenceRoot), ["blocked-before-write.json"]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
