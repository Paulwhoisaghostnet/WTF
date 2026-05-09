import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseFocusedPath,
  cycleFocusedPath,
  minimizedAllStates,
  normalizeWindowSession,
  restoredVisibleStates,
  serializeWindowSession,
  type WindowState,
} from "./window-state";

const win = (zIndex: number, minimized = false): WindowState => ({
  minimized,
  maximized: false,
  position: { x: 20, y: 20 },
  size: { w: 960, h: 620 },
  zIndex,
});

test("window session normalization dedupes paths and drops invalid data", () => {
  const session = normalizeWindowSession({
    version: 1,
    pages: ["/dashboard", "http://bad", "/dashboard", "/w"],
    states: {
      "/dashboard": { zIndex: 40, size: { w: 100, h: 1000 } },
      "/w": { minimized: true, position: { x: -200, y: 25 }, zIndex: 30 },
    },
    titles: { "/dashboard": "Dashboard" },
    focusedPath: "/missing",
    topZ: 41,
  });

  assert.deepEqual(session.pages, ["/dashboard", "/w"]);
  assert.equal(session.states["/dashboard"].size.w, 320);
  assert.equal(session.states["/w"].position.x, 0);
  assert.equal(session.focusedPath, null);
  assert.equal(session.topZ, 41);
});

test("window sessions serialize and rehydrate", () => {
  const encoded = serializeWindowSession({
    pages: ["/dashboard"],
    states: { "/dashboard": win(12) },
    titles: { "/dashboard": "Dashboard" },
    focusedPath: "/dashboard",
    topZ: 12,
  });

  const decoded = normalizeWindowSession(JSON.parse(encoded));
  assert.deepEqual(decoded.pages, ["/dashboard"]);
  assert.equal(decoded.focusedPath, "/dashboard");
  assert.equal(decoded.titles["/dashboard"], "Dashboard");
});

test("focus selection and cycling skip minimized windows", () => {
  const pages = ["/dashboard", "/w", "/tv"];
  const states = {
    "/dashboard": win(12),
    "/w": win(40, true),
    "/tv": win(20),
  };

  assert.equal(chooseFocusedPath(pages, states), "/tv");
  assert.equal(cycleFocusedPath(pages, states, "/dashboard", 1), "/tv");
  assert.equal(cycleFocusedPath(pages, states, "/dashboard", -1), "/tv");
});

test("show desktop can minimize and restore the previous visible set", () => {
  const pages = ["/dashboard", "/w", "/tv"];
  const states = {
    "/dashboard": win(12),
    "/w": win(40, true),
    "/tv": win(20),
  };

  const minimized = minimizedAllStates(pages, states);
  assert.deepEqual(minimized.visibleBefore, ["/dashboard", "/tv"]);
  assert.equal(minimized.states["/dashboard"].minimized, true);
  assert.equal(minimized.states["/w"].minimized, true);

  const restored = restoredVisibleStates(minimized.visibleBefore, minimized.states);
  assert.equal(restored["/dashboard"].minimized, false);
  assert.equal(restored["/tv"].minimized, false);
  assert.equal(restored["/w"].minimized, true);
});
