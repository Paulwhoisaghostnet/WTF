import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { chromium, type Browser, type Page } from "playwright";

import {
  captureRavioliPrivateRecovery,
  countRavioliPrivateRecoveryRecords,
  RAVIOLI_PRIVATE_RECOVERY_MAX_RECORD_BYTES,
  validateRavioliPrivateRecoveryOutputDirectory,
} from "./shadownet-ravioli-private-recovery";

const CREATOR = "tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM";
const ROUTER = "KT1N6ZEgWS4HyJte7EtSuwHtrnNSVThaNhb7";
const GNOCCHI = "KT1ShvgCuQZAKWTUFeCQZphNcn1y6Bi7LyYi";
const DRAFT_ID = "0123456789abcdef0123456789abcdef";
const RECOVERY_KEY = `pasta.ravioli.publish-recovery-draft.v1:shadownet:${CREATOR}:${DRAFT_ID}`;
const PACK_RECOVERY_KEY = `pasta.ravioli.publish-recovery.v1:shadownet:${ROUTER}:1`;
const CREATED_AT = "2026-07-23T23:40:00.000Z";
const UPDATED_AT = "2026-07-23T23:41:00.000Z";

type Fixture = {
  root: string;
  publicRoot: string;
  privateRoot: string;
  browser: Browser;
  page: Page;
  server: Server;
};

function openKit() {
  return {
    schema: "pasta-ravioli-open-kit@3",
    network: "shadownet",
    contract: ROUTER,
    tokenId: 1,
    mode: "blind_funded_pool",
    manifestUri: "ipfs://bafkreimanifestfixture",
    blindSecurity: "commit-reveal-ui-hidden-chain-public",
    warning: "Private recipe nonces remain sealed until reveal.",
    editionPolicy: {
      requiresLimitedWrapper: true,
      wrapperEditionClass: "limited-edition",
      earliestChildEnd: "2026-07-25T00:00:00.000Z",
      wrapperSaleStart: "2026-07-23T23:00:00.000Z",
      wrapperSaleEnd: "2026-07-24T00:00:00.000Z",
      revealDeadline: "2026-07-24T01:00:00.000Z",
      openDeadline: "2026-07-24T02:00:00.000Z",
    },
    recipes: [{
      serial: 0,
      nonce: "11".repeat(32),
      actions: [{
        kind: "escrow",
        fa2: "KT1ShvgCuQZAKWTUFeCQZphNcn1y6Bi7LyYi",
        tokenId: 0,
        amount: 1,
      }],
    }],
  };
}

function recoveryRecord() {
  const kit = openKit();
  return {
    schema: "pasta-ravioli-publish-recovery@1",
    encoding: "pasta-recovery-canonical@1",
    status: "FAILED",
    draftId: DRAFT_ID,
    network: "shadownet",
    account: CREATOR,
    contract: ROUTER,
    tokenId: 1,
    kit: null,
    product: {
      name: "Private durability fixture",
      mode: "blind_funded_pool",
      editions: 1,
      target: "existing_contract",
      workflow: "publish",
      expectedTerminalStage: "FINALIZE_BLIND_PACK",
    },
    history: [
      {
        stage: "DRAFT_SAVED_BEFORE_SIDE_EFFECT",
        status: "IN_PROGRESS",
        at: CREATED_AT,
      },
      {
        stage: "SEALED_REVEAL_PREIMAGE_SAVED_BEFORE_PIN",
        status: "IN_PROGRESS",
        at: UPDATED_AT,
        details: {
          salt: "22".repeat(32),
          offset: 0,
          publicReveal: {
            schema: "pasta-ravioli-public-reveal@1",
            network: "shadownet",
            contract: ROUTER,
            tokenId: 1,
            mode: "blind_funded_pool",
            manifestUri: kit.manifestUri,
            maxSupply: 1,
            itemCount: 1,
            openKit: kit,
          },
        },
      },
      {
        stage: "PUBLISH_FAILED",
        status: "FAILED",
        at: UPDATED_AT,
        details: {
          message: "Injected failure after the authenticated encrypted reveal pin.",
        },
      },
    ],
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function canonicalJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => canonicalJsonValue(item));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalJsonValue(child)]),
  );
}

function canonicalSha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJsonValue(value)))
    .digest("hex");
}

