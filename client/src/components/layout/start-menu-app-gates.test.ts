import assert from "node:assert/strict";
import test from "node:test";
import {
  filterStartMenuGroup,
  isStartMenuItemEnabled,
} from "./start-menu-app-gates";

test("Start Menu app gates hide disabled WTF OS launchers", () => {
  const apps = {
    casino: false,
    arcade: true,
    console: false,
    gallery: false,
  };

  assert.equal(isStartMenuItemEnabled("/casino", apps), false);
  assert.equal(isStartMenuItemEnabled("/arcade", apps), true);
  assert.equal(isStartMenuItemEnabled("/console", apps), false);
  assert.equal(isStartMenuItemEnabled("/my-gallery", apps), false);
  assert.equal(isStartMenuItemEnabled("/links", apps), true);
});

test("Start Menu groups keep ungated entries and drop empty gated groups", () => {
  const group = {
    label: "Casino",
    icon: "$",
    items: [
      { label: "WTF Casino", path: "/casino", icon: "$" },
      { label: "WTF Arcade", path: "/arcade", icon: "AR" },
      { label: "My Games", path: "/console", icon: "CN" },
    ],
  };

  const filtered = filterStartMenuGroup(group, {
    casino: false,
    arcade: true,
    console: false,
  });

  assert.deepEqual(
    filtered?.items.map((item) => item.path),
    ["/arcade"]
  );

  assert.equal(
    filterStartMenuGroup(group, {
      casino: false,
      arcade: false,
      console: false,
    }),
    null
  );
});
