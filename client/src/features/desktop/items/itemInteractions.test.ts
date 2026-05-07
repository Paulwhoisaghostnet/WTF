import assert from "node:assert/strict";
import { test } from "node:test";
import type { HamsterState } from "@shared/desktop";
import { applyAntItemInteractions } from "../ants/itemInteractions";
import type { AntState } from "../ants/model";
import {
  cleanDesktopMessesAtPoint,
  cleanMessDropWithTool,
  createDesktopMessDrop,
} from "../drops/itemInteractions";
import type { PetDrop } from "../drops/model";
import { applyPetItemInteractions } from "../pet/itemInteractions";
import {
  applyBallItemInteractions,
  ballSmearDrop,
  dirtyBallFromDrop,
  markStickyNotesFromDirtyBall,
} from "../toys/itemInteractions";
import type { PetToyState } from "../toys/model";
import {
  canMaterialBeShredded,
  materialForDesktopKind,
} from "../materials";
import {
  createDesktopArtifactItem,
  createGenericDesktopArtifact,
} from "./useDesktopItemActions";
import type { DesktopItemState } from "./model";
import { normalizeDesktopItems } from "./storage";

const bounds = { width: 500, height: 360 };

function stickyNote(overrides: Partial<Extract<DesktopItemState, { kind: "sticky-note" }>> = {}) {
  return {
    id: "note-1",
    kind: "sticky-note" as const,
    x: 40,
    y: 40,
    createdAt: 1,
    text: "",
    stickiness: 1,
    stickyWetness: 0,
    paperWetness: 0,
    curl: 0,
    strokes: [],
    marks: [],
    lastPetLessonAt: 0,
    ...overrides,
  };
}

function ant(overrides: Partial<AntState> = {}): AntState {
  return {
    id: "ant-1",
    x: 92,
    y: 118,
    spawnX: 0,
    spawnY: 0,
    targetFoodId: null,
    phase: "exploring",
    phaseStartedAt: 1,
    path: [],
    pathIndex: 0,
    angle: 0,
    carrying: false,
    lastTrailAt: 0,
    lastRetargetAt: 0,
    ...overrides,
  };
}

function ball(overrides: Partial<PetToyState> = {}): PetToyState {
  return {
    id: "ball-1",
    kind: "ball",
    x: 76,
    y: 92,
    vx: 90,
    vy: 0,
    color: "#f047a6",
    owner: "local",
    createdAt: 1,
    lastPetHitAt: 0,
    lastMessAt: 0,
    ...overrides,
  };
}

test("sticky note traps can fully stick ants based on foot coverage and glue load", () => {
  const originalRandom = Math.random;
  Math.random = () => 0.99;
  try {
    const result = applyAntItemInteractions({
      ant: ant({ glueLoad: 0.72 }),
      items: [stickyNote()],
      bounds,
      now: 10_000,
    });
    assert.equal(result.stuck, true);
    assert.equal(result.speedMultiplier, 0);
    assert.ok((result.ant.stuckUntil ?? 0) > 10_000);
  } finally {
    Math.random = originalRandom;
  }
});

test("pets learn from sticky notes and leave footprints on the note", () => {
  const result = applyPetItemInteractions({
    current: { x: 88, y: 70 },
    pet: { trauma: 12, energy: 60 } as HamsterState,
    items: [stickyNote()],
    bounds,
    now: 24_000,
  });
  assert.equal(result.changed, true);
  assert.equal(result.items[0].kind, "sticky-note");
  const note = result.items[0] as Extract<DesktopItemState, { kind: "sticky-note" }>;
  assert.equal(note.marks.length, 1);
  assert.ok(result.target);
  assert.ok(result.speedMultiplier < 1);
});

