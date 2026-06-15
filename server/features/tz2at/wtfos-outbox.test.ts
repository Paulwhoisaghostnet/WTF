import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WTFOS_ACTIVITY_EVENT_COLLECTION,
  buildWtfosActivityEventRecord,
} from "./wtfos-outbox";

test("WTFOS activity event records stay in app.wtfos namespace", () => {
  const record = buildWtfosActivityEventRecord({
    eventId: "evt-1",
    systemEventId: 7,
    eventType: "tz2at.wallet_link.published",
    canonicalDid: "did:plc:canonical",
    actorDid: "did:plc:wtfos",
    source: "wtfos.tz2at",
    sourceModule: "tz2at",
    userId: 42,
    walletAddress: "tz1abc",
    subject: { chain: "tezos", walletAddress: "tz1abc" },
    rawRef: { type: "atproto_record", id: "at://did:plc:canonical/xyz.tz2at.identity.walletLink/self" },
    sourceRecordUri: "at://did:plc:canonical/xyz.tz2at.identity.walletLink/self",
    occurredAt: new Date("2026-05-26T11:59:00.000Z"),
    createdAt: new Date("2026-05-26T12:00:00.000Z"),
  });

  assert.equal(record.$type, WTFOS_ACTIVITY_EVENT_COLLECTION);
  assert.equal(record.$type, "app.wtfos.activity.event");
  assert.equal(record.canonicalDid, "did:plc:canonical");
  assert.equal(record.actorDid, "did:plc:wtfos");
  assert.equal(record.eventId, "evt-1");
  assert.equal(record.systemEventId, 7);
  assert.equal(record.userId, 42);
  assert.equal(record.walletAddress, "tz1abc");
  assert.deepEqual(record.subject, { chain: "tezos", walletAddress: "tz1abc" });
  assert.equal(record.occurredAt, "2026-05-26T11:59:00.000Z");
  assert.equal(record.createdAt, "2026-05-26T12:00:00.000Z");
});

test("WTFOS outbox publisher targets primary or linked WTFOS repos, not canonical user repo", () => {
  const source = readFileSync("server/features/tz2at/wtfos-outbox.ts", "utf8");
  const schema = readFileSync("shared/schema-social.ts", "utf8");

  assert.match(source, /collection:\s*row\.collection/);
  assert.match(source, /repo:\s*row\.targetDid/);
  assert.match(source, /repo\.putRecord/);
  assert.match(source, /repo\.createRecord/);
  assert.match(source, /export async function listWtfosOutboxForSource/);
  assert.match(source, /PRIMARY_WTFOS_OUTBOX_TARGET/);
  assert.match(source, /USER_WTFOS_OUTBOX_TARGET/);
  assert.doesNotMatch(source, /repo:\s*account\.did/);
  assert.match(schema, /wtfosAtprotoOutboxTargetEnum/);
  assert.match(schema, /wtfosAtprotoOutbox/);
  assert.match(schema, /wtfos_atproto_outbox/);
});

test("SystemEvent exports are enqueued for primary WTFOS and user WTFOS targets", () => {
  const source = readFileSync("server/features/tz2at/wtfos-outbox.ts", "utf8");
  const ingest = readFileSync("server/challenges/events/ingest.ts", "utf8");

  assert.match(source, /enqueueWtfosSystemEventExports/);
  assert.match(source, /targetType:\s*PRIMARY_WTFOS_OUTBOX_TARGET/);
  assert.match(source, /targetType:\s*USER_WTFOS_OUTBOX_TARGET/);
  assert.match(ingest, /enqueueWtfosSystemEventExports\(event\)/);
});
