import {
  DEDROOMS_ANCHOR_ROOM_IDS,
  DEDROOMS_ANCHOR_ROOMS,
  DEDROOMS_GREEN_ROOM_ID,
  GREEN_ROOM_ROOM_BY_ID,
  GREEN_ROOM_ROOMS,
  type GreenRoomRoom,
} from "./world";

export type DedRoomsCoordinate = {
  x: number;
  y: number;
  z: number;
};

export type DedRoomsPlacedRoom = {
  roomId: string;
  templateId: string;
  coordinate: DedRoomsCoordinate;
  status: "placed" | "void";
  placedBy: "anchor" | "spawn" | "door" | "event" | "loop";
  anchorKey?: string;
  discoveredByUserId?: number | null;
  transformedFrom?: string | null;
  placedAt: string;
  updatedAt: string;
};

export type DedRoomsDoorLink = {
  fromRoomId: string;
  doorKey: string;
  toRoomId: string;
  label: string;
  reciprocalDoorKey?: string | null;
  createdAt: string;
};

export type DedRoomsAnchorPlacement = {
  key: string;
  roomId: string;
  title: string;
  coordinate: DedRoomsCoordinate;
  discovered: boolean;
};

export type DedRoomsMapState = {
  version: 1;
  initialized: boolean;
  seed: string;
  createdAt: string;
  updatedAt: string;
  anchors: Record<string, DedRoomsAnchorPlacement>;
  placedRooms: Record<string, DedRoomsPlacedRoom>;
  coordIndex: Record<string, string>;
  usedRoomIds: string[];
  links: Record<string, DedRoomsDoorLink>;
  greenRoomPlaced: boolean;
  events: string[];
};

export type DedRoomsDoor = {
  key: string;
  label: string;
  kind: "wall" | "hatch" | "portal" | "path" | "object";
  resolvedToRoomId: string | null;
};

const CARDINAL_DOORS = ["north", "south", "east", "west"] as const;
const OPPOSITE_DOOR: Record<string, string> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
  up: "down",
  down: "up",
  in: "out",
  out: "in",
  hatch: "trapdoor",
  trapdoor: "hatch",
  "ceiling door": "floor door",
  "floor door": "ceiling door",
};

function cloneMapState(state: DedRoomsMapState): DedRoomsMapState {
  return JSON.parse(JSON.stringify(state)) as DedRoomsMapState;
}

function nowIso(now: Date | string = new Date()) {
  return now instanceof Date ? now.toISOString() : now;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pseudo(seed: string, salt: string, modulo: number): number {
  return hashString(`${seed}:${salt}`) % Math.max(1, modulo);
}

export function coordKey(coord: DedRoomsCoordinate): string {
  return `${coord.x},${coord.y},${coord.z}`;
}

function coordinateFromSalt(seed: string, salt: string, attempt: number, radius: number): DedRoomsCoordinate {
  const span = radius * 2 + 1;
  return {
    x: pseudo(seed, `${salt}:x:${attempt}`, span) - radius,
    y: pseudo(seed, `${salt}:y:${attempt}`, span) - radius,
    z: pseudo(seed, `${salt}:z:${attempt}`, 3) - 1,
  };
}

export function findEmptyDedRoomsCoordinate(
  state: DedRoomsMapState,
  salt: string,
  radius = 7,
): DedRoomsCoordinate {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const coord = coordinateFromSalt(state.seed, salt, attempt, radius);
    if (!state.coordIndex[coordKey(coord)]) return coord;
  }
  const z = 0;
  for (let ring = radius + 1; ring < radius + 80; ring += 1) {
    for (let x = -ring; x <= ring; x += 1) {
      for (const y of [-ring, ring]) {
        const coord = { x, y, z };
        if (!state.coordIndex[coordKey(coord)]) return coord;
      }
    }
    for (let y = -ring + 1; y < ring; y += 1) {
      for (const x of [-ring, ring]) {
        const coord = { x, y, z };
        if (!state.coordIndex[coordKey(coord)]) return coord;
      }
    }
  }
  throw new Error("DedRooms could not find an empty coordinate");
}