test("dirty balls smear mess and mark sticky notes", () => {
  const dirty = dirtyBallFromDrop(ball(), { id: "poop-1", kind: "poop", x: 82, y: 98 } as PetDrop, 100);
  assert.ok((dirty.dirtiness ?? 0) > 0.3);
  const smear = ballSmearDrop(dirty, 1500);
  assert.equal(smear.kind, "mess");
  const marked = markStickyNotesFromDirtyBall({
    toy: dirty,
    items: [stickyNote()],
    bounds,
    now: 1600,
  });
  assert.equal(marked.changed, true);
  const note = marked.items[0] as Extract<DesktopItemState, { kind: "sticky-note" }>;
  assert.equal(note.marks.length, 1);
});

test("mops reduce mess in three passes while vacuums erase it immediately", () => {
  const mess = createDesktopMessDrop({ x: 80, y: 80 }, { messiness: 1, radius: 40, now: 1 });
  const firstMop = cleanMessDropWithTool(mess, "mop", 2);
  assert.ok(firstMop);
  assert.ok((firstMop?.messiness ?? 1) < 1);
  const vacuumed = cleanMessDropWithTool(mess, "vacuum", 3);
  assert.equal(vacuumed, null);

  const cleaned = cleanDesktopMessesAtPoint([mess], { x: 80, y: 80 }, "mop", 4);
  assert.equal(cleaned.cleaned, true);
  assert.equal(cleaned.drops.length, 1);
  assert.ok((cleaned.drops[0]?.radius ?? 0) > (mess.radius ?? 0));
});

test("generic marketplace desktop artifacts normalize as movable desktop icons", () => {
  const catapult = createGenericDesktopArtifact("Catapult", "CAT", 90, 90, bounds, {
    sourceSku: "desktop-catapult",
    inventoryOrdinal: 1,
  });
  assert.equal(catapult.kind, "artifact-icon");
  assert.equal(catapult.sourceSku, "desktop-catapult");
  assert.equal(catapult.inventoryOrdinal, 1);

  const normalized = normalizeDesktopItems(
    [{ ...catapult, label: "Catapult".repeat(12), monogram: "catapult" }],
    bounds
  );
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.kind, "artifact-icon");
  const artifact = normalized[0] as Extract<DesktopItemState, { kind: "artifact-icon" }>;
  assert.equal(artifact.label.length, 40);
  assert.equal(artifact.monogram, "CATAP");
});

test("cursor tray scale mutations clamp and expire through desktop item storage", () => {
  const tray = createDesktopArtifactItem("cursor-tool-tray", 120, 120, bounds, {
    sourceSku: "desktop-cursor-tool-tray",
    inventoryOrdinal: 1,
  });
  const future = normalizeDesktopItems(
    [{ ...tray, scaleFactor: 99, scaleExpiresAt: Date.now() + 10_000 }],
    bounds
  );
  assert.equal(future.length, 1);
  assert.equal(future[0]?.kind, "cursor-tool-tray");
  assert.equal(future[0]?.scaleFactor, 2.5);

  const expired = normalizeDesktopItems(
    [{ ...tray, scaleFactor: 0.1, scaleExpiresAt: Date.now() - 10 }],
    bounds
  );
  assert.equal(expired[0]?.scaleFactor, undefined);
});

test("balls transit paired desktop portals without treating the portal as an obstacle", () => {
  const items: DesktopItemState[] = [
    {
      id: "portal-blue",
      kind: "portal",
      color: "blue",
      x: 80,
      y: 88,
      createdAt: 1,
      material: materialForDesktopKind("portal"),
    },
    {
      id: "portal-orange",
      kind: "portal",
      color: "orange",
      x: 330,
      y: 220,
      createdAt: 1,
      material: materialForDesktopKind("portal"),
    },
  ];
  const result = applyBallItemInteractions({
    toy: ball({ x: 88, y: 104, vx: 40, vy: 10 }),
    items,
    bounds,
    now: 5_000,
  });
  assert.ok(result.x > 320);
  assert.ok((result.lastPortalTransitAt ?? 0) >= 5_000);
});

test("paper shredder compatibility is declared by material, not item name", () => {
  assert.equal(canMaterialBeShredded(materialForDesktopKind("sticky-note")).compatible, true);
  assert.equal(canMaterialBeShredded(materialForDesktopKind("paper-shredder")).compatible, false);
});
