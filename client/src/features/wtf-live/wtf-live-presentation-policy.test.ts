import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync("client/src/features/wtf-live/WtfLiveApp.tsx", "utf8");
const publicRoomSource = readFileSync("client/src/features/wtf-live/WtfLivePublicRoom.tsx", "utf8");
const styleSource = readFileSync("client/src/features/wtf-live/wtf-live-styles.ts", "utf8");

test("WTF LIVE creation dialogs are presentation-host aware", () => {
  assert.match(appSource, /usePresentationShell/);
  assert.match(appSource, /data-wtf-live-dialog="true"/);
  assert.match(appSource, /data-wtf-live-presentation-host=\{presentation\.host\}/);
  assert.match(appSource, /aria-modal="true"/);
  assert.match(styleSource, /\[data-wtf-live-presentation-host="gamma"\][\s\S]*?background:\s*rgba\(7,\s*7,\s*6,\s*0\.82\)/);
  assert.match(styleSource, /\[data-wtf-live-presentation-host="gamma"\][\s\S]*?box-shadow:\s*none/);
  assert.match(styleSource, /\[data-wtf-live-presentation-host="gamma"\][\s\S]*?border-radius:\s*6px/);
});

test("WTF LIVE room handoffs and popouts preserve the active presentation host", () => {
  assert.match(appSource, /presentationRouteHref\(publicRoomPath\(room\.id\)\)/);
  assert.match(publicRoomSource, /presentationRouteHref\("\/live\?tab=show-kit", presentation\.host\)/);
  assert.match(publicRoomSource, /presentationRouteHref\("\/wtfiam\?category=wtf_live", presentation\.host\)/);
  assert.match(publicRoomSource, /data-wtf-live-popout-layer data-wtf-live-presentation-host=\{presentation\.host\}/);
  assert.match(publicRoomSource, /\[data-wtf-live-presentation-host="gamma"\] &[\s\S]*?box-shadow:\s*none/);
  assert.match(publicRoomSource, /\[data-wtf-live-presentation-host="gamma"\] &[\s\S]*?border-radius:\s*6px/);
  assert.match(publicRoomSource, /\[data-wtf-live-presentation-host="gamma"\] &[\s\S]*?background-image:\s*none/);
});

test("WTF LIVE game rooms host Jackbox inside the room as a shared screen", () => {
  assert.match(appSource, /roomKind:\s*createRoomKind/);
  assert.match(appSource, /data-wtf-live-create-room-kind/);
  assert.match(appSource, /data-wtf-live-game-host-actions/);
  assert.match(appSource, /data-wtf-live-game-start=\{game\.appId\}/);
  assert.match(appSource, /function gameRoomHostPath\(roomId: string, appId: string\)/);
  assert.match(appSource, /\?hostApp=\$\{encodeURIComponent\(appId\)\}/);
  assert.match(publicRoomSource, /const runtimeRoomKind = isStageRoom \? "stage" : isGameRoom \? "game" : "room"/);
  assert.match(publicRoomSource, /show-kit\?roomKind=\$\{runtimeRoomKind\}/);
  assert.match(publicRoomSource, /data-wtf-live-game-room-host-actions/);
  assert.match(publicRoomSource, /data-wtf-live-room-frame=\{isStageRoom \? "stage" : isGameRoom \? "game" : "room"\}/);
  assert.match(publicRoomSource, /const requestedGame = hostedGameFromAppId\(params\.get\("hostApp"\)\);[\s\S]*?joinRoom\(\);/);
  assert.match(publicRoomSource, /api\.post<LaunchResponse>\(`\/api\/apphost\/apps\/\$\{encodeURIComponent\(hostedGameAppId \?\? ""\)\}\/launch`, \{\}\)/);
  assert.match(publicRoomSource, /api\.post<StreamOfferResponse>\(\s*`\/api\/apphost\/apps\/\$\{encodeURIComponent\(appId\)\}\/stream\/offer`/);
  assert.match(publicRoomSource, /api\.post\(`\/api\/apphost\/apps\/\$\{encodeURIComponent\(hostedGameAppId\)\}\/input`,/);
  assert.match(publicRoomSource, /installHostedGameStream\(stream\)/);
  assert.match(publicRoomSource, /setScreenStream\(stream\)/);
  assert.match(publicRoomSource, /data-wtf-live-game-control-surface=\{hostedGame\.appId\}/);
  assert.match(publicRoomSource, /data-wtf-live-game-room-stream=\{hostedGame\.appId\}/);
  assert.doesNotMatch(publicRoomSource, /\/applications\/\$\{encodeURIComponent\(appId\)\}\/play/);
});