function placeRoom(
  state: DedRoomsMapState,
  roomId: string,
  coordinate: DedRoomsCoordinate,
  placedBy: DedRoomsPlacedRoom["placedBy"],
  now: string,
  options: { anchorKey?: string; discoveredByUserId?: number | null } = {},
) {
  if (!GREEN_ROOM_ROOM_BY_ID.has(roomId)) throw new Error(`Unknown authored DedRooms room: ${roomId}`);
  if (state.placedRooms[roomId]) throw new Error(`DedRooms room already placed: ${roomId}`);
  const key = coordKey(coordinate);
  if (state.coordIndex[key]) throw new Error(`DedRooms coordinate is occupied: ${key}`);
  state.placedRooms[roomId] = {
    roomId,
    templateId: roomId,
    coordinate,
    status: "placed",
    placedBy,
    anchorKey: options.anchorKey,
    discoveredByUserId: options.discoveredByUserId ?? null,
    placedAt: now,
    updatedAt: now,
  };
  state.coordIndex[key] = roomId;
  state.usedRoomIds = [...new Set([...state.usedRoomIds, roomId])];
  if (roomId === DEDROOMS_GREEN_ROOM_ID) state.greenRoomPlaced = true;
}

export function createInitialDedRoomsMap(seed = "dedrooms:season-3:intro", at: Date | string = new Date()): DedRoomsMapState {
  const now = nowIso(at);
  const state: DedRoomsMapState = {
    version: 1,
    initialized: true,
    seed,
    createdAt: now,
    updatedAt: now,
    anchors: {},
    placedRooms: {},
    coordIndex: {},
    usedRoomIds: [],
    links: {},
    greenRoomPlaced: false,
    events: ["initialized"],
  };

  for (const anchor of DEDROOMS_ANCHOR_ROOMS) {
    const coordinate = findEmptyDedRoomsCoordinate(state, `anchor:${anchor.key}`, 6);
    placeRoom(state, anchor.roomId, coordinate, "anchor", now, { anchorKey: anchor.key });
    state.anchors[anchor.key] = {
      key: anchor.key,
      roomId: anchor.roomId,
      title: anchor.title,
      coordinate,
      discovered: false,
    };
  }

  return state;
}

export function parseDedRoomsMapState(value: unknown): DedRoomsMapState {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (record.version === 1 && record.initialized === true) return record as DedRoomsMapState;
  return createInitialDedRoomsMap();
}

export function dedRoomsUnusedRoomIds(
  state: DedRoomsMapState,
  options: { includeAnchors?: boolean; includeGreenRoom?: boolean } = {},
): string[] {
  const used = new Set(state.usedRoomIds);
  return GREEN_ROOM_ROOMS
    .map((room) => room.id)
    .filter((roomId) => !used.has(roomId))
    .filter((roomId) => options.includeAnchors || !DEDROOMS_ANCHOR_ROOM_IDS.has(roomId))
    .filter((roomId) => options.includeGreenRoom || roomId !== DEDROOMS_GREEN_ROOM_ID);
}

export function pickUnusedDedRoomsRoomId(
  state: DedRoomsMapState,
  salt: string,
  options: { includeAnchors?: boolean; includeGreenRoom?: boolean } = {},
): string | null {
  const available = dedRoomsUnusedRoomIds(state, options);
  if (available.length === 0) return null;
  return available[pseudo(state.seed, `deck:${salt}:${available.length}`, available.length)] || available[0];
}

