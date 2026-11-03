import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyWastebasket,
  normalizeWastebasket,
  permanentlyDeleteShortcut,
  readWastebasket,
  restoreShortcut,
  trashShortcut,
} from "./wastebasket";
import { DESKTOP_SHORTCUT_LIMIT, desktopShortcutStorageKey, type DesktopShortcut } from "./desktop-shortcuts";

function memoryStore() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
  };
}

const shortcut: DesktopShortcut = {
  id: "profile-1",
  label: "Profile",
  path: "/profile",
  icon: "P",
  x: 24,
  y: 36,
  createdAt: 100,
};

test("wastebasket preserves a valid shortcut for restore and rejects unsafe entries", () => {
  assert.deepEqual(normalizeWastebasket([{ ...shortcut, deletedAt: 200 }, {
    ...shortcut, id: "unsafe", path: "//evil.example", deletedAt: 201,
  }]), [{ ...shortcut, deletedAt: 200 }]);
  const store = memoryStore();
  trashShortcut(11, shortcut, store, 200);
  assert.equal(readWastebasket(11, store).length, 1);
  assert.equal(readWastebasket(12, store).length, 0);
  assert.equal(restoreShortcut(11, shortcut.id, { width: 640, height: 480 }, store), "restored");
  assert.equal(readWastebasket(11, store).length, 0);
  assert.deepEqual(JSON.parse(store.getItem(desktopShortcutStorageKey(11)) ?? "[]")[0], shortcut);
});

test("a full desktop keeps its trashed shortcut recoverable", () => {
  const store = memoryStore();
  const active = Array.from({ length: DESKTOP_SHORTCUT_LIMIT }, (_, index) => ({ ...shortcut, id: `active-${index}` }));
  store.setItem(desktopShortcutStorageKey(11), JSON.stringify(active));
  trashShortcut(11, shortcut, store, 200);
  assert.equal(restoreShortcut(11, shortcut.id, { width: 640, height: 480 }, store), "desktop-full");
  assert.equal(readWastebasket(11, store).length, 1);
  assert.equal(JSON.parse(store.getItem(desktopShortcutStorageKey(11)) ?? "[]").length, DESKTOP_SHORTCUT_LIMIT);
});

test("permanent deletion and emptying affect only the selected account's basket", () => {
  const store = memoryStore();
  trashShortcut(11, shortcut, store, 200);
  trashShortcut(11, { ...shortcut, id: "second" }, store, 201);
  trashShortcut(12, shortcut, store, 202);
  assert.equal(permanentlyDeleteShortcut(11, shortcut.id, store), true);
  assert.deepEqual(readWastebasket(11, store).map((item) => item.id), ["second"]);
  emptyWastebasket(11, store);
  assert.equal(readWastebasket(11, store).length, 0);
  assert.equal(readWastebasket(12, store).length, 1);
});
