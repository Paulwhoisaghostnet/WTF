import assert from "node:assert/strict";
import test from "node:test";
import { CLASSIC_TASK_WAYFINDER } from "./classic-task-wayfinder";

test("classic OS wayfinder exposes one stable destination for each commissioned task", () => {
  assert.deepEqual(
    CLASSIC_TASK_WAYFINDER.map(({ id, label, route }) => ({ id, label, route })),
    [
      { id: "play", label: "Play", route: "/arcade" },
      { id: "create", label: "Create", route: "/game-studio" },
      { id: "shop", label: "Shop", route: "/wtfiam" },
      { id: "events", label: "Events", route: "/calendar" },
      { id: "talk", label: "Talk", route: "/mail" },
    ]
  );

  assert.equal(new Set(CLASSIC_TASK_WAYFINDER.map((task) => task.id)).size, 5);
  assert.equal(new Set(CLASSIC_TASK_WAYFINDER.map((task) => task.route)).size, 5);
  for (const task of CLASSIC_TASK_WAYFINDER) {
    assert(task.description.trim().length > 0, `${task.label} needs a plain-language explanation`);
  }
});