export function spawnDedRoomsPlayerRoom(
  input: DedRoomsMapState,
  userId: number,
  playerCountBeforeSpawn: number,
  at: Date | string = new Date(),
): { state: DedRoomsMapState; roomId: string; placed: boolean; coordinate: DedRoomsCoordinate; firstPlayer: boolean } {
  const state = cloneMapState(input);
  const now = nowIso(at);
  const firstPlayer = playerCountBeforeSpawn <= 0;
  const occupied = Object.values(state.placedRooms).filter((room) => room.status === "placed");
  const spawnableOccupied = occupied.filter(
    (room) => !DEDROOMS_ANCHOR_ROOM_IDS.has(room.roomId) && room.roomId !== DEDROOMS_GREEN_ROOM_ID,
  );

  if (!firstPlayer && spawnableOccupied.length > 0 && pseudo(state.seed, `spawn:occupied:${userId}:${playerCountBeforeSpawn}`, 100) < 45) {
    const room =
      spawnableOccupied[pseudo(state.seed, `spawn:room:${userId}:${spawnableOccupied.length}`, spawnableOccupied.length)] ||
      spawnableOccupied[0];
    return { state, roomId: room.roomId, placed: false, coordinate: room.coordinate, firstPlayer };
  }

  const coordinate = findEmptyDedRoomsCoordinate(state, `spawn:${userId}:${playerCountBeforeSpawn}`, 8);
  const roomId = pickUnusedDedRoomsRoomId(state, `spawn:${userId}:${playerCountBeforeSpawn}`, { includeGreenRoom: false });
  if (!roomId) {
    const fallbackPool = spawnableOccupied.length > 0 ? spawnableOccupied : occupied;
    const room = fallbackPool[pseudo(state.seed, `spawn:exhausted:${userId}`, fallbackPool.length)] || fallbackPool[0];
    return { state, roomId: room.roomId, placed: false, coordinate: room.coordinate, firstPlayer };
  }
  placeRoom(state, roomId, coordinate, "spawn", now, { discoveredByUserId: userId });
  state.updatedAt = now;
  state.events.push(`spawn:${roomId}`);
  return { state, roomId, placed: true, coordinate, firstPlayer };
}

