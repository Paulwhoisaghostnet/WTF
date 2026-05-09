import assert from "node:assert/strict";
import test from "node:test";
import {
  createDesktopShortcut,
  normalizeDesktopShortcuts,
  parseShortcutPayload,
  serializeShortcutPayload,
  shortcutIdFromIconKey,
  shortcutIconKey,
} from "./desktop-shortcuts";

test("shortcut payloads round-trip through the drag MIME body", () => {
  const payload = { label: "WTF Arcade", path: "/arcade", icon: "🕹️" };
  assert.deepEqual(parseShortcutPayload(serializeShortcutPayload(payload)), payload);
});

test("shortcut payload parser rejects unsafe paths", () => {
  assert.equal(parseShortcutPayload(JSON.stringify({ label: "Bad", path: "javascript:alert(1)", icon: "!" })), null);
  assert.equal(parseShortcutPayload(JSON.stringify({ label: "Bad", path: "//example.com", icon: "!" })), null);
});

test("desktop shortcut creation clamps drop coordinates to icon bounds", () => {
  const shortcut = createDesktopShortcut(
    { label: "Game Console", path: "/console", icon: "▶" },
    { x: 9999, y: 9999 },
    { width: 640, height: 480 },
    12345
  );
  assert.equal(shortcut.label, "Game Console");
  assert.equal(shortcut.path, "/console");
  assert.equal(shortcut.x, 572);
  assert.equal(shortcut.y, 414);
});

test("normalizer drops malformed and duplicate shortcut records", () => {
  const shortcuts = normalizeDesktopShortcuts(
    [
      { id: "one", label: "Arcade", path: "/arcade", icon: "A", x: 10, y: 20, createdAt: 1 },
      { id: "one", label: "Duplicate", path: "/console", icon: "C", x: 40, y: 50, createdAt: 2 },
      { id: "bad", label: "", path: "/arcade", icon: "A", x: 10, y: 20 },
      { id: "unsafe", label: "Unsafe", path: "//arcade", icon: "A", x: 10, y: 20 },
    ],
    { width: 320, height: 240 }
  );
  assert.equal(shortcuts.length, 1);
  assert.equal(shortcuts[0]?.id, "one");
  assert.equal(shortcuts[0]?.x, 10);
  assert.equal(shortcuts[0]?.y, 20);
});

test("shortcut icon keys are reversible", () => {
  assert.equal(shortcutIconKey({ id: "abc" }), "shortcut:abc");
  assert.equal(shortcutIdFromIconKey("shortcut:abc"), "abc");
  assert.equal(shortcutIdFromIconKey("arcade"), null);
});
