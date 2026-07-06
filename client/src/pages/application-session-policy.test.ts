import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const sessionPath = "client/src/pages/ApplicationSession.tsx";
const sessionSource = existsSync(sessionPath) ? readFileSync(sessionPath, "utf8") : "";

test("Application session page owns launch attach stream and input", () => {
  assert.match(sessionSource, /export function ApplicationSession/);
  assert.match(sessionSource, /import \{ AppWindow \} from "\.\.\/components\/layout\/AppWindow"/);
  assert.match(sessionSource, /<AppWindow title=\{appName\}/);
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
  assert.match(sessionSource, /status\.state === "running"/);
  assert.doesNotMatch(sessionSource, /\["running", "launching"\]\.includes\(status\.state\)/);
  assert.match(sessionSource, /const resumeRemotePlayback = useCallback/);
  assert.match(sessionSource, /onLoadedMetadata=\{resumeRemotePlayback\}/);
  assert.match(sessionSource, /const controlsReady = status\?\.state === "running"/);
  assert.match(sessionSource, /if \(!controlsReady\) return;/);
  assert.match(sessionSource, /if \(event\.type === "pointer" && event\.action === "move"\) return;/);
});
