import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { ensureUserRole } from "../../lib/user-roles";
import {
  greenRoomAdminAudits,
  greenRoomAlliances,
  greenRoomAllianceMembers,
  greenRoomCampaigns,
  greenRoomContentRecords,
  greenRoomEvents,
  greenRoomInventoryItems,
  greenRoomNpcStates,
  greenRoomPlayerFlags,
  greenRoomPlayers,
  greenRoomRelationships,
  greenRoomResourceNodes,
  greenRoomWorldFlags,
  roles,
  seasonContestants,
  seasons,
  users,
} from "@shared/schema";
import {
  canCarry,
  combineThreeUpgrade,
  inspectGreenRoomDetail,
  inventoryWeight,
  isCommandUnlocked,
  knownGreenRoomCommands,
  normalizeGreenRoomItemKey,
  parseGreenRoomCommand,
  type GreenRoomInventoryStack,
} from "./engine";
import {
  coordKey,
  createInitialDedRoomsMap,
  dedRoomsDoorsForRoom,
  dedRoomsRoomForPlacedId,
  dedRoomsUnusedRoomIds,
  parseDedRoomsMapState,
  placeDedRoomsGreenRoom,
  resolveDedRoomsDoor,
  spawnDedRoomsPlayerRoom,
  type DedRoomsMapState,
  type DedRoomsPlacedRoom,
  type DedRoomsCoordinate,
  type DedRoomsDoor,
  type DedRoomsAnchorPlacement,
} from "./dedrooms-map";
import {
  DEDROOMS_GREEN_ROOM_ID,
  DEDROOMS_WORLD_STATE_KEY,
  findGreenRoomRoom,
  GREEN_ROOM_ATTUNEMENT_REQUIREMENTS,
  GREEN_ROOM_BASE_COMMAND_DECK,
  GREEN_ROOM_CAMPAIGN_SLUG,
  GREEN_ROOM_DEPARTED_MESSAGE,
  GREEN_ROOM_ITEM_BY_KEY,
  GREEN_ROOM_MINIGAMES,
  GREEN_ROOM_NPC_BY_KEY,
  GREEN_ROOM_NPCS,
  GREEN_ROOM_PUZZLE_HOOKS,
  GREEN_ROOM_ROOM_BY_ID,
  GREEN_ROOM_RESOURCES,
  GREEN_ROOM_RESOURCE_BY_KEY,
  greenRoomSeedSummary,
  roomResources,
} from "./world";
import {
  SEASON_3_DEFAULT_ANTE_WTF,
  SEASON_3_NAME,
  SEASON_3_NUMBER,
} from "../../lib/season3-scaffold";
import type { UserRole } from "@shared/types";
import { isAdmin } from "@shared/types";

export type GreenRoomAuthUser = {
  id: number;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  pfpImageUrl?: string | null;
  role?: UserRole | string | null;
};

export type GreenRoomTranscriptEvent = {
  id: number;
  scope: string;
  eventType: string;
  message: string;
  visibility: string;
  locationId: string | null;
  userId: number | null;
  actorUserId: number | null;
  createdAt: string;
  metadata: unknown;
};

type GreenRoomFlagMap = Record<string, unknown>;

const MARK_VALUES = new Set(["friend", "ally", "neutral", "sus-af"]);
const ADMIN_CONTENT_KINDS = new Set([
  "room",
  "room-deck",
  "anchor",
  "npc",
  "npc-sheet",
  "item",
  "resource",
  "event",
  "room-event",
  "dialogue",
  "world-flag",
  "campaign",
  "campaign-script",
  "completion-rule",
]);
const PROOF_TO_MILESTONE: Record<string, string> = {
  ghost_receipt: "ghost-ledger",
  frog_wisdom: "pond-ritual",
  static_map: "static-map",
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function itemDef(itemKey: string) {
  return GREEN_ROOM_ITEM_BY_KEY.get(itemKey) || {
    key: itemKey,
    label: itemKey.replace(/_/g, " "),
    weight: 1,
    tags: ["custom"],
  };
}

function normalizeStack(row: typeof greenRoomInventoryItems.$inferSelect): GreenRoomInventoryStack {
  return {
    itemKey: row.itemKey,
    label: row.label,
    tier: row.tier,
    quantity: row.quantity,
    weight: row.weight,
  };
}

async function ensureCampaign() {
  const [existing] = await db
    .select()
    .from(greenRoomCampaigns)
    .where(eq(greenRoomCampaigns.slug, GREEN_ROOM_CAMPAIGN_SLUG))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(greenRoomCampaigns)
    .values({
      slug: GREEN_ROOM_CAMPAIGN_SLUG,
      title: "Search for the Green Room",
      mode: "active",
      targetDepartures: 50,
      sharedUnlockProgress: {
        required: ["ghost-ledger", "pond-ritual", "static-map"],
        completed: [],
      },
    })
    .returning();
  return created;
}

async function ensureDedRoomsMap(): Promise<DedRoomsMapState> {
  const [row] = await db
    .select()
    .from(greenRoomWorldFlags)
    .where(eq(greenRoomWorldFlags.key, DEDROOMS_WORLD_STATE_KEY))
    .limit(1);
  if (row) return parseDedRoomsMapState(row.valueJson);
  const state = createInitialDedRoomsMap();
  await db
    .insert(greenRoomWorldFlags)
    .values({
      key: DEDROOMS_WORLD_STATE_KEY,
      valueJson: state,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: greenRoomWorldFlags.key,
      set: { valueJson: state, updatedAt: new Date() },
    });
  return state;
}

async function saveDedRoomsMap(state: DedRoomsMapState, updatedBy?: number | null): Promise<DedRoomsMapState> {
  const nextState = { ...state, updatedAt: new Date().toISOString() };
  await db
    .insert(greenRoomWorldFlags)
    .values({
      key: DEDROOMS_WORLD_STATE_KEY,
      valueJson: nextState,
      updatedBy: updatedBy ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: greenRoomWorldFlags.key,
      set: {
        valueJson: nextState,
        updatedBy: updatedBy ?? null,
        updatedAt: new Date(),
      },
    });
  return nextState;
}

async function dedRoomsPlayerCount() {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(greenRoomPlayers);
  return Number(row?.count || 0);
}

function markDedRoomsRoomDiscovered(state: DedRoomsMapState, roomId: string): DedRoomsMapState {
  const next = JSON.parse(JSON.stringify(state)) as DedRoomsMapState;
  for (const anchor of Object.values(next.anchors)) {
    if (anchor.roomId === roomId) anchor.discovered = true;
  }
  return next;
}

function placedRoomCoordinate(mapState: DedRoomsMapState, roomId: string): DedRoomsCoordinate | null {
  return mapState.placedRooms[roomId]?.coordinate || null;
}

function placedRoomSummary(mapState: DedRoomsMapState, roomId: string): DedRoomsPlacedRoom | null {
  return mapState.placedRooms[roomId] || null;
}

async function ensureSeason3ContestantRole() {
  await db
    .insert(roles)
    .values({
      slug: "season_3_contestant",
      label: "Season 3 Contestant",
      category: "gameshow",
      purpose: "Additive badge/access role granted by departing through the Search for the Green Room intro labyrinth.",
      description: "Marks a user as qualified for Season 3 through the Green Room campaign without replacing broader account roles.",
      accessLevel: 32,
      sortOrder: 68,
      color: "#16a34a",
      icon: "door-open",
      defaultWtfOsAccess: true,
      isSystem: true,
      isAssignable: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: roles.slug,
      set: {
        label: "Season 3 Contestant",
        category: "gameshow",
        purpose: "Additive badge/access role granted by departing through the Search for the Green Room intro labyrinth.",
        description: "Marks a user as qualified for Season 3 through the Green Room campaign without replacing broader account roles.",
        accessLevel: 32,
        sortOrder: 68,
        color: "#16a34a",
        icon: "door-open",
        defaultWtfOsAccess: true,
        isSystem: true,
        isAssignable: true,
        updatedAt: new Date(),
      },
    });
}

async function ensurePlayer(user: GreenRoomAuthUser) {
  const campaign = await ensureCampaign();
  let mapState = await ensureDedRoomsMap();
  const [existing] = await db
    .select()
    .from(greenRoomPlayers)
    .where(eq(greenRoomPlayers.userId, user.id))
    .limit(1);
  if (existing) {
    let locationId = existing.locationId;
    if (!mapState.placedRooms[locationId] || mapState.placedRooms[locationId]?.status !== "placed") {
      const playerCount = await dedRoomsPlayerCount();
      const spawn = spawnDedRoomsPlayerRoom(mapState, user.id, Math.max(1, playerCount));
      mapState = await saveDedRoomsMap(markDedRoomsRoomDiscovered(spawn.state, spawn.roomId), user.id);
      locationId = spawn.roomId;
    } else {
      const discovered = markDedRoomsRoomDiscovered(mapState, locationId);
      if (JSON.stringify(discovered.anchors) !== JSON.stringify(mapState.anchors)) {
        mapState = await saveDedRoomsMap(discovered, user.id);
      }
    }
    await db
      .update(greenRoomPlayers)
      .set({ locationId, lastSeenAt: new Date(), updatedAt: new Date(), campaignId: existing.campaignId ?? campaign.id })
      .where(eq(greenRoomPlayers.userId, user.id));
    return { player: { ...existing, locationId, campaignId: existing.campaignId ?? campaign.id }, campaign, mapState };
  }

  const playerCount = await dedRoomsPlayerCount();
  const spawn = spawnDedRoomsPlayerRoom(mapState, user.id, playerCount);
  mapState = await saveDedRoomsMap(markDedRoomsRoomDiscovered(spawn.state, spawn.roomId), user.id);
  const start = spawn.roomId;
  const [created] = await db
    .insert(greenRoomPlayers)
    .values({
      userId: user.id,
      campaignId: campaign.id,
      locationId: start,
      weightLimit: 24,
      commandDeck: GREEN_ROOM_BASE_COMMAND_DECK,
      skillsJson: { combine: 1, barter: 1, attention: 1 },
      flagsJson: {},
      attunementJson: { proofs: [], ready: false },
    })
    .returning();

  await addItem(user.id, "coin", 3, 1, { quiet: true });
  await addEvent({
    userId: user.id,
    actorUserId: user.id,
    locationId: start,
    eventType: "ded_rooms.player.started",
    message: `You wake into ${findGreenRoomRoom(start).title}. The app remembers this exact wrongness. ${spawn.firstPlayer ? "The five anchor rooms were already placed before you arrived." : "Somewhere else, the map politely makes room for strangers."}`,
    visibility: "private",
    scope: "player",
    metadata: {
      coordinate: coordKey(spawn.coordinate),
      placed: spawn.placed,
      firstPlayer: spawn.firstPlayer,
    },
  });

  return { player: created, campaign, mapState };
}

async function syncNpcStates() {
  const hour = new Date().getUTCHours();
  for (const npc of GREEN_ROOM_NPCS) {
    const locationId = npc.schedule[hour % npc.schedule.length] || npc.defaultRoomId;
    await db
      .insert(greenRoomNpcStates)
      .values({
        npcKey: npc.key,
        locationId,
        mood: npc.mood,
        currentScript: `schedule:${hour}`,
        stateJson: { wants: npc.wants },
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: greenRoomNpcStates.npcKey,
        set: {
          locationId,
          mood: npc.mood,
          currentScript: `schedule:${hour}`,
          stateJson: { wants: npc.wants },
          updatedAt: new Date(),
        },
      });
  }
}

async function inventoryForUser(userId: number) {
  const rows = await db
    .select()
    .from(greenRoomInventoryItems)
    .where(eq(greenRoomInventoryItems.userId, userId))
    .orderBy(greenRoomInventoryItems.itemKey, greenRoomInventoryItems.tier);
  return rows.map(normalizeStack);
}

async function updateInventoryWeight(userId: number) {
  const stacks = await inventoryForUser(userId);
  const weight = inventoryWeight(stacks);
  await db
    .update(greenRoomPlayers)
    .set({ inventoryWeight: weight, updatedAt: new Date() })
    .where(eq(greenRoomPlayers.userId, userId));
  return weight;
}

async function addItem(
  userId: number,
  itemKey: string,
  quantity = 1,
  tier = 1,
  options: { quiet?: boolean; metadata?: Record<string, unknown> } = {},
) {
  const normalized = normalizeGreenRoomItemKey(itemKey);
  const def = itemDef(normalized);
  await db
    .insert(greenRoomInventoryItems)
    .values({
      userId,
      itemKey: normalized,
      label: def.label,
      tier,
      quantity,
      weight: def.weight,
      metadataJson: options.metadata || {},
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        greenRoomInventoryItems.userId,
        greenRoomInventoryItems.itemKey,
        greenRoomInventoryItems.tier,
      ],
      set: {
        quantity: sql`${greenRoomInventoryItems.quantity} + ${quantity}`,
        label: def.label,
        weight: def.weight,
        updatedAt: new Date(),
      },
    });
  await updateInventoryWeight(userId);
}