function realStudioPreOperationTenRecord() {
  const publicKit = openKit();
  const privateKit = {
    ...publicKit,
    sealedReveal: {
      schema: "pasta-ravioli-sealed-reveal-reference@1",
      contentsUri: "ipfs://bafkreisealedfixture",
      salt: "22".repeat(32),
      offset: 0,
      envelopeSha256: "33".repeat(32),
    },
  };
  const escrowIntent = {
    network: "shadownet",
    signer: CREATOR,
    expectedCounter: 23_831_517,
    action: "call",
    target: GNOCCHI,
    entrypoint: "update_operators",
    payload: [{
      add_operator: {
        operator: ROUTER,
        owner: CREATOR,
        token_id: 0,
      },
    }],
  };
  const escrowIntentSha256 = canonicalSha256(escrowIntent);
  const operationHash = "onhP2YFTpzcpg66wPz1j2aX93dSwqeb6J1zJfaN4qCUFxrGZ62L";
  const base = recoveryRecord();
  return {
    ...base,
    status: "IN_PROGRESS",
    kit: privateKit,
    history: [
      base.history[0],
      {
        stage: "AUTHORIZE_ESCROW_KT1Shvg…LyYi:PREPARED",
        status: "IN_PROGRESS",
        at: UPDATED_AT,
        details: {
          intent: escrowIntent,
          intentSha256: escrowIntentSha256,
        },
      },
      {
        stage: "AUTHORIZE_ESCROW_KT1Shvg…LyYi:SUBMITTED",
        status: "IN_PROGRESS",
        at: UPDATED_AT,
        operationHash,
        details: { intentSha256: escrowIntentSha256 },
      },
      {
        stage: "AUTHORIZE_ESCROW_KT1Shvg…LyYi:CONFIRMED",
        status: "IN_PROGRESS",
        at: UPDATED_AT,
        operationHash,
        details: { intentSha256: escrowIntentSha256 },
      },
      base.history[1],
      {
        stage: "OPEN_KIT_SAVED_BEFORE_COMMIT",
        status: "IN_PROGRESS",
        at: UPDATED_AT,
      },
      {
        stage: "CREATE_PACK:PREPARED",
        status: "IN_PROGRESS",
        at: UPDATED_AT,
        details: {
          intent: {
            network: "shadownet",
            signer: CREATOR,
            expectedCounter: 23_831_518,
            action: "call",
            target: ROUTER,
            entrypoint: "create_pack",
            payload: { expected_token_id: 1 },
          },
          intentSha256: "44".repeat(32),
        },
      },
    ],
    updatedAt: UPDATED_AT,
  };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function fixture(): Promise<Fixture> {
  const rawRoot = await mkdtemp(path.join(os.tmpdir(), "ravioli-private-recovery-"));
  const root = await realpath(rawRoot);
  const publicRoot = path.join(root, "public-proof");
  const privateRoot = path.join(root, "private-recovery");
  await mkdir(publicRoot, { mode: 0o700 });
  await mkdir(privateRoot, { mode: 0o700 });
  await chmod(publicRoot, 0o700);
  await chmod(privateRoot, 0o700);
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Ravioli recovery fixture</title>");
  });
  const origin = await listen(server);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: "networkidle" });
  return { root, publicRoot, privateRoot, browser, page, server };
}

async function dispose(value: Fixture): Promise<void> {
  await value.browser.close().catch(() => undefined);
  await closeServer(value.server).catch(() => undefined);
  await rm(value.root, { recursive: true, force: true });
}

async function setRecovery(page: Page, raw: string): Promise<void> {
  await page.evaluate(({ key, value }) => {
    localStorage.clear();
    localStorage.setItem(key, value);
    localStorage.setItem("pasta.ravioli.publish-recovery-index.v1", JSON.stringify([key]));
    localStorage.setItem("unrelated.wallet.secret", "must-never-leave-browser-storage");
  }, { key: RECOVERY_KEY, value: raw });
}

async function recursiveFiles(directory: string): Promise<string[]> {
  const output: string[] = [];
  const visit = async (current: string): Promise<void> => {
    for (const name of await readdir(current)) {
      const absolute = path.join(current, name);
      const info = await lstat(absolute);
      if (info.isDirectory()) await visit(absolute);
      else output.push(absolute);
    }
  };
  await visit(directory);
  return output.sort();
}

test("publish recovery inventory distinguishes an empty rehydration page from recoverable state", async () => {
  const active = await fixture();
  try {
    await active.page.evaluate(() => localStorage.clear());
    assert.equal(await countRavioliPrivateRecoveryRecords(active.page), 0);
    await setRecovery(active.page, JSON.stringify(recoveryRecord()));
    assert.equal(await countRavioliPrivateRecoveryRecords(active.page), 1);
  } finally {
    await dispose(active);
  }
});

