import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const websocketSource = readFileSync("server/websocket.ts", "utf8");

test("apphost websocket input is queued and coalesces pointer movement", () => {
  assert.match(websocketSource, /const APPHOST_INPUT_TIMEOUT_MS = 2_000/);
  assert.match(websocketSource, /const APPHOST_INPUT_MOVE_FLUSH_MS = 8/);
  assert.match(websocketSource, /const APPHOST_INPUT_QUEUE_LIMIT = 32/);
  assert.match(websocketSource, /type AppHostInputQueue = \{/);
  assert.match(websocketSource, /function isAppHostPointerMove\(event: AppHostInputEvent\)/);
  assert.match(websocketSource, /inputQueue\.latestMove = event/);
  assert.match(websocketSource, /scheduleAppHostInputDrain\(inputQueue, APPHOST_INPUT_MOVE_FLUSH_MS\)/);
  assert.match(websocketSource, /if \(!item\.ack\) \{[\s\S]*?void request\.catch/);
  assert.match(websocketSource, /inputQueue\.queue\.unshift\(\{ appId, event, ack: true \}\)/);
  assert.match(websocketSource, /timeoutMs: APPHOST_INPUT_TIMEOUT_MS/);
});

test("apphost websocket handler does not forward every input message immediately", () => {
  assert.match(websocketSource, /case "apphost_input": \{[\s\S]*?enqueueAppHostInput\(client, appId, event\);[\s\S]*?break;/);
  assert.doesNotMatch(
    websocketSource,
    /case "apphost_input": \{[\s\S]*?await fetchAppHostJson\(`\/apps\/\$\{appId\}\/input`/,
  );
  assert.match(websocketSource, /function leaveAppHostRoom\(client: WsClient\) \{[\s\S]*?clearAppHostInputQueue\(client\);/);
});

test("apphost websocket input requires a joined room for the same app id", () => {
  assert.match(
    websocketSource,
    /case "apphost_input": \{[\s\S]*?const appId = normalizeAppHostAppId\(msg\.appId\);[\s\S]*?if \(!client\.appHostAppId \|\| !appId \|\| client\.appHostAppId !== appId\) \{[\s\S]*?Join the apphost room before sending input\./,
  );
  assert.doesNotMatch(
    websocketSource,
    /const appId = normalizeAppHostAppId\(msg\.appId\) \|\| client\.appHostAppId/,
  );
});
