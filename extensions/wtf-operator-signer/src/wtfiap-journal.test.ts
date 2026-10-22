import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { operatorSignerWtfIapEnvelopeSchema } from "../../../shared/operator-signer";
import { journalWtfIapSend, WtfIapSigningQueue } from "./wtfiap-journal";
import { okResponse } from "./policy";

const envelope = operatorSignerWtfIapEnvelopeSchema.parse({
  version: 1, auth: "never-persist-this-token", requestId: "room:start", walletId: "wtfiap-referee",
  intent: "wtfiap_escrow", payload: { contract: "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD", chainId: "NetXdQprcVkpaWU",
    entrypoint: "start_room", args: { room_id: "a".repeat(64), expected_terms_hash: "b".repeat(64), match_id: "c".repeat(64) } },
});
const response = okResponse({ requestId: envelope.requestId, intent: envelope.intent, opHash: "operation-hash" });

test("duplicate and restarted requests recover one durable operation without persisting secrets", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "wtfiap-journal-")); t.after(() => rm(dir, { recursive: true, force: true }));
  let calls = 0;
  const send = async () => { calls++; return response; };
  assert.deepEqual(JSON.parse(JSON.stringify(await journalWtfIapSend(dir, envelope, send))), JSON.parse(JSON.stringify(response)));
  assert.deepEqual(await journalWtfIapSend(dir, envelope, send), JSON.parse(JSON.stringify(response)));
  assert.equal(calls, 1);
  const text = await readFile(join(dir, (await readdir(dir))[0]), "utf8");
  assert.equal(text.includes(envelope.auth), false);
  assert(envelope.payload.entrypoint === "start_room");
  const different = { ...envelope, payload: { ...envelope.payload, args: { ...envelope.payload.args, match_id: "d".repeat(64) } } };
  assert.equal((await journalWtfIapSend(dir, different as typeof envelope, send)).ok, false);
  assert.equal(calls, 1);
});

test("ambiguous broadcast and concurrent replay cannot broadcast again", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "wtfiap-journal-")); t.after(() => rm(dir, { recursive: true, force: true }));
  let calls = 0;
  await assert.rejects(journalWtfIapSend(dir, envelope, async () => { calls++; throw new Error("lost response after injection"); }));
  const recovered = await journalWtfIapSend(dir, envelope, async () => { calls++; return response; });
  assert.equal(recovered.ok, false);
  if (!recovered.ok) assert.equal(recovered.code, "WTFIAP_SUBMISSION_UNKNOWN");
  assert.equal(calls, 1);
});

test("wallet queue serializes counter-consuming calls and survives an earlier failure", async () => {
  const queue = new WtfIapSigningQueue(); const order: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = queue.run("referee", async () => { order.push("first"); await gate; throw new Error("failed"); });
  const second = queue.run("referee", async () => { order.push("second"); });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(order, ["first"]); release();
  await assert.rejects(first); await second;
  assert.deepEqual(order, ["first", "second"]);
});
