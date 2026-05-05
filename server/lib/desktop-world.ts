import { createHash, randomUUID } from "crypto";
import {
  DESKTOP_WORLD_EDGES,
  type DesktopWorldEdge,
  type DesktopWorldEscapeRequest,
  type DesktopWorldEscapeResponse,
  type DesktopWorldFoodDrop,
  type DesktopWorldHeartbeatRequest,
  type DesktopWorldHeartbeatResponse,
  type DesktopWorldVisitor,
  type HamsterColorSchemeKey,
} from "@shared/desktop";

const ACTIVE_TTL_MS = 16_000;
const VISITOR_TTL_MS = 30_000;
const ANT_ISSUE_COOLDOWN_MS = 7_500;
const PASS_ISSUE_COOLDOWN_MS = 12_000;
const GUINEA_PIG_AWAY_MS = 24_000;
const MAX_ACTIVE_NEIGHBORS = 4;
const MAX_FOODS = 24;

interface HiddenTile {
  x: number;
  y: number;
}

interface DesktopWorldPresence {
  userId: number;
  tile: HiddenTile;
  viewport: {
    width: number;
    height: number;
  };
  foods: DesktopWorldFoodDrop[];
  lastSeenAt: number;
  lastAntIssuedAt: number;
}

interface StoredVisitor extends DesktopWorldVisitor {
  targetUserId: number;
  createdAt: number;
}

const presences = new Map<number, DesktopWorldPresence>();
const visitors = new Map<string, StoredVisitor>();
const passCooldowns = new Map<string, number>();

function worldSecret() {
  return process.env.DESKTOP_WORLD_SECRET || "wtf-desktop-world-v1";
}

function hashInt(input: string): number {
  const hash = createHash("sha256").update(input).digest();
  return hash.readUInt32BE(0);
}

function hiddenTileForUser(userId: number): HiddenTile {
  const x = (hashInt(`${worldSecret()}:x:${userId}`) % 10_000) - 5_000;
  const y = (hashInt(`${worldSecret()}:y:${userId}`) % 10_000) - 5_000;
  return { x, y };
}

