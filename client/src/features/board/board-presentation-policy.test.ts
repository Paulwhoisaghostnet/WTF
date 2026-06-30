import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const messageBoardSource = readFileSync("client/src/pages/MessageBoard.tsx", "utf8");
const chromeSource = readFileSync("client/src/features/board/BoardChrome.ts", "utf8");
const channelSettingsSource = readFileSync("client/src/features/board/BoardChannelSettings.tsx", "utf8");
const managementDialogsSource = readFileSync("client/src/features/board/BoardManagementDialogs.tsx", "utf8");

test("Message Board custom chrome is presentation-host aware", () => {
  assert.match(messageBoardSource, /usePresentationShell/);
  assert.match(messageBoardSource, /data-board-presentation-host=\{presentation\.host\}/);
  assert.match(chromeSource, /BoardSurface/);
  assert.match(chromeSource, /\[data-board-presentation-host="gamma"\]/);
  assert.match(chromeSource, /background-image:\s*none/);
  assert.match(chromeSource, /box-shadow:\s*none/);
  assert.match(chromeSource, /border-radius:\s*6px/);
});

test("Message Board dialogs expose shell-owned dialog semantics", () => {
  assert.match(channelSettingsSource, /data-board-dialog="channel-settings"/);
  assert.match(channelSettingsSource, /role="dialog"/);
  assert.match(channelSettingsSource, /aria-modal="true"/);
  assert.match(managementDialogsSource, /data-board-dialog="management"/);
  assert.match(managementDialogsSource, /role="dialog"/);
  assert.match(managementDialogsSource, /aria-modal="true"/);
});
