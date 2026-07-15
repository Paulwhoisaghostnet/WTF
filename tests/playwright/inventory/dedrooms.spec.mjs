import { test, expect } from "@playwright/test";

function baseState(overrides = {}) {
  return {
    status: "exploring",
    departed: false,
    campaign: {
      mode: "active",
      targetDepartures: 50,
      departureCount: 7,
      progress: {
        required: ["ghost-ledger", "pond-ritual", "static-map"],
        completed: ["ghost-ledger", "pond-ritual", "static-map"],
        sharedUnlocked: true,
      },
    },
    player: {
      locationId: "arboretum_sunset_path",
      placedRoomId: "arboretum_sunset_path",
      coordinate: { x: 1, y: -2, z: 0 },
      coordinateKey: "1,-2,0",
      status: "exploring",
      weightLimit: 24,
      inventoryWeight: 3,
      commands: ["look t1", "inspect t1", "go t1", "doors t1", "map t1", "sheet t1", "roll t1", "listen t1", "combine t1", "talk t1", "enter t1"],
      attuned: true,
      sheet: {
        name: "Contestant",
        level: 2,
        attributes: { attention: 12, nerve: 10, charm: 9, weird: 13, crumbcraft: 11 },
        skills: { attention: 1, barter: 1, combine: 1, navigation: 1, lore: 1 },
      },
    },
    room: {
      id: "arboretum_sunset_path",
      title: "Sunset Path With One Shoe",
      region: "Indoor Sunset Forest",
      description:
        "The room is somehow a forest. Actual trees line a narrow path, and far above the canopy a ceiling looks like sunset sky. A single shoe waits beside the path.",
      exits: { west: "arboretum_2", east: "arboretum_4" },
      doors: [
        { key: "west", label: "west wall door", kind: "wall", resolvedToRoomId: null },
        { key: "east", label: "east wall door", kind: "wall", resolvedToRoomId: null },
        { key: "path", label: "forest path", kind: "path", resolvedToRoomId: null },
        { key: "tire tracks", label: "taxi tire tracks", kind: "path", resolvedToRoomId: null },
      ],
      tags: ["forest", "lily-lore"],
    },
    doors: [
      { key: "west", label: "west wall door", kind: "wall", resolvedToRoomId: null },
      { key: "east", label: "east wall door", kind: "wall", resolvedToRoomId: null },
      { key: "path", label: "forest path", kind: "path", resolvedToRoomId: null },
      { key: "tire tracks", label: "taxi tire tracks", kind: "path", resolvedToRoomId: null },
    ],
    map: {
      placedCount: 6,
      deckRemaining: 101,
      currentCoordinate: { x: 1, y: -2, z: 0 },
      currentCoordinateKey: "1,-2,0",
      currentPlacedRoomId: "arboretum_sunset_path",
      greenRoomPlaced: false,
      anchors: [
        { key: "thng", roomId: "market_2", title: "THNG", discovered: false, coordinate: null },
        { key: "herb_ivory_tower", roomId: "backstage_4", title: "Herb's Ivory Tower on High Horse Hill", discovered: false, coordinate: null },
        { key: "governance_chambers", roomId: "dao_2", title: "The Governance Chambers", discovered: false, coordinate: null },
        { key: "trilla_tek_wishworks", roomId: "cats_6", title: "The Trilla-tek Wishworks", discovered: false, coordinate: null },
        { key: "tyranny_force_bakery", roomId: "bakery_2", title: "The Tyranny Force Listening Bakery", discovered: false, coordinate: null },
      ],
    },
    npcs: [{ key: "art_ghost", name: "The Art Ghost", mood: "wistful", wants: ["found_art"] }],
    resources: [{ key: "quiet_moss", label: "quiet moss", family: "forest", farmYield: 1 }],
    minigames: [{ key: "paint_match", title: "Yellow Paint Match", command: "match paint", rewardKey: "yellow_paint_flake" }],
    inventory: [{ itemKey: "coin", label: "coin", tier: 1, quantity: 3, weight: 1 }],
    nearby: [],
    transcript: [
      {
        id: 1,
        eventType: "ded_rooms.player.started",
        message: "You wake into Sunset Path With One Shoe.",
        visibility: "private",
        locationId: "arboretum_sunset_path",
        createdAt: "2026-06-18T12:00:00Z",
      },
    ],
    seedSummary: {
      roomCount: 108,
      npcCount: 38,
      puzzleHookCount: 100,
      minigameCount: 40,
      resourceFamilyCount: 31,
    },
    isAdmin: false,
    ...overrides,
  };
}

