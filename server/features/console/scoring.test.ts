import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createConsoleTicket,
  verifyConsoleTicket,
  type ConsoleTicketPayload,
} from "./scoring";

const payload: ConsoleTicketPayload = {
  v: 1,
  gameId: 42,
  slug: "score-cave",
  userId: 7,
  runId: "run-123",
  issuedAt: "2026-05-07T10:00:00.000Z",
  expiresAt: "2026-05-07T12:00:00.000Z",
};

test("console ticket signatures verify against the expected run", () => {
  const ticket = createConsoleTicket(payload, "secret-a");
  const result = verifyConsoleTicket(
    ticket,
    {
      gameId: payload.gameId,
      slug: payload.slug,
      userId: payload.userId,
      runId: payload.runId,
      expiresAt: new Date(payload.expiresAt),
    },
    "secret-a",
    new Date("2026-05-07T10:30:00.000Z")
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.payload.runId, payload.runId);
});

test("console ticket signatures reject tampered run ids", () => {
  const ticket = createConsoleTicket(payload, "secret-a");
  const result = verifyConsoleTicket(
    ticket,
    {
      gameId: payload.gameId,
      slug: payload.slug,
      userId: payload.userId,
      runId: "other-run",
      expiresAt: new Date(payload.expiresAt),
    },
    "secret-a",
    new Date("2026-05-07T10:30:00.000Z")
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /does not match/);
});

test("console ticket signatures reject expired tickets", () => {
  const ticket = createConsoleTicket(payload, "secret-a");
  const result = verifyConsoleTicket(
    ticket,
    {
      gameId: payload.gameId,
      slug: payload.slug,
      userId: payload.userId,
      runId: payload.runId,
      expiresAt: new Date(payload.expiresAt),
    },
    "secret-a",
    new Date("2026-05-07T12:00:01.000Z")
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /expired/);
});
