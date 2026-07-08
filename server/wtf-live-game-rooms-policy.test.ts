import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSource = readFileSync("drizzle/0111_wtf_live_game_rooms.sql", "utf8");
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
  assert.match(routesSource, /roomKind: z\.enum\(\["room", "game"\]\)\.optional\(\)\.default\("room"\)/);
  assert.match(routesSource, /const roomKindSchema = z\.enum\(\["room", "game", "stage"\]\)\.default\("room"\)/);
  assert.match(routesSource, /return value === "game" \? "game" : "room"/);
  assert.match(routesSource, /roomKind: room\.kind/);
  assert.match(routesSource, /roomKind: parsed\.data\.roomKind/);
  assert.match(routesSource, /room\.kind === "game"[\s\S]*?allowGuestCamera: true[\s\S]*?allowGuestScreen: false/);
  assert.doesNotMatch(routesSource, /rooms\.filter\(\(room\) => room\.kind === "room"\)/);
  assert.match(websocketSource, /room\.kind === "game" \? "game" : "room"/);
  assert.match(websocketSource, /client\.wtfLiveRoomKind = stageAccess \? "stage" : room\?\.kind === "game" \? "game" : "room"/);
});
