import assert from "node:assert/strict";
import test from "node:test";
import {
  combineThreeUpgrade,
  inspectGreenRoomDetail,
  inventoryWeight,
  parseGreenRoomCommand,
} from "./engine";
import {
  GREEN_ROOM_MINIGAMES,
  GREEN_ROOM_NPCS,
  GREEN_ROOM_PUZZLE_HOOKS,
  GREEN_ROOM_RESOURCES,
  DEDROOMS_ANCHOR_ROOM_IDS,
  DEDROOMS_GREEN_ROOM_ID,
  findGreenRoomRoom,
  greenRoomSeedSummary,
} from "./world";
import {
  createInitialDedRoomsMap,
  dedRoomsDoorsForRoom,
  dedRoomsUnusedRoomIds,
  placeDedRoomsGreenRoom,
  resolveDedRoomsDoor,
  spawnDedRoomsPlayerRoom,
  swapDedRoomsRooms,
  transformDedRoomsRoom,
  voidDedRoomsRoom,
} from "./dedrooms-map";

function assertMinigameKey(input: string, key: string) {
  const parsed = parseGreenRoomCommand(input);
  assert.equal(parsed.verb, "minigame");
  if (parsed.verb === "minigame") assert.equal(parsed.key, key);
}

test("Green Room parser normalizes core MUD commands", () => {
  assert.deepEqual(parseGreenRoomCommand("n"), {
    verb: "go",
    args: ["n"],
    direction: "north",
    raw: "n",
  });
  assert.equal(parseGreenRoomCommand("look shoe").verb, "look");
  assert.equal(parseGreenRoomCommand("inspect yellow paint").verb, "inspect");
  assert.equal(parseGreenRoomCommand("combine glass fruit").verb, "combine");
  assert.equal(parseGreenRoomCommand("mark @lily sus-af").verb, "mark");
  assert.equal(parseGreenRoomCommand("sheet").verb, "sheet");
  assert.equal(parseGreenRoomCommand("roll lore").verb, "roll");
  assert.equal(parseGreenRoomCommand("map").verb, "map");
  assert.equal(parseGreenRoomCommand("doors").verb, "doors");
  assert.equal(parseGreenRoomCommand("listen").verb, "listen");
  assert.equal(parseGreenRoomCommand("overhear").verb, "listen");
  assert.equal(parseGreenRoomCommand("campaign").verb, "campaign");
  assert.deepEqual(parseGreenRoomCommand("go ceiling door"), {
    verb: "go",
    args: ["go", "ceiling", "door"],
    direction: "ceiling door",
    raw: "go ceiling door",
  });
  assert.equal(parseGreenRoomCommand("press refund").verb, "minigame");
  assertMinigameKey("listen moss", "moss_whisper");
  assertMinigameKey("count ants", "ant_count");
  assertMinigameKey("pet cat", "cat_petition");
  assertMinigameKey("decode splendor", "splendor_decode");
  assertMinigameKey("bank bread", "bakery_banking");
  assertMinigameKey("pin art", "bread_art_pin");
  assertMinigameKey("dust case", "case_dust");
  assertMinigameKey("vote quorum", "quorum_vote");
  assertMinigameKey("bridge rumor", "rollup_bridge");
  assertMinigameKey("check wallet", "wallet_warning_check");
});

test("DedRooms initializes five anchor rooms before the first player spawn", () => {
  const map = createInitialDedRoomsMap("test-seed", "2026-06-19T00:00:00.000Z");
  assert.equal(Object.keys(map.anchors).length, 5);
  assert.equal(Object.keys(map.placedRooms).length, 5);
  for (const anchor of Object.values(map.anchors)) {
    assert.ok(DEDROOMS_ANCHOR_ROOM_IDS.has(anchor.roomId), `${anchor.roomId} should be an anchor`);
    assert.equal(map.placedRooms[anchor.roomId]?.placedBy, "anchor");
  }
  assert.equal(map.greenRoomPlaced, false);
  assert.equal(map.placedRooms[DEDROOMS_GREEN_ROOM_ID], undefined);
});

