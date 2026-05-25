import assert from "node:assert/strict";
import test from "node:test";
import {
  filterStartMenuGroup,
  isStartMenuItemEnabled,
} from "./start-menu-app-gates";
import { PAGE_DEFS } from "../../routes/page-defs";
import {
  buildStartMenuEntries,
  buildStartMenuGroups,
  filterStartMenuEntriesByQuery,
} from "./start-menu-model";

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

test("Start Menu model uses requested Win95 sections", () => {
  const entries = buildStartMenuEntries(PAGE_DEFS, {}, "admin", {
    casinoMembershipActive: true,
  });
  const signature = entries.map((entry) =>
    entry.kind === "separator"
      ? "|"
      : entry.kind === "group"
        ? entry.group.label
        : entry.item.label
  );

  assert.deepEqual(signature.slice(0, 7), [
    "Apps",
    "|",
    "Gameshow",
    "Social",
    "On Chain",
    "Gaming",
    "My Media",
  ]);
  assert(signature.includes("Account"));
  assert(signature.includes("Settings"));
  assert(signature.includes("Admin"));
  assert(signature.includes("Browse"));
});

test("Start Menu model keeps Casino in Gaming and My Games in My Media", () => {
  const groups = buildStartMenuGroups(PAGE_DEFS, {}, "contestant", {
    casinoMembershipActive: false,
  });
  const byKey = new Map(groups.map((group) => [group.key, group]));
  const gaming = byKey.get("gaming")!;
  const myMedia = byKey.get("my-media")!;

  assert.deepEqual(
    gaming.items.map((item) => item.label),
    ["WTF Casino", "WTF Arcade", "Game Console", "Game Studio"]
  );
  assert.equal(gaming.items.find((item) => item.path === "/casino")?.disabled, true);
  assert.equal(myMedia.items.find((item) => item.label === "My Games")?.path, "/console");
});

test("Start Menu model respects auth roles and desktop app gates", () => {
  const guestGroups = buildStartMenuGroups(PAGE_DEFS, {}, null);
  const guestPaths = guestGroups.flatMap((group) => group.items.map((item) => item.path));

  assert(guestPaths.includes("/gallery"));
  assert(!guestPaths.includes("/dashboard"));
  assert(!guestPaths.includes("/admin"));

  const userGroups = buildStartMenuGroups(
    PAGE_DEFS,
    {
      arcade: false,
      console: false,
      gallery: false,
    },
    "contestant"
  );
  const userPaths = userGroups.flatMap((group) => group.items.map((item) => item.path));

  assert(userPaths.includes("/mission-control"));
  assert(userPaths.includes("/dashboard"));
  assert(!userPaths.includes("/arcade"));
  assert(!userPaths.includes("/console"));
  assert(!userPaths.includes("/my-gallery"));
  assert(!userPaths.includes("/admin"));
});

test("Start Menu hides every app entry from time out accounts", () => {
  const groups = buildStartMenuGroups(PAGE_DEFS, {}, "time_out");
  assert.deepEqual(groups, []);
});

test("Start Menu keeps admin tools out of the first-class app rail", () => {
  const entries = buildStartMenuEntries(PAGE_DEFS, {}, "admin", {
    casinoMembershipActive: true,
  });
  const appsGroup = entries.find(
    (entry) => entry.kind === "group" && entry.group.key === "apps"
  );
  assert(appsGroup && appsGroup.kind === "group");

  const appPaths = appsGroup.group.items.map((item) => item.path);
  const adminGroup = entries.find(
    (entry) => entry.kind === "group" && entry.group.key === "admin"
  );
  assert(adminGroup && adminGroup.kind === "group");
  const adminPaths = adminGroup.group.items.map((item) => item.path);

  assert(!appPaths.includes("/admin"));
  assert(!appPaths.includes("/control-board"));
  assert(!appPaths.includes("/contract-factory"));
  assert(!appPaths.includes("/operator-wallet"));

  assert(adminPaths.includes("/admin"));
  assert(adminPaths.includes("/control-board"));
  assert(adminPaths.includes("/contract-factory"));
  assert(adminPaths.includes("/operator-wallet"));
});

test("Start Menu groups settings and keeps every flyout chunkable into six-item columns", () => {
  const groups = buildStartMenuGroups(PAGE_DEFS, {}, "admin", {
    casinoMembershipActive: true,
  });
  const byKey = new Map(groups.map((group) => [group.key, group]));
  const account = byKey.get("account")!;
  const settings = byKey.get("settings")!;

  assert.deepEqual(
    account.items.map((item) => item.path),
    [
      "/mission-control",
      "/dashboard",
      "/profile",
      "/notification-center",
      "/file-manager",
      "/command-palette",
      "/task-manager",
    ]
  );
  assert(settings.items.includes(settings.items.find((item) => item.path === "/desktop-settings")!));
  assert(settings.items.includes(settings.items.find((item) => item.path === "/recovery-mode")!));

  for (const group of groups) {
    const columnCount = Math.ceil(group.items.length / 6);
    for (let index = 0; index < columnCount; index += 1) {
      assert(group.items.slice(index * 6, index * 6 + 6).length <= 6);
    }
  }
});

test("Start Menu search filters across grouped apps without flattening the menu", () => {
  const entries = buildStartMenuEntries(PAGE_DEFS, {}, "contestant", {
    casinoMembershipActive: false,
  });
  const filtered = filterStartMenuEntriesByQuery(entries, "quest");
  const groups = filtered.flatMap((entry) => (entry.kind === "group" ? [entry.group] : []));

  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "Gameshow");
  assert.deepEqual(
    groups[0].items.map((item) => item.label),
    ["Side Quests"]
  );
});

test("Start Menu search can open a whole category by group name", () => {
  const entries = buildStartMenuEntries(PAGE_DEFS, {}, "contestant", {
    casinoMembershipActive: false,
  });
  const filtered = filterStartMenuEntriesByQuery(entries, "gaming");
  const groups = filtered.flatMap((entry) => (entry.kind === "group" ? [entry.group] : []));

  assert.equal(groups[0].label, "Gaming");
  assert.deepEqual(
    groups[0].items.map((item) => item.label),
    ["WTF Casino", "WTF Arcade", "Game Console", "Game Studio"]
  );
});