async function consumeItem(userId: number, itemKey: string, quantity = 1, tier = 1): Promise<boolean> {
  const normalized = normalizeGreenRoomItemKey(itemKey);
  const [stack] = await db
    .select()
    .from(greenRoomInventoryItems)
    .where(and(
      eq(greenRoomInventoryItems.userId, userId),
      eq(greenRoomInventoryItems.itemKey, normalized),
      eq(greenRoomInventoryItems.tier, tier),
    ))
    .limit(1);
  if (!stack || stack.quantity < quantity) return false;
  if (stack.quantity === quantity) {
    await db.delete(greenRoomInventoryItems).where(eq(greenRoomInventoryItems.id, stack.id));
  } else {
    await db
      .update(greenRoomInventoryItems)
      .set({ quantity: stack.quantity - quantity, updatedAt: new Date() })
      .where(eq(greenRoomInventoryItems.id, stack.id));
  }
  await updateInventoryWeight(userId);
  return true;
}

async function hasItem(userId: number, itemKey: string, quantity = 1, tier?: number): Promise<boolean> {
  const normalized = normalizeGreenRoomItemKey(itemKey);
  const rows = await db
    .select()
    .from(greenRoomInventoryItems)
    .where(and(eq(greenRoomInventoryItems.userId, userId), eq(greenRoomInventoryItems.itemKey, normalized)));
  return rows.some((row) => (tier ? row.tier === tier : true) && row.quantity >= quantity);
}

async function getPlayerFlags(userId: number): Promise<GreenRoomFlagMap> {
  const rows = await db
    .select()
    .from(greenRoomPlayerFlags)
    .where(eq(greenRoomPlayerFlags.userId, userId));
  const out: GreenRoomFlagMap = {};
  for (const row of rows) out[row.key] = row.valueJson;
  return out;
}

async function setPlayerFlag(userId: number, key: string, value: unknown = true) {
  await db
    .insert(greenRoomPlayerFlags)
    .values({ userId, key, valueJson: value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [greenRoomPlayerFlags.userId, greenRoomPlayerFlags.key],
      set: { valueJson: value, updatedAt: new Date() },
    });
}

async function addEvent(input: {
  userId?: number | null;
  actorUserId?: number | null;
  locationId?: string | null;
  eventType: string;
  message: string;
  visibility?: string;
  scope?: string;
  metadata?: Record<string, unknown>;
}) {
  const [event] = await db
    .insert(greenRoomEvents)
    .values({
      userId: input.userId ?? null,
      actorUserId: input.actorUserId ?? null,
      locationId: input.locationId ?? null,
      eventType: input.eventType,
      message: input.message,
      visibility: input.visibility || "private",
      scope: input.scope || "player",
      metadataJson: input.metadata || {},
    })
    .returning();
  return event;
}

async function recentEvents(userId: number, locationId: string, limit = 50): Promise<GreenRoomTranscriptEvent[]> {
  const rows = await db
    .select()
    .from(greenRoomEvents)
    .where(
      or(
        eq(greenRoomEvents.userId, userId),
        and(eq(greenRoomEvents.locationId, locationId), eq(greenRoomEvents.visibility, "room")),
        and(eq(greenRoomEvents.locationId, locationId), eq(greenRoomEvents.visibility, "world")),
      )
    )
    .orderBy(desc(greenRoomEvents.createdAt))
    .limit(limit);
  return rows.reverse().map((row) => ({
    id: row.id,
    scope: row.scope,
    eventType: row.eventType,
    message: row.message,
    visibility: row.visibility,
    locationId: row.locationId,
    userId: row.userId,
    actorUserId: row.actorUserId,
    createdAt: row.createdAt.toISOString(),
    metadata: row.metadataJson,
  }));
}

async function nearbyPlayers(userId: number, locationId: string) {
  const rows = await db
    .select({
      userId: greenRoomPlayers.userId,
      username: users.username,
      displayName: users.displayName,
      status: greenRoomPlayers.status,
      mark: greenRoomRelationships.mark,
    })
    .from(greenRoomPlayers)
    .innerJoin(users, eq(users.id, greenRoomPlayers.userId))
    .leftJoin(
      greenRoomRelationships,
      and(eq(greenRoomRelationships.userId, userId), eq(greenRoomRelationships.targetUserId, users.id)),
    )
    .where(and(eq(greenRoomPlayers.locationId, locationId), eq(greenRoomPlayers.status, "exploring")))
    .limit(40);
  return rows
    .filter((row) => row.userId !== userId)
    .map((row) => ({
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      mark: row.mark || "neutral",
    }));
}

function isSharedUnlocked(campaign: typeof greenRoomCampaigns.$inferSelect) {
  if (campaign.sharedUnlockedAt) return true;
  const progress = asRecord(campaign.sharedUnlockProgress);
  const required = Array.isArray(progress.required) ? progress.required.map(String) : [];
  const completed = new Set(Array.isArray(progress.completed) ? progress.completed.map(String) : []);
  return required.length > 0 && required.every((item) => completed.has(item));
}

function campaignProgress(campaign: typeof greenRoomCampaigns.$inferSelect) {
  const progress = asRecord(campaign.sharedUnlockProgress);
  const required = Array.isArray(progress.required) ? progress.required.map(String) : ["ghost-ledger", "pond-ritual", "static-map"];
  const completed = Array.isArray(progress.completed) ? progress.completed.map(String) : [];
  return {
    required,
    completed,
    sharedUnlocked: Boolean(campaign.sharedUnlockedAt) || required.every((milestone) => completed.includes(milestone)),
  };
}

function playerAttuned(player: typeof greenRoomPlayers.$inferSelect) {
  const attunement = asRecord(player.attunementJson);
  if (attunement.ready === true) return true;
  const proofs = new Set(Array.isArray(attunement.proofs) ? attunement.proofs.map(String) : []);
  return GREEN_ROOM_ATTUNEMENT_REQUIREMENTS.every((proof) => proofs.has(proof));
}

async function setPlayerAttunement(userId: number, proofs: string[]) {
  const ready = GREEN_ROOM_ATTUNEMENT_REQUIREMENTS.every((proof) => proofs.includes(proof));
  const attunement = { proofs, ready, updatedAt: new Date().toISOString() };
  await db
    .update(greenRoomPlayers)
    .set({ attunementJson: attunement, updatedAt: new Date() })
    .where(eq(greenRoomPlayers.userId, userId));
  return attunement;
}

