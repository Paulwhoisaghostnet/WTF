import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSource = readFileSync("drizzle/0111_wtf_live_game_rooms.sql", "utf8");
const repairMigrationSource = readFileSync("drizzle/0112_wtf_live_game_room_settings_repair.sql", "utf8");
const schemaSource = readFileSync("shared/schema-wtf-live.ts", "utf8");
const registrySource = readFileSync("server/features/wtf-live/registry.ts", "utf8");
const smartRoomsSource = readFileSync("server/features/wtf-live/smart-rooms.ts", "utf8");
const routesSource = readFileSync("server/routes/wtf-live.ts", "utf8");
const websocketSource = readFileSync("server/websocket.ts", "utf8");

test("WTF LIVE game rooms are durable room records with scoped settings", () => {
  assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS room_kind/);
  assert.match(migrationSource, /IN \('room', 'game'\)/);
  assert.match(migrationSource, /IN \('room', 'game', 'stage'\)/);
  assert.match(schemaSource, /roomKind: varchar\("room_kind"/);
  assert.match(schemaSource, /wtf_live_rooms_kind_idx/);
  assert.match(schemaSource, /wtf_live_rooms_kind_check[\s\S]*?'room', 'game'/);
  assert.match(schemaSource, /wtf_live_room_settings_kind_check[\s\S]*?'room', 'game', 'stage'/);
  assert.match(schemaSource, /wtf_live_room_invites_kind_check[\s\S]*?'room', 'game', 'stage'/);
  assert.match(schemaSource, /wtf_live_room_calendar_events_kind_check[\s\S]*?'room', 'game', 'stage'/);
  assert.match(repairMigrationSource, /DROP CONSTRAINT IF EXISTS wtf_live_room_settings_room_kind_check/);
  assert.match(repairMigrationSource, /DROP CONSTRAINT IF EXISTS wtf_live_room_invites_room_kind_check/);
  assert.match(repairMigrationSource, /DROP CONSTRAINT IF EXISTS wtf_live_room_calendar_events_room_kind_check/);
  assert.match(repairMigrationSource, /ADD CONSTRAINT wtf_live_room_settings_kind_check[\s\S]*?'room', 'game', 'stage'/);
  assert.match(repairMigrationSource, /INSERT INTO wtf_live_room_settings[\s\S]*FROM wtf_live_rooms[\s\S]*room_kind = 'game'/);
  assert.match(repairMigrationSource, /ON CONFLICT \(room_kind, room_id\) DO UPDATE SET/);
});

test("WTF LIVE registry and permissions preserve game room kind", () => {
  assert.match(registrySource, /export type WtfLiveRoomType = "room" \| "game"/);
  assert.match(registrySource, /kind: row\.roomKind === "game" \? "game" : "room"/);
  assert.match(registrySource, /roomKind\?: WtfLiveRoomType/);
  assert.match(registrySource, /const roomKind = input\.roomKind === "game" \? "game" : "room"/);
  assert.match(registrySource, /roomKind: wtfLiveRooms\.roomKind/);
  assert.match(smartRoomsSource, /export type WtfLiveRoomKind = "room" \| "game" \| "stage"/);
  assert.match(smartRoomsSource, /return value === "game" \? "game" : "room"/);
  assert.match(smartRoomsSource, /eq\(wtfLiveRooms\.roomKind, roomKind === "game" \? "game" : "room"\)/);
});

test("WTF LIVE routes and sockets use game room settings buckets", () => {
  const createRoomRouteSource = routesSource.slice(
    routesSource.indexOf('router.post("/api/wtf-live/rooms"'),
    routesSource.indexOf('router.get("/api/wtf-live/rooms/:roomId/access"'),
  );
  assert.match(routesSource, /roomKind: z\.enum\(\["room", "game"\]\)\.optional\(\)\.default\("room"\)/);
  assert.match(routesSource, /const roomKindSchema = z\.enum\(\["room", "game", "stage"\]\)\.default\("room"\)/);
  assert.match(routesSource, /return value === "game" \? "game" : "room"/);
  assert.match(routesSource, /roomKind: room\.kind/);
  assert.match(routesSource, /roomKind: parsed\.data\.roomKind/);
  assert.match(routesSource, /room\.kind === "game"[\s\S]*?allowGuestCamera: true[\s\S]*?allowGuestScreen: false/);
  assert.match(routesSource, /console\.error\("\[wtf-live\] failed to initialize game room settings:"/);
  assert.match(routesSource, /console\.error\("\[wtf-live\] create room failed:"/);
  assert.match(routesSource, /res\.status\(500\)\.json\(\{ error: "Could not create room\. Please try again\." \}\)/);
  assert.doesNotMatch(createRoomRouteSource, /res\.status\(500\)\.json\(\{ error: \(err as Error\)\.message/);
  assert.doesNotMatch(routesSource, /rooms\.filter\(\(room\) => room\.kind === "room"\)/);
  assert.match(websocketSource, /room\.kind === "game" \? "game" : "room"/);
  assert.match(websocketSource, /client\.wtfLiveRoomKind = stageAccess \? "stage" : room\?\.kind === "game" \? "game" : "room"/);
});
