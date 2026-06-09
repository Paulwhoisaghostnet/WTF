import assert from "node:assert/strict";
import { test } from "node:test";
import { getCanvasFont } from "./get-canvas-font";

test("getCanvasFont falls back to role defaults when document is unavailable", () => {
  assert.match(getCanvasFont("mono", 12), /^normal normal 12px /);
  assert.match(getCanvasFont("display", 24, { weight: "bold" }), /^normal bold 24px /);
});