async function ensureResourceNode(roomId: string, resourceKey: string) {
  const key = `${roomId}:${resourceKey}`;
  const resource = GREEN_ROOM_RESOURCE_BY_KEY.get(resourceKey);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(12, 0, 0, 0);
  const [existing] = await db
    .select()
    .from(greenRoomResourceNodes)
    .where(eq(greenRoomResourceNodes.nodeKey, key))
    .limit(1);
  if (existing) {
    if (existing.nextDropAt && existing.nextDropAt <= now) {
      const [updated] = await db
        .update(greenRoomResourceNodes)
        .set({
          quantityAvailable: resource?.dailyDrop ?? 3,
          nextDropAt: tomorrow,
          updatedAt: now,
          stateJson: { restockedAt: now.toISOString() },
        })
        .where(eq(greenRoomResourceNodes.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }
  const [created] = await db
    .insert(greenRoomResourceNodes)
    .values({
      nodeKey: key,
      locationId: roomId,
      resourceKey,
      quantityAvailable: resource?.dailyDrop ?? 3,
      nextDropAt: tomorrow,
      stateJson: { seededAt: now.toISOString() },
    })
    .returning();
  return created;
}

async function roomNpcStates(locationId: string) {
  await syncNpcStates();
  const rows = await db
    .select()
    .from(greenRoomNpcStates)
    .where(eq(greenRoomNpcStates.locationId, locationId));
  return rows.map((row) => {
    const def = GREEN_ROOM_NPC_BY_KEY.get(row.npcKey);
    return {
      key: row.npcKey,
      name: def?.name || row.npcKey,
      mood: row.mood,
      wants: def?.wants || [],
      sheet: npcCharacterSheet(row.npcKey),
    };
  });
}

async function ensureGreenRoomSeason3(actorUserId: number | null) {
  const [existing] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.number, SEASON_3_NUMBER))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(seasons)
    .values({
      name: SEASON_3_NAME,
      number: SEASON_3_NUMBER,
      status: "upcoming",
      description: "Season 3 contestant intake row, created by Search for the Green Room departure.",
      createdBy: actorUserId ?? undefined,
      anteWtfRequired: SEASON_3_DEFAULT_ANTE_WTF,
    })
    .returning();
  return created;
}

async function ensureSeasonContestant(userId: number, actorUserId: number | null) {
  const season = await ensureGreenRoomSeason3(actorUserId);
  const [existing] = await db
    .select()
    .from(seasonContestants)
    .where(and(eq(seasonContestants.seasonId, season.id), eq(seasonContestants.userId, userId)))
    .limit(1);
  if (existing) {
    await db
      .update(seasonContestants)
      .set({
        status: existing.status === "eliminated" ? existing.status : "active",
        notes: existing.notes || "Qualified through Search for the Green Room.",
        updatedAt: new Date(),
      })
      .where(eq(seasonContestants.id, existing.id));
    return existing;
  }
  const [created] = await db
    .insert(seasonContestants)
    .values({
      seasonId: season.id,
      userId,
      status: "active",
      notes: "Qualified through Search for the Green Room.",
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

async function departThroughGreenRoom(user: GreenRoomAuthUser, player: typeof greenRoomPlayers.$inferSelect, campaign: typeof greenRoomCampaigns.$inferSelect) {
  if (player.status === "departed") {
    return [GREEN_ROOM_DEPARTED_MESSAGE];
  }
  if (campaign.mode !== "active") {
    await addEvent({
      userId: user.id,
      actorUserId: user.id,
      locationId: player.locationId,
      eventType: "ded_rooms.door.myth_mode",
      message: "The door opens onto a story that already happened. It gives no role now, only a cold green reflection.",
      visibility: "private",
    });
    return ["The Green Room is in myth mode. The door still matters, but it no longer grants Season 3 status."];
  }
  if (!isSharedUnlocked(campaign)) {
    return ["The door is waiting on the shared lock. Ghost, pond, and static-map milestones still need the community's proof."];
  }
  if (!playerAttuned(player)) {
    return ["The door recognizes the world, but not you yet. Attune with ghost receipt, frog wisdom, and static map."];
  }

  await ensureSeason3ContestantRole();
  await ensureUserRole(user.id, "contestant");
  await ensureUserRole(user.id, "season_3_contestant");
  await ensureSeasonContestant(user.id, user.id);

  await db
    .update(greenRoomPlayers)
    .set({
      status: "departed",
      departedAt: new Date(),
      departureMode: "active",
      updatedAt: new Date(),
    })
    .where(eq(greenRoomPlayers.userId, user.id));

  const nextCount = campaign.departureCount + 1;
  const nextMode = nextCount >= campaign.targetDepartures ? "myth" : campaign.mode;
  await db
    .update(greenRoomCampaigns)
    .set({
      departureCount: nextCount,
      mode: nextMode,
      mythModeAt: nextMode === "myth" ? new Date() : campaign.mythModeAt,
      updatedAt: new Date(),
    })
    .where(eq(greenRoomCampaigns.id, campaign.id));

  await addEvent({
    userId: user.id,
    actorUserId: user.id,
    locationId: player.locationId,
    eventType: "ded_rooms.player.departed",
    message: GREEN_ROOM_DEPARTED_MESSAGE,
    visibility: "private",
    metadata: { campaignMode: "active", departureCount: nextCount },
  });
  await addEvent({
    actorUserId: user.id,
    locationId: player.locationId,
    eventType: "ded_rooms.world.departure_echo",
    message: `${user.username} goes through the Green Room door. The hallway politely pretends not to notice.`,
    visibility: "room",
    scope: "room",
    metadata: { departedUserId: user.id },
  });

  return [GREEN_ROOM_DEPARTED_MESSAGE];
}

function adminForUser(user: GreenRoomAuthUser) {
  return isAdmin(String(user.role || "witness") as UserRole);
}

function numberFromSheet(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function buildPlayerCharacterSheet(
  user: GreenRoomAuthUser,
  player: typeof greenRoomPlayers.$inferSelect,
  flags: GreenRoomFlagMap,
  inventory: GreenRoomInventoryStack[],
) {
  const skills = asRecord(player.skillsJson);
  const userSeed = Math.abs(Number(user.id || 0));
  const passions = asRecord(flags.character_passions).items;
  const habits = asRecord(flags.character_habits).items;
  const friendships = asRecord(flags.character_friendships).items;
  const rivalries = asRecord(flags.character_rivalries).items;
  return {
    key: `player:${user.id}`,
    type: "player",
    name: user.displayName || user.username,
    level: 1 + Math.floor(inventory.reduce((sum, stack) => sum + stack.tier * stack.quantity, 0) / 12),
    attributes: {
      attention: 10 + (userSeed % 5),
      nerve: 9 + ((userSeed + 2) % 6),
      charm: 8 + ((userSeed + 4) % 7),
      weird: 11 + ((userSeed + 1) % 5),
      crumbcraft: 9 + ((userSeed + 3) % 6),
    },
    skills: {
      attention: numberFromSheet(skills.attention, 1),
      barter: numberFromSheet(skills.barter, 1),
      combine: numberFromSheet(skills.combine, 1),
      navigation: numberFromSheet(skills.navigation, 1),
      lore: numberFromSheet(skills.lore, 1),
      breadcraft: numberFromSheet(skills.breadcraft, 1),
    },
    inventory: {
      weight: player.inventoryWeight,
      weightLimit: player.weightLimit,
      stackCount: inventory.length,
    },
    personality: asRecord(flags.character_personality).summary || "newly weird, observant by necessity",
    faith: asRecord(flags.character_faith).summary || "uncommitted, but the rooms are campaigning",
    passions: Array.isArray(passions) ? passions.map(String) : ["finding exits", "reading plaques", "not trusting bread too quickly"],
    habits: Array.isArray(habits) ? habits.map(String) : ["checks corners twice", "keeps receipts", "tests doors gently"],
    friendships: Array.isArray(friendships) ? friendships.map(String) : [],
    rivalries: Array.isArray(rivalries) ? rivalries.map(String) : [],
    currentState: {
      status: player.status,
      attuned: playerAttuned(player),
      departedAt: toIso(player.departedAt),
    },
  };
}

function npcCharacterSheet(npcKey: string) {
  const npc = GREEN_ROOM_NPC_BY_KEY.get(npcKey);
  if (!npc) return null;
  const seed = npc.key.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return {
    key: `npc:${npc.key}`,
    type: "npc",
    name: npc.name,
    level: 1 + (seed % 5),
    attributes: {
      attention: 8 + (seed % 7),
      nerve: 8 + ((seed + 2) % 7),
      charm: 8 + ((seed + 4) % 7),
      weird: 10 + ((seed + 6) % 8),
      crumbcraft: 7 + ((seed + 8) % 7),
    },
    skills: {
      attention: 1 + (seed % 3),
      barter: 1 + ((seed + 1) % 4),
      lore: 1 + ((seed + 2) % 4),
      breadcraft: npc.wants.some((want) => want.includes("bread") || want.includes("crumb") || want.includes("baker")) ? 3 : 1,
    },
    inventory: {
      wants: npc.wants,
      carries: npc.wants.slice(0, 2).map((want) => `${want.replace(/_/g, " ")} rumor`),
    },
    personality: npc.mood,
    faith: npc.key.includes("baker") ? "loaf-backed civic mysticism" : npc.key.includes("cult") ? "excellent minutes and soft candles" : "private and probably room-shaped",
    passions: npc.lines.slice(0, 2),
    habits: npc.schedule.slice(0, 4).map((roomId) => `wanders through ${findGreenRoomRoom(roomId).title}`),
    friendships: [],
    rivalries: [],
    currentState: {
      defaultRoomId: npc.defaultRoomId,
      mood: npc.mood,
    },
  };
}

function dedRoomsMapPayload(mapState: DedRoomsMapState, playerRoomId: string) {
  const coordinate = placedRoomCoordinate(mapState, playerRoomId);
  return {
    version: mapState.version,
    seed: mapState.seed,
    initialized: mapState.initialized,
    placedCount: Object.values(mapState.placedRooms).filter((room) => room.status === "placed").length,
    deckRemaining: dedRoomsUnusedRoomIds(mapState, { includeGreenRoom: false }).length,
    currentCoordinate: coordinate,
    currentCoordinateKey: coordinate ? coordKey(coordinate) : null,
    currentPlacedRoomId: playerRoomId,
    greenRoomPlaced: mapState.greenRoomPlaced,
    anchors: Object.values(mapState.anchors).map((anchor: DedRoomsAnchorPlacement) => ({
      key: anchor.key,
      roomId: anchor.roomId,
      title: anchor.title,
      discovered: anchor.discovered,
      coordinate: anchor.discovered ? anchor.coordinate : null,
    })),
  };
}

function formatCoordinate(coord: DedRoomsCoordinate | null) {
  return coord ? `${coord.x},${coord.y},${coord.z}` : "unknown";
}

function formatDoorLine(door: DedRoomsDoor) {
  return door.resolvedToRoomId
    ? `${door.key}: ${door.label} -> ${findGreenRoomRoom(door.resolvedToRoomId).title}`
    : `${door.key}: ${door.label} -> unresolved`;
}

function roomInspectableLabels(room: ReturnType<typeof findGreenRoomRoom>): string[] {
  return [...new Set(
    Object.entries(room.details)
      .map(([key, detail]) => detail.aliases[0] || key)
      .filter(Boolean),
  )];
}

function commandLinesForRoomOverview(
  room: ReturnType<typeof findGreenRoomRoom>,
  npcs: Array<{ key: string; name: string }>,
  resources: Array<{ key: string; label: string; farmYield: number }>,
  doors: DedRoomsDoor[],
  minigames: Array<{ title: string; command: string }>,
) {
  const lines = [room.description];
  lines.push(
    doors.length
      ? `Passages: ${doors.map((door) => `${door.key}${door.resolvedToRoomId ? " (linked)" : ""}`).join(", ")}.`
      : "Passages: none visible.",
  );
  const inspectables = roomInspectableLabels(room);
  if (inspectables.length > 0) {
    lines.push(`Inspectable: ${inspectables.join(", ")}. Try inspect <thing>.`);
  }
  if (npcs.length > 0) {
    lines.push(`NPCs here: ${npcs.map((npc) => npc.name).join(", ")}. Try talk <npc> or listen.`);
  }
  if (resources.length > 0) {
    lines.push(
      `Resources: ${resources
        .map((resource) => `${resource.label} (gather ${resource.key}; farm ${resource.key})`)
        .join(", ")}.`,
    );
  }
  if (minigames.length > 0) {
    lines.push(`Odd jobs: ${minigames.map((game) => `${game.title} via "${game.command}"`).join("; ")}.`);
  }
  return lines;
}

function passiveConversationLines(roomId: string, npcs: Array<{ key: string; name: string; mood: string; wants: string[] }>) {
  const room = findGreenRoomRoom(roomId);
  if (room.tags.includes("bread-art") || room.tags.includes("display-cases") || room.tags.includes("market")) {
    return [
      'A collector squints at a display case: "I dunno, its kind of stale... got anything by this artist that\'s fresh?"',
      'A curator replies, "It\'s clear you are only in this for the bread, but I\'m here for the art."',
      "The baker behind them stamps a rewards card with the grave dignity of a central bank.",
    ];
  }
  if (room.id === "dao_2") {
    return [
      "Two bakers debate whether abstaining counts as proofing the dough.",
      "One whispers that Herb's people have been buying ovens near every ballot box.",
    ];
  }
  if (room.id === "bakery_2") {
    return [
      "A baker says the listening loaves are just artisanal acoustics.",
      "Another baker writes that sentence down before pretending not to.",
    ];
  }
  if (npcs.length >= 2) {
    return [
      `${npcs[0].name} and ${npcs[1].name} speak in the pause between obvious sentences.`,
      `${npcs[0].name}: "The room moved again, didn't it?"`,
      `${npcs[1].name}: "Only in the way a debt moves when nobody owns the counter."`,
    ];
  }
  if (npcs.length === 1) {
    return [
      `${npcs[0].name} mutters to nobody visible.`,
      "The room listens harder than it should.",
    ];
  }
  return ["You listen. Pipes tick, lights hum, and something behind the wall chooses not to be plot-relevant yet."];
}

export async function getGreenRoomState(user: GreenRoomAuthUser) {
  const { player, campaign, mapState } = await ensurePlayer(user);
  if (player.status === "departed") {
    return {
      status: "departed",
      message: GREEN_ROOM_DEPARTED_MESSAGE,
      campaign: {
        mode: campaign.mode,
        targetDepartures: campaign.targetDepartures,
        departureCount: campaign.departureCount,
      },
      transcript: [
        {
          id: 0,
          scope: "player",
          eventType: "ded_rooms.departed",
          message: GREEN_ROOM_DEPARTED_MESSAGE,
          visibility: "private",
          locationId: player.locationId,
          userId: user.id,
          actorUserId: user.id,
          createdAt: new Date().toISOString(),
          metadata: {},
        },
      ],
      departed: true,
    };
  }

  const room = findGreenRoomRoom(player.locationId);
  const npcs = await roomNpcStates(room.id);
  const resources = roomResources(room.id);
  const inventory = await inventoryForUser(user.id);
  const flags = await getPlayerFlags(user.id);
  const transcript = await recentEvents(user.id, player.locationId, 60);
  const nearby = await nearbyPlayers(user.id, player.locationId);
  const progress = campaignProgress(campaign);
  const coordinate = placedRoomCoordinate(mapState, player.locationId);
  const doors = dedRoomsDoorsForRoom(room, mapState);

  return {
    status: "exploring",
    app: {
      key: "dedrooms",
      title: "DedRooms",
      route: "/dedrooms",
    },
    departed: false,
    campaign: {
      id: campaign.id,
      slug: campaign.slug,
      title: campaign.title,
      mode: campaign.mode,
      targetDepartures: campaign.targetDepartures,
      departureCount: campaign.departureCount,
      sharedUnlockedAt: toIso(campaign.sharedUnlockedAt),
      mythModeAt: toIso(campaign.mythModeAt),
      progress,
    },
    player: {
      userId: player.userId,
      locationId: player.locationId,
      placedRoomId: player.locationId,
      coordinate,
      coordinateKey: coordinate ? coordKey(coordinate) : null,
      status: player.status,
      weightLimit: player.weightLimit,
      inventoryWeight: player.inventoryWeight,
      commands: knownGreenRoomCommands(player.commandDeck),
      attuned: playerAttuned(player),
      attunement: player.attunementJson,
      flags,
      sheet: buildPlayerCharacterSheet(user, player, flags, inventory),
    },
    room: {
      id: room.id,
      title: room.title,
      region: room.region,
      description: room.description,
      exits: room.exits,
      placed: placedRoomSummary(mapState, player.locationId),
      doors,
      inspectable: roomInspectableLabels(room),
      interactables: {
        passages: doors.map((door) => ({ key: door.key, label: door.label, linked: Boolean(door.resolvedToRoomId) })),
        npcs: npcs.map((npc) => ({ key: npc.key, name: npc.name })),
        resources: resources.map((resource) => ({ key: resource.key, label: resource.label })),
        minigames: GREEN_ROOM_MINIGAMES.filter((game) => game.roomHint === room.id).map((game) => ({
          key: game.key,
          title: game.title,
          command: game.command,
        })),
      },
      tags: room.tags,
    },
    doors,
    map: dedRoomsMapPayload(mapState, player.locationId),
    npcs,
    resources: resources.map((resource) => ({
      key: resource.key,
      label: resource.label,
      family: resource.family,
      farmYield: resource.farmYield,
    })),
    minigames: GREEN_ROOM_MINIGAMES.filter((game) => game.roomHint === room.id),
    inventory,
    nearby,
    transcript,
    seedSummary: greenRoomSeedSummary(),
    isAdmin: adminForUser(user),
  };
}

export async function getGreenRoomHistory(user: GreenRoomAuthUser, limit = 80) {
  const { player } = await ensurePlayer(user);
  return { events: await recentEvents(user.id, player.locationId, Math.max(1, Math.min(200, limit))) };
}

async function commandLinesForLook(
  user: GreenRoomAuthUser,
  player: typeof greenRoomPlayers.$inferSelect,
  mapState: DedRoomsMapState,
  target: string,
) {
  const room = findGreenRoomRoom(player.locationId);
  const npcs = await roomNpcStates(room.id);
  const resources = roomResources(room.id);
  const doors = dedRoomsDoorsForRoom(room, mapState);
  const minigames = GREEN_ROOM_MINIGAMES.filter((game) => game.roomHint === room.id);
  const normalizedTarget = String(target || "").trim().toLowerCase();
  if (!target) {
    return commandLinesForRoomOverview(room, npcs, resources, doors, minigames);
  }
  if (["room", "here", "around", "objects", "items", "resources", "resource", "doors", "exits", "passages"].includes(normalizedTarget)) {
    return commandLinesForRoomOverview(room, npcs, resources, doors, minigames);
  }
  const detail = inspectGreenRoomDetail(room, target);
  if (detail.found && detail.flag) await setPlayerFlag(user.id, detail.flag, { seenAt: new Date().toISOString() });
  return [
    detail.text,
    ...(detail.reveals.length > 0 ? [`You now have a better reason to inspect: ${detail.reveals.join(", ")}.`] : []),
  ];
}

async function commandLinesForGather(user: GreenRoomAuthUser, player: typeof greenRoomPlayers.$inferSelect, target: string, farm: boolean) {
  const room = findGreenRoomRoom(player.locationId);
  const available = roomResources(room.id);
  const normalizedTarget = normalizeGreenRoomItemKey(target);
  const resource =
    (target
      ? available.find(
          (candidate) =>
            candidate.key === normalizedTarget ||
            normalizeGreenRoomItemKey(candidate.label) === normalizedTarget,
        )
      : null) ||
    available[0] ||
    null;
  if (!resource) return ["This room has nothing obvious to gather. That is probably suspicious, but not useful."];
  const stacks = await inventoryForUser(user.id);
  if (!canCarry(stacks, player.weightLimit, GREEN_ROOM_RESOURCE_BY_KEY.get(resource.key)?.weight || 1)) {
    return ["Your inventory is too heavy for more. Combine or barter before carrying more weirdness."];
  }
  if (farm) {
    await addItem(user.id, resource.key, Math.max(1, resource.farmYield));
    await setPlayerFlag(user.id, `farmed_${resource.key}`, { at: new Date().toISOString(), roomId: room.id });
    return [`You farm ${resource.label}. It is slower than a daily drop, but it keeps the story from dead-ending.`];
  }
  const node = await ensureResourceNode(room.id, resource.key);
  if (node.quantityAvailable <= 0) {
    return [`The daily ${resource.label} drop has already been picked clean here. You can still farm a smaller yield.`];
  }
  await db
    .update(greenRoomResourceNodes)
    .set({ quantityAvailable: Math.max(0, node.quantityAvailable - 1), updatedAt: new Date() })
    .where(eq(greenRoomResourceNodes.id, node.id));
  await addItem(user.id, resource.key, 1);
  await addEvent({
    actorUserId: user.id,
    locationId: room.id,
    eventType: "ded_rooms.resource.gathered",
    message: `${user.username} gathers ${resource.label}.`,
    visibility: "room",
    scope: "room",
    metadata: { resourceKey: resource.key },
  });
  return [`You gather ${resource.label}. ${Math.max(0, node.quantityAvailable - 1)} remain in this daily drop.`];
}

async function commandLinesForTalk(user: GreenRoomAuthUser, player: typeof greenRoomPlayers.$inferSelect, target: string) {
  const room = findGreenRoomRoom(player.locationId);
  const states = await roomNpcStates(room.id);
  const normalizedTarget = target.replace(/^the /, "");
  const state = states.find((candidate) =>
    candidate.key.includes(normalizedTarget.replace(/\s+/g, "_")) ||
    candidate.name.toLowerCase().includes(normalizedTarget)
  );
  if (!state) {
    const names = states.map((candidate) => candidate.name).join(", ");
    return [names ? `You can talk to: ${names}.` : "No one here reacts to conversation. The walls seem relieved."];
  }
  const npc = GREEN_ROOM_NPC_BY_KEY.get(state.key);
  if (state.key === "art_ghost") {
    if (await hasItem(user.id, "found_art")) {
      await consumeItem(user.id, "found_art");
      await addItem(user.id, "ghost_receipt", 1);
      await setPlayerFlag(user.id, "art_ghost_trust", { score: 3, at: new Date().toISOString() });
      return [
        "The Art Ghost buys your found art with a receipt that is somehow colder than the room.",
        "He says: The Green Room likes proof that cannot hang on a wall.",
      ];
    }
    await setPlayerFlag(user.id, "art_ghost_met", { at: new Date().toISOString() });
    return [
      "The Art Ghost asks if you have art for sale. He will remember politeness, but he pays only for something found.",
      ...(npc?.lines || []),
    ];
  }
  if (state.key === "frog_sage") {
    const flags = await getPlayerFlags(user.id);
    const pond = asRecord(flags.pond_coin_days);
    const count = Number(pond.count || 0);
    if (count >= 30) {
      await addItem(user.id, "frog_wisdom", 1, 1, { metadata: { source: "pond" } });
      await setPlayerFlag(user.id, "frog_sage_wisdom", { at: new Date().toISOString() });
      return [
        "The Frog Sage rises from the pond and says: Fools spend reflections. Financiers sell them back wet.",
        "You receive frog wisdom, which weighs nothing and still changes your posture.",
      ];
    }
    return [`The pond ripples. ${30 - count} daily coin offerings remain before the Frog Sage considers you financially funny.`];
  }
  if (state.key === "taxi_dispatcher") {
    const flags = await getPlayerFlags(user.id);
    if (flags.lily_yellow_paint_seen) {
      await setPlayerFlag(user.id, "dispatcher_lily_hint", { at: new Date().toISOString() });
      return [
        "Dispatcher 7 says: Unit Lily took a fare into a room that was not outdoors yet. The meter is still running.",
        "This deepens the Lily branch. It does not block the Green Room.",
      ];
    }
    return ["The dispatcher hisses through radio static: Bring me yellow evidence, not yellow theories."];
  }
  if (state.key === "janitor_of_doors") {
    if (await hasItem(user.id, "static_map")) {
      await setPlayerFlag(user.id, "janitor_static_map_hint", { at: new Date().toISOString() });
      return ["The Janitor of Doors nods at your static map. The Green Room opens when the world and your proof both stop arguing."];
    }
    return ["The Janitor of Doors says a map made of static would be silly enough to be useful."];
  }
  if (state.key === "queen_of_small_requirements") {
    if (await consumeItem(user.id, "ant_sugar_grain")) {
      await addItem(user.id, "crumb_contract", 1);
      await setPlayerFlag(user.id, "ant_queen_contract", { at: new Date().toISOString() });
      return [
        "The Queen of Small Requirements accepts one sugar grain and has nine ants notarize it as a public work.",
        "You receive a crumb contract. It is tiny, binding, and mostly about humility.",
      ];
    }
    return [
      "The ant queen taps: Bring one ant sugar grain if you wish to be classified as citizen instead of weather.",
      ...(npc?.lines || []),
    ];
  }
  if (state.key === "crumb_bailiff") {
    if (await hasItem(user.id, "crumb_contract")) {
      await setPlayerFlag(user.id, "crumb_bailiff_respects_contract", { at: new Date().toISOString() });
      return [
        "The Crumb Bailiff reads your crumb contract upside down and declares you temporarily admissible.",
        "He whispers that the ants have seen yellow threads dragged through places no ant would willingly inventory.",
      ];
    }
    return ["The Crumb Bailiff bangs a sesame seed gavel. Evidence first, questions second, lunch never."];
  }
  if (state.key === "aubergine_abbess") {
    if (await consumeItem(user.id, "aubergine_seed")) {
      await addItem(user.id, "purple_vow", 1);
      await setPlayerFlag(user.id, "aubergine_vow_taken", { at: new Date().toISOString() });
      return [
        "The Aubergine Abbess plants your seed in a bowl of supermarket mist.",
        "She gives you a purple vow and says it is legally not a cult if the snacks are optional.",
      ];
    }
    return ["The Abbess asks for an aubergine seed. She will not explain why all vows here bruise purple."];
  }
  if (state.key === "duke_of_bruised_vegetables") {
    if (await consumeItem(user.id, "glass_fruit")) {
      await addItem(user.id, "aubergine_seed", 1);
      await setPlayerFlag(user.id, "duke_bartered_glass_fruit", { at: new Date().toISOString() });
      return [
        "The Duke accepts the glass fruit as precedent and bangs a zucchini on the bench.",
        "He awards you an aubergine seed and advises never to plead guilty to ripeness.",
      ];
    }
    return ["The Duke wants glass fruit before he will discuss bruises, moons, or checkout law."];
  }
  if (state.key === "radiant_launderer") {
    if (await consumeItem(user.id, "uranium_glass")) {
      await addItem(user.id, "warm_warning_label", 1);
      await setPlayerFlag(user.id, "radiant_laundry_label", { at: new Date().toISOString() });
      return [
        "The Radiant Launderer seals your uranium glass in a velvet safety sleeve and runs a cold wash for symbolism only.",
        "You receive a warm warning label. It says DO NOT TUMBLE DRY PROPHECY.",
      ];
    }
    return ["The launderer asks for sealed uranium glass and points at the safety posters until the room feels supervised."];
  }
  if (state.key === "shepherd_of_last_weather") {
    if (await consumeItem(user.id, "wool_star")) {
      await addItem(user.id, "flock_constellation", 1);
      await setPlayerFlag(user.id, "flock_constellation_charted", { at: new Date().toISOString() });
      return [
        "The Shepherd of Last Weather combs your wool star into a constellation shaped like a cancelled forecast.",
        "You receive a flock constellation. It points north only when nobody is asking.",
      ];
    }
    return ["The shepherd says counting sheep is easy. Convincing them to remain counted is the rite."];
  }
  if (state.key === "candle_cultist") {
    if (await consumeItem(user.id, "candle_stub")) {
      await addItem(user.id, "soft_cult_invitation", 1);
      await setPlayerFlag(user.id, "soft_cult_invited", { at: new Date().toISOString() });
      return [
        "The Candle Cultist logs your candle stub as attendance, apology, and dessert contribution.",
        "You receive a soft cult invitation. The fine print bans violence and mandatory chanting before lunch.",
      ];
    }
    return ["The cultist welcomes you warmly, then asks for a candle stub because warmth needs minutes."];
  }
  if (state.key === "wool_deacon") {
    if (await hasItem(user.id, "soft_cult_invitation")) {
      await setPlayerFlag(user.id, "wool_deacon_corner_hint", { at: new Date().toISOString() });
      return [
        "The Wool Deacon folds your invitation into a rectangle that briefly has five corners.",
        "He says the velvet corner is not hungry. It is just bad at being full.",
      ];
    }
    return ["The Wool Deacon folds silence into a blanket and waits for proof you were invited."];
  }
  if (state.key === "cat_who_remembers") {
    if (await consumeItem(user.id, "cat_whisker")) {
      await addItem(user.id, "cat_permission", 1);
      await setPlayerFlag(user.id, "cat_permission_granted", { at: new Date().toISOString() });
      return [
        "The Cat Who Remembers the First Door accepts the whisker as if it loaned it to you in the first place.",
        "You receive cat permission. It is not a map, but several doors become less smug.",
      ];
    }
    return ["The cat says nothing. Its silence specifies that you should petition with a whisker, not a plan."];
  }
  if (state.key === "yellow_knight") {
    const flags = await getPlayerFlags(user.id);
    if (await hasItem(user.id, "yellow_thread") && (await hasItem(user.id, "yellow_paint_flake") || flags.lily_yellow_paint_seen)) {
      await consumeItem(user.id, "yellow_thread");
      await addItem(user.id, "yellow_knight_rumor", 1);
      await setPlayerFlag(user.id, "yellow_knight_lily_rumor", { at: new Date().toISOString() });
      return [
        "The Yellow Knight ties your yellow thread around the caution lance and bows toward the sunset forest.",
        "He says Lily's taxi wore the same yellow as cowards, kings, and road work. You receive a Yellow Knight rumor.",
      ];
    }
    return ["The Yellow Knight asks for yellow thread and evidence of yellow paint before he will make the Lily connection aloud."];
  }
  if (state.key === "splendor_that_blinks") {
    if (await consumeItem(user.id, "void_salt")) {
      await addItem(user.id, "splendor_index", 1);
      await setPlayerFlag(user.id, "splendor_indexed", { at: new Date().toISOString() });
      return [
        "The Splendor That Blinks dissolves your void salt in water that refuses wetness.",
        "A splendor index appears in your inventory. Reading it makes the command prompt feel overdressed.",
      ];
    }
    return ["The splendor blinks patiently. It wants void salt, or maybe it wants you to admit wanting to know why."];
  }
  if (state.key === "overbaked_baker") {
    if (await consumeItem(user.id, "bakery_reward_stamp")) {
      await addItem(user.id, "bakery_banker_card", 1);
      await setPlayerFlag(user.id, "bakery_banker_card_received", { at: new Date().toISOString() });
      return [
        "The Baker Who Overbaked the Block accepts your reward stamp, opens a tiny crumb account, and insists this is a pastry relationship.",
        "You receive a bakery banker card. It earns double points whenever your bread art is pinned under glass and described too seriously.",
      ];
    }
    if (await consumeItem(user.id, "baker_salt")) {
      await addItem(user.id, "overbaked_block_receipt", 1);
      await setPlayerFlag(user.id, "overbaked_block_respected", { at: new Date().toISOString() });
      return [
        "The Baker Who Overbaked the Block seasons the burned loaf with your baker salt and calls it a governance-compatible crust.",
        "You receive an overbaked block receipt. It proves the mistake was artisanal, or at least final. The baker also nudges a rewards brochure toward you with bankerly innocence.",
      ];
    }
    return ["The baker wants baker salt or a bakery reward stamp before discussing delegation drama, crumb custody, or why proof of steak still gets a laugh."];
  }
  if (state.key === "walletless_delegator") {
    if (await consumeItem(user.id, "delegation_receipt")) {
      await addItem(user.id, "delegation_vow", 1);
      await setPlayerFlag(user.id, "delegator_vow_recorded", { at: new Date().toISOString() });
      return [
        "The Delegator Without a Wallet folds your receipt into a loaf-shaped promise.",
        "You receive a delegation vow. It yields nothing except trust, crumbs, and one excellent rumor.",
      ];
    }
    return ["The delegator wants a delegation receipt and refuses to explain why their wallet connection is a lifestyle."];
  }
  if (state.key === "proposal_threadcaster") {
    if (await consumeItem(user.id, "proposal_ash")) {
      await addItem(user.id, "threadcaster_receipt", 1);
      await setPlayerFlag(user.id, "threadcaster_receipt_earned", { at: new Date().toISOString() });
      return [
        "The Proposal Threadcaster inhales your proposal ash and exhales a thread with timestamps, footnotes, and one apology.",
        "You receive a threadcaster receipt. Reading it makes every Tezos fight feel older and somehow kinder.",
      ];
    }
    return ["The Threadcaster wants proposal ash before turning old drama into context."];
  }
  if (state.key === "infinite_edition_minter") {
    if (await consumeItem(user.id, "bread_art_sketch")) {
      await addItem(user.id, "bread_pin_receipt", 1);
      await setPlayerFlag(user.id, "bread_art_pin_completed", { at: new Date().toISOString() });
      return [
        "The Bread Art Pinner feeds your sketch to the plotter, buys a dramatic slice from the baker, and pins the result with ceremonial tongs.",
        "You receive a bread pin receipt. It lists loaf count as 'ask again after the rewards-program disclosure.'",
      ];
    }
    return ["The bread art pinner wants a bread art sketch. Not a wallet seed. They point to the glass safety sign several times."];
  }
  if (state.key === "one_of_one_saint") {
    if (await consumeItem(user.id, "curator_tag")) {
      await addItem(user.id, "single_slice_prayer", 1);
      await setPlayerFlag(user.id, "single_slice_blessing", { at: new Date().toISOString() });
      return [
        "The Single-Slice Saint pins your curator tag beside one blessed slice and refuses to make a second one.",
        "You receive a single-slice prayer. It is unique, unless someone traces it through the display case.",
      ];
    }
    return ["The saint wants a curator tag before blessing scarcity, loaf counts, or your sense of proportion."];
  }
  if (state.key === "metadata_moth") {
    if (await consumeItem(user.id, "pinned_bread_art")) {
      await addItem(user.id, "clean_placard", 1);
      await setPlayerFlag(user.id, "placard_moth_cleaned", { at: new Date().toISOString() });
      return [
        "The Case-Placard Moth wraps your pinned bread art in a wax shawl and stops blaming the glass for a full three seconds.",
        "You receive a clean placard. The preview still fogs fashionably late.",
      ];
    }
    return ["The Case-Placard Moth wants pinned bread art before it will call any missing preview temporary."];
  }
  if (state.key === "curator_without_floor") {
    if (await consumeItem(user.id, "curator_tag")) {
      await addItem(user.id, "single_slice_prayer", 1);
      await setPlayerFlag(user.id, "curator_slice_prayer_shared", { at: new Date().toISOString() });
      return [
        "The Curator Without a Case studies your tag and refuses to reduce it to lowest crumb price.",
        "You receive a single-slice prayer and a private suspicion that taste may be a porch lantern.",
      ];
    }
    return ["The curator wants a curator tag, not a lowest-crumb chart. They say discovery should leave fingerprints on the case glass."];
  }
  if (state.key === "floor_sweeper") {
    if (await consumeItem(user.id, "case_dust")) {
      await addItem(user.id, "case_duster_receipt", 1);
      await setPlayerFlag(user.id, "case_duster_receipt", { at: new Date().toISOString() });
      return [
        "The Display Case Duster of Last Resort accepts your case dust and buffs it into three piles: alpha, cope, and porch folklore.",
        "You receive a case duster receipt. It is not financial advice, which makes it lonely.",
      ];
    }
    return ["The duster wants case dust before discussing bargains, bottoms, or why the lowest crumb has been crawling all week."];
  }
  if (state.key === "ghost_of_here_and_now") {
    if (await consumeItem(user.id, "old_kiosk_ghost")) {
      await addItem(user.id, "ghost_case_map", 1);
      await setPlayerFlag(user.id, "old_kiosk_ghost_mapped", { at: new Date().toISOString() });
      return [
        "The Ghost of the Here And Now Bread Kiosk accepts the old kiosk ghost and unfolds a map made from mirrors, forks, and stubborn bread-art people.",
        "You receive a ghost case map. It remembers Here And Now, Teia garden cases, and every bakery tab someone kept open on purpose.",
      ];
    }
    return ["The ghost asks for an old kiosk ghost from the bread-art cache. It promises not nostalgia, but continuity."];
  }
  if (state.key === "royalty_splitter") {
    if (await consumeItem(user.id, "crumb_resale_ribbon")) {
      await addItem(user.id, "crumb_resale_apology", 1);
      await setPlayerFlag(user.id, "crumb_resale_apology_written", { at: new Date().toISOString() });
      return [
        "The Crumb Splitter in Mourning divides your ribbon into fractions and writes each crumb a tiny apology.",
        "You receive a crumb resale apology. It weighs nothing and still makes the till sigh.",
      ];
    }
    return ["The splitter wants a crumb resale ribbon before talking about optional courtesy and non-optional feelings."];
  }
  if (state.key === "dao_choir_director") {
    if (await consumeItem(user.id, "proposal_ash")) {
      await addItem(user.id, "governance_hymnal", 1);
      await setPlayerFlag(user.id, "governance_hymnal_received", { at: new Date().toISOString() });
      return [
        "The DAO Choir Director taps your proposal ash into the score and the choir reaches quorum by accident.",
        "You receive a governance hymnal. The chorus is mostly abstentions but the harmony works.",
      ];
    }
    return ["The director wants proposal ash before the choir will vote on whether singing counts as infrastructure."];
  }
  if (state.key === "michelson_monk") {
    if (await consumeItem(user.id, "lambda_thread")) {
      await addItem(user.id, "contract_audit_charm", 1);
      await setPlayerFlag(user.id, "michelson_charm_received", { at: new Date().toISOString() });
      return [
        "The Michelson Monk stitches your lambda thread through the contract's nervous stack.",
        "You receive a contract audit charm. It does not guarantee safety, but it does glare at sloppy assumptions.",
      ];
    }
    return ["The monk wants lambda thread and says every stack is a tower of tiny promises."];
  }
  if (state.key === "indexer_oracle") {
    if (await consumeItem(user.id, "indexer_receipt")) {
      await addItem(user.id, "indexed_memory", 1);
      await setPlayerFlag(user.id, "indexer_memory_indexed", { at: new Date().toISOString() });
      return [
        "The Indexer Oracle stamps your receipt one block late and exactly on time.",
        "You receive indexed memory. It proves the bread-art sale happened, the delay happened, and the refresh button learned nothing.",
      ];
    }
    return ["The oracle wants an indexer receipt before it can convert suspense into history."];
  }
  if (state.key === "bridge_ferryman") {
    if (await consumeItem(user.id, "bridged_echo")) {
      await addItem(user.id, "rollup_ticket", 1);
      await setPlayerFlag(user.id, "rollup_ticket_stamped", { at: new Date().toISOString() });
      return [
        "The Bridge Ferryman stamps your bridged echo, walks it across the Etherlink escalator, and returns with faster shoes.",
        "You receive a rollup ticket. It says the hallway is infrastructure now.",
      ];
    }
    return ["The ferryman wants a bridged echo before discussing rollups, toll booths, or discourse with lower latency."];
  }
  if (state.key === "wallet_fox") {
    if (await hasItem(user.id, "clean_placard") || await consumeItem(user.id, "wallet_warning")) {
      await addItem(user.id, "wallet_fox_warning", 1);
      await setPlayerFlag(user.id, "wallet_fox_warning_received", { at: new Date().toISOString() });
      return [
        "The Wallet Fox Behind Glass nods at your safe handling and refuses, correctly, to ask for secret words.",
        "You receive a wallet fox warning: real seed phrases, mnemonics, and private keys never belong in games, chats, or forms.",
      ];
    }
    return ["The fox wants a clean placard or a wallet warning. It will not accept secrets, even as a joke."];
  }
  return npc?.lines?.length ? npc.lines : [`${state.name} has nothing to say, but performs having said it.`];
}

async function commandLinesForPondThrow(user: GreenRoomAuthUser, player: typeof greenRoomPlayers.$inferSelect) {
  if (player.locationId !== "coin_pond") return ["You toss the idea away. The pond is not here to catch it."];
  if (!(await consumeItem(user.id, "coin"))) return ["You need a coin to make the pond take you seriously."];
  const flags = await getPlayerFlags(user.id);
  const current = asRecord(flags.pond_coin_days);
  const day = todayKey();
  const priorDay = String(current.lastDay || "");
  const count = Number(current.count || 0);
  const nextCount = priorDay === day ? count : count + 1;
  await setPlayerFlag(user.id, "pond_coin_days", { count: nextCount, lastDay: day });
  await addEvent({
    actorUserId: user.id,
    locationId: "coin_pond",
    eventType: "ded_rooms.pond.offering",
    message: `${user.username} throws a coin into the pond. The water files it somewhere.`,
    visibility: "room",
    scope: "room",
    metadata: { count: nextCount },
  });
  if (priorDay === day) {
    return ["The pond accepts the coin, but not as a new day. It is extremely strict about calendars."];
  }
  if (nextCount >= 30) {
    await addItem(user.id, "frog_wisdom", 1);
    await setPlayerFlag(user.id, "frog_sage_unlocked", { at: new Date().toISOString() });
    return ["The thirtieth offering vanishes upward. The Frog Sage is now willing to discuss fools, finance, and your tone."];
  }
  return [`The coin sinks sideways. Pond offering ${nextCount}/30 is recorded.`];
}

async function commandLinesForCombine(user: GreenRoomAuthUser, itemKey: string) {
  const stacks = await inventoryForUser(user.id);
  const result = combineThreeUpgrade(stacks, itemKey);
  if (!result.ok) return [result.message];
  await consumeItem(user.id, result.itemKey, result.consumed, result.fromTier);
  await addItem(user.id, result.itemKey, result.created, result.toTier);
  const lines = [result.message];
  if (result.itemKey === "static" && result.toTier >= 2 && !(await hasItem(user.id, "static_map"))) {
    await addItem(user.id, "static_map", 1);
    lines.push("The upgraded static resolves into a static map. It shows where you are by arguing with itself.");
  }
  return lines;
}

async function maybePlaceGreenRoomFromCampaign(user: GreenRoomAuthUser, campaign: typeof greenRoomCampaigns.$inferSelect, trigger: string) {
  if (!isSharedUnlocked(campaign) && !campaign.sharedUnlockedAt) return null;
  const mapState = await ensureDedRoomsMap();
  if (mapState.greenRoomPlaced) return null;
  const placed = placeDedRoomsGreenRoom(mapState, trigger);
  await saveDedRoomsMap(placed.state, user.id);
  await addEvent({
    actorUserId: user.id,
    eventType: "ded_rooms.green_room.placed",
    message: "Somewhere in DedRooms, a green threshold enters the map and refuses to announce its coordinates.",
    visibility: "world",
    scope: "world",
    metadata: { trigger, coordinate: coordKey(placed.coordinate) },
  });
  return placed;
}

async function commandLinesForAttune(user: GreenRoomAuthUser, campaign: typeof greenRoomCampaigns.$inferSelect) {
  const proofs: string[] = [];
  for (const proof of GREEN_ROOM_ATTUNEMENT_REQUIREMENTS) {
    if (await hasItem(user.id, proof)) proofs.push(proof);
  }
  const attunement = await setPlayerAttunement(user.id, proofs);
  const missing = GREEN_ROOM_ATTUNEMENT_REQUIREMENTS.filter((proof) => !proofs.includes(proof));
  if (attunement.ready) {
    const placed = await maybePlaceGreenRoomFromCampaign(user, campaign, "personal-attunement");
    return [
      "Your proofs align. The Green Room can now recognize you if the shared lock is open.",
      ...(placed?.placed ? ["Somewhere, a green threshold enters the map. The coordinates remain rude."] : []),
    ];
  }
  return [`You are not fully attuned. Missing: ${missing.map((proof) => proof.replace(/_/g, " ")).join(", ")}.`];
}

async function commandLinesForOffer(user: GreenRoomAuthUser, campaign: typeof greenRoomCampaigns.$inferSelect, target: string) {
  const proof = PROOF_TO_MILESTONE[target] ? target : "";
  if (!proof || !(await hasItem(user.id, proof))) {
    return ["Offer needs a known proof you carry: ghost receipt, frog wisdom, or static map."];
  }
  const milestone = PROOF_TO_MILESTONE[proof];
  const progress = campaignProgress(campaign);
  const completed = new Set(progress.completed);
  completed.add(milestone);
  const unlocked = progress.required.every((required) => completed.has(required));
  await db
    .update(greenRoomCampaigns)
    .set({
      sharedUnlockProgress: { required: progress.required, completed: [...completed] },
      sharedUnlockedAt: unlocked ? (campaign.sharedUnlockedAt || new Date()) : campaign.sharedUnlockedAt,
      updatedAt: new Date(),
    })
    .where(eq(greenRoomCampaigns.id, campaign.id));
  await addEvent({
    actorUserId: user.id,
    eventType: "ded_rooms.shared_milestone",
    message: `${user.username} offers ${proof.replace(/_/g, " ")} to the shared lock.`,
    visibility: "world",
    scope: "world",
    metadata: { milestone, unlocked },
  });
  const placed = unlocked ? await maybePlaceGreenRoomFromCampaign(user, { ...campaign, sharedUnlockedAt: campaign.sharedUnlockedAt || new Date() }, "shared-unlock") : null;
  return unlocked
    ? [
        "The shared lock turns. The Green Room is now waiting on personal attunement.",
        ...(placed?.placed ? ["Somewhere, a green threshold enters the map. The coordinates remain rude."] : []),
      ]
    : [`Shared milestone recorded: ${milestone}.`];
}

async function commandLinesForMinigame(user: GreenRoomAuthUser, player: typeof greenRoomPlayers.$inferSelect, key: string) {
  const game = GREEN_ROOM_MINIGAMES.find((candidate) => candidate.key === key);
  if (!game || game.roomHint !== player.locationId) return ["That minigame does not catch here. Try reading the room more literally."];
  await addItem(user.id, game.rewardKey, 1);
  await setPlayerFlag(user.id, `minigame_${game.key}`, { completedAt: new Date().toISOString() });
  return [`${game.title} accepts your effort and pays out ${itemDef(game.rewardKey).label}.`];
}

async function commandLinesForMark(user: GreenRoomAuthUser, username: string, mark: string) {
  if (!username || !MARK_VALUES.has(mark)) return ["Usage: mark @username friend|ally|neutral|sus-af."];
  const [target] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (!target) return [`No signed-in wtfOS user named ${username} was found.`];
  if (target.id === user.id) return ["You mark yourself as complicated. The system refuses to store that."];
  await db
    .insert(greenRoomRelationships)
    .values({
      userId: user.id,
      targetUserId: target.id,
      mark,
      metadataJson: { source: "dedrooms" },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [greenRoomRelationships.userId, greenRoomRelationships.targetUserId],
      set: { mark, updatedAt: new Date() },
    });
  return [`${target.username} is now marked ${mark}.`];
}

async function commandLinesForAlliance(user: GreenRoomAuthUser, action: string, name: string) {
  if (action === "create") {
    const rawName = name.trim().slice(0, 80);
    if (!rawName) return ["Usage: ally create <name>."];
    const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || `alliance-${user.id}`;
    const [alliance] = await db
      .insert(greenRoomAlliances)
      .values({
        slug,
        name: rawName,
        createdByUserId: user.id,
        status: "active",
        metadataJson: { source: "dedrooms" },
      })
      .onConflictDoUpdate({
        target: greenRoomAlliances.slug,
        set: { name: rawName, updatedAt: new Date() },
      })
      .returning();
    await db
      .insert(greenRoomAllianceMembers)
      .values({
        allianceId: alliance.id,
        userId: user.id,
        status: "active",
        role: "founder",
        joinedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [greenRoomAllianceMembers.allianceId, greenRoomAllianceMembers.userId],
        set: { status: "active", role: "founder", joinedAt: new Date(), updatedAt: new Date() },
      });
    return [`Alliance created: ${alliance.name}. Other players can still be deeply sus.`];
  }
  const rows = await db
    .select({
      name: greenRoomAlliances.name,
      status: greenRoomAllianceMembers.status,
      role: greenRoomAllianceMembers.role,
    })
    .from(greenRoomAllianceMembers)
    .innerJoin(greenRoomAlliances, eq(greenRoomAlliances.id, greenRoomAllianceMembers.allianceId))
    .where(eq(greenRoomAllianceMembers.userId, user.id))
    .limit(20);
  return rows.length
    ? rows.map((row) => `${row.name}: ${row.status} (${row.role})`)
    : ["You are in no alliances. This may be wise or lonely."];
}

async function commandLinesForTravel(
  user: GreenRoomAuthUser,
  player: typeof greenRoomPlayers.$inferSelect,
  mapState: DedRoomsMapState,
  doorName: string,
) {
  const room = findGreenRoomRoom(player.locationId);
  const doorKey = String(doorName || "").trim().toLowerCase();
  const doors = dedRoomsDoorsForRoom(room, mapState);
  const door = doors.find((candidate) => candidate.key === doorKey || candidate.label.toLowerCase() === doorKey);
  if (!door) {
    return [`You cannot find a passage called ${doorName || "that"}. Try doors, then go <door name>.`];
  }

  const resolved = resolveDedRoomsDoor(mapState, player.locationId, door.key, {
    userId: user.id,
    allowGreenRoom: mapState.greenRoomPlaced,
  });
  const nextMapState = await saveDedRoomsMap(markDedRoomsRoomDiscovered(resolved.state, resolved.nextRoomId), user.id);
  await db
    .update(greenRoomPlayers)
    .set({ locationId: resolved.nextRoomId, lastSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(greenRoomPlayers.userId, user.id));
  const nextRoom = dedRoomsRoomForPlacedId(nextMapState, resolved.nextRoomId);
  await addEvent({
    actorUserId: user.id,
    locationId: player.locationId,
    eventType: "ded_rooms.player.left",
    message: `${user.username} leaves through ${door.label}.`,
    visibility: "room",
    scope: "room",
  });
  await addEvent({
    actorUserId: user.id,
    locationId: resolved.nextRoomId,
    eventType: "ded_rooms.player.entered",
    message: `${user.username} arrives, looking like the map made a decision.`,
    visibility: "room",
    scope: "room",
    metadata: {
      placed: resolved.placed,
      looped: resolved.looped,
      coordinate: coordKey(resolved.coordinate),
    },
  });
  return [
    `You go through ${door.label}.`,
    resolved.placed ? `${nextRoom.title} locks into the map at ${coordKey(resolved.coordinate)}.` : resolved.looped ? "The passage loops to a room the map already knows." : "The old link holds.",
    ...commandLinesForRoomOverview(
      nextRoom,
      await roomNpcStates(nextRoom.id),
      roomResources(nextRoom.id),
      dedRoomsDoorsForRoom(nextRoom, nextMapState),
      GREEN_ROOM_MINIGAMES.filter((game) => game.roomHint === nextRoom.id),
    ),
  ];
}

function commandLinesForDoors(player: typeof greenRoomPlayers.$inferSelect, mapState: DedRoomsMapState) {
  const room = findGreenRoomRoom(player.locationId);
  const doors = dedRoomsDoorsForRoom(room, mapState);
  return doors.length ? doors.map(formatDoorLine) : ["No doors present themselves. This is not the same as safety."];
}

function commandLinesForMap(player: typeof greenRoomPlayers.$inferSelect, mapState: DedRoomsMapState) {
  const payload = dedRoomsMapPayload(mapState, player.locationId);
  const discoveredAnchors = payload.anchors.filter((anchor) => anchor.discovered);
  const hiddenAnchors = payload.anchors.length - discoveredAnchors.length;
  return [
    `Coordinate: ${formatCoordinate(payload.currentCoordinate)}. Placed rooms: ${payload.placedCount}. Authored rooms unplaced: ${payload.deckRemaining}.`,
    discoveredAnchors.length
      ? `Known anchors: ${discoveredAnchors.map((anchor) => `${anchor.title} @ ${formatCoordinate(anchor.coordinate)}`).join("; ")}.`
      : `Known anchors: none discovered yet. ${hiddenAnchors} anchor rooms exist somewhere in the placed map.`,
    payload.greenRoomPlaced ? "The Green Room has entered the map." : "The Green Room is absent. It will not spawn until the intro campaign triggers it.",
  ];
}

function commandLinesForSheet(
  user: GreenRoomAuthUser,
  player: typeof greenRoomPlayers.$inferSelect,
  flags: GreenRoomFlagMap,
  inventory: GreenRoomInventoryStack[],
) {
  const sheet = buildPlayerCharacterSheet(user, player, flags, inventory);
  return [
    `${sheet.name}, level ${sheet.level}.`,
    `Attributes: attention ${sheet.attributes.attention}, nerve ${sheet.attributes.nerve}, charm ${sheet.attributes.charm}, weird ${sheet.attributes.weird}, crumbcraft ${sheet.attributes.crumbcraft}.`,
    `Skills: ${Object.entries(sheet.skills).map(([key, value]) => `${key} +${value}`).join(", ")}.`,
    `Inventory: ${sheet.inventory.weight}/${sheet.inventory.weightLimit} wt across ${sheet.inventory.stackCount} stacks.`,
    `Habits: ${sheet.habits.join("; ")}.`,
  ];
}

function commandLinesForRoll(player: typeof greenRoomPlayers.$inferSelect, skill: string) {
  const normalizedSkill = String(skill || "attention").trim().toLowerCase().replace(/\s+/g, "_");
  const skills = asRecord(player.skillsJson);
  const bonus = numberFromSheet(skills[normalizedSkill], normalizedSkill === "attention" ? 1 : 0);
  const die = Math.floor(Math.random() * 20) + 1;
  const total = die + bonus;
  const beat = total >= 12 ? "success" : "complication";
  return [`d20 ${normalizedSkill}: ${die} + ${bonus} = ${total}. ${beat}.`];
}

function commandLinesForCampaign(campaign: typeof greenRoomCampaigns.$inferSelect, player: typeof greenRoomPlayers.$inferSelect, mapState: DedRoomsMapState) {
  const progress = campaignProgress(campaign);
  const missing = progress.required.filter((milestone) => !progress.completed.includes(milestone));
  return [
    `${campaign.title}: ${campaign.mode}. Departures ${campaign.departureCount}/${campaign.targetDepartures}.`,
    progress.sharedUnlocked ? "Shared lock: open." : `Shared lock missing: ${missing.join(", ")}.`,
    playerAttuned(player) ? "Personal attunement: ready." : "Personal attunement: incomplete.",
    mapState.greenRoomPlaced ? "Green Room map state: placed." : "Green Room map state: absent until triggered.",
  ];
}

async function commandLinesForListen(player: typeof greenRoomPlayers.$inferSelect) {
  const npcs = await roomNpcStates(player.locationId);
  return passiveConversationLines(player.locationId, npcs);
}

export async function runGreenRoomCommand(user: GreenRoomAuthUser, input: string) {
  const { player, campaign, mapState } = await ensurePlayer(user);
  if (player.status === "departed") {
    return {
      lines: [GREEN_ROOM_DEPARTED_MESSAGE],
      event: await addEvent({
        userId: user.id,
        actorUserId: user.id,
        locationId: player.locationId,
        eventType: "ded_rooms.departed.echo",
        message: GREEN_ROOM_DEPARTED_MESSAGE,
        visibility: "private",
      }),
      state: await getGreenRoomState(user),
    };
  }

  const parsed = parseGreenRoomCommand(input);
  if (parsed.verb !== "unknown" && parsed.verb !== "minigame" && !isCommandUnlocked(player.commandDeck, parsed.verb)) {
    return {
      lines: [`You have not unlocked ${parsed.verb} yet.`],
      state: await getGreenRoomState(user),
    };
  }

  let lines: string[] = [];
  switch (parsed.verb) {
    case "help":
      lines = [
        "Known commands: " + knownGreenRoomCommands(player.commandDeck).join(", "),
        "Try look, inspect <thing>, doors, go <door>, map, sheet, roll <skill>, listen, gather, farm, combine <item>, talk <npc>, mark @user sus-af, ally status, campaign, offer <proof>, attune, enter green room.",
      ];
      break;
    case "look":
    case "inspect":
      lines = await commandLinesForLook(user, player, mapState, parsed.target);
      break;
    case "go": {
      lines = await commandLinesForTravel(user, player, mapState, parsed.direction);
      break;
    }
    case "say": {
      const text = parsed.text.slice(0, 280);
      if (!text) {
        lines = ["Say what? The room refuses to fill in the blank."];
      } else {
        await addEvent({
          actorUserId: user.id,
          locationId: player.locationId,
          eventType: "ded_rooms.chat",
          message: `${user.username}: ${text}`,
          visibility: "room",
          scope: "room",
        });
        lines = [`You say: ${text}`];
      }
      break;
    }
    case "who": {
      const nearby = await nearbyPlayers(user.id, player.locationId);
      lines = nearby.length
        ? [`Here: ${nearby.map((p) => `${p.username} (${p.mark})`).join(", ")}.`]
        : ["No other players are in this room right now. The room remains overstaffed by vibes."];
      break;
    }
    case "inventory": {
      const stacks = await inventoryForUser(user.id);
      lines = stacks.length
        ? stacks.map((stack) => `${stack.quantity}x t${stack.tier} ${stack.label} (${stack.quantity * stack.weight} wt)`)
        : ["Your inventory is empty. This makes the world suspicious of you."];
      break;
    }
    case "sheet": {
      lines = commandLinesForSheet(user, player, await getPlayerFlags(user.id), await inventoryForUser(user.id));
      break;
    }
    case "roll":
      lines = commandLinesForRoll(player, parsed.skill);
      break;
    case "map":
      lines = commandLinesForMap(player, mapState);
      break;
    case "doors":
      lines = commandLinesForDoors(player, mapState);
      break;
    case "listen":
      lines = await commandLinesForListen(player);
      break;
    case "campaign":
      lines = commandLinesForCampaign(campaign, player, mapState);
      break;
    case "gather":
      lines = await commandLinesForGather(user, player, parsed.target, false);
      break;
    case "farm":
      lines = await commandLinesForGather(user, player, parsed.target, true);
      break;
    case "combine":
      lines = await commandLinesForCombine(user, parsed.itemKey);
      break;
    case "talk":
      lines = await commandLinesForTalk(user, player, parsed.target);
      break;
    case "mark":
      lines = await commandLinesForMark(user, parsed.username, parsed.mark);
      break;
    case "ally":
      lines = await commandLinesForAlliance(user, parsed.action, parsed.name);
      break;
    case "offer":
      lines = await commandLinesForOffer(user, campaign, parsed.target);
      break;
    case "attune":
      lines = await commandLinesForAttune(user, campaign);
      break;
    case "enter": {
      const target = parsed.target;
      if (!target.includes("green") && target) {
        lines = await commandLinesForTravel(user, player, mapState, target);
      } else if (player.locationId !== DEDROOMS_GREEN_ROOM_ID || (target && !target.includes("green") && !target.includes("door"))) {
        lines = ["There is no Green Room door here. There are, however, several normal ways to be wrong."];
      } else {
        const [freshPlayer] = await db
          .select()
          .from(greenRoomPlayers)
          .where(eq(greenRoomPlayers.userId, user.id))
          .limit(1);
        const [freshCampaign] = await db
          .select()
          .from(greenRoomCampaigns)
          .where(eq(greenRoomCampaigns.id, campaign.id))
          .limit(1);
        lines = await departThroughGreenRoom(user, freshPlayer || player, freshCampaign || campaign);
      }
      break;
    }
    case "throw":
      lines = parsed.itemKey === "coin" && parsed.target.includes("pond")
        ? await commandLinesForPondThrow(user, player)
        : ["You throw that thought away. The game records nothing useful."];
      break;
    case "minigame":
      lines = await commandLinesForMinigame(user, player, parsed.key);
      break;
    default:
      lines = ["The command does nothing yet. This may mean it is wrong, locked, or waiting to become a rumor."];
      break;
  }

  const message = lines.join("\n");
  const event = await addEvent({
    userId: user.id,
    actorUserId: user.id,
    locationId: player.locationId,
    eventType: `ded_rooms.command.${parsed.verb}`,
    message,
    visibility: "private",
    metadata: { input: parsed.raw },
  });
  return { lines, event, state: await getGreenRoomState(user) };
}

function validateContentReferences(kind: string, data: Record<string, unknown>) {
  const errors: string[] = [];
  const roomId = typeof data.roomId === "string" ? data.roomId : typeof data.locationId === "string" ? data.locationId : "";
  if (roomId && !GREEN_ROOM_ROOM_BY_ID.has(roomId)) errors.push(`Unknown roomId: ${roomId}`);
  const npcKey = typeof data.npcKey === "string" ? data.npcKey : "";
  if (npcKey && !GREEN_ROOM_NPC_BY_KEY.has(npcKey)) errors.push(`Unknown npcKey: ${npcKey}`);
  const resourceKey = typeof data.resourceKey === "string" ? data.resourceKey : "";
  if (resourceKey && !GREEN_ROOM_RESOURCE_BY_KEY.has(resourceKey)) errors.push(`Unknown resourceKey: ${resourceKey}`);
  const itemKey = typeof data.itemKey === "string" ? normalizeGreenRoomItemKey(data.itemKey) : "";
  if (itemKey && !GREEN_ROOM_ITEM_BY_KEY.has(itemKey)) errors.push(`Unknown itemKey: ${itemKey}`);
  if (kind === "room") {
    const exits = asRecord(data.exits);
    for (const [direction, target] of Object.entries(exits)) {
      if (typeof target === "string" && !GREEN_ROOM_ROOM_BY_ID.has(target)) errors.push(`Exit ${direction} points to unknown room: ${target}`);
    }
  }
  return errors;
}

export async function listGreenRoomAdminContent(user: GreenRoomAuthUser) {
  if (!adminForUser(user)) throw new Error("Admin access required");
  const [campaign] = await db.select().from(greenRoomCampaigns).where(eq(greenRoomCampaigns.slug, GREEN_ROOM_CAMPAIGN_SLUG)).limit(1);
  const mapState = await ensureDedRoomsMap();
  const records = await db.select().from(greenRoomContentRecords).orderBy(desc(greenRoomContentRecords.updatedAt)).limit(200);
  return {
    campaign,
    records,
    seed: {
      summary: greenRoomSeedSummary(),
      puzzleHooks: GREEN_ROOM_PUZZLE_HOOKS,
      minigames: GREEN_ROOM_MINIGAMES,
      map: dedRoomsMapPayload(mapState, Object.keys(mapState.placedRooms)[0] || ""),
    },
  };
}

export async function saveGreenRoomAdminContent(
  user: GreenRoomAuthUser,
  input: { kind: string; key: string; title: string; body?: string; dataJson?: unknown; status?: string },
) {
  if (!adminForUser(user)) throw new Error("Admin access required");
  const kind = String(input.kind || "").trim();
  const key = String(input.key || "").trim();
  const title = String(input.title || "").trim();
  const status = String(input.status || "published").trim() || "published";
  if (!ADMIN_CONTENT_KINDS.has(kind)) throw new Error("Unsupported DedRooms content kind");
  if (!/^[a-z0-9_.:-]{2,140}$/i.test(key)) throw new Error("Content key must be 2-140 URL-safe characters");
  if (!title) throw new Error("Title is required");
  const dataJson = asRecord(input.dataJson);
  const referenceErrors = validateContentReferences(kind, dataJson);
  if (referenceErrors.length > 0) throw new Error(referenceErrors.join("; "));

  const [record] = await db
    .insert(greenRoomContentRecords)
    .values({
      kind,
      key,
      title,
      body: String(input.body || ""),
      dataJson,
      status,
      createdBy: user.id,
      updatedBy: user.id,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: greenRoomContentRecords.key,
      set: {
        kind,
        title,
        body: String(input.body || ""),
        dataJson,
        status,
        updatedBy: user.id,
        version: sql`${greenRoomContentRecords.version} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning();

  await db.insert(greenRoomAdminAudits).values({
    actorUserId: user.id,
    action: "ded_rooms.content.upsert",
    targetKind: kind,
    targetKey: key,
    metadataJson: { status },
  });
  return { record };
}

export async function updateGreenRoomCampaignAdmin(
  user: GreenRoomAuthUser,
  input: { mode?: string; targetDepartures?: number; sharedUnlockProgress?: unknown },
) {
  if (!adminForUser(user)) throw new Error("Admin access required");
  const campaign = await ensureCampaign();
  const mode = input.mode ? String(input.mode) : campaign.mode;
  if (!["active", "myth", "paused"].includes(mode)) throw new Error("Unsupported campaign mode");
  const targetDepartures = Number.isInteger(input.targetDepartures)
    ? Math.max(1, Math.min(10000, Number(input.targetDepartures)))
    : campaign.targetDepartures;
  const progress = input.sharedUnlockProgress ? asRecord(input.sharedUnlockProgress) : asRecord(campaign.sharedUnlockProgress);
  const [updated] = await db
    .update(greenRoomCampaigns)
    .set({
      mode,
      targetDepartures,
      sharedUnlockProgress: progress,
      mythModeAt: mode === "myth" ? (campaign.mythModeAt || new Date()) : campaign.mythModeAt,
      updatedAt: new Date(),
    })
    .where(eq(greenRoomCampaigns.id, campaign.id))
    .returning();
  await db.insert(greenRoomAdminAudits).values({
    actorUserId: user.id,
    action: "ded_rooms.campaign.update",
    targetKind: "campaign",
    targetKey: campaign.slug,
    metadataJson: { mode, targetDepartures },
  });
  return { campaign: updated };
}
