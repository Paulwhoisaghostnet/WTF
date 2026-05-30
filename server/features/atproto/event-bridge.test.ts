import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import {
  AtprotoEventAuthorizationError,
  assertAtprotoBridgeCredential,
  bridgeKindForAtprotoEventType,
  isAtprotoKernelEventSource,
  issueAtprotoBridgeCredential,
} from "./event-bridge";

test("AT-tagged kernel event sources are a closed set", () => {
  assert.equal(isAtprotoKernelEventSource("atproto"), true);
  assert.equal(isAtprotoKernelEventSource("bluesky"), true);
  assert.equal(isAtprotoKernelEventSource("tz2at"), false);
  assert.equal(isAtprotoKernelEventSource("messageboard"), false);
});

test("ingestSystemEvent rejects AT-sourced events without a bridge credential", () => {
  assert.throws(
    () =>
      assertAtprotoBridgeCredential({
        source: "atproto",
        eventType: "atproto.post.liked",
        bridge: null,
      }),
    AtprotoEventAuthorizationError
  );
});

test("ingestSystemEvent rejects AT-sourced events with wrong bridge allowlist", () => {
  assert.throws(
    () => issueAtprotoBridgeCredential("skywire.notifications.sync", "atproto.post.liked"),
    AtprotoEventAuthorizationError
  );
});

test("authorized Skywire adapter bridge accepts documented event types", () => {
  const bridge = issueAtprotoBridgeCredential("skywire.adapter", "atproto.post.created");
  assert.doesNotThrow(() =>
    assertAtprotoBridgeCredential({
      source: "atproto",
      eventType: "atproto.post.created",
      bridge,
    })
  );
});

test("notification sync uses the dedicated notifications bridge", () => {
  assert.equal(bridgeKindForAtprotoEventType("atproto.notification.received"), "skywire.notifications.sync");
  assert.equal(bridgeKindForAtprotoEventType("atproto.post.created"), "skywire.adapter");
});

test("non-AT sources bypass bridge enforcement", () => {
  assert.doesNotThrow(() =>
    assertAtprotoBridgeCredential({
      source: "tz2at",
      eventType: "tz2at.wtfos_pds.provisioned",
      bridge: null,
    })
  );
});

test("AppView firehose indexer never imports challenge event ingestion", () => {
  const indexer = readFileSync("server/features/atproto-spine/appview/indexer.ts", "utf8");
  assert.doesNotMatch(indexer, /ingestSystemEvent/);
  assert.doesNotMatch(indexer, /emitAtprotoSystemEvent/);
  assert.match(indexer, /indexAppviewRow/);
});

test("ingestSystemEvent enforces AT bridge guard at runtime", () => {
  const ingest = readFileSync("server/challenges/events/ingest.ts", "utf8");
  assert.match(ingest, /assertAtprotoBridgeCredential/);
});

test("Skywire adapter issues bridge credentials before kernel ingestion", () => {
  const adapter = readFileSync("server/features/atproto/events.ts", "utf8");
  assert.match(adapter, /issueAtprotoBridgeCredential/);
  assert.match(adapter, /atprotoBridge:\s*bridge/);
});

test("Skywire pipeline dispatch issues bridge credentials for pipeline events", () => {
  const route = readFileSync("server/routes/skywire.ts", "utf8");
  assert.match(route, /issueAtprotoBridgeCredential\("skywire\.pipeline"/);
  assert.match(route, /atprotoBridge:\s*pipelineBridge/);
});
