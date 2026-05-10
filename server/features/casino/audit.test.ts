import assert from "node:assert/strict";
import test from "node:test";
import {
  appendCasinoAuditEvent,
  createCasinoAuditJournal,
  hashCasinoActor,
  hashCasinoPayload,
  stableCasinoAuditJson,
} from "./audit";

test("Casino audit payload hashes are stable across object key order and bigint values", () => {
  const left = {
    wallet: "tz1-test",
    stakeMicrowtf: 5_000_000n,
    selections: ["patches", "wheeky"],
  };
  const right = {
    selections: ["patches", "wheeky"],
    stakeMicrowtf: 5_000_000n,
    wallet: "tz1-test",
  };

  assert.equal(stableCasinoAuditJson(left), stableCasinoAuditJson(right));
  assert.equal(hashCasinoPayload(left), hashCasinoPayload(right));
});

test("Casino audit chains change when action payload changes", () => {
  const base = createCasinoAuditJournal("test-chain");
  const first = appendCasinoAuditEvent(base, {
    atMs: 1,
    gameKey: "raceway",
    scope: "race-1",
    action: "ticket_accepted",
    actorId: "mock-wallet-1",
    message: "Ticket accepted.",
    payload: { stakeMicrowtf: 5_000_000n },
  });
  const second = appendCasinoAuditEvent(first, {
    atMs: 2,
    gameKey: "raceway",
    scope: "race-1",
    action: "ticket_accepted",
    actorId: "mock-wallet-1",
    message: "Ticket accepted.",
    payload: { stakeMicrowtf: 6_000_000n },
  });

  assert.notEqual(first.latestHash, second.latestHash);
  assert.equal(second.events[0].previousHash, first.latestHash);
});

test("Casino audit journal keeps a bounded retained history while count keeps growing", () => {
  let journal = createCasinoAuditJournal("bounded");
  for (let index = 0; index < 5; index += 1) {
    journal = appendCasinoAuditEvent(
      journal,
      {
        atMs: index,
        gameKey: "wtf-button",
        scope: "red",
        action: "press_rejected",
        actorId: `wallet-${index}`,
        severity: "rejection",
        message: "Rejected.",
        payload: { index },
      },
      3
    );
  }

  assert.equal(journal.eventCount, 5);
  assert.equal(journal.events.length, 3);
  assert.equal(journal.events[0].atMs, 4);
});

test("Casino audit actor hashes do not expose raw wallet identifiers", () => {
  const wallet = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
  const actorHash = hashCasinoActor(wallet);

  assert.equal(actorHash?.length, 16);
  assert.notEqual(actorHash, wallet);
  assert.equal(hashCasinoActor(wallet), actorHash);
});
