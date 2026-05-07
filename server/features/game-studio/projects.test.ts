import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProjectFiles } from "./projects";

test("normalizeProjectFiles keeps editable game source files", () => {
  assert.deepEqual(
    normalizeProjectFiles({
      "index.html": "<html></html>",
      "scripts/game.js": "console.log('ok')",
      "styles.css": "body{}",
    }),
    {
      "index.html": "<html></html>",
      "scripts/game.js": "console.log('ok')",
      "styles.css": "body{}",
    }
  );
});

test("normalizeProjectFiles rejects traversal and unsupported source files", () => {
  assert.deepEqual(
    normalizeProjectFiles({
      "../index.html": "bad",
      "/safe.mjs": "ok",
      "assets/player.png": "not source text",
      "readme.md": "# notes",
    }),
    {
      "safe.mjs": "ok",
      "readme.md": "# notes",
    }
  );
});
