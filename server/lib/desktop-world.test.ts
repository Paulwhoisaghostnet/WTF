import assert from "node:assert/strict";
import { test } from "node:test";
import {
  recordDesktopWorldHeartbeat,
  resetDesktopWorldForTests,
  submitDesktopWorldEscape,
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