test("DedRooms first player spawns in a new non-anchor authored room", () => {
  const map = createInitialDedRoomsMap("spawn-seed", "2026-06-19T00:00:00.000Z");
  const spawn = spawnDedRoomsPlayerRoom(map, 42, 0, "2026-06-19T00:01:00.000Z");
  assert.equal(spawn.firstPlayer, true);
  assert.equal(spawn.placed, true);
  assert.equal(DEDROOMS_ANCHOR_ROOM_IDS.has(spawn.roomId), false);
  assert.notEqual(spawn.roomId, DEDROOMS_GREEN_ROOM_ID);
  assert.equal(spawn.state.placedRooms[spawn.roomId]?.placedBy, "spawn");
});

test("DedRooms later players can land in existing rooms or reveal unused rooms", () => {
  const initial = createInitialDedRoomsMap("later-spawn-seed", "2026-06-19T00:00:00.000Z");
  const first = spawnDedRoomsPlayerRoom(initial, 1, 0, "2026-06-19T00:01:00.000Z");
  const second = spawnDedRoomsPlayerRoom(first.state, 2, 1, "2026-06-19T00:02:00.000Z");
  assert.equal(second.firstPlayer, false);
  assert.ok(second.state.placedRooms[second.roomId], "later spawn should resolve to a placed room");
  assert.equal(DEDROOMS_ANCHOR_ROOM_IDS.has(second.roomId), false);
  assert.notEqual(second.roomId, DEDROOMS_GREEN_ROOM_ID);
});

test("DedRooms later spawns avoid anchor rooms such as THNG", () => {
  let map = spawnDedRoomsPlayerRoom(
    createInitialDedRoomsMap("anchor-avoidance-seed", "2026-06-19T00:00:00.000Z"),
    1,
    0,
    "2026-06-19T00:01:00.000Z",
  ).state;

  for (let userId = 2; userId < 30; userId += 1) {
    const spawn = spawnDedRoomsPlayerRoom(map, userId, userId - 1, `2026-06-19T00:${String(userId).padStart(2, "0")}:00.000Z`);
    assert.equal(DEDROOMS_ANCHOR_ROOM_IDS.has(spawn.roomId), false, `${spawn.roomId} should not be a spawn target`);
    assert.notEqual(spawn.roomId, DEDROOMS_GREEN_ROOM_ID);
    map = spawn.state;
  }
});

test("DedRooms doors respect authored exits instead of inventing every cardinal direction", () => {
  const room = findGreenRoomRoom("antworks_3");
  const doors = dedRoomsDoorsForRoom(room);
  const keys = doors.map((door) => door.key);
  assert.ok(keys.includes("east"));
  assert.ok(keys.includes("west"));
  assert.equal(keys.includes("north"), false);
  assert.equal(keys.includes("south"), false);
});

test("DedRooms unresolved door places a unique authored room and links back", () => {
  const initial = createInitialDedRoomsMap("door-seed", "2026-06-19T00:00:00.000Z");
  const spawn = spawnDedRoomsPlayerRoom(initial, 7, 0, "2026-06-19T00:01:00.000Z");
  const door = dedRoomsDoorsForRoom(findGreenRoomRoom(spawn.roomId), spawn.state)[0];
  assert.ok(door, "spawn room should have at least one authored door");
  const resolved = resolveDedRoomsDoor(spawn.state, spawn.roomId, door.key, { userId: 7, at: "2026-06-19T00:02:00.000Z" });
  assert.equal(resolved.placed, true);
  assert.notEqual(resolved.nextRoomId, spawn.roomId);
  assert.notEqual(resolved.nextRoomId, DEDROOMS_GREEN_ROOM_ID);
  assert.equal(resolved.state.links[`${spawn.roomId}:${door.key}`]?.toRoomId, resolved.nextRoomId);
});