function distanceSq(a: HiddenTile, b: HiddenTile): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function edgeToward(from: HiddenTile, to: HiddenTile): DesktopWorldEdge {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

function oppositeEdge(edge: DesktopWorldEdge): DesktopWorldEdge {
  if (edge === "top") return "bottom";
  if (edge === "bottom") return "top";
  if (edge === "left") return "right";
  return "left";
}

function normalizeEdge(value: unknown, fallback: DesktopWorldEdge): DesktopWorldEdge {
  return DESKTOP_WORLD_EDGES.includes(value as DesktopWorldEdge)
    ? (value as DesktopWorldEdge)
    : fallback;
}

function clampPositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function normalizeFoodDrops(value: unknown): DesktopWorldFoodDrop[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((drop) => ({
      id: typeof drop.id === "string" ? drop.id.slice(0, 80) : "",
      x: Math.max(0, Math.min(50_000, Math.round(Number(drop.x) || 0))),
      y: Math.max(0, Math.min(50_000, Math.round(Number(drop.y) || 0))),
      servings: clampPositiveInt(drop.servings, 1, 20),
    }))
    .filter((drop) => drop.id)
    .slice(0, MAX_FOODS);
}

function normalizeHeartbeat(input: unknown): DesktopWorldHeartbeatRequest {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const viewport =
    raw.viewport && typeof raw.viewport === "object" && !Array.isArray(raw.viewport)
      ? (raw.viewport as Record<string, unknown>)
      : {};
  return {
    viewport: {
      width: clampPositiveInt(viewport.width, 1024, 8192),
      height: clampPositiveInt(viewport.height, 768, 8192),
    },
    foods: normalizeFoodDrops(raw.foods),
  };
}

function prune(now: number) {
  for (const [userId, presence] of presences.entries()) {
    if (now - presence.lastSeenAt > ACTIVE_TTL_MS) presences.delete(userId);
  }
  for (const [id, visitor] of visitors.entries()) {
    if (now - visitor.createdAt > visitor.ttlMs + VISITOR_TTL_MS) visitors.delete(id);
  }
  for (const [key, lastIssuedAt] of passCooldowns.entries()) {
    if (now - lastIssuedAt > PASS_ISSUE_COOLDOWN_MS * 3) passCooldowns.delete(key);
  }
}

function activePresences(now: number) {
  return [...presences.values()].filter((presence) => now - presence.lastSeenAt <= ACTIVE_TTL_MS);
}

function nearestActiveNeighbors(userId: number, now: number, limit = MAX_ACTIVE_NEIGHBORS) {
  const selfTile = hiddenTileForUser(userId);
  return activePresences(now)
    .filter((presence) => presence.userId !== userId)
    .map((presence) => ({ presence, distance: distanceSq(selfTile, presence.tile) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((entry) => entry.presence);
}

function makeVisitor(
  targetUserId: number,
  visitor: Omit<DesktopWorldVisitor, "id" | "seed" | "ttlMs"> & {
    ttlMs?: number;
  },
  now: number
) {
  const id = `dw-${visitor.kind}-${randomUUID()}`;
  const stored: StoredVisitor = {
    ...visitor,
    id,
    seed: hashInt(`${id}:${now}`),
    ttlMs: visitor.ttlMs ?? VISITOR_TTL_MS,
    targetUserId,
    createdAt: now,
  };
  visitors.set(id, stored);
  return stored;
}

function visibleVisitor(visitor: StoredVisitor): DesktopWorldVisitor {
  return {
    id: visitor.id,
    kind: visitor.kind,
    role: visitor.role,
    entryEdge: visitor.entryEdge,
    exitEdge: visitor.exitEdge,
    seed: visitor.seed,
    targetDropId: visitor.targetDropId,
    colorSchemeKey: visitor.colorSchemeKey,
    label: visitor.label,
    ttlMs: visitor.ttlMs,
  };
}

function issueAntTrafficForFoodSource(source: DesktopWorldPresence, now: number) {
  if (
    source.foods.length === 0 ||
    (source.lastAntIssuedAt > 0 && now - source.lastAntIssuedAt < ANT_ISSUE_COOLDOWN_MS)
  ) {
    return;
  }
  const neighbors = nearestActiveNeighbors(source.userId, now);
  if (neighbors.length === 0) return;
  const firstFood = source.foods[0];
  const sourceEdge = edgeToward(source.tile, neighbors[0].tile);

  makeVisitor(
    source.userId,
    {
      kind: "ant",
      role: "forage",
      entryEdge: sourceEdge,
      exitEdge: sourceEdge,
      targetDropId: firstFood.id,
      label: "hungry ant",
      ttlMs: 36_000,
    },
    now
  );
  source.lastAntIssuedAt = now;

  for (const neighbor of neighbors.slice(0, 3)) {
    const key = `${neighbor.userId}:${source.userId}`;
    const lastPassIssuedAt = passCooldowns.get(key) ?? 0;
    if (lastPassIssuedAt > 0 && now - lastPassIssuedAt < PASS_ISSUE_COOLDOWN_MS) continue;
    const exitEdge = edgeToward(neighbor.tile, source.tile);
    makeVisitor(
      neighbor.userId,
      {
        kind: "ant",
        role: "pass",
        entryEdge: oppositeEdge(exitEdge),
        exitEdge,
        label: "passing ant",
        ttlMs: 24_000,
      },
      now
    );
    passCooldowns.set(key, now);
  }
}

export function recordDesktopWorldHeartbeat(
  userId: number,
  input: unknown,
  now = Date.now()
): DesktopWorldHeartbeatResponse {
  prune(now);
  const normalized = normalizeHeartbeat(input);
  const existing = presences.get(userId);
  const presence: DesktopWorldPresence = {
    userId,
    tile: existing?.tile ?? hiddenTileForUser(userId),
    viewport: normalized.viewport,
    foods: normalized.foods,
    lastSeenAt: now,
    lastAntIssuedAt: existing?.lastAntIssuedAt ?? 0,
  };
  presences.set(userId, presence);

  for (const active of activePresences(now)) {
    issueAntTrafficForFoodSource(active, now);
  }

  const userVisitors = [...visitors.values()]
    .filter((visitor) => visitor.targetUserId === userId)
    .slice(0, 18)
    .map(visibleVisitor);
  const activeNeighborCount = nearestActiveNeighbors(userId, now).length;
  return {
    visitors: userVisitors,
    activity: {
      activeNeighborCount,
      antsNearby: userVisitors.filter((visitor) => visitor.kind === "ant").length,
    },
  };
}

export function submitDesktopWorldEscape(
  userId: number,
  input: unknown,
  now = Date.now()
): DesktopWorldEscapeResponse {
  prune(now);
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const owner = presences.get(userId) ?? {
    userId,
    tile: hiddenTileForUser(userId),
    viewport: { width: 1024, height: 768 },
    foods: [],
    lastSeenAt: now,
    lastAntIssuedAt: 0,
  };
  presences.set(userId, { ...owner, lastSeenAt: now });
  const nearest = nearestActiveNeighbors(userId, now, 1)[0];
  if (!nearest) {
    return { accepted: false, awayMs: 0 };
  }

  const requestedEdge = normalizeEdge(raw.edge, edgeToward(owner.tile, nearest.tile));
  const pet =
    raw.pet && typeof raw.pet === "object" && !Array.isArray(raw.pet)
      ? (raw.pet as Record<string, unknown>)
      : {};
  makeVisitor(
    nearest.userId,
    {
      kind: "guinea-pig",
      role: "visit",
      entryEdge: edgeToward(nearest.tile, owner.tile),
      exitEdge: oppositeEdge(requestedEdge),
      colorSchemeKey:
        typeof pet.colorSchemeKey === "string"
          ? (pet.colorSchemeKey as HamsterColorSchemeKey)
          : undefined,
      label: "wandering guinea pig",
      ttlMs: GUINEA_PIG_AWAY_MS,
    },
    now
  );
  return { accepted: true, awayMs: GUINEA_PIG_AWAY_MS };
}

export function resetDesktopWorldForTests() {
  presences.clear();
  visitors.clear();
  passCooldowns.clear();
}