test("injected post-pin failure preserves exact private recovery after browser close", async () => {
  const active = await fixture();
  try {
    const raw = JSON.stringify(recoveryRecord());
    await setRecovery(active.page, raw);
    await writeFile(path.join(active.publicRoot, "public-sentinel.txt"), "public evidence only\n");

    let captured;
    try {
      throw new Error("injected sealed-pin policy failure");
    } catch {
      captured = await captureRavioliPrivateRecovery({
        page: active.page,
        privateOutputDirectory: active.privateRoot,
        publicProofRunRoot: active.publicRoot,
      });
    } finally {
      await active.browser.close();
    }

    assert.deepEqual(Object.keys(captured).sort(), ["count", "path", "sha256"]);
    assert.equal(captured.count, 1);
    assert.match(captured.sha256, /^[0-9a-f]{64}$/);
    assert.equal(path.dirname(captured.path), active.privateRoot);
    await assert.rejects(active.page.evaluate(() => localStorage.length), /closed/i);

    const manifestBytes = await readFile(path.join(captured.path, "manifest.json"));
    assert.equal(
      (await import("node:crypto")).createHash("sha256").update(manifestBytes).digest("hex"),
      captured.sha256,
    );
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    assert.equal(manifest.schema, "pastaprotocol-ravioli-private-recovery-snapshot@1");
    assert.equal(manifest.records.length, 1);
    assert.equal(manifest.records[0].storageKey, RECOVERY_KEY);
    const exactBytes = await readFile(path.join(captured.path, manifest.records[0].file));
    assert.equal(exactBytes.toString("utf8"), raw);
    assert.equal(manifest.records[0].byteLength, Buffer.byteLength(raw));
    assert.equal(
      (await import("node:crypto")).createHash("sha256").update(exactBytes).digest("hex"),
      manifest.records[0].sha256,
    );
    assert.equal((await lstat(captured.path)).mode & 0o077, 0);
    assert.equal((await lstat(path.join(captured.path, "manifest.json"))).mode & 0o077, 0);

    const publicFiles = await recursiveFiles(active.publicRoot);
    assert.deepEqual(publicFiles.map((file) => path.relative(active.publicRoot, file)), ["public-sentinel.txt"]);
    const privateBytes = Buffer.concat(await Promise.all((await recursiveFiles(captured.path)).map((file) => readFile(file))));
    assert.equal(privateBytes.includes(Buffer.from("must-never-leave-browser-storage")), false);
  } finally {
    await dispose(active);
  }
});

test("capture rejects public-root overlap, traversal, symlinks, and non-directories", async () => {
  const active = await fixture();
  try {
    await setRecovery(active.page, JSON.stringify(recoveryRecord()));
    const insidePublic = path.join(active.publicRoot, "private");
    await mkdir(insidePublic, { mode: 0o700 });
    await chmod(insidePublic, 0o700);
    await assert.rejects(
      captureRavioliPrivateRecovery({
        page: active.page,
        privateOutputDirectory: active.publicRoot,
        publicProofRunRoot: active.publicRoot,
      }),
      /outside the public proof root/,
    );
    await assert.rejects(
      captureRavioliPrivateRecovery({
        page: active.page,
        privateOutputDirectory: insidePublic,
        publicProofRunRoot: active.publicRoot,
      }),
      /outside the public proof root/,
    );

    const traversal = `${path.join(active.root, "unused")}${path.sep}..${path.sep}private-recovery`;
    await assert.rejects(
      captureRavioliPrivateRecovery({
        page: active.page,
        privateOutputDirectory: traversal,
        publicProofRunRoot: active.publicRoot,
      }),
      /path traversal/,
    );

    const symlinkPath = path.join(active.root, "private-link");
    await symlink(active.privateRoot, symlinkPath);
    await assert.rejects(
      captureRavioliPrivateRecovery({
        page: active.page,
        privateOutputDirectory: symlinkPath,
        publicProofRunRoot: active.publicRoot,
      }),
      /symbolic link/,
    );

    const filePath = path.join(active.root, "not-a-directory");
    await writeFile(filePath, "not a directory");
    await assert.rejects(
      captureRavioliPrivateRecovery({
        page: active.page,
        privateOutputDirectory: filePath,
        publicProofRunRoot: active.publicRoot,
      }),
      /non-directory/,
    );
    assert.deepEqual(await readdir(active.privateRoot), []);
  } finally {
    await dispose(active);
  }
});