test("DedRooms rejects unavailable passages", () => {
  let selected: ReturnType<typeof spawnDedRoomsPlayerRoom> | null = null;
  let unavailable = "";
  for (let index = 0; index < 40 && !selected; index += 1) {
    const spawn = spawnDedRoomsPlayerRoom(
      createInitialDedRoomsMap(`missing-door-seed-${index}`, "2026-06-19T00:00:00.000Z"),
      100 + index,
      0,
      "2026-06-19T00:01:00.000Z",
    );
    const keys = new Set(dedRoomsDoorsForRoom(findGreenRoomRoom(spawn.roomId), spawn.state).map((door) => door.key));
    unavailable = ["north", "south", "east", "west"].find((direction) => !keys.has(direction)) || "";
    if (unavailable) selected = spawn;
  }
  assert.ok(selected, "expected a room with a missing cardinal passage");
  assert.throws(() => resolveDedRoomsDoor(selected!.state, selected!.roomId, unavailable, { userId: 999 }));
});

test("DedRooms deck exhaustion loops unresolved doors to existing rooms", () => {
  const initial = createInitialDedRoomsMap("exhaustion-seed", "2026-06-19T00:00:00.000Z");
  const spawn = spawnDedRoomsPlayerRoom(initial, 12, 0, "2026-06-19T00:01:00.000Z");
  const door = dedRoomsDoorsForRoom(findGreenRoomRoom(spawn.roomId), spawn.state)[0];
  assert.ok(door, "spawn room should have at least one authored door");
  const exhausted = {
    ...spawn.state,
    usedRoomIds: [...new Set([...spawn.state.usedRoomIds, ...dedRoomsUnusedRoomIds(spawn.state, { includeGreenRoom: false })])],
  };
  const resolved = resolveDedRoomsDoor(exhausted, spawn.roomId, door.key, { userId: 12, at: "2026-06-19T00:02:00.000Z" });
  assert.equal(resolved.placed, false);
  assert.equal(resolved.looped, true);
  assert.ok(exhausted.placedRooms[resolved.nextRoomId], "loop target should be an existing placed room");
});

test("DedRooms Green Room only appears after an explicit trigger", () => {
  const initial = createInitialDedRoomsMap("green-delay-seed", "2026-06-19T00:00:00.000Z");
  assert.equal(initial.greenRoomPlaced, false);
  assert.equal(initial.placedRooms[DEDROOMS_GREEN_ROOM_ID], undefined);
  const placed = placeDedRoomsGreenRoom(initial, "test-trigger", "2026-06-19T00:03:00.000Z");
  assert.equal(placed.placed, true);
  assert.equal(placed.state.greenRoomPlaced, true);
  assert.ok(placed.state.placedRooms[DEDROOMS_GREEN_ROOM_ID]);
});

test("DedRooms room swap, void, and transform events mutate map state without duplicating rooms", () => {
  const initial = createInitialDedRoomsMap("movement-seed", "2026-06-19T00:00:00.000Z");
  const first = spawnDedRoomsPlayerRoom(initial, 21, 0, "2026-06-19T00:01:00.000Z");
  const door = dedRoomsDoorsForRoom(findGreenRoomRoom(first.roomId), first.state)[0];
  assert.ok(door, "spawn room should have at least one authored door");
  const second = resolveDedRoomsDoor(first.state, first.roomId, door.key, { userId: 21, at: "2026-06-19T00:02:00.000Z" });
  const beforeA = first.state.placedRooms[first.roomId]?.coordinate;
  const beforeB = second.state.placedRooms[second.nextRoomId]?.coordinate;
  const swapped = swapDedRoomsRooms(second.state, first.roomId, second.nextRoomId, "2026-06-19T00:03:00.000Z");
  assert.deepEqual(swapped.placedRooms[first.roomId]?.coordinate, beforeB);
  assert.deepEqual(swapped.placedRooms[second.nextRoomId]?.coordinate, beforeA);

  const transformed = transformDedRoomsRoom(swapped, first.roomId, "coin_pond", "2026-06-19T00:04:00.000Z");
  assert.equal(transformed.placedRooms[first.roomId]?.templateId, "coin_pond");

  const voided = voidDedRoomsRoom(transformed, second.nextRoomId, "2026-06-19T00:05:00.000Z");
  assert.equal(voided.placedRooms[second.nextRoomId]?.status, "void");
});