async function mockAuth(page) {
  await page.route("**/api/auth/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 777,
        username: "contestant",
        displayName: "Contestant",
        role: "contestant",
        roles: ["contestant"],
        welcomedToWtfOs: true,
        gmWelcome: null,
        createdAt: "2026-01-01T00:00:00Z",
        effectivePermissions: {},
      }),
    });
  });
  await page.route("**/api/apps/desktop", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        apps: { dedrooms: true },
        list: [{ key: "dedrooms", enabled: true, installable: true }],
      }),
    });
  });
}

async function mockDedRooms(page, options = {}) {
  let state = baseState(options.initialState || {});
  let eventId = 10;
  await page.addInitScript(() => {
    class FakeDedRoomsWebSocket extends EventTarget {
      constructor(url) {
        super();
        this.url = url;
        this.readyState = 0;
        setTimeout(() => {
          this.readyState = 1;
          this.dispatchEvent(new Event("open"));
        }, 0);
      }
      send(payload) {
        const msg = JSON.parse(String(payload || "{}"));
        if (msg.type === "ded_rooms_join") {
          setTimeout(() => {
            this.dispatchEvent(new MessageEvent("message", {
              data: JSON.stringify({
                type: "ded_rooms_presence_snapshot",
                locationId: msg.locationId,
                peers: [{ userId: 778, username: "other-contestant", role: "contestant" }],
              }),
            }));
          }, 0);
        }
      }
      close() {
        this.readyState = 3;
        this.dispatchEvent(new CloseEvent("close"));
      }
    }
    window.WebSocket = FakeDedRoomsWebSocket;
  });

  await page.route("**/api/dedrooms/state", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state) });
  });

  await page.route("**/api/dedrooms/command", async (route) => {
    const body = route.request().postDataJSON();
    const input = String(body?.input || "").toLowerCase();
    let lines = ["The command echoes without consequence."];
    if (input === "look shoe") {
      lines = ["It is a small shoe. The name Lily is written inside in careful marker."];
    } else if (input === "look tracks") {
      lines = ["From a taxi, it would seem. Then the tracks suddenly take to offroading."];
    } else if (input === "inspect paint") {
      lines = ["Yellow paint scrapings cling to the trees along the tire tracks."];
    } else if (input === "combine coin") {
      lines = ["Three tier 1 coin collapse into one tier 2."];
      state = {
        ...state,
        inventory: [{ itemKey: "coin", label: "coin", tier: 2, quantity: 1, weight: 1 }],
        player: { ...state.player, inventoryWeight: 1 },
      };
    } else if (input === "sheet") {
      lines = ["Contestant, level 2.", "Skills: attention +1, barter +1, combine +1, navigation +1, lore +1."];
    } else if (input === "doors") {
      lines = ["west: west wall door -> unresolved", "east: east wall door -> unresolved", "path: forest path -> unresolved"];
    } else if (input === "map") {
      lines = [
        "Coordinate: 1,-2,0. Placed rooms: 6. Authored rooms unplaced: 101.",
        "Known anchors: THNG, Herb's Ivory Tower on High Horse Hill, The Governance Chambers, The Trilla-tek Wishworks, The Tyranny Force Listening Bakery.",
        "The Green Room is absent. It will not spawn until the intro campaign triggers it.",
      ];
    } else if (input === "listen") {
      lines = ['A collector squints: "I dunno, its kind of stale... got anything by this artist that\'s fresh?"'];
    } else if (input === "go north") {
      lines = ["You cannot find a passage called north. Try doors, then go <door name>."];
    } else if (input === "go east") {
      lines = ["You go through east wall door.", "Check-In Counter locks into the map at 2,-2,0."];
      state = {
        ...state,
        player: { ...state.player, locationId: "lobby_1", placedRoomId: "lobby_1", coordinate: { x: 2, y: -2, z: 0 }, coordinateKey: "2,-2,0" },
        room: { ...state.room, id: "lobby_1", title: "Check-In Counter", region: "Impossible Lobby", description: "You are in Check-In Counter.", doors: state.doors },
        map: { ...state.map, placedCount: 7, deckRemaining: 100, currentCoordinate: { x: 2, y: -2, z: 0 }, currentCoordinateKey: "2,-2,0", currentPlacedRoomId: "lobby_1" },
      };
    } else if (input === "enter green room" && state.campaign.mode === "active") {
      state = {
        status: "departed",
        departed: true,
        message: "You have departed from this world.",
        campaign: state.campaign,
        transcript: [{
          id: 999,
          eventType: "ded_rooms.player.departed",
          message: "You have departed from this world.",
          visibility: "private",
          locationId: state.player.locationId,
          createdAt: "2026-06-18T12:05:00Z",
        }],
      };
      lines = ["You have departed from this world."];
    } else if (input === "enter green room" && state.campaign.mode === "myth") {
      lines = ["The Green Room is in myth mode. The door still matters, but it no longer grants Season 3 status."];
    }

    if (!state.departed) {
      state = {
        ...state,
        transcript: [
          ...state.transcript,
          {
            id: eventId++,
            eventType: "ded_rooms.command",
            message: lines.join("\n"),
            visibility: "private",
            locationId: state.player.locationId,
            createdAt: `2026-06-18T12:${eventId}:00Z`,
          },
        ],
      };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ lines, state }),
    });
  });
}

