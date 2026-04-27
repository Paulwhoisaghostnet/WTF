import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyHamsterAction,
  DEFAULT_DESKTOP_APPEARANCE,
  deriveHamsterSnapshot,
  normalizeDesktopAppearance,
  normalizeIconLayout,
} from "./desktop";

test("normalizes desktop appearance while keeping valid personalization", () => {
  const normalized = normalizeDesktopAppearance({
    colorSchemeKey: "hotdog-stand",
    desktopColor: "#ff0000",
    windowColor: "#ffff00",
    textColor: "#00ff00",
    backgroundImageUrl: "https://example.com/wallpaper.png",
    backgroundFit: "tile",
    cursorStyle: "paintbrush",
    desktopPhysicsEnabled: true,
    desktopGravityMode: "zero",
    desktopPetEnabled: true,
  });

  assert.equal(normalized.colorSchemeKey, "hotdog-stand");
  assert.equal(normalized.desktopColor, "#ff0000");
  assert.equal(normalized.windowColor, "#ffff00");
  assert.equal(normalized.textColor, "#00ff00");
  assert.equal(normalized.backgroundImageUrl, "https://example.com/wallpaper.png");
  assert.equal(normalized.backgroundFit, "tile");
  assert.equal(normalized.cursorStyle, "paintbrush");
  assert.equal(normalized.desktopPhysicsEnabled, true);
  assert.equal(normalized.desktopGravityMode, "zero");
  assert.equal(normalized.desktopPetEnabled, true);
});

test("falls back to safe desktop appearance defaults for bad input", () => {
  const normalized = normalizeDesktopAppearance({
    colorSchemeKey: "nope",
    desktopColor: "red",
    windowColor: "#xyz",
    textColor: null,
    backgroundImageUrl: "javascript:alert(1)",
    backgroundFit: "stretch",
    cursorStyle: "laser",
    desktopPhysicsEnabled: "true",
    desktopGravityMode: "moon",
    desktopPetEnabled: "yes",
  });

  assert.deepEqual(normalized, DEFAULT_DESKTOP_APPEARANCE);
});

test("normalizes icon layout and discards malformed coordinates", () => {
  const layout = normalizeIconLayout(
    {
      hoard: { x: 100.5, y: 82 },
      w: { x: -20, y: Infinity },
      tv: { x: 99999, y: 120 },
      mystery: { x: 10, y: 10 },
    },
    ["hoard", "w", "tv"]
  );

  assert.deepEqual(layout, {
    hoard: { x: 101, y: 82 },
    tv: { x: 99999, y: 120 },
  });
});

test("hamster dies after three missed care days", () => {
  const snapshot = deriveHamsterSnapshot(
    {
      name: "Niblet",
      alive: true,
      hunger: 80,
      thirst: 75,
      happiness: 70,
      hygiene: 60,
      energy: 45,
      level: 1,
      xpEarned: 0,
      missedCareDays: 0,
      careStreak: 4,
      lastCareDate: "2026-04-20",
      lastInteractionAt: "2026-04-20T10:00:00.000Z",
      interactionCounts: {},
    },
    new Date("2026-04-23T12:00:00.000Z")
  );

  assert.equal(snapshot.alive, false);
  assert.equal(snapshot.missedCareDays, 3);
  assert.equal(snapshot.hunger, 0);
  assert.equal(snapshot.thirst, 0);
});

test("hamster care actions update stats, daily streak, and XP", () => {
  const result = applyHamsterAction(
    {
      name: "Niblet",
      alive: true,
      hunger: 20,
      thirst: 40,
      happiness: 50,
      hygiene: 55,
      energy: 25,
      level: 1,
      xpEarned: 0,
      missedCareDays: 1,
      careStreak: 2,
      lastCareDate: "2026-04-25",
      lastInteractionAt: "2026-04-25T10:00:00.000Z",
      interactionCounts: { feed: 1 },
    },
    "feed",
    new Date("2026-04-26T12:00:00.000Z")
  );

  assert.equal(result.next.hunger, 55);
  assert.equal(result.next.careStreak, 3);
  assert.equal(result.next.missedCareDays, 0);
  assert.equal(result.next.lastCareDate, "2026-04-26");
  assert.equal(result.next.interactionCounts.feed, 2);
  assert.equal(result.next.xpEarned, 4);
  assert.equal(result.xpAmount, 4);
});