test("Green Room combine-3 upgrades one tier at a time", () => {
  const result = combineThreeUpgrade([
    { itemKey: "coin", label: "coin", tier: 1, quantity: 3, weight: 1 },
  ], "coin");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fromTier, 1);
    assert.equal(result.toTier, 2);
    assert.equal(result.consumed, 3);
    assert.equal(result.created, 1);
  }

  const missing = combineThreeUpgrade([
    { itemKey: "coin", label: "coin", tier: 1, quantity: 2, weight: 1 },
  ], "coin");
  assert.equal(missing.ok, false);
});

test("Green Room inventory weight respects stack quantities", () => {
  assert.equal(inventoryWeight([
    { itemKey: "coin", label: "coin", tier: 1, quantity: 3, weight: 1 },
    { itemKey: "glass_fruit", label: "glass fruit", tier: 1, quantity: 2, weight: 2 },
  ]), 7);
});

test("Lily shoe inspection chain exposes shoe, taxi tracks, and yellow paint", () => {
  const room = findGreenRoomRoom("arboretum_sunset_path");
  const shoe = inspectGreenRoomDetail(room, "shoe");
  assert.equal(shoe.found, true);
  assert.match(shoe.text, /Lily/);
  assert.deepEqual(shoe.reveals, ["tracks"]);

  const tracks = inspectGreenRoomDetail(room, "tire tracks");
  assert.equal(tracks.found, true);
  assert.match(tracks.text, /taxi/i);
  assert.match(tracks.text, /offroad/i);
  assert.deepEqual(tracks.reveals, ["paint"]);

  const paint = inspectGreenRoomDetail(room, "yellow paint");
  assert.equal(paint.found, true);
  assert.match(paint.text, /yellow paint scrapings/i);
});

test("description nouns can be inspected even before they become special mechanics", () => {
  const room = findGreenRoomRoom("coin_pond");
  const detail = inspectGreenRoomDetail(room, "mall corridor");
  assert.equal(detail.found, true);
  assert.match(detail.text, /definitely here/i);
});

test("Green Room seed has enough world depth for the expanded chapter", () => {
  const summary = greenRoomSeedSummary();
  assert.ok(summary.roomCount >= 108);
  assert.ok(summary.npcCount >= 38);
  assert.ok(summary.puzzleHookCount >= 95);
  assert.ok(summary.minigameCount >= 39);
  assert.ok(summary.resourceFamilyCount >= 30);
});

test("weirdness expansion seeds ants, aubergines, uranium, sheep, cults, cats, the Yellow Knight, and splendor", () => {
  const themeRooms = [
    ["antworks_3", "ants", /ant/i],
    ["aubergine_2", "aubergines", /aubergine|eggplant|purple/i],
    ["uranium_4", "uranium", /uranium|warning/i],
    ["flock_3", "sheep", /sheep|constellation/i],
    ["flock_5", "cult", /cult|blanket/i],
    ["cats_2", "cats", /cat/i],
    ["cats_5", "knight", /Yellow Knight|taxi-yellow/i],
    ["cats_6", "splendor", /splendor|command prompt/i],
  ] as const;

  for (const [roomId, target, expected] of themeRooms) {
    const detail = inspectGreenRoomDetail(findGreenRoomRoom(roomId), target);
    assert.equal(detail.found, true, `${roomId} should expose ${target}`);
    assert.match(detail.text, expected);
  }

  for (const key of [
    "queen_of_small_requirements",
    "aubergine_abbess",
    "radiant_launderer",
    "shepherd_of_last_weather",
    "candle_cultist",
    "cat_who_remembers",
    "yellow_knight",
    "splendor_that_blinks",
  ]) {
    assert.ok(GREEN_ROOM_NPCS.some((npc) => npc.key === key), `missing NPC ${key}`);
  }

  for (const key of ["ant_sugar_grain", "aubergine_seed", "uranium_glass", "wool_star", "candle_stub", "cat_whisker", "yellow_thread", "void_salt"]) {
    assert.ok(GREEN_ROOM_RESOURCES.some((resource) => resource.key === key), `missing resource ${key}`);
  }

  for (const key of ["ant_count", "aubergine_polish", "glow_wash", "sheep_count", "cat_petition", "knight_salute", "splendor_decode"]) {
    assert.ok(GREEN_ROOM_MINIGAMES.some((minigame) => minigame.key === key), `missing minigame ${key}`);
  }
});