test("private recovery preflight rejects a symbolic-link ancestor before browser access", async () => {
  const rawRoot = await mkdtemp(path.join(os.tmpdir(), "ravioli-private-parent-"));
  const root = await realpath(rawRoot);
  try {
    const publicRoot = path.join(root, "public");
    const realParent = path.join(root, "real-parent");
    const privateRoot = path.join(realParent, "private");
    const aliasParent = path.join(root, "alias-parent");
    await mkdir(publicRoot);
    await mkdir(realParent);
    await mkdir(privateRoot, { mode: 0o700 });
    await chmod(privateRoot, 0o700);
    await symlink(realParent, aliasParent);
    await assert.rejects(
      validateRavioliPrivateRecoveryOutputDirectory({
        privateOutputDirectory: path.join(aliasParent, "private"),
        publicProofRunRoot: publicRoot,
      }),
      /symbolic link/,
    );
    assert.equal(
      await validateRavioliPrivateRecoveryOutputDirectory({
        privateOutputDirectory: privateRoot,
        publicProofRunRoot: publicRoot,
      }),
      await realpath(privateRoot),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("capture rejects unexpected schema keys and over-limit bytes before writing", async () => {
  const active = await fixture();
  try {
    await setRecovery(active.page, JSON.stringify({ ...recoveryRecord(), leaked: "unexpected" }));
    await assert.rejects(
      captureRavioliPrivateRecovery({
        page: active.page,
        privateOutputDirectory: active.privateRoot,
        publicProofRunRoot: active.publicRoot,
      }),
      /unexpected key set/,
    );
    assert.deepEqual(await readdir(active.privateRoot), []);

    const oversized = JSON.stringify({
      ...recoveryRecord(),
      history: [{
        stage: "PUBLISH_FAILED",
        status: "FAILED",
        at: UPDATED_AT,
        details: { message: "x".repeat(RAVIOLI_PRIVATE_RECOVERY_MAX_RECORD_BYTES) },
      }],
    });
    assert(Buffer.byteLength(oversized) > RAVIOLI_PRIVATE_RECOVERY_MAX_RECORD_BYTES);
    await setRecovery(active.page, oversized);
    await assert.rejects(
      captureRavioliPrivateRecovery({
        page: active.page,
        privateOutputDirectory: active.privateRoot,
        publicProofRunRoot: active.publicRoot,
      }),
      /exceeds its byte limit/,
    );
    assert.deepEqual(await readdir(active.privateRoot), []);
  } finally {
    await dispose(active);
  }
});

test("capture accepts the exact legacy Studio escrow stage and both recovery aliases", async () => {
  const active = await fixture();
  try {
    const raw = JSON.stringify(realStudioPreOperationTenRecord());
    await active.page.evaluate(({ draftKey, packKey, value }) => {
      localStorage.clear();
      localStorage.setItem(draftKey, value);
      localStorage.setItem(packKey, value);
      localStorage.setItem(
        "pasta.ravioli.publish-recovery-index.v1",
        JSON.stringify([draftKey, packKey]),
      );
    }, {
      draftKey: RECOVERY_KEY,
      packKey: PACK_RECOVERY_KEY,
      value: raw,
    });

    const captured = await captureRavioliPrivateRecovery({
      page: active.page,
      privateOutputDirectory: active.privateRoot,
      publicProofRunRoot: active.publicRoot,
    });
    assert.equal(captured.count, 2);
    const manifest = JSON.parse(await readFile(path.join(captured.path, "manifest.json"), "utf8"));
    assert.deepEqual(
      manifest.records.map((record: { storageKey: string }) => record.storageKey).sort(),
      [RECOVERY_KEY, PACK_RECOVERY_KEY].sort(),
    );
    for (const record of manifest.records) {
      assert.equal(await readFile(path.join(captured.path, record.file), "utf8"), raw);
    }
  } finally {
    await dispose(active);
  }
});

test("legacy escrow exception rejects Unicode lookalikes, controls, and target drift", async () => {
  const active = await fixture();
  try {
    const cases = [
      {
        label: "horizontal-ellipsis lookalike",
        mutate(record: ReturnType<typeof realStudioPreOperationTenRecord>) {
          record.history[1].stage = "AUTHORIZE_ESCROW_KT1Shvg⋯LyYi:PREPARED";
        },
        expected: /stage is invalid/,
      },
      {
        label: "embedded control",
        mutate(record: ReturnType<typeof realStudioPreOperationTenRecord>) {
          record.history[1].stage = "AUTHORIZE_ESCROW_KT1Shvg…LyYi:\nPREPARED";
        },
        expected: /stage is invalid/,
      },
      {
        label: "short/full target disagreement",
        mutate(record: ReturnType<typeof realStudioPreOperationTenRecord>) {
          const details = record.history[1].details as {
            intent: { target: string };
          };
          details.intent.target = ROUTER;
        },
        expected: /does not match its full target/,
      },
    ];
    for (const scenario of cases) {
      const record = structuredClone(realStudioPreOperationTenRecord());
      scenario.mutate(record);
      await setRecovery(active.page, JSON.stringify(record));
      await assert.rejects(
        captureRavioliPrivateRecovery({
          page: active.page,
          privateOutputDirectory: active.privateRoot,
          publicProofRunRoot: active.publicRoot,
        }),
        scenario.expected,
        scenario.label,
      );
      assert.deepEqual(await readdir(active.privateRoot), []);
    }
  } finally {
    await dispose(active);
  }
});
