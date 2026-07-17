import assert from "node:assert/strict";
import { test } from "node:test";
import type { HamsterState } from "./desktop";
import {
  applyHamsterAction,
  createGeneratedHamsterState,
  DEFAULT_DESKTOP_APPEARANCE,
  DEFAULT_HAMSTER_STATE,
  DESKTOP_APPEARANCE_STYLES,
  DESKTOP_COLOR_SCHEMES,
  DESKTOP_CURSOR_STYLES,
  DESKTOP_ICON_LAYOUT_KEYS,
  DESKTOP_WALLPAPER_UPLOAD_MAX_BYTES,
  HAMSTER_COLOR_SCHEMES,
  HAMSTER_CORE_STAT_KEYS,
  generateHamsterGenetics,
  deriveHamsterSnapshot,
  HAMSTER_EMOTION_COUNT_KEYS,
  HAMSTER_HEALTH_COUNT_KEYS,
  desktopSundayGrassWeeksBetween,
  hamsterNeedSatisfactionScore,
  mediaLibraryWallpaperUrl,
  normalizeHamsterGenetics,
  normalizeDesktopAppearance,
  normalizeIconLayout,
  projectDesktopSundayGrassState,
  recordHamsterHappinessSnapshot,
  serializeHamsterInteractionCounts,
  tokenWallpaperUrl,
} from "./desktop";

