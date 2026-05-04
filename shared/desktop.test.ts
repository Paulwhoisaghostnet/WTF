import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyHamsterAction,
  DEFAULT_DESKTOP_APPEARANCE,
  DESKTOP_COLOR_SCHEMES,
  DESKTOP_CURSOR_STYLES,
  DESKTOP_WALLPAPER_UPLOAD_MAX_BYTES,
  HAMSTER_COLOR_SCHEMES,
  deriveHamsterSnapshot,
  mediaLibraryWallpaperUrl,
  normalizeDesktopAppearance,
  normalizeIconLayout,
  tokenWallpaperUrl,
} from "./desktop";

test("normalizes desktop appearance while keeping valid personalization", () => {
  const longCacheUrl = `/api/cache/media?url=${encodeURIComponent(
    `https://example.com/${"nested/".repeat(80)}wallpaper.png`
  )}`;
  const normalized = normalizeDesktopAppearance({
    colorSchemeKey: "hotdog-stand",
    desktopColor: "#ff0000",
    windowColor: "#ffff00",
    textColor: "#00ff00",
    backgroundImageUrl: longCacheUrl,
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
  assert.equal(normalized.backgroundImageUrl, longCacheUrl);
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

test("desktop appearance defaults are aubergine-first with a broad preset set", () => {
  assert.equal(DEFAULT_DESKTOP_APPEARANCE.cursorStyle, "eggplant");
  assert.ok(DESKTOP_COLOR_SCHEMES.length >= 10);
  assert.ok(DESKTOP_CURSOR_STYLES.length >= 21);
  assert.ok(new Set(DESKTOP_COLOR_SCHEMES.map((scheme) => scheme.desktopColor)).size >= 10);
  for (const cursorStyle of [
    "pixel-arrow",
    "crosshair",
    "bow-arrow",
    "carrot",
    "horse-runner",
    "horf",
    "guinea-pig-runner",
    "ant-runner",
    "a11-rocket",
    "hatchet",
    "tezos-classic",
    "tezos-current",
    "blang-side-eye",
  ]) {
    assert.ok(DESKTOP_CURSOR_STYLES.includes(cursorStyle as any));
  }
  assert.equal(DESKTOP_CURSOR_STYLES.includes("glitch-block" as any), false);
  assert.equal(DESKTOP_CURSOR_STYLES.includes("rubber-stamp" as any), false);
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
      colorSchemeKey: "aubergine",
      alive: true,
      hunger: 20,
      thirst: 40,
      happiness: 50,
      hygiene: 55,
      energy: 25,
      level: 1,
      xpEarned: 0,
      carePoints: 3,
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
  assert.equal(result.next.colorSchemeKey, "aubergine");
  assert.equal(result.next.carePoints, 3);
  assert.equal(result.next.careStreak, 3);
  assert.equal(result.next.missedCareDays, 0);
  assert.equal(result.next.lastCareDate, "2026-04-26");
  assert.equal(result.next.interactionCounts.feed, 2);
  assert.equal(result.next.xpEarned, 4);
  assert.equal(result.xpAmount, 4);
});

test("hamster schemes and scooper care points normalize safely", () => {
  assert.ok(HAMSTER_COLOR_SCHEMES.length >= 24);

  const snapshot = deriveHamsterSnapshot(
    {
      name: "  Waffles  ",
      colorSchemeKey: "radioactive",
      alive: true,
      hunger: 70,
      thirst: 70,
      happiness: 70,
      hygiene: 20,
      energy: 70,
      level: 1,
      xpEarned: 0,
      carePoints: 2,
      missedCareDays: 0,
      careStreak: 0,
      lastCareDate: "2026-04-26",
      lastInteractionAt: null,
      interactionCounts: {},
    },
    new Date("2026-04-26T12:00:00.000Z")
  );
  assert.equal(snapshot.name, "Waffles");
  assert.equal(snapshot.colorSchemeKey, "radioactive");

  const result = applyHamsterAction(snapshot, "scoop", new Date("2026-04-26T12:00:00.000Z"));
  assert.equal(result.next.hygiene, 35);
  assert.equal(result.next.carePoints, 3);
  assert.equal(result.next.interactionCounts.scoop, 1);
  assert.equal(result.xpAmount, 4);
});

test("resolves stored media items into usable desktop wallpaper URLs", () => {
  assert.equal(DESKTOP_WALLPAPER_UPLOAD_MAX_BYTES, 25 * 1024 * 1024);
  assert.equal(
    mediaLibraryWallpaperUrl({
      id: 12,
      sourceType: "upload",
      sourceUrl: "disk://abc.png",
      playbackUrl: null,
    }),
    "/api/media/12/file"
  );
  assert.equal(
    mediaLibraryWallpaperUrl({
      id: 13,
      sourceType: "ipfs",
      sourceUrl: "ipfs://bafybeigdyrzt",
      playbackUrl: null,
    }),
    "/api/cache/media?url=https%3A%2F%2Fipfs.io%2Fipfs%2Fbafybeigdyrzt"
  );
  assert.equal(
    mediaLibraryWallpaperUrl({
      id: 14,
      sourceType: "remote",
      sourceUrl: "https://example.com/wall.png",
      playbackUrl: null,
    }),
    "/api/cache/media?url=https%3A%2F%2Fexample.com%2Fwall.png"
  );
});

test("resolves owned token image metadata into desktop wallpaper URLs", () => {
  assert.equal(
    tokenWallpaperUrl({
      thumbnail: "",
      metadata: {
        thumbnailUri: "ipfs://thumb",
        displayUri: "ipfs://display",
        artifactUri: "ipfs://artifact",
      },
    }),
    "/api/cache/media?url=https%3A%2F%2Fipfs.io%2Fipfs%2Fdisplay"
  );
  assert.equal(
    tokenWallpaperUrl({
      thumbnail: "https://example.com/thumb.jpg",
      metadata: {},
    }),
    "/api/cache/media?url=https%3A%2F%2Fexample.com%2Fthumb.jpg"
  );
});
