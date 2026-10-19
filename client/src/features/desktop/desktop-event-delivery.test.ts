import assert from "node:assert/strict";
import { test } from "node:test";
import { createDesktopEventQueue, type DesktopClientEventPayload } from "./desktop-event-delivery";

const event = (id: string): DesktopClientEventPayload => ({
  eventType: "desktop.artifact.spawned", objectId: id, objectKind: "fan", action: "spawn",
});

test("desktop startup events await delivery in order without blocking an unrelated read", async () => {
  const sent: string[] = [];
  let releaseFirst!: () => void;
  const firstResponse = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const queue = createDesktopEventQueue(async (payload) => {
    sent.push(payload.objectId);
    if (payload.objectId === "first") await firstResponse;
  });
  const first = queue(event("first"));
  const second = queue(event("second"));
  await Promise.resolve();
  assert.deepEqual(sent, ["first"], "queued restoration events must not take additional browser connections");
  assert.equal(await Promise.resolve("show read complete"), "show read complete");
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(sent, ["first", "second"]);
});

test("a failed event remains observable and does not discard the next event", async () => {
  const sent: string[] = [];
  const failure = new Error("offline");
  const queue = createDesktopEventQueue(async (payload) => {
    sent.push(payload.objectId);
    if (payload.objectId === "first") throw failure;
    return { ok: true };
  });
  const first = queue(event("first"));
  const second = queue(event("second"));
  await assert.rejects(first, (error) => error === failure);
  assert.deepEqual(await second, { ok: true });
  assert.deepEqual(sent, ["first", "second"]);
});

test("queued events cannot be attributed to the next signed-in account", async () => {
  const sent: string[] = [];
  let userId: number | null = 1;
  let releaseFirst!: () => void;
  const firstResponse = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const queue = createDesktopEventQueue(async (payload) => {
    sent.push(payload.objectId);
    if (payload.objectId === "old-in-flight") await firstResponse;
  }, () => userId);
  const first = queue(event("old-in-flight"));
  const stale = queue(event("old-queued"));
  const rejected = assert.rejects(stale, /signed-in account changed/);
  await Promise.resolve();
  userId = 2;
  const current = queue(event("new-account"));
  releaseFirst();
  await Promise.all([first, rejected, current]);
  assert.deepEqual(sent, ["old-in-flight", "new-account"]);
});
