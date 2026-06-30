import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const websocketSource = readFileSync("server/websocket.ts", "utf8");
const harnessSource = readFileSync("tests/playwright/harness.mjs", "utf8");

test("WTF LIVE realtime chat sanitizer defaults legacy MEK fonts to Classic 95", () => {
  assert.match(
    websocketSource,
    /const WTF_LIVE_CHAT_FONTS = new Set\(\["classic-95", "terminal", "serif-press"\]\);/,
  );
  assert.match(websocketSource, /const DEFAULT_WTF_LIVE_CHAT_STYLE: WtfLiveChatStyle = \{[\s\S]*?font: "classic-95"/);
  assert.match(websocketSource, /system: "classic-95"/);
  assert.match(websocketSource, /"mek-mono": "classic-95"/);
  assert.match(websocketSource, /"grout-display": "classic-95"/);
  assert.match(websocketSource, /function normalizeWtfLiveChatStyle\(value: unknown\): WtfLiveChatStyle \| undefined/);
  assert.match(websocketSource, /if \(typeof value !== "object" \|\| !value\) return undefined;/);
  assert.match(websocketSource, /\.\.\.\(style \? \{ style \} : \{\}\)/);
  assert.doesNotMatch(websocketSource, /WTF_LIVE_CHAT_FONTS = new Set\(\[[^\]]*"mek-mono"/);
  assert.doesNotMatch(websocketSource, /WTF_LIVE_CHAT_FONTS = new Set\(\[[^\]]*"grout-display"/);
  assert.doesNotMatch(websocketSource, /font: "mek-mono"/);
});

test("WTF LIVE Playwright relay preserves unstyled chat messages for receiver defaults", () => {
  assert.match(harnessSource, /function liveNormalizeChatStyle\(value\) \{[\s\S]*?return undefined;/);
  assert.match(harnessSource, /\.\.\.\(style \? \{ style \} : \{\}\)/);
  assert.doesNotMatch(harnessSource, /const style = value && typeof value === "object" \? value : \{\};/);
});