test("Tezos bread-art display-case mirror expansion seeds blockchain lore without real-secret prompts", () => {
  const themeRooms = [
    ["bakery_2", "rewards", /crumb points|banker|custodial pastry/i],
    ["bakery_5", "bins", /Tezos drama|same fight/i],
    ["minting_2", "seed", /bread-art|crust rarity/i],
    ["minting_5", "placard", /case placard|crumb provenance/i],
    ["market_2", "market", /display case|pinned bread art|crust placement/i],
    ["market_5", "kiosk", /bread-art cases|stubborn love/i],
    ["dao_2", "quorum", /quorum|amendment/i],
    ["dao_4", "contract", /audited|contract/i],
    ["rollup_2", "indexer", /bread-art sale|crumb cache/i],
    ["rollup_4", "bridge", /speed|finality|Chain Debate/i],
    ["rollup_6", "case", /real secret words|games/i],
  ] as const;

  for (const [roomId, target, expected] of themeRooms) {
    const detail = inspectGreenRoomDetail(findGreenRoomRoom(roomId), target);
    assert.equal(detail.found, true, `${roomId} should expose ${target}`);
    assert.match(detail.text, expected);
  }

  for (const key of [
    "overbaked_baker",
    "walletless_delegator",
    "proposal_threadcaster",
    "infinite_edition_minter",
    "metadata_moth",
    "curator_without_floor",
    "ghost_of_here_and_now",
    "royalty_splitter",
    "dao_choir_director",
    "michelson_monk",
    "indexer_oracle",
    "bridge_ferryman",
    "wallet_fox",
  ]) {
    assert.ok(GREEN_ROOM_NPCS.some((npc) => npc.key === key), `missing NPC ${key}`);
  }

  for (const key of [
    "tez_crumb",
    "baker_salt",
    "delegation_receipt",
    "bakery_reward_stamp",
    "bread_art_sketch",
    "case_placard",
    "pinned_bread_art",
    "case_dust",
    "curator_tag",
    "crumb_resale_ribbon",
    "old_kiosk_ghost",
    "proposal_ash",
    "lambda_thread",
    "indexer_receipt",
    "bridged_echo",
    "wallet_warning",
  ]) {
    assert.ok(GREEN_ROOM_RESOURCES.some((resource) => resource.key === key), `missing resource ${key}`);
  }

  for (const key of [
    "block_bake",
    "delegation_loaf",
    "bakery_banking",
    "bread_art_pin",
    "case_polish",
    "bread_pin",
    "case_dust",
    "bread_listing",
    "kiosk_haunt",
    "crumb_split",
    "quorum_vote",
    "michelson_verify",
    "indexer_chase",
    "rollup_bridge",
    "wallet_warning_check",
  ]) {
    assert.ok(GREEN_ROOM_MINIGAMES.some((minigame) => minigame.key === key), `missing minigame ${key}`);
  }

  const hookRooms = new Map(GREEN_ROOM_PUZZLE_HOOKS.map((hook) => [hook.key, hook.roomId]));
  assert.equal(hookRooms.get("bakery_banker_rewards_branch"), "bakery_2");
  assert.equal(hookRooms.get("generative_bread_pin"), "minting_2");
  assert.equal(hookRooms.get("old_kiosk_ghost"), "market_5");
  assert.equal(hookRooms.get("michelson_stack_riddle"), "dao_4");
  assert.equal(hookRooms.get("rollup_bridge_rumor"), "rollup_4");
  assert.equal(hookRooms.get("wallet_fox_warning"), "rollup_6");
});
