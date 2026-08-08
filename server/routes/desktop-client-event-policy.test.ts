import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync("server/routes/desktop.ts", "utf8");
const desktopSource = readFileSync("client/src/components/layout/Desktop.tsx", "utf8");

function clientEventAllowlist(): string {
  const match = routeSource.match(
    /const DESKTOP_CLIENT_EVENT_TYPES = new Set\(\[([\s\S]*?)\]\);/
  );
  assert.ok(match, "desktop client event allowlist must remain explicit");
  return match[1]!;
}

test("desktop client event allowlist preserves declared shortcut and context-menu handles", () => {
  const allowlist = clientEventAllowlist();
  const declaredHandles = [
    "desktop.context_menu.opened",
    "desktop.shortcut.created",
    "desktop.shortcut.opened",
    "desktop.shortcut.moved",
    "desktop.shortcut.deleted",
  ];

  for (const eventType of declaredHandles) {
    assert.match(
      desktopSource,
      new RegExp(`eventType: ["']${eventType.replaceAll(".", "\\.")}["']`),
      `${eventType} must still be emitted by the desktop client`
    );
    assert.match(
      allowlist,
      new RegExp(`["']${eventType.replaceAll(".", "\\.")}["']`),
      `${eventType} must survive server normalization`
    );
  }
});

test("unknown desktop client event names still fall back to the generic click handle", () => {
  assert.match(
    routeSource,
    /DESKTOP_CLIENT_EVENT_TYPES\.has\(eventTypeInput\)[\s\S]*?: "desktop\.object\.clicked";/
  );
});
