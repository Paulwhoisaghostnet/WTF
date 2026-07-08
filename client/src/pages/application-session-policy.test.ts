import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const sessionPath = "client/src/pages/ApplicationSession.tsx";
const sessionSource = existsSync(sessionPath) ? readFileSync(sessionPath, "utf8") : "";

test("Application session page owns launch attach stream and input", () => {
  assert.match(sessionSource, /export function ApplicationSession/);
  assert.match(sessionSource, /import \{ AppWindow \} from "\.\.\/components\/layout\/AppWindow"/);
  assert.match(sessionSource, /import \{ useWindowManager \} from "\.\.\/lib\/window-context"/);
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
  assert.match(sessionSource, /pointer-events: none/);
  assert.match(sessionSource, /receivedStream\.getTracks\(\)/);
  assert.doesNotMatch(sessionSource, /onLoadedMetadata=\{resumeRemotePlayback\}/);
  assert.match(sessionSource, /const controlsReady = status\?\.state === "running" && socketReady/);
  assert.match(sessionSource, /if \(!controlsReady \|\| !appId\) return;/);
  assert.match(sessionSource, /pendingMoveRef\.current = event/);
  assert.match(sessionSource, /requestAnimationFrame\(flushPendingMove\)/);
  assert.match(sessionSource, /api\.post\(`\/api\/apphost\/apps\/\$\{encodeURIComponent\(appId\)\}\/input`, event\)/);
});

test("Application session page keeps the game surface first and wtfOS controls as overlays", () => {
  assert.match(sessionSource, /data-application-session-mode="game-first"/);
  assert.match(sessionSource, /data-application-session-region="overlay-controls"/);
  assert.match(sessionSource, /data-application-session-region="status-overlay"/);
  assert.match(sessionSource, /data-application-session-region="live-room-action"/);
  assert.match(sessionSource, /wm\.openPage\("\/live\?tab=rooms"\)/);
  assert.match(sessionSource, /const Page = styled\.main`[\s\S]*?position:\s*relative;[\s\S]*?overflow:\s*hidden;[\s\S]*?background:\s*#000000;/);
  assert.match(sessionSource, /const Header = styled\.header`[\s\S]*?position:\s*absolute;[\s\S]*?backdrop-filter:\s*blur\(8px\);/);
  assert.match(sessionSource, /const Body = styled\.section`[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;/);
  assert.match(sessionSource, /const StatusDock = styled\.div`[\s\S]*?position:\s*absolute;[\s\S]*?bottom:\s*8px;/);
  assert.doesNotMatch(sessionSource, /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
});

test("Application session page monitors live stream latency and framerate", () => {
  assert.match(sessionSource, /peerConnection\.getStats\(\)/);
  assert.match(sessionSource, /framesPerSecond/);
  assert.match(sessionSource, /currentRoundTripTime/);
  assert.match(sessionSource, /data-application-session-region="stream-stats"/);
  assert.match(sessionSource, /ms RTT/);
  assert.match(sessionSource, /ms jitter/);
});

test("Application session page gives the game's native cursor priority", () => {
  assert.match(sessionSource, /cursor: \$\{\(p\) => \(p\.\$nativeCursor \? "none" : "default"\)\}/);
  assert.match(sessionSource, /data-remote-cursor-surface=\{remoteStream \? "true" : undefined\}/);
  assert.match(sessionSource, /requestPointerLock/);
  assert.match(sessionSource, /Capture cursor/);
  assert.match(sessionSource, /document\.pointerLockElement === frame/);
  assert.match(sessionSource, /event\.movementX/);
  assert.match(sessionSource, /Press Esc to release/);
});

test("Application session page always renders video and self-heals a stalled stream", () => {
  assert.match(sessionSource, /video\.muted = true;\s*\n\s*void video\.play\(\)\.catch\(\(\) => undefined\);/);
  assert.match(sessionSource, /status\?\.progress\?\.phase !== "ready"/);
  assert.match(sessionSource, /zeroFrameSamples \+= 1;/);
  assert.match(sessionSource, /setStreamAttempt\(\(attempt\) => attempt \+ 1\);/);
});
