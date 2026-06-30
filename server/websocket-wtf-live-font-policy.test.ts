import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const websocketSource = readFileSync("server/websocket.ts", "utf8");
const harnessSource = readFileSync("tests/playwright/harness.mjs", "utf8");

test("WTF LIVE realtime chat sanitizer defaults every legacy font to Soft System", () => {
  assert.match(
    websocketSource,
    /const WTF_LIVE_CHAT_FONTS = new Set\(\["wtfos-soft-system"\]\);/,
  );
  assert.match(websocketSource, /const DEFAULT_WTF_LIVE_CHAT_STYLE: WtfLiveChatStyle = \{[\s\S]*?font: "wtfos-soft-system"/);
  assert.match(websocketSource, /system: "wtfos-soft-system"/);
  assert.match(websocketSource, /"mek-mono": "wtfos-soft-system"/);
  assert.match(websocketSource, /"grout-display": "wtfos-soft-system"/);
  assert.match(websocketSource, /"classic-95": "wtfos-soft-system"/);
  assert.match(websocketSource, /terminal: "wtfos-soft-system"/);
  assert.match(websocketSource, /"serif-press": "wtfos-soft-system"/);
  assert.match(websocketSource, /function normalizeWtfLiveChatStyle\(value: unknown\): WtfLiveChatStyle \| undefined/);
  assert.match(websocketSource, /if \(typeof value !== "object" \|\| !value\) return undefined;/);
  assert.match(websocketSource, /\.\.\.\(style \? \{ style \} : \{\}\)/);
  assert.doesNotMatch(websocketSource, /WTF_LIVE_CHAT_FONTS = new Set\(\[[^\]]*"mek-mono"/);
  assert.doesNotMatch(websocketSource, /WTF_LIVE_CHAT_FONTS = new Set\(\[[^\]]*"grout-display"/);
  assert.doesNotMatch(websocketSource, /font: "mek-mono"/);
  assert.match(harnessSource, /const LIVE_CHAT_FONTS = new Set\(\["wtfos-soft-system"\]\);/);
  assert.match(harnessSource, /"classic-95": "wtfos-soft-system"/);
  assert.match(harnessSource, /\|\| "wtfos-soft-system"/);
});

test("WTF LIVE Playwright relay preserves unstyled chat messages for receiver defaults", () => {
  assert.match(harnessSource, /function liveNormalizeChatStyle\(value\) \{[\s\S]*?return undefined;/);
  assert.match(harnessSource, /\.\.\.\(style \? \{ style \} : \{\}\)/);
  assert.doesNotMatch(harnessSource, /const style = value && typeof value === "object" \? value : \{\};/);
});
