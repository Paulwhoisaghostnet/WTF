import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPetBallItem,
  itemMetadataKind,
  PET_BALL_MAX_OWNED,
  petBallAccountCapDecision,
} from "./pet-ball-account-cap";

test("pet ball account cap blocks repeat purchases after account owns three", () => {
  assert.equal(PET_BALL_MAX_OWNED, 3);
  assert.deepEqual(petBallAccountCapDecision(0, 3), {
    ok: true,
    owned: 0,
    requested: 3,
    limit: 3,
    remaining: 3,
  });
  assert.deepEqual(petBallAccountCapDecision(3, 1), {
    ok: false,
    owned: 3,
    requested: 1,
    limit: 3,
    remaining: 0,
  });
  assert.deepEqual(petBallAccountCapDecision(2, 2), {
    ok: false,
    owned: 2,
    requested: 2,
    limit: 3,
    remaining: 1,
  });
});

test("pet ball account cap recognizes ball listings by sku or metadata kind", () => {
  assert.equal(isPetBallItem("pet-ball", null), true);
  assert.equal(isPetBallItem("custom-blue-ball", "ball"), true);
  assert.equal(isPetBallItem("toy-red", "toy-ball"), true);
  assert.equal(isPetBallItem("pet-food", "food"), false);
  assert.equal(itemMetadataKind({ kind: "toy-ball" }), "toy-ball");
  assert.equal(itemMetadataKind(null), null);
});
