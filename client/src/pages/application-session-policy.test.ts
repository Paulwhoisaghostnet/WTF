import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const sessionPath = "client/src/pages/ApplicationSession.tsx";
const sessionSource = existsSync(sessionPath) ? readFileSync(sessionPath, "utf8") : "";

test("Application session page owns launch attach stream and input", () => {
  assert.match(sessionSource, /export function ApplicationSession/);
  assert.match(sessionSource, /api\.post<LaunchResponse>\(`\/api\/apphost\/apps\/\$\{encodeURIComponent\(appId\)\}\/launch`, \{\}\)/);
  assert.match(sessionSource, /api\.get<AppSessionResponse>\(`\/api\/apphost\/apps\/\$\{encodeURIComponent\(appId\)\}\/session`\)/);
  assert.match(sessionSource, /api\.post<[^>]+>\(\s*`\/api\/apphost\/apps\/\$\{encodeURIComponent\(appId\)\}\/stream\/offer`/);
  assert.match(sessionSource, /api\.get<AppSnapshotResponse>\(`\/api\/apphost\/apps\/\$\{encodeURIComponent\(appId\)\}\/snapshot`\)/);
  assert.match(sessionSource, /new RTCPeerConnection/);
  assert.match(sessionSource, /<RemoteVideo/);
  assert.match(sessionSource, /new WebSocket\(appHostWebSocketUrl\(\)\)/);
  assert.match(sessionSource, /data-application-session-region="remote-surface"/);
  assert.match(sessionSource, /onPointerDown=\{handlePointerEvent\}/);
  assert.match(sessionSource, /onKeyDown=\{handleKeyEvent\}/);
});