test("normalizes desktop appearance while forcing platform font selections", () => {
  const longCacheUrl = `/api/cache/media?url=${encodeURIComponent(
    `https://example.com/${"nested/".repeat(80)}wallpaper.png`
  )}`;
  const normalized = normalizeDesktopAppearance({
    appearanceStyleKey: "wtf-xp",
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
    fontPackKey: "terminal",
    chatTypographyPresetKey: "editorial",
    wimChatStyle: {
      fontFamily: "Georgia",
      fontSize: 14,
      color: "#3a2511",
      bold: false,
      italic: true,
      underline: false,
    },
    wtfLiveChatStyle: {
      font: "serif-press",
      color: "amber",
      size: 13,
      bold: false,
      italic: true,
    },
  });

  assert.equal(normalized.appearanceStyleKey, "wtf-xp");
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
  assert.equal(normalized.fontPackKey, "wtfos-soft-system");
  assert.equal(normalized.chatTypographyPresetKey, "editorial");
  assert.deepEqual(normalized.wimChatStyle, {
    fontFamily: "wtfOS Soft Sans",
    fontSize: 14,
    color: "#3a2511",
    bold: false,
    italic: true,
    underline: false,
  });
  assert.deepEqual(normalized.wtfLiveChatStyle, {
    font: "serif-press",
    color: "amber",
    size: 13,
    bold: false,
    italic: true,
  });
});

test("falls back to safe desktop appearance defaults for bad input", () => {
  const normalized = normalizeDesktopAppearance({
    appearanceStyleKey: "vista-but-not-really",
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
  assert.equal(DEFAULT_DESKTOP_APPEARANCE.appearanceStyleKey, "classic-95");
  assert.equal(DEFAULT_DESKTOP_APPEARANCE.fontPackKey, "wtfos-soft-system");
  assert.equal(DEFAULT_DESKTOP_APPEARANCE.chatTypographyPresetKey, "wtfos-default");
  assert.deepEqual(DEFAULT_DESKTOP_APPEARANCE.wimChatStyle, {
    fontFamily: "wtfOS Soft Sans",
    fontSize: 12,
    color: "#06135f",
    bold: false,
    italic: false,
    underline: false,
  });
  assert.deepEqual(DEFAULT_DESKTOP_APPEARANCE.wtfLiveChatStyle, {
    font: "wtfos-soft-system",
    color: "ink",
    size: 12,
    bold: false,
    italic: false,
  });
  assert.equal(DEFAULT_DESKTOP_APPEARANCE.cursorStyle, "eggplant");
  assert.deepEqual(
    DESKTOP_APPEARANCE_STYLES.map((style) => style.key),
    ["classic-95", "wtf-xp", "wtf-aqua", "wtf-zine"]
  );
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

test("normalizes desktop chat typography defaults inside composer windows", () => {
  const normalized = normalizeDesktopAppearance({
    chatTypographyPresetKey: "loud-display",
    wimChatStyle: {
      fontFamily: "Papyrus",
      fontSize: 999,
      color: "purple",
      bold: "yes",
      italic: true,
      underline: false,
    },
    wtfLiveChatStyle: {
      font: "mono",
      color: "neon",
      size: 99,
      bold: true,
      italic: "yes",
    },
  });

  assert.equal(normalized.chatTypographyPresetKey, "loud-display");
  assert.deepEqual(normalized.wimChatStyle, {
    fontFamily: "wtfOS Soft Sans",
    fontSize: 18,
    color: "#8f1d2c",
    bold: true,
    italic: true,
    underline: false,
  });
  assert.deepEqual(normalized.wtfLiveChatStyle, {
    font: "wtfos-soft-system",
    color: "red",
    size: 14,
    bold: true,
    italic: false,
  });
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

test("desktop icon layout allow-list covers every first-party desktop icon", () => {
  assert.deepEqual([...DESKTOP_ICON_LAYOUT_KEYS], [
    "recycle-bin",
    "mission-control",
    "command-palette",
    "wtfiam",
    "hoard",
    "wim",
    "w",
    "skywire",
    "wtf-live",
    "tz2at",
    "crp-nominations",
    "rat-race",
    "map-lab",
    "agent",
    "applications",
    "mail",
    "tv",
    "dicksword",
    "i-hate-telegram",
    "dear-diary",
    "arcade",
    "casino",
    "dedrooms",
    "dues-manager",
    "console",
    "game-studio",
    "studio",
    "ipfs-pinning",
    "my-gallery",
    "objkt-operator",
  ]);

  const layout = normalizeIconLayout(
    Object.fromEntries(
      DESKTOP_ICON_LAYOUT_KEYS.map((key, index) => [key, { x: index * 10, y: index * 20 }])
    ),
    DESKTOP_ICON_LAYOUT_KEYS
  );

  assert.equal(Object.keys(layout).length, DESKTOP_ICON_LAYOUT_KEYS.length);
  const wtfiamIndex = DESKTOP_ICON_LAYOUT_KEYS.indexOf("wtfiam");
  assert.deepEqual(layout["wtfiam"], { x: wtfiamIndex * 10, y: wtfiamIndex * 20 });
  const arcadeIndex = DESKTOP_ICON_LAYOUT_KEYS.indexOf("arcade");
  const gameStudioIndex = DESKTOP_ICON_LAYOUT_KEYS.indexOf("game-studio");
  assert.deepEqual(layout["arcade"], { x: arcadeIndex * 10, y: arcadeIndex * 20 });
  assert.deepEqual(layout["game-studio"], { x: gameStudioIndex * 10, y: gameStudioIndex * 20 });
});

test("desktop Sunday grass appears only on Sundays and grows each new Sunday", () => {
  const saturday = new Date(2026, 4, 9, 12);
  const firstSunday = new Date(2026, 4, 10, 12);
  const nextSunday = new Date(2026, 4, 17, 12);
  const laterSunday = new Date(2026, 4, 31, 12);

  assert.equal(
    projectDesktopSundayGrassState(null, saturday, { x: 88, y: 144 }).visible,
    false
  );

  const first = projectDesktopSundayGrassState(null, firstSunday, { x: 88, y: 144 });
  assert.equal(first.visible, true);
  assert.equal(first.state?.heightStage, 1);
  assert.equal(first.state?.lastSundayKey, "2026-05-10");

  const repeat = projectDesktopSundayGrassState(first.state, firstSunday, { x: 300, y: 300 });
  assert.equal(repeat.state?.heightStage, 1);
  assert.equal(repeat.state?.x, 88);

  const second = projectDesktopSundayGrassState(first.state, nextSunday, { x: 300, y: 300 });
  assert.equal(second.state?.heightStage, 2);
  assert.equal(second.state?.lastSundayKey, "2026-05-17");

  const skipped = projectDesktopSundayGrassState(second.state, laterSunday, { x: 300, y: 300 });
  assert.equal(skipped.state?.heightStage, 4);
  assert.equal(desktopSundayGrassWeeksBetween("2026-05-17", "2026-05-31"), 2);
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

test("petting and poop exposure affect cleanliness and sickness risk", () => {
  const base = {
    name: "Scritch",
    colorSchemeKey: "golden" as const,
    alive: true,
    hunger: 80,
    thirst: 80,
    happiness: 55,
    hygiene: 82,
    energy: 60,
    level: 1,
    xpEarned: 0,
    carePoints: 0,
    missedCareDays: 0,
    careStreak: 0,
    lastCareDate: "2026-05-04",
    lastInteractionAt: "2026-05-04T10:00:00.000Z",
    interactionCounts: {},
  };

  const petted = applyHamsterAction(base, "pet", new Date("2026-05-04T12:00:00.000Z"));
  assert.equal(petted.next.hygiene, 79);
  assert.equal(petted.next.happiness, 75);

  const pooped = applyHamsterAction(petted.next, "poop", new Date("2026-05-04T12:02:00.000Z"));
  assert.equal(pooped.xpAmount, 0);
  assert.equal(pooped.next.poopExposure, 1);
  assert.ok(pooped.next.hygiene < petted.next.hygiene);
  assert.ok(pooped.next.sicknessRisk > 0);

  const cleaned = applyHamsterAction(pooped.next, "clean", new Date("2026-05-04T12:04:00.000Z"));
  assert.equal(cleaned.next.poopExposure, 0);
  assert.equal(cleaned.next.sicknessRisk, 0);
  assert.ok(cleaned.next.hygiene > pooped.next.hygiene);
});

test("sick hamsters require medicine and rest before recovery", () => {
  const sick = {
    name: "Soup",
    colorSchemeKey: "golden" as const,
    alive: true,
    hunger: 80,
    thirst: 80,
    happiness: 45,
    hygiene: 38,
    energy: 20,
    sick: true,
    sicknessRisk: 80,
    medicineDoses: 0,
    restDoses: 0,
    poopExposure: 2,
    level: 1,
    xpEarned: 0,
    carePoints: 0,
    missedCareDays: 0,
    careStreak: 0,
    lastCareDate: "2026-05-04",
    lastInteractionAt: "2026-05-04T10:00:00.000Z",
    interactionCounts: {},
  };

  const medicated = applyHamsterAction(sick, "medicine", new Date("2026-05-04T12:00:00.000Z"));
  assert.equal(medicated.next.sick, true);
  assert.equal(medicated.next.medicineDoses, 1);
  assert.equal(medicated.next.restDoses, 0);

  const rested = applyHamsterAction(medicated.next, "nap", new Date("2026-05-04T12:02:00.000Z"));
  assert.equal(rested.next.sick, false);
  assert.equal(rested.next.medicineDoses, 0);
  assert.equal(rested.next.restDoses, 0);
  assert.ok(rested.next.energy > medicated.next.energy);
});

test("hamster health counters serialize through interaction counts", () => {
  const state = {
    ...DEFAULT_HAMSTER_STATE,
    sick: true,
    sicknessRisk: 64,
    medicineDoses: 1,
    restDoses: 2,
    poopExposure: 3,
    bondXp: 144,
    happinessIndexScore: 82,
    happinessSampleCount: 5,
    trauma: 11,
    interactionCounts: {
      pet: 4,
      [HAMSTER_EMOTION_COUNT_KEYS.happinessLastRecordedAt]: Date.parse("2026-05-04T11:30:00.000Z"),
    },
  };
  const counts = serializeHamsterInteractionCounts(state);
  assert.equal(counts[HAMSTER_HEALTH_COUNT_KEYS.sick], 1);
  assert.equal(counts[HAMSTER_HEALTH_COUNT_KEYS.sicknessRisk], 64);
  assert.equal(counts[HAMSTER_HEALTH_COUNT_KEYS.poopExposure], 3);
  assert.equal(counts[HAMSTER_EMOTION_COUNT_KEYS.bondXp], 144);
  assert.equal(counts[HAMSTER_EMOTION_COUNT_KEYS.happinessIndexScore], 82);
  assert.equal(counts[HAMSTER_EMOTION_COUNT_KEYS.trauma], 11);

  const restored = deriveHamsterSnapshot(
    {
      name: "Niblet",
      colorSchemeKey: "golden" as const,
      alive: true,
      hunger: 72,
      thirst: 72,
      happiness: 68,
      hygiene: 70,
      energy: 64,
      level: 1,
      xpEarned: 0,
      carePoints: 0,
      missedCareDays: 0,
      careStreak: 0,
      interactionCounts: counts,
      lastCareDate: "2026-05-04",
    },
    new Date("2026-05-04T12:00:00.000Z")
  );
  assert.equal(restored.sick, true);
  assert.equal(restored.medicineDoses, 1);
  assert.equal(restored.restDoses, 2);
  assert.equal(restored.poopExposure, 3);
  assert.equal(restored.bondXp, 144);
  assert.equal(restored.bondLevel, 3);
  assert.equal(restored.trauma, 11);
});

test("happiness index records needs, raises bond, and triggers trauma from low scores", () => {
  const happy = applyHamsterAction(
    {
      ...DEFAULT_HAMSTER_STATE,
      hunger: 92,
      thirst: 90,
      happiness: 86,
      hygiene: 88,
      energy: 82,
      careStreak: 4,
      lastCareDate: "2026-05-04",
      interactionCounts: {
        [HAMSTER_EMOTION_COUNT_KEYS.happinessLastRecordedAt]: Date.parse("2026-05-04T00:00:00.000Z"),
        [HAMSTER_EMOTION_COUNT_KEYS.happinessSampleCount]: 1,
        [HAMSTER_EMOTION_COUNT_KEYS.happinessIndexScore]: 84,
      },
    },
    "pet",
    new Date("2026-05-04T08:00:00.000Z")
  );
  assert.ok(hamsterNeedSatisfactionScore(happy.next) >= 80);
  assert.ok(happy.next.happinessSampleCount >= 2);
  assert.ok(happy.next.happinessIndexScore >= 80);
  assert.ok(happy.next.bondXp > 0);
  assert.ok(happy.next.bondLevel >= 1);

  const neglected = deriveHamsterSnapshot(
    {
      ...DEFAULT_HAMSTER_STATE,
      hunger: 1,
      thirst: 1,
      happiness: 5,
      hygiene: 3,
      energy: 2,
      lastCareDate: "2026-05-04",
      interactionCounts: {
        [HAMSTER_EMOTION_COUNT_KEYS.happinessLastRecordedAt]: Date.parse("2026-05-04T00:00:00.000Z"),
        [HAMSTER_EMOTION_COUNT_KEYS.happinessSampleCount]: 2,
        [HAMSTER_EMOTION_COUNT_KEYS.happinessIndexScore]: 42,
      },
    },
    new Date("2026-05-04T08:00:00.000Z")
  );
  assert.ok(neglected.happinessIndexScore < 42);
  assert.ok(neglected.trauma > 0);
  assert.ok(
    Number(neglected.interactionCounts[HAMSTER_EMOTION_COUNT_KEYS.traumaTriggeredAt] ?? 0) > 0
  );
});

test("hamster trauma only recovers after repeated high-happiness care", () => {
  let recovering: HamsterState = {
    ...DEFAULT_HAMSTER_STATE,
    hunger: 96,
    thirst: 95,
    happiness: 94,
    hygiene: 93,
    energy: 91,
    trauma: 42,
    careStreak: 6,
    happinessIndexScore: 82,
    happinessSampleCount: 4,
    interactionCounts: {
      [HAMSTER_EMOTION_COUNT_KEYS.happinessLastRecordedAt]: Date.parse("2026-05-04T00:00:00.000Z"),
      [HAMSTER_EMOTION_COUNT_KEYS.happinessSampleCount]: 4,
      [HAMSTER_EMOTION_COUNT_KEYS.happinessIndexScore]: 82,
      [HAMSTER_EMOTION_COUNT_KEYS.trauma]: 42,
      [HAMSTER_EMOTION_COUNT_KEYS.traumaRecoveryScore]: 0,
    },
  };

  recovering = recordHamsterHappinessSnapshot(
    recovering,
    new Date("2026-05-04T07:00:00.000Z")
  );
  assert.equal(recovering.trauma, 42);
  assert.equal(recovering.interactionCounts[HAMSTER_EMOTION_COUNT_KEYS.traumaRecoveryScore], 1);

  recovering = recordHamsterHappinessSnapshot(
    recovering,
    new Date("2026-05-04T14:00:00.000Z")
  );
  assert.equal(recovering.trauma, 42);
  assert.equal(recovering.interactionCounts[HAMSTER_EMOTION_COUNT_KEYS.traumaRecoveryScore], 2);

  recovering = recordHamsterHappinessSnapshot(
    recovering,
    new Date("2026-05-04T21:00:00.000Z")
  );
  assert.ok(recovering.trauma < 42);
  assert.equal(recovering.interactionCounts[HAMSTER_EMOTION_COUNT_KEYS.traumaRecoveryScore], 0);
});

test("new hamsters get deterministic founder genetics for racing and breeding", () => {
  const first = createGeneratedHamsterState({
    seed: "founder-test-radioactive-or-not",
    now: new Date("2026-05-04T12:00:00.000Z"),
  });
  const second = createGeneratedHamsterState({
    seed: "founder-test-radioactive-or-not",
    now: new Date("2026-05-04T12:00:00.000Z"),
  });

  assert.deepEqual(first.genetics, second.genetics);
  assert.equal(first.lastCareDate, "2026-05-04");
  assert.equal(first.lastInteractionAt, "2026-05-04T12:00:00.000Z");
  assert.ok(["common", "uncommon", "rare", "epic", "legendary"].includes(first.genetics.rarityTier));
  for (const key of HAMSTER_CORE_STAT_KEYS) {
    assert.ok(first.genetics.baseStats[key] >= 1 && first.genetics.baseStats[key] <= 100);
    assert.ok(first.genetics.effectiveStats[key] >= 1 && first.genetics.effectiveStats[key] <= 100);
  }
});

test("rare hamster attributes apply bonuses and forced appearance", () => {
  let radioactiveSeed = "";
  for (let i = 0; i < 5_000; i += 1) {
    const seed = `rare-fixture-${i}`;
    const genetics = generateHamsterGenetics(seed);
    if (genetics.attributes.some((attribute) => attribute.key === "radioactive")) {
      radioactiveSeed = seed;
      break;
    }
  }
  assert.ok(radioactiveSeed);

  const genetics = generateHamsterGenetics(radioactiveSeed);
  const radioactive = genetics.attributes.find((attribute) => attribute.key === "radioactive");
  assert.ok(radioactive);
  assert.equal(genetics.rarityTier, "legendary");
  assert.equal(genetics.phenotype.forcedColorSchemeKey, "radioactive");
  assert.equal(genetics.phenotype.glow, true);
  assert.ok(genetics.effectiveStats.metabolism > genetics.baseStats.metabolism);

  const normalized = normalizeHamsterGenetics({
    ...genetics,
    effectiveStats: { ...genetics.effectiveStats, speed: 999 },
  });
  assert.equal(normalized.effectiveStats.speed, Math.min(100, genetics.baseStats.speed + genetics.statBonuses.speed));
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
    "/api/cache/media?url=https%3A%2F%2Fnftstorage.link%2Fipfs%2Fbafybeigdyrzt"
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
    "/api/cache/media?url=https%3A%2F%2Fnftstorage.link%2Fipfs%2Fdisplay"
  );
  assert.equal(
    tokenWallpaperUrl({
      thumbnail: "https://example.com/thumb.jpg",
      metadata: {},
    }),
    "/api/cache/media?url=https%3A%2F%2Fexample.com%2Fthumb.jpg"
  );
});
