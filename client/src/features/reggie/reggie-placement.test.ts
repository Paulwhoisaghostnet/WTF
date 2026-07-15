import assert from "node:assert/strict";
import test from "node:test";
import {
  placementForAnchor,
  REGGIE_BUBBLE_MAX_HEIGHT,
  REGGIE_BUBBLE_WIDTH,
  REGGIE_SPRITE_WIDTH,
} from "./reggie-placement";

const viewport = { width: 1024, height: 768 };

test("Reggie keeps a left-edge target clear and puts the bubble to its right", () => {
  const placement = placementForAnchor({ left: 24, right: 88, top: 40, height: 64 }, viewport);
  assert.equal(placement.bubbleSide, "right");
  assert.ok(placement.x >= 104);
  assert.ok(placement.x + REGGIE_SPRITE_WIDTH + 16 + REGGIE_BUBBLE_WIDTH <= viewport.width - 12);
  assert.ok(placement.y >= 12);
});

test("Reggie keeps a right-edge target clear and puts the bubble to its left", () => {
  const placement = placementForAnchor({ left: 900, right: 964, top: 690, height: 64 }, viewport);
  assert.equal(placement.bubbleSide, "left");
  assert.ok(placement.x + REGGIE_SPRITE_WIDTH <= 884);
  assert.ok(placement.x - 16 - REGGIE_BUBBLE_WIDTH >= 12);
  assert.ok(placement.y + REGGIE_BUBBLE_MAX_HEIGHT / 2 <= viewport.height - 12 + 25);
});