function normalizeDoorKey(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

function linkKey(roomId: string, doorKey: string): string {
  return `${roomId}:${normalizeDoorKey(doorKey)}`;
}

function specialDoorKeys(room: GreenRoomRoom): DedRoomsDoor[] {
  const tags = new Set(room.tags);
  const doors: DedRoomsDoor[] = [];
  const add = (key: string, label: string, kind: DedRoomsDoor["kind"]) => {
    if (!doors.some((door) => door.key === key)) doors.push({ key, label, kind, resolvedToRoomId: null });
  };

  if (tags.has("forest")) add("path", "forest path", "path");
  if (tags.has("taxi-lore")) add("tire tracks", "taxi tire tracks", "path");
  if (tags.has("cats")) add("cat shelf", "cat shelf", "hatch");
  if (tags.has("display-cases") || tags.has("market")) add("display case", "display case gate", "object");
  if (tags.has("baker") || tags.has("bread-art")) add("bread chute", "bread chute", "hatch");
  if (tags.has("dao") || tags.has("governance")) add("proposal arch", "proposal arch", "portal");
  if (tags.has("cosmic") || tags.has("trilla-tek")) add("portal", "wet velvet portal", "portal");
  if (tags.has("imperial") || tags.has("backstage")) add("mirror", "propaganda mirror", "portal");

  const hash = hashString(room.id);
  if (hash % 3 === 0) add("hatch", "maintenance hatch", "hatch");
  if (hash % 5 === 0) add("ceiling door", "ceiling door", "hatch");
  if (hash % 7 === 0) add("painting", "loose painting", "object");
  return doors;
}

function doorKindForKey(key: string): DedRoomsDoor["kind"] {
  if (CARDINAL_DOORS.includes(key as typeof CARDINAL_DOORS[number])) return "wall";
  if (key === "up" || key === "down" || key === "in" || key === "out") return "portal";
  if (key.includes("hatch") || key.includes("ceiling") || key.includes("floor")) return "hatch";
  if (key.includes("portal") || key.includes("arch") || key.includes("mirror")) return "portal";
  if (key.includes("path") || key.includes("track")) return "path";
  return "object";
}

function labelForDoorKey(key: string): string {
  if (CARDINAL_DOORS.includes(key as typeof CARDINAL_DOORS[number])) return `${key} wall door`;
  if (key === "up" || key === "down" || key === "in" || key === "out") return `${key} passage`;
  return key;
}

function authoredDoorsForRoom(room: GreenRoomRoom): DedRoomsDoor[] {
  const seen = new Set<string>();
  const doors: DedRoomsDoor[] = [];
  const add = (door: DedRoomsDoor) => {
    const key = normalizeDoorKey(door.key);
    if (seen.has(key)) return;
    seen.add(key);
    doors.push({ ...door, key });
  };

  for (const exitKey of Object.keys(room.exits)) {
    const key = normalizeDoorKey(exitKey);
    add({ key, label: labelForDoorKey(key), kind: doorKindForKey(key), resolvedToRoomId: null });
  }
  for (const door of specialDoorKeys(room)) add(door);
  return doors;
}

function roomForPlacedState(state: DedRoomsMapState, roomId: string): GreenRoomRoom | null {
  const placed = state.placedRooms[roomId];
  const templateId = placed?.templateId || roomId;
  return GREEN_ROOM_ROOM_BY_ID.get(templateId) || null;
}

function authoredDoorKeysForRoom(room: GreenRoomRoom): Set<string> {
  return new Set(authoredDoorsForRoom(room).map((door) => door.key));
}

function linkedDoorIsSupportedByReciprocal(state: DedRoomsMapState, roomId: string, doorKey: string): boolean {
  const link = state.links[linkKey(roomId, doorKey)];
  if (!link?.reciprocalDoorKey) return false;
  const otherRoom = roomForPlacedState(state, link.toRoomId);
  if (!otherRoom) return false;
  return authoredDoorKeysForRoom(otherRoom).has(normalizeDoorKey(link.reciprocalDoorKey));
}

export function dedRoomsDoorsForRoom(room: GreenRoomRoom, state?: DedRoomsMapState): DedRoomsDoor[] {
  const seen = new Set<string>();
  const doors: DedRoomsDoor[] = [];
  const add = (door: DedRoomsDoor) => {
    const key = normalizeDoorKey(door.key);
    if (seen.has(key)) return;
    seen.add(key);
    doors.push({ ...door, key, resolvedToRoomId: state?.links[linkKey(room.id, key)]?.toRoomId || door.resolvedToRoomId || null });
  };

  for (const door of authoredDoorsForRoom(room)) add(door);

  if (state) {
    for (const link of Object.values(state.links)) {
      if (link.fromRoomId !== room.id) continue;
      const key = normalizeDoorKey(link.doorKey);
      if (seen.has(key)) continue;
      if (!linkedDoorIsSupportedByReciprocal(state, room.id, key)) continue;
      add({
        key,
        label: labelForDoorKey(key),
        kind: doorKindForKey(key),
        resolvedToRoomId: link.toRoomId,
      });
    }
  }
  return doors;
}

function doorOffset(seed: string, roomId: string, doorKey: string): DedRoomsCoordinate {
  const normalized = normalizeDoorKey(doorKey);
  if (normalized === "north") return { x: 0, y: -1, z: 0 };
  if (normalized === "south") return { x: 0, y: 1, z: 0 };
  if (normalized === "east") return { x: 1, y: 0, z: 0 };
  if (normalized === "west") return { x: -1, y: 0, z: 0 };
  if (normalized === "up" || normalized === "ceiling door") return { x: 0, y: 0, z: 1 };
  if (normalized === "down" || normalized === "trapdoor" || normalized === "floor door") return { x: 0, y: 0, z: -1 };
  const choices: DedRoomsCoordinate[] = [
    { x: 1, y: -1, z: 0 },
    { x: -1, y: -1, z: 0 },
    { x: 1, y: 1, z: 0 },
    { x: -1, y: 1, z: 0 },
    { x: 2, y: 0, z: 0 },
    { x: -2, y: 0, z: 0 },
    { x: 0, y: 2, z: 0 },
    { x: 0, y: -2, z: 0 },
  ];
  return choices[pseudo(seed, `door-offset:${roomId}:${normalized}`, choices.length)] || choices[0];
}

export function resolveDedRoomsDoor(
  input: DedRoomsMapState,
  currentRoomId: string,
  doorName: string,
  options: { userId?: number | null; allowGreenRoom?: boolean; at?: Date | string } = {},
): { state: DedRoomsMapState; nextRoomId: string; placed: boolean; looped: boolean; doorKey: string; coordinate: DedRoomsCoordinate } {
  const state = cloneMapState(input);
  const now = nowIso(options.at || new Date());
  const requestedDoorKey = normalizeDoorKey(doorName);
  const currentRoom = dedRoomsRoomForPlacedId(state, currentRoomId);
  const availableDoor = dedRoomsDoorsForRoom(currentRoom, state).find((door) => door.key === requestedDoorKey);
  if (!availableDoor) {
    throw new Error(`DedRooms passage is not available from ${currentRoomId}: ${requestedDoorKey}`);
  }
  const doorKey = availableDoor.key;
  const existingLink = state.links[linkKey(currentRoomId, doorKey)];
  if (existingLink) {
    const placed = state.placedRooms[existingLink.toRoomId];
    return {
      state,
      nextRoomId: existingLink.toRoomId,
      placed: false,
      looped: false,
      doorKey,
      coordinate: placed?.coordinate || { x: 0, y: 0, z: 0 },
    };
  }

  const current = state.placedRooms[currentRoomId];
  if (!current || current.status !== "placed") throw new Error(`DedRooms current room is not placed: ${currentRoomId}`);
  const offset = doorOffset(state.seed, currentRoomId, doorKey);
  const targetCoordinate = {
    x: current.coordinate.x + offset.x,
    y: current.coordinate.y + offset.y,
    z: current.coordinate.z + offset.z,
  };
  const targetCoordKey = coordKey(targetCoordinate);
  let nextRoomId = state.coordIndex[targetCoordKey] || "";
  let placed = false;
  let looped = false;

  if (!nextRoomId) {
    const unused = pickUnusedDedRoomsRoomId(state, `door:${currentRoomId}:${doorKey}`, { includeGreenRoom: options.allowGreenRoom === true });
    if (unused) {
      nextRoomId = unused;
      placeRoom(state, nextRoomId, targetCoordinate, "door", now, { discoveredByUserId: options.userId ?? null });
      placed = true;
    } else {
      const candidates = Object.values(state.placedRooms).filter((room) => room.status === "placed" && room.roomId !== currentRoomId);
      const fallback = candidates[pseudo(state.seed, `loop:${currentRoomId}:${doorKey}`, candidates.length)] || current;
      nextRoomId = fallback.roomId;
      looped = true;
    }
  }

  const reciprocalDoorKey = OPPOSITE_DOOR[doorKey] || null;
  state.links[linkKey(currentRoomId, doorKey)] = {
    fromRoomId: currentRoomId,
    doorKey,
    toRoomId: nextRoomId,
    label: doorKey,
    reciprocalDoorKey,
    createdAt: now,
  };
  if (reciprocalDoorKey) {
    state.links[linkKey(nextRoomId, reciprocalDoorKey)] = {
      fromRoomId: nextRoomId,
      doorKey: reciprocalDoorKey,
      toRoomId: currentRoomId,
      label: reciprocalDoorKey,
      reciprocalDoorKey: doorKey,
      createdAt: now,
    };
  }
  state.updatedAt = now;
  state.events.push(placed ? `door:${currentRoomId}:${doorKey}:${nextRoomId}` : `loop:${currentRoomId}:${doorKey}:${nextRoomId}`);

  return {
    state,
    nextRoomId,
    placed,
    looped,
    doorKey,
    coordinate: state.placedRooms[nextRoomId]?.coordinate || targetCoordinate,
  };
}

export function placeDedRoomsGreenRoom(
  input: DedRoomsMapState,
  salt = "green-room-trigger",
  at: Date | string = new Date(),
): { state: DedRoomsMapState; roomId: string; placed: boolean; coordinate: DedRoomsCoordinate } {
  const state = cloneMapState(input);
  const existing = state.placedRooms[DEDROOMS_GREEN_ROOM_ID];
  if (existing) return { state, roomId: DEDROOMS_GREEN_ROOM_ID, placed: false, coordinate: existing.coordinate };
  const coordinate = findEmptyDedRoomsCoordinate(state, salt, 9);
  const now = nowIso(at);
  placeRoom(state, DEDROOMS_GREEN_ROOM_ID, coordinate, "event", now);
  state.greenRoomPlaced = true;
  state.updatedAt = now;
  state.events.push("green-room-triggered");
  return { state, roomId: DEDROOMS_GREEN_ROOM_ID, placed: true, coordinate };
}

export function swapDedRoomsRooms(input: DedRoomsMapState, aRoomId: string, bRoomId: string, at: Date | string = new Date()): DedRoomsMapState {
  const state = cloneMapState(input);
  const a = state.placedRooms[aRoomId];
  const b = state.placedRooms[bRoomId];
  if (!a || !b) throw new Error("DedRooms swap requires two placed rooms");
  const aCoord = a.coordinate;
  const bCoord = b.coordinate;
  a.coordinate = bCoord;
  b.coordinate = aCoord;
  a.updatedAt = nowIso(at);
  b.updatedAt = nowIso(at);
  state.coordIndex[coordKey(aCoord)] = bRoomId;
  state.coordIndex[coordKey(bCoord)] = aRoomId;
  state.updatedAt = nowIso(at);
  state.events.push(`swap:${aRoomId}:${bRoomId}`);
  return state;
}

export function voidDedRoomsRoom(input: DedRoomsMapState, roomId: string, at: Date | string = new Date()): DedRoomsMapState {
  const state = cloneMapState(input);
  const room = state.placedRooms[roomId];
  if (!room) throw new Error(`DedRooms void requires a placed room: ${roomId}`);
  room.status = "void";
  room.updatedAt = nowIso(at);
  delete state.coordIndex[coordKey(room.coordinate)];
  state.updatedAt = nowIso(at);
  state.events.push(`void:${roomId}`);
  return state;
}

export function transformDedRoomsRoom(input: DedRoomsMapState, roomId: string, nextTemplateId: string, at: Date | string = new Date()): DedRoomsMapState {
  const state = cloneMapState(input);
  const room = state.placedRooms[roomId];
  if (!room) throw new Error(`DedRooms transform requires a placed room: ${roomId}`);
  if (!GREEN_ROOM_ROOM_BY_ID.has(nextTemplateId)) throw new Error(`Unknown DedRooms transform target: ${nextTemplateId}`);
  room.transformedFrom = room.templateId;
  room.templateId = nextTemplateId;
  room.updatedAt = nowIso(at);
  state.updatedAt = nowIso(at);
  state.events.push(`transform:${roomId}:${nextTemplateId}`);
  return state;
}

export function dedRoomsRoomForPlacedId(state: DedRoomsMapState, roomId: string): GreenRoomRoom {
  const placed = state.placedRooms[roomId];
  const templateId = placed?.templateId || roomId;
  const room = GREEN_ROOM_ROOM_BY_ID.get(templateId);
  if (!room) throw new Error(`Unknown DedRooms placed room: ${roomId}`);
  return room;
}
