import assert from "node:assert/strict";
import { test } from "node:test";
import {
  recordDesktopWorldHeartbeat,
  resetDesktopWorldForTests,
  submitDesktopWorldEscape,
  submitDesktopWorldToyEscape,
} from "./desktop-world";

test("desktop world returns anonymous ant visitors without exposing map coordinates", () => {
  resetDesktopWorldForTests();
  const food = { id: "food-a", x: 240, y: 220, servings: 20 };
  recordDesktopWorldHeartbeat(
    101,
    { viewport: { width: 1024, height: 768 }, foods: [food] },
    1_000
  );

  const neighbor = recordDesktopWorldHeartbeat(
    202,
    { viewport: { width: 1024, height: 768 }, foods: [] },
    2_000
  );
  assert.ok(neighbor.visitors.some((visitor) => visitor.kind === "ant"));
  assert.ok(neighbor.activity.neighborFoodSmell);
  assert.equal(neighbor.activity.neighborFoodSmell.foodCount, 1);
  assert.ok(neighbor.activity.neighborFoodSmell.intensity > 0);
  assert.equal("targetUserId" in neighbor.activity.neighborFoodSmell, false);
  assert.equal("x" in neighbor.activity.neighborFoodSmell, false);
  assert.equal("y" in neighbor.activity.neighborFoodSmell, false);
  for (const visitor of neighbor.visitors) {
    assert.equal("targetUserId" in visitor, false);
    assert.equal("x" in visitor, false);
    assert.equal("y" in visitor, false);
  }

  const source = recordDesktopWorldHeartbeat(
    101,
    { viewport: { width: 1024, height: 768 }, foods: [food] },
    2_100
  );
  assert.ok(
    source.visitors.some(
      (visitor) => visitor.kind === "ant" && visitor.role === "forage" && visitor.targetDropId === food.id
    )
  );
});

test("guinea pig escape only enters the closest active neighbor space", () => {
  resetDesktopWorldForTests();
  recordDesktopWorldHeartbeat(
    303,
    { viewport: { width: 1024, height: 768 }, foods: [] },
    5_000
  );
  assert.deepEqual(
    submitDesktopWorldEscape(303, { edge: "right", pet: { colorSchemeKey: "golden" } }, 5_100),
    { accepted: false, awayMs: 0 }
  );

  recordDesktopWorldHeartbeat(
    404,
    { viewport: { width: 1024, height: 768 }, foods: [] },
    5_200
  );
  const escaped = submitDesktopWorldEscape(
    303,
    { edge: "right", pet: { colorSchemeKey: "golden" } },
    5_300
  );
  assert.equal(escaped.accepted, true);
  assert.ok(escaped.awayMs > 0);

  const neighbor = recordDesktopWorldHeartbeat(
    404,
    { viewport: { width: 1024, height: 768 }, foods: [] },
    5_400
  );
  const visitor = neighbor.visitors.find((entry) => entry.kind === "guinea-pig");
  assert.ok(visitor);
  assert.equal(visitor.label, "wandering guinea pig");
  assert.equal("targetUserId" in visitor, false);
});

test("desktop balls travel as anonymous toy visitors through active neighbor space", () => {
  resetDesktopWorldForTests();
  recordDesktopWorldHeartbeat(
    501,
    { viewport: { width: 1024, height: 768 }, foods: [] },
    10_000
  );
  assert.deepEqual(
    submitDesktopWorldToyEscape(501, { edge: "right", toy: { kind: "ball", color: "#f047a6" } }, 10_100),
    { accepted: false, awayMs: 0 }
  );

  recordDesktopWorldHeartbeat(
    602,
    { viewport: { width: 1024, height: 768 }, foods: [] },
    10_200
  );
  const transfer = submitDesktopWorldToyEscape(
    501,
    { edge: "right", toy: { kind: "ball", color: "#f047a6" } },
    10_300
  );
  assert.equal(transfer.accepted, true);

  const neighbor = recordDesktopWorldHeartbeat(
    602,
    { viewport: { width: 1024, height: 768 }, foods: [] },
    10_400
  );
  const ball = neighbor.visitors.find((entry) => entry.kind === "ball");
  assert.ok(ball);
  assert.equal(ball.role, "toy");
  assert.equal(ball.toy?.kind, "ball");
  assert.equal(ball.toy?.color, "#f047a6");
  assert.equal("targetUserId" in ball, false);
  assert.equal("ownerUserId" in ball, false);
});