async function runCommand(page, command) {
  await page.getByLabel("DedRooms command").fill(command);
  await page.getByTitle("Send command").click();
}

test.describe("DedRooms MUD", () => {
  test("renders the terminal MUD, runs commands, combines inventory, inspects Lily lore, and departs", async ({ page }) => {
    await mockAuth(page);
    await mockDedRooms(page);

    await page.goto("/dedrooms", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-dedrooms-shell]")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sunset Path With One Shoe" })).toBeVisible();
    await expect(page.getByText("quiet moss")).toBeVisible();
    await expect(page.getByText("@other-contestant")).toBeVisible();
    await expect(page.getByText("@ 1,-2,0")).toBeVisible();
    await expect(page.getByText("green room absent")).toBeVisible();
    await expect(page.getByText("6 placed")).toBeVisible();
    await expect(page.getByText("0/5 anchors known")).toBeVisible();

    await runCommand(page, "sheet");
    await expect(page.getByText("Contestant, level 2.")).toBeVisible();

    await runCommand(page, "doors");
    await expect(page.getByText("east wall door")).toBeVisible();

    await runCommand(page, "map");
    await expect(page.getByText("THNG")).toBeVisible();
    await expect(page.getByText("The Governance Chambers")).toBeVisible();
    await expect(page.getByText("The Green Room is absent")).toBeVisible();

    await runCommand(page, "listen");
    await expect(page.getByText("kind of stale")).toBeVisible();

    await runCommand(page, "go north");
    await expect(page.getByText("cannot find a passage called north")).toBeVisible();

    await runCommand(page, "go east");
    await expect(page.getByRole("heading", { name: "Check-In Counter" })).toBeVisible();

    await runCommand(page, "look shoe");
    await expect(page.getByText("The name Lily is written inside")).toBeVisible();

    await runCommand(page, "look tracks");
    await expect(page.getByText("From a taxi, it would seem")).toBeVisible();
    await expect(page.getByText("take to offroading")).toBeVisible();

    await runCommand(page, "inspect paint");
    await expect(page.getByText("Yellow paint scrapings")).toBeVisible();

    await runCommand(page, "combine coin");
    await expect(page.getByText("1x t2 coin")).toBeVisible();

    await runCommand(page, "enter green room");
    await expect(page.getByText("You have departed from this world.", { exact: true })).toBeVisible();
  });

  test("keeps the door in myth mode without departed status", async ({ page }) => {
    await mockAuth(page);
    await mockDedRooms(page, {
      initialState: {
        campaign: {
          mode: "myth",
          targetDepartures: 50,
          departureCount: 50,
          progress: { required: [], completed: [], sharedUnlocked: true },
        },
        player: {
          ...baseState().player,
          locationId: "green_room_threshold",
        },
        room: {
          id: "green_room_threshold",
          title: "Door That Is Too Green",
          region: "Wrong Backstage",
          description: "A green door stands at the end of a backstage corridor.",
          exits: { west: "backstage_5" },
          tags: ["green-room"],
        },
      },
    });

    await page.goto("/dedrooms", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Door That Is Too Green")).toBeVisible();
    await runCommand(page, "enter green room");
    await expect(page.getByText("myth mode")).toBeVisible();
    await expect(page.locator("[data-dedrooms-shell]")).toBeVisible();
  });
});
