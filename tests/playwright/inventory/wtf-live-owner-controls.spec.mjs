import { test, expect } from "@playwright/test";

async function setRole(request, data) {
  const payload = typeof data === "string" ? { userRole: data } : data;
  const res = await request.post("/__test/state", { data: payload });
  expect(res.ok()).toBeTruthy();
}

async function setAdmin(request) {
  await setRole(request, { userRole: "admin" });
}

async function setAnonymous(request) {
  await setRole(request, { userRole: "anonymous" });
}

function fatalErrors(errors) {
  return errors.filter((error) => !/(favicon|ResizeObserver|WebGL|wallet|beacon|taquito|status of 401 \(Unauthorized\))/i.test(error));
}

function tinyWavBuffer() {
  const sampleRate = 8000;
  const sampleCount = 400;
  const buffer = Buffer.alloc(44 + sampleCount * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + sampleCount * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(sampleCount * 2, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.round(Math.sin((index / sampleRate) * 440 * Math.PI * 2) * 1200);
    buffer.writeInt16LE(sample, 44 + index * 2);
  }
  return buffer;
}

async function mockAuthUser(context, user) {
  await context.route("**/api/auth/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role ?? "user",
        welcomedToWtfOs: true,
        welcomedToWtfOsAt: "2026-01-01T00:00:00Z",
        gmWelcomeUtcDay: "2026-06-09",
        gmWelcomeLastSeenAt: "2026-06-09T00:00:00Z",
        gmWelcome: null,
        createdAt: "2026-01-01T00:00:00Z",
        effectivePermissions: {},
      }),
    });
  });
}

async function mockAnonymousUser(context) {
  await context.route("**/api/auth/user", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Not authenticated" }),
    });
  });
}

async function mockApphost(context) {
  const appStatus = (appId) => ({
    appId,
    state: "launching",
    progress: {
      phase: "opening",
      label: "Opening game",
      detail: "Inventory smoke is using a mocked hosted Jackbox stream.",
      percent: 64,
    },
  });
  const appPayload = (appId) => ({
    id: appId,
    name: appId === "jackbox-party-pack-11" ? "Jackbox 11" : "Jackbox 10",
    audioRequired: true,
  });
  const appIdFromUrl = (url) => decodeURIComponent(new URL(url).pathname.split("/").at(4) || "jackbox-party-pack-10");

  await context.route("**/api/apphost/apps/*/session", async (route) => {
    const appId = appIdFromUrl(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        app: appPayload(appId),
        status: appStatus(appId),
        session: {
          appId,
          appName: appPayload(appId).name,
          display: { width: 1280, height: 720 },
          audio: { required: true },
          stream: { preferredTransport: "webrtc", iceServers: [] },
        },
      }),
    });
  });
  await context.route("**/api/apphost/apps/*/status", async (route) => {
    const appId = appIdFromUrl(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: appStatus(appId) }),
    });
  });
  await context.route("**/api/apphost/apps/*/launch", async (route) => {
    const appId = appIdFromUrl(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, app: appPayload(appId), status: appStatus(appId) }),
    });
  });
  await context.route("**/api/apphost/apps/*/snapshot", async (route) => {
    const appId = appIdFromUrl(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        appId,
        dataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGOSHzRgQAAAABJRU5ErkJggg==",
      }),
    });
  });
  await context.route("**/api/apphost/apps/*/stop", async (route) => {
    const appId = appIdFromUrl(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, app: appPayload(appId), status: { appId, state: "stopped" } }),
    });
  });
}

async function installMediaMocks(page, fillStyle) {
  await page.addInitScript((color) => {
    function makeVideoStream(label) {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext("2d");
      let frame = 0;
      const paint = () => {
        if (!context) return;
        context.fillStyle = color;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#ffffff";
        context.font = "24px sans-serif";
        context.fillText(`${label} ${frame}`, 18, 92);
        frame += 1;
      };
      paint();
      setInterval(paint, 250);
      return canvas.captureStream(8);
    }

    function addAudioTrack(stream) {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return;
      const audioContext = new AudioContextCtor();
      const oscillator = audioContext.createOscillator();
      const destination = audioContext.createMediaStreamDestination();
      oscillator.frequency.value = 180;
      oscillator.connect(destination);
      oscillator.start();
      destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    }

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async (constraints = {}) => {
          const stream = new MediaStream();
          if (constraints.video) {
            makeVideoStream("camera").getVideoTracks().forEach((track) => stream.addTrack(track));
          }
          if (constraints.audio) addAudioTrack(stream);
          return stream;
        },
        getDisplayMedia: async () => {
          const stream = makeVideoStream("screen");
          addAudioTrack(stream);
          return stream;
        },
        enumerateDevices: async () => [
          {
            deviceId: "harness-mic",
            groupId: "harness-audio",
            kind: "audioinput",
            label: "Harness Mic",
            toJSON() {
              return this;
            },
          },
          {
            deviceId: "harness-camera",
            groupId: "harness-video",
            kind: "videoinput",
            label: "Harness Camera",
            toJSON() {
              return this;
            },
          },
        ],
      },
    });
    HTMLMediaElement.prototype.captureStream = function captureStream() {
      const stream = new MediaStream();
      if (this.tagName.toLowerCase() === "video") {
        makeVideoStream("media").getVideoTracks().forEach((track) => stream.addTrack(track));
      }
      addAudioTrack(stream);
      return stream;
    };
    HTMLMediaElement.prototype.mozCaptureStream = HTMLMediaElement.prototype.captureStream;
    HTMLMediaElement.prototype.play = async function play() {
      this.dispatchEvent(new Event("play"));
      this.dispatchEvent(new Event("timeupdate"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      this.dispatchEvent(new Event("pause"));
    };
    Object.defineProperty(HTMLMediaElement.prototype, "duration", {
      configurable: true,
      get() {
        return 4;
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
      configurable: true,
      get() {
        return 1;
      },
      set() {},
    });
  }, fillStyle);
}

function capturePageErrors(page, errors, label) {
  page.on("pageerror", (error) => errors.push(`${label} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label} console: ${message.text()}`);
  });
}

test.describe("interaction inventory — WTF LIVE owner controls", () => {
  test("signed-in room Join opens the public room in a new browser tab", async ({
    page,
    request,
  }) => {
    await setAdmin(request);
    const errors = [];
    capturePageErrors(page, errors, "live-app");

    await page.goto("/live", { waitUntil: "domcontentloaded" });

    const officialRoom = page.locator(
      "[data-wtf-live-room-card='wtf-live'][data-wtf-live-room-surface='public']",
    );
    await expect(officialRoom).toBeVisible();
    await expect(page.locator("[data-wtf-live-active-room-summary]")).toHaveAttribute("data-wtf-live-active-room-count", "0");
    await expect(officialRoom).toHaveAttribute("data-wtf-live-room-active", "false");
    await expect(officialRoom.locator("[data-wtf-live-room-user-count='wtf-live']")).toContainText("0 users");

    const popupPromise = page.waitForEvent("popup");
    await officialRoom.getByRole("button", { name: "Join in New Tab" }).click();
    const roomPage = await popupPromise;
    await roomPage.waitForLoadState("domcontentloaded");

    expect(new URL(roomPage.url()).pathname).toBe("/live/r/wtf-live");
    await expect(page).toHaveURL(/\/live$/);
    await expect(page.getByText("Opened WTF LIVE in a new browser tab.")).toBeVisible();
    await roomPage.getByRole("button", { name: "Join Room" }).click();
    await expect(roomPage.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });
    await page.bringToFront();
    await expect(page.locator("[data-wtf-live-active-room-summary]")).toHaveAttribute("data-wtf-live-active-room-count", "1", { timeout: 8_000 });
    await expect(page.locator("[data-wtf-live-active-room-summary]")).toHaveAttribute("data-wtf-live-active-user-count", "1");
    await expect(officialRoom).toHaveAttribute("data-wtf-live-room-active", "true");
    await expect(officialRoom.locator("[data-wtf-live-room-presence='wtf-live']")).toContainText("Active now");
    await expect(officialRoom.locator("[data-wtf-live-room-user-count='wtf-live']")).toContainText("1 user");
    await roomPage.close();
    await page.bringToFront();
    await expect(page.locator("[data-wtf-live-active-room-summary]")).toHaveAttribute("data-wtf-live-active-room-count", "0", { timeout: 8_000 });
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("owned public room cards expose close and delete controls where the owner sees them", async ({
    page,
    request,
  }) => {
    await setAdmin(request);
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/live", { waitUntil: "domcontentloaded" });

    const publicOwnedRoom = page.locator(
      "[data-wtf-live-room-card='my-room'][data-wtf-live-room-surface='public']",
    );
    await expect(publicOwnedRoom).toBeVisible();
    await expect(publicOwnedRoom).toHaveAttribute("data-wtf-live-owned-room", "true");
    await expect(publicOwnedRoom.getByText("Owner controls", { exact: true })).toBeVisible();
    await expect(publicOwnedRoom.getByRole("button", { name: "Close" })).toBeVisible();
    await expect(publicOwnedRoom.getByRole("button", { name: "Delete" })).toBeVisible();

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("Delete My Room?");
      await dialog.accept();
    });
    await publicOwnedRoom.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("My Room deleted.")).toBeVisible();
    await expect(page.locator("[data-wtf-live-room-card='my-room']")).toHaveCount(0);
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("private WTF-user rooms have access-list controls and no public guest envelope", async ({
    page,
    request,
  }) => {
    await setAdmin(request);
    const errors = [];
    capturePageErrors(page, errors, "private-room");

    await page.goto("/live", { waitUntil: "domcontentloaded" });
    await page.locator("[data-wtf-live-create-room-access]").selectOption("private");
    await page.getByPlaceholder("Room title").fill("Private Focus Room");
    await page.locator("[data-wtf-live-create-private-access-list]").fill("wtf-user");
    await page.getByRole("button", { name: "Create Private Room" }).click();

    await expect(page.getByText("Private Focus Room created as a private WTF-user room.")).toBeVisible();
    const selectedPrivateRoom = page.locator("[data-wtf-live-room-card='private-room'][data-wtf-live-room-surface='selected']");
    await expect(selectedPrivateRoom).toBeVisible();
    await expect(selectedPrivateRoom.locator("[data-wtf-live-private-room='private-room']")).toContainText("WTF users only");
    await expect(selectedPrivateRoom.getByText("Private room · no public guest URL")).toBeVisible();
    await expect(selectedPrivateRoom.getByRole("button", { name: "Copy URL" })).toHaveCount(0);
    await expect(selectedPrivateRoom.locator("[data-wtf-live-private-access-editor='private-room']")).toBeVisible();

    await selectedPrivateRoom.locator("[data-wtf-live-private-access-list='private-room']").fill("wtf-user\nwtf-admin");
    await selectedPrivateRoom.locator("[data-wtf-live-private-access-save='private-room']").click();
    await expect(page.getByText("Private Focus Room private access list saved.")).toBeVisible();

    const privateList = await (await request.get("/api/wtf-live/rooms/private")).json();
    expect(privateList.rooms.some((room) => room.id === "private-room")).toBeTruthy();
    const privateAccess = await (await request.get("/api/wtf-live/rooms/private-room/access")).json();
    expect(privateAccess.members.map((member) => member.username)).toEqual(["wtf-user", "wtf-admin"]);
    const publicEnvelope = await request.get("/api/wtf-live/public/rooms/private-room");
    expect(publicEnvelope.status()).toBe(404);
    const privateEnvelope = await request.get("/api/wtf-live/rooms/private-room/join");
    expect(privateEnvelope.ok()).toBeTruthy();
    const privateMessages = await (await request.get("/api/wtf-live/rooms/private-room/messages")).json();
    expect(privateMessages.source).toBe("wtf-live.privateRealtimeOnly");

    const popupPromise = page.waitForEvent("popup");
    await selectedPrivateRoom.getByRole("button", { name: "Join Private Room" }).click();
    const roomPage = await popupPromise;
    await roomPage.waitForLoadState("domcontentloaded");
    expect(new URL(roomPage.url()).pathname).toBe("/live/r/private-room");
    await expect(roomPage.getByText("Private room")).toBeVisible();
    await roomPage.close();
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("game rooms let owners launch Jackbox host apps while room media remains available", async ({
    page,
    request,
  }) => {
    await setAdmin(request);
    await mockApphost(page.context());
    const errors = [];
    capturePageErrors(page, errors, "game-room");

    await page.goto("/live", { waitUntil: "domcontentloaded" });
    await page.locator("[data-wtf-live-create-room-kind]").selectOption("game");
    await page.getByPlaceholder("Room title").fill("Friday Jackbox");
    await page.getByRole("button", { name: "Create Game Room" }).click();

    await expect(page.getByText("Friday Jackbox created as a game room.")).toBeVisible();
    const selectedGameRoom = page.locator("[data-wtf-live-room-card='game-room'][data-wtf-live-room-surface='selected']");
    await expect(selectedGameRoom).toBeVisible();
    await expect(selectedGameRoom).toHaveAttribute("data-wtf-live-game-room", "game-room");
    await expect(selectedGameRoom.locator("[data-wtf-live-game-room-badge='game-room']")).toContainText("Jackbox");
    await expect(selectedGameRoom.locator("[data-wtf-live-game-host-actions='game-room']")).toBeVisible();

    const launchPopupPromise = page.waitForEvent("popup");
    await selectedGameRoom.locator("[data-wtf-live-game-start='jackbox-party-pack-10']").click();
    const launchPopup = await launchPopupPromise;
    await launchPopup.waitForLoadState("domcontentloaded");
    const launchPopupUrl = new URL(launchPopup.url());
    expect(launchPopupUrl.pathname).toBe("/live/r/game-room");
    expect(launchPopupUrl.searchParams.get("hostApp")).toBe("jackbox-party-pack-10");
    await expect(launchPopup.locator("[data-wtf-live-room-frame='game']")).toBeVisible();
    await expect(launchPopup.locator("[data-wtf-live-game-room-apphost='jackbox-party-pack-10']")).toBeVisible({ timeout: 10_000 });
    await expect(launchPopup.locator("[data-wtf-live-game-control-surface='jackbox-party-pack-10']")).toBeVisible();
    await launchPopup.close();

    const settings = await (await request.get("/api/wtf-live/rooms/game-room/settings?roomKind=game")).json();
    expect(settings.settings.roomKind).toBe("game");
    expect(settings.settings.allowGuestCamera).toBe(true);
    expect(settings.settings.allowGuestScreen).toBe(false);
    const joinEnvelope = await (await request.get("/api/wtf-live/rooms/game-room/join")).json();
    expect(joinEnvelope.room.kind).toBe("game");
    expect(joinEnvelope.capabilities.gameRoom).toBe(true);
    expect(joinEnvelope.roomSettings.roomKind).toBe("game");

    const roomPopupPromise = page.waitForEvent("popup");
    await selectedGameRoom.getByRole("button", { name: "Join in New Tab" }).click();
    const roomPage = await roomPopupPromise;
    await roomPage.waitForLoadState("domcontentloaded");
    expect(new URL(roomPage.url()).pathname).toBe("/live/r/game-room");
    await expect(roomPage.locator("[data-wtf-live-room-frame='game']")).toBeVisible();
    await expect(roomPage.getByRole("button", { name: "Join Game Room" })).toBeVisible();
    await roomPage.getByRole("button", { name: "Join Game Room" }).click();
    await expect(roomPage.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });
    await expect(roomPage.locator("[data-wtf-live-game-room-host-actions='game-room']")).toBeVisible();
    await expect(roomPage.locator("[data-wtf-live-toggle-mic]")).toBeVisible();
    await expect(roomPage.locator("[data-wtf-live-toggle-camera]")).toBeVisible();
    await roomPage.locator("[data-wtf-live-game-start='jackbox-party-pack-11']").click();
    await expect(roomPage.locator("[data-wtf-live-game-room-apphost='jackbox-party-pack-11']")).toBeVisible({ timeout: 10_000 });
    await expect(roomPage.locator("[data-wtf-live-game-control-surface='jackbox-party-pack-11']")).toBeVisible();
    expect(new URL(roomPage.url()).pathname).toBe("/live/r/game-room");
    await roomPage.close();

    expect(fatalErrors(errors)).toEqual([]);
  });

  test("smart room owner controls select WTF users, save settings, schedule events, and attach Show Kits", async ({
    page,
    request,
  }) => {
    await setAdmin(request);
    await request.post("/api/wtf-live/show-kits", {
      data: { name: "Control Room Kit", description: "owner controls fixture", clipIds: [], isDefault: true },
    });
    const errors = [];
    capturePageErrors(page, errors, "smart-room-controls");

    await page.goto("/live?tab=rooms&room=my-room", { waitUntil: "domcontentloaded" });
    const roomCard = page.locator("[data-wtf-live-room-card='my-room'][data-wtf-live-room-surface='selected']");
    await expect(roomCard).toBeVisible();
    await expect(roomCard.locator("[data-wtf-live-room-settings='my-room']")).toBeVisible();
    await expect(roomCard.locator("[data-wtf-live-room-schedule='my-room']")).toBeVisible();

    await roomCard.locator("[data-wtf-live-user-search='room-my-room']").fill("stage");
    await expect(roomCard.locator("[data-wtf-live-user-select='room-my-room']")).toContainText("stage-host");
    await roomCard.locator("[data-wtf-live-user-select='room-my-room']").selectOption("3");
    await roomCard.locator("[data-wtf-live-room-add-host='my-room']").click();
    await expect(roomCard.locator("[data-wtf-live-room-host-list='my-room']")).toHaveValue(/stage-host/);
    await roomCard.locator("[data-wtf-live-room-invite-host='my-room']").click();
    await expect(page.getByText("Invite sent to @stage-host for My Room.")).toBeVisible();

    await roomCard.locator("[data-wtf-live-user-search='room-my-room']").fill("room");
    await roomCard.locator("[data-wtf-live-user-select='room-my-room']").selectOption("4");
    await roomCard.locator("[data-wtf-live-room-add-guest='my-room']").click();
    await expect(roomCard.locator("[data-wtf-live-room-guest-list='my-room']")).toHaveValue(/room-guest/);
    await roomCard.locator("[data-wtf-live-room-roles-save='my-room']").click();
    await expect(page.getByText("My Room hosts and guests saved.")).toBeVisible();
    const roomAccess = await (await request.get("/api/wtf-live/rooms/my-room/access")).json();
    expect(roomAccess.members.some((member) => member.username === "stage-host" && member.role === "host")).toBeTruthy();
    expect(roomAccess.members.some((member) => member.username === "room-guest" && member.role === "guest")).toBeTruthy();

    await roomCard.locator("[data-wtf-live-room-settings='my-room']").click();
    await page.locator("[data-wtf-live-room-allow-camera='my-room']").uncheck();
    await page.locator("[data-wtf-live-room-allow-screen='my-room']").uncheck();
    await page.locator("[data-wtf-live-room-show-kit-select='my-room']").selectOption({ index: 1 });
    await page.locator("[data-wtf-live-room-settings-save='my-room']").click();
    await expect(page.getByText("My Room settings saved.")).toBeVisible();
    const savedSettings = await (await request.get("/api/wtf-live/rooms/my-room/settings")).json();
    expect(savedSettings.settings.allowGuestCamera).toBe(false);
    expect(savedSettings.settings.allowGuestScreen).toBe(false);
    expect(savedSettings.settings.showKitName).toBe("Control Room Kit");

    await roomCard.locator("[data-wtf-live-room-schedule='my-room']").click();
    await page.locator("[data-wtf-live-room-event-title='my-room']").fill("Smart Controls Live");
    await page.locator("[data-wtf-live-room-event-target='my-room']").selectOption("both");
    const ttcPopupPromise = page.waitForEvent("popup");
    await page.locator("[data-wtf-live-room-event-save='my-room']").click();
    const ttcPopup = await ttcPopupPromise;
    expect(ttcPopup.url()).toContain("thetezos.com");
    await ttcPopup.close();
    await expect(page.getByText("My Room event scheduled and TTC submission opened.")).toBeVisible();

    await page.goto("/live?tab=stages&stage=my-stage", { waitUntil: "domcontentloaded" });
    const stageCard = page.locator("[data-wtf-live-stage-card='my-stage']");
    await expect(stageCard.locator("[data-wtf-live-stage-settings='my-stage']")).toBeVisible();
    await expect(stageCard.locator("[data-wtf-live-stage-schedule='my-stage']")).toBeVisible();
    await stageCard.locator("[data-wtf-live-user-search='stage-my-stage']").fill("stage");
    await stageCard.locator("[data-wtf-live-user-select='stage-my-stage']").selectOption("3");
    await stageCard.locator("[data-wtf-live-stage-add-host='my-stage']").click();
    await expect(stageCard.locator("[data-wtf-live-stage-host-list='my-stage']")).toHaveValue(/stage-host/);
    await stageCard.locator("[data-wtf-live-stage-invite-host='my-stage']").click();
    await expect(page.getByText("Invite sent to @stage-host for My Stage.")).toBeVisible();
    await stageCard.locator("[data-wtf-live-stage-access-save='my-stage']").click();
    await expect(page.getByText("My Stage stage hosts and speakers saved.")).toBeVisible();

    await stageCard.locator("[data-wtf-live-stage-settings='my-stage']").click();
    await page.locator("[data-wtf-live-room-show-kit-select='my-stage']").selectOption({ index: 1 });
    await page.locator("[data-wtf-live-room-settings-save='my-stage']").click();
    await expect(page.getByText("My Stage settings saved.")).toBeVisible();
    await stageCard.locator("[data-wtf-live-stage-schedule='my-stage']").click();
    await page.locator("[data-wtf-live-room-event-title='my-stage']").fill("Smart Stage Live");
    await page.locator("[data-wtf-live-room-event-save='my-stage']").click();
    await expect(page.getByText("My Stage event scheduled.")).toBeVisible();

    await page.goto("/live/r/my-room", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Join Room" }).click();
    await expect(page.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });
    await page.locator("[data-wtf-live-sharing-settings-toggle]").click();
    await expect(page.locator("[data-wtf-live-runtime-room-settings='my-room']")).toBeVisible();
    await page.locator("[data-wtf-live-runtime-allow-audio]").uncheck();
    await page.locator("[data-wtf-live-runtime-settings-save]").click();
    await expect(page.getByText("Room settings saved.")).toBeVisible();

    expect(fatalErrors(errors)).toEqual([]);
  });

  test("signed-in Show Kit soundboard persists clips and owner relays them to an audience room", async ({
    browser,
    page,
    request,
  }) => {
    await setAdmin(request);
    const errors = [];
    capturePageErrors(page, errors, "show-kit-settings");

    await page.goto("/live?tab=show-kit", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-wtf-live-soundboard-settings]")).toBeVisible();
    await page.locator("[data-wtf-live-soundboard-label]").fill("Intro Sting");
    await page.locator("[data-wtf-live-soundboard-category]").fill("Intro");
    await page.locator("[data-wtf-live-soundboard-shortcut]").fill("Alt+1");
    await page.locator("[data-wtf-live-soundboard-volume]").evaluate((node) => {
      const input = /** @type {HTMLInputElement} */ (node);
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(input, "65");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.locator("[data-wtf-live-soundboard-cooldown]").selectOption("500");
    await page.locator("[data-wtf-live-soundboard-file]").setInputFiles({
      name: "intro-sting.wav",
      mimeType: "audio/wav",
      buffer: tinyWavBuffer(),
    });
    await expect(page.locator("[data-wtf-live-soundboard-status]")).toContainText("Intro Sting added");
    const clip = page.locator("[data-wtf-live-soundboard-clip]").filter({ hasText: "Intro Sting" });
    await expect(clip).toBeVisible();
    await expect(clip).toContainText("Alt+1");
    await expect(clip).toContainText("Intro");
    await expect(clip).toContainText("65%");

    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("wtf-live:soundboard:")) localStorage.removeItem(key);
      }
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-wtf-live-soundboard-clip]").filter({ hasText: "Intro Sting" })).toBeVisible();
    await expect(page.locator("[data-wtf-live-soundboard-settings]")).toContainText("server presets");
    await page.locator("[data-wtf-live-soundboard-shortcut]").fill("Alt+1");
    await expect(page.locator("[data-wtf-live-soundboard-conflict]")).toContainText("Intro Sting");
    await expect(page.locator("[data-wtf-live-soundboard-file]")).toBeDisabled();
    await page.locator("[data-wtf-live-show-kit-name]").fill("Main Room Kit");
    await page.locator("[data-wtf-live-show-kit-description]").fill("Intro kit for the owned room");
    await page.locator("[data-wtf-live-show-kit-save]").click();
    await expect(page.locator("[data-wtf-live-soundboard-status]")).toContainText("Main Room Kit saved as a Show Kit.");
    await expect(page.locator("[data-wtf-live-show-kit-list]")).toContainText("Main Room Kit");
    await page.goto("/live?tab=rooms&room=my-room", { waitUntil: "domcontentloaded" });
    const ownedRoomCard = page.locator("[data-wtf-live-room-card='my-room'][data-wtf-live-room-surface='selected']");
    await expect(ownedRoomCard).toBeVisible();
    await ownedRoomCard.locator("[data-wtf-live-room-settings='my-room']").click();
    await page.locator("[data-wtf-live-room-show-kit-select='my-room']").selectOption({ index: 1 });
    await page.locator("[data-wtf-live-room-settings-save='my-room']").click();
    await expect(page.getByText("My Room settings saved.")).toBeVisible();

    const owner = page;
    const audienceContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const audience = await audienceContext.newPage();
    capturePageErrors(owner, errors, "show-kit-owner");
    capturePageErrors(audience, errors, "show-kit-audience");
    await mockAnonymousUser(audienceContext);

    try {
      await owner.goto("/live/r/my-room", { waitUntil: "domcontentloaded" });
      await owner.getByRole("button", { name: "Join Room" }).click();
      await expect(owner.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });
      await expect(owner.locator("[data-wtf-live-soundboard-runtime]")).toBeVisible();
      const trigger = owner.locator("[data-wtf-live-soundboard-trigger]").filter({ hasText: "Intro Sting" });
      await expect(trigger).toBeVisible();

      await audience.goto("/live/r/my-room", { waitUntil: "domcontentloaded" });
      await audience.getByPlaceholder("Display name").fill("Audience Guest");
      await audience.getByRole("button", { name: "Join Room" }).click();
      await expect(audience.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });
      await expect(audience.locator("[data-wtf-live-soundboard-runtime]")).toHaveCount(0);
      await expect(audience.locator("[data-wtf-live-remote-audio]")).toHaveCount(1, { timeout: 10_000 });

      await trigger.click();
      await expect(owner.locator("[data-wtf-live-soundboard-status]")).toContainText("Intro Sting sent");
      await expect(audience.locator("[data-wtf-live-soundboard-received]")).toContainText("wtf-admin: Intro Sting");
      await trigger.click();
      await expect(owner.locator("[data-wtf-live-soundboard-status]")).toContainText("cooling down");

      await owner.locator("[data-wtf-live-soundboard-stop]").click();
      await expect(owner.locator("[data-wtf-live-soundboard-status]")).toContainText("Soundboard stopped.");
      await owner.locator("[data-wtf-live-chat-text]").focus();
      await owner.keyboard.down("Alt");
      await owner.keyboard.press("Digit1");
      await owner.keyboard.up("Alt");
      await expect(owner.locator("[data-wtf-live-soundboard-status]")).toContainText("Soundboard stopped.");

      await owner.locator("[data-wtf-live-chat-text]").evaluate((node) => node.blur());
      await owner.locator("[data-wtf-live-stage-area]").click();
      await owner.waitForTimeout(650);
      await owner.keyboard.down("Alt");
      await owner.keyboard.press("Digit1");
      await owner.keyboard.up("Alt");
      await expect(owner.locator("[data-wtf-live-soundboard-status]")).toContainText("Intro Sting sent via Alt+1");
      expect(fatalErrors(errors)).toEqual([]);
    } finally {
      await audienceContext.close();
    }
  });

  test("mobile room setup controls are first and desktop chat plus attendance pop out", async ({
    page,
    request,
  }) => {
    await setAnonymous(request);
    const errors = [];
    capturePageErrors(page, errors, "mobile-popouts");

    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto("/live/r/wtf-live", { waitUntil: "domcontentloaded" });
    await expect(page.getByPlaceholder("Display name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Join Room" })).toBeVisible();
    await expect(page.locator("[data-wtf-live-toggle-mic]")).toBeVisible();
    await expect(page.locator("[data-wtf-live-toggle-camera]")).toBeVisible();
    await expect(page.locator("[data-wtf-live-toggle-screen]")).toBeVisible();
    const mobileOrder = await page.evaluate(() => {
      const controls = document.querySelector("[data-wtf-live-control-rail]")?.getBoundingClientRect();
      const stage = document.querySelector("[data-wtf-live-stage-area]")?.getBoundingClientRect();
      return controls && stage ? { controlsTop: controls.top, stageTop: stage.top } : null;
    });
    expect(mobileOrder).not.toBeNull();
    expect(mobileOrder.controlsTop).toBeLessThan(mobileOrder.stageTop);
    await page.getByPlaceholder("Display name").fill("Mobile Alice");
    await page.getByRole("button", { name: "Join Room" }).click();
    await expect(page.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });
    const mobileStack = await page.evaluate(() => {
      const box = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const shellNode = document.querySelector("main");
      const railNode = document.querySelector("[data-wtf-live-control-rail]");
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentScrollWidth: document.documentElement.scrollWidth,
        documentScrollHeight: document.documentElement.scrollHeight,
        shellScrollWidth: shellNode?.scrollWidth ?? 0,
        shellScrollHeight: shellNode?.scrollHeight ?? 0,
        shellClientHeight: shellNode?.clientHeight ?? 0,
        rail: box("[data-wtf-live-control-rail]"),
        railScrollHeight: railNode?.scrollHeight ?? 0,
        stage: box("[data-wtf-live-stage-area]"),
        attendance: box("[data-wtf-live-bento-tile='attendance']"),
        chat: box("[data-wtf-live-bento-tile='chat']"),
        composer: box("[data-wtf-live-chat-composer]"),
      };
    });
    expect(mobileStack.documentScrollWidth).toBeLessThanOrEqual(mobileStack.viewportWidth);
    expect(mobileStack.shellScrollWidth).toBeLessThanOrEqual(mobileStack.viewportWidth);
    expect(Math.max(mobileStack.documentScrollHeight, mobileStack.shellScrollHeight)).toBeGreaterThan(mobileStack.viewportHeight);
    expect(mobileStack.rail).not.toBeNull();
    expect(mobileStack.stage).not.toBeNull();
    expect(mobileStack.attendance).not.toBeNull();
    expect(mobileStack.chat).not.toBeNull();
    expect(mobileStack.composer).not.toBeNull();
    expect(mobileStack.rail.height).toBeGreaterThanOrEqual(mobileStack.railScrollHeight - 2);
    expect(mobileStack.rail.bottom).toBeLessThanOrEqual(mobileStack.stage.top);
    expect(mobileStack.stage.bottom).toBeLessThanOrEqual(mobileStack.attendance.top);
    expect(mobileStack.attendance.bottom).toBeLessThanOrEqual(mobileStack.chat.top);
    expect(Math.max(mobileStack.documentScrollHeight, mobileStack.shellScrollHeight)).toBeGreaterThanOrEqual(mobileStack.composer.bottom - 2);
    await page.locator("[data-wtf-live-attendance-toggle]").scrollIntoViewIfNeeded();
    const attendanceTapHandle = await page.evaluate(() => {
      const attendanceSummary = document.querySelector("[data-wtf-live-attendance-toggle]");
      const attendanceBox = attendanceSummary?.getBoundingClientRect();
      const tapTarget = attendanceBox
        ? document.elementFromPoint(attendanceBox.left + attendanceBox.width / 2, attendanceBox.top + attendanceBox.height / 2)
        : null;
      return tapTarget?.closest("[data-wtf-live-attendance-toggle]") ? "attendance" : tapTarget?.getAttribute("data-wtf-live-push-to-talk-toggle") ? "ptt" : tapTarget?.tagName ?? null;
    });
    expect(attendanceTapHandle).toBe("attendance");
    await page.locator("[data-wtf-live-attendance-toggle]").click();
    await expect
      .poll(() => page.locator("[data-wtf-live-attendance-panel]").evaluate((node) => Boolean(node.open)))
      .toBe(true);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Display name").fill("Panel Alice");
    await page.getByRole("button", { name: "Join Room" }).click();
    await expect(page.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });
    await page.locator("[data-wtf-live-attendance-toggle]").click();
    const before = await page.evaluate(() => {
      const stage = document.querySelector("[data-wtf-live-stage-area]")?.getBoundingClientRect();
      const attendance = document.querySelector("[data-wtf-live-bento-tile='attendance']")?.getBoundingClientRect();
      const chat = document.querySelector("[data-wtf-live-bento-tile='chat']")?.getBoundingClientRect();
      const tileCount = document.querySelectorAll("[data-wtf-live-bento-tile]").length;
      return stage && attendance && chat
        ? { stageWidth: stage.width, attendanceWidth: attendance.width, chatWidth: chat.width, tileCount }
        : null;
    });
    expect(before).not.toBeNull();

    await page.locator("[data-wtf-live-popout-chat]").click();
    const chatPopoutPanel = page.locator("[data-wtf-live-panel-popout='chat']");
    await expect(chatPopoutPanel).toBeVisible();
    await expect(page.locator("[data-wtf-live-panel-popout='chat'] [data-wtf-live-chat-composer]")).toBeVisible();
    const chatPopoutBox = await chatPopoutPanel.boundingBox();
    expect(chatPopoutBox).not.toBeNull();
    await page.mouse.move(chatPopoutBox.x + 20, chatPopoutBox.y + 16);
    await page.mouse.down();
    await page.mouse.move(720, chatPopoutBox.y + 16, { steps: 8 });
    await page.mouse.up();
    await page.locator("[data-wtf-live-popout-attendance]").click();
    await expect(page.locator("[data-wtf-live-panel-popout='attendance']")).toBeVisible();
    await expect(page.locator("[data-wtf-live-panel-popout='attendance'] [data-wtf-live-attendance-panel='popout']")).toBeVisible();
    await expect(page.locator("[data-wtf-live-bento-tile='attendance']")).toHaveCount(0);
    await expect(page.locator("[data-wtf-live-bento-tile='chat']")).toHaveCount(0);
    const after = await page.evaluate(() => {
      const stage = document.querySelector("[data-wtf-live-stage-area]")?.getBoundingClientRect();
      const tileCount = document.querySelectorAll("[data-wtf-live-bento-tile]").length;
      return stage ? { stageWidth: stage.width, tileCount } : null;
    });
    expect(after).not.toBeNull();
    expect(after.stageWidth).toBeGreaterThan(before.stageWidth * 0.75);
    expect(after.tileCount).toBe(before.tileCount - 2);
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("public room mic test diagnoses mobile browser and system permission blockers", async ({
    browser,
    request,
  }) => {
    await setAnonymous(request);
    const errors = [];

    const unsupportedContext = await browser.newContext({ viewport: { width: 390, height: 780 } });
    const unsupported = await unsupportedContext.newPage();
    capturePageErrors(unsupported, errors, "mic-unsupported");
    await unsupported.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: undefined,
      });
    });

    const deniedContext = await browser.newContext({ viewport: { width: 390, height: 780 } });
    const denied = await deniedContext.newPage();
    capturePageErrors(denied, errors, "mic-denied");
    await denied.addInitScript(() => {
      Object.defineProperty(navigator, "permissions", {
        configurable: true,
        value: {
          query: async (descriptor) => {
            if (descriptor?.name === "microphone") return { state: "denied" };
            throw new TypeError("permission unsupported");
          },
        },
      });
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => {
            throw new DOMException("blocked", "NotAllowedError");
          },
          enumerateDevices: async () => [
            {
              deviceId: "blocked-mic",
              groupId: "blocked-audio",
              kind: "audioinput",
              label: "",
              toJSON() {
                return this;
              },
            },
          ],
        },
      });
    });

    const successContext = await browser.newContext({ viewport: { width: 390, height: 780 } });
    const success = await successContext.newPage();
    capturePageErrors(success, errors, "mic-success");
    await installMediaMocks(success, "#1f6feb");

    try {
      await unsupported.goto("/live/r/wtf-live", { waitUntil: "domcontentloaded" });
      await expect(unsupported.locator("[data-wtf-live-sharing-testing-drawer]")).toBeHidden();
      await unsupported.locator("[data-wtf-live-sharing-testing-toggle]").click();
      await expect(unsupported.locator("[data-wtf-live-mic-test]")).toBeVisible();
      await expect(unsupported.locator("[data-wtf-live-mic-test-details-toggle]")).toHaveAttribute("aria-expanded", "false");
      await expect(unsupported.locator("[data-wtf-live-mic-test-details]")).toBeHidden();
      await unsupported.locator("[data-wtf-live-mic-test-button]").click();
      await expect(unsupported.locator("[data-wtf-live-mic-test]")).toHaveAttribute("data-wtf-live-mic-test-state", "unsupported");
      await expect(unsupported.locator("[data-wtf-live-mic-test-status]")).toContainText("browser does not expose microphone capture");
      await unsupported.locator("[data-wtf-live-mic-test-details-toggle]").click();
      await expect(unsupported.locator("[data-wtf-live-mic-test-guidance]")).toContainText("privacy browsers");

      await denied.goto("/live/r/wtf-live", { waitUntil: "domcontentloaded" });
      await denied.locator("[data-wtf-live-sharing-testing-toggle]").click();
      await denied.locator("[data-wtf-live-mic-test-button]").click();
      await expect(denied.locator("[data-wtf-live-mic-test]")).toHaveAttribute("data-wtf-live-mic-test-state", "blocked");
      await denied.locator("[data-wtf-live-mic-test-details-toggle]").click();
      await expect(denied.locator("[data-wtf-live-mic-test-permission]")).toContainText("denied");
      await expect(denied.locator("[data-wtf-live-mic-test-guidance]")).toContainText("operating-system microphone permission");

      await success.goto("/live/r/wtf-live", { waitUntil: "domcontentloaded" });
      await success.locator("[data-wtf-live-sharing-testing-toggle]").click();
      await expect(success.locator("[data-wtf-live-mic-test-button]")).toBeVisible();
      await success.locator("[data-wtf-live-mic-test-button]").click();
      await expect(success.locator("[data-wtf-live-mic-test]")).toHaveAttribute("data-wtf-live-mic-test-state", "ok");
      await expect(success.locator("[data-wtf-live-mic-test-status]")).toContainText("Mic test passed");
      await success.locator("[data-wtf-live-mic-test-details-toggle]").click();
      await expect(success.locator("[data-wtf-live-mic-test-device]")).toContainText("Harness Mic");
      const mobileMetrics = await success.evaluate(() => {
        const panel = document.querySelector("[data-wtf-live-mic-test]")?.getBoundingClientRect();
        const button = document.querySelector("[data-wtf-live-mic-test-button]")?.getBoundingClientRect();
        return {
          viewportWidth: window.innerWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          panel: panel ? { left: panel.left, right: panel.right, width: panel.width } : null,
          button: button ? { width: button.width, height: button.height } : null,
        };
      });
      expect(mobileMetrics.documentScrollWidth).toBeLessThanOrEqual(mobileMetrics.viewportWidth);
      expect(mobileMetrics.panel).not.toBeNull();
      expect(mobileMetrics.panel.left).toBeGreaterThanOrEqual(0);
      expect(mobileMetrics.panel.right).toBeLessThanOrEqual(mobileMetrics.viewportWidth);
      expect(mobileMetrics.button).not.toBeNull();
      expect(mobileMetrics.button.height).toBeGreaterThanOrEqual(44);
      expect(fatalErrors(errors)).toEqual([]);
    } finally {
      await unsupportedContext.close();
      await deniedContext.close();
      await successContext.close();
    }
  });

  test("tablet room keeps controls and chat style targets reachable at the responsive breakpoint", async ({
    page,
    request,
  }) => {
    await setAnonymous(request);
    const errors = [];
    capturePageErrors(page, errors, "tablet-controls");

    for (const viewport of [
      { width: 980, height: 760 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/live/r/wtf-live", { waitUntil: "domcontentloaded" });
      await page.getByPlaceholder("Display name").fill(`Tablet ${viewport.width}`);
      await page.getByRole("button", { name: "Join Room" }).click();
      await expect(page.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });

      const metrics = await page.evaluate(() => {
        const box = (selector) => {
          const node = document.querySelector(selector);
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          return {
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            visibleHeight: Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)),
          };
        };
        const railNode = document.querySelector("[data-wtf-live-control-rail]");
        const toolbar = box("[data-wtf-live-chat-tools]");
        const styleTargets = Array.from(
          document.querySelectorAll("[data-wtf-live-chat-tools] button, [data-wtf-live-chat-tools] select"),
        ).map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            handle:
              node.getAttribute("data-wtf-live-chat-font") ??
              node.getAttribute("data-wtf-live-chat-font-size") ??
              node.getAttribute("data-wtf-live-chat-color") ??
              node.getAttribute("data-wtf-live-chat-bold") ??
              node.getAttribute("data-wtf-live-chat-italic") ??
              node.getAttribute("data-wtf-live-chat-style-toggle") ??
              node.getAttribute("data-wtf-live-chat-style-reset") ??
              node.tagName.toLowerCase(),
            width: rect.width,
            height: rect.height,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
          };
        });
        return {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          documentScrollWidth: document.documentElement.scrollWidth,
          rail: box("[data-wtf-live-control-rail]"),
          railScrollHeight: railNode?.scrollHeight ?? 0,
          stage: box("[data-wtf-live-stage-area]"),
          composer: box("[data-wtf-live-chat-composer]"),
          toolbar,
          styleTargets,
        };
      });

      expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
      expect(metrics.rail).not.toBeNull();
      expect(metrics.stage).not.toBeNull();
      expect(metrics.composer).not.toBeNull();
      expect(metrics.toolbar).not.toBeNull();
      expect(metrics.rail.visibleHeight).toBeGreaterThan(96);
      if (viewport.width <= 980) {
        expect(metrics.rail.height).toBeGreaterThanOrEqual(metrics.railScrollHeight - 2);
      }
      expect(metrics.stage.top).toBeGreaterThanOrEqual(0);
      expect(metrics.composer.left).toBeGreaterThanOrEqual(0);
      expect(metrics.composer.right).toBeLessThanOrEqual(metrics.viewportWidth);
      for (const target of metrics.styleTargets) {
        expect.soft(target.width, `${target.handle} target width`).toBeGreaterThanOrEqual(24);
        expect.soft(target.height, `${target.handle} target height`).toBeGreaterThanOrEqual(24);
        expect.soft(target.left, `${target.handle} target left`).toBeGreaterThanOrEqual(metrics.toolbar.left - 1);
        expect.soft(target.right, `${target.handle} target right`).toBeLessThanOrEqual(metrics.toolbar.right + 1);
      }
    }

    expect(fatalErrors(errors)).toEqual([]);
  });

  test("public room exposes core bento trays, screen grids, and receiver default font settings", async ({
    page,
    request,
  }) => {
    await setAnonymous(request);
    const errors = [];
    capturePageErrors(page, errors, "bento-popouts");
    await installMediaMocks(page, "#0d6b57");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/live/r/wtf-live", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Display name").fill("Bento Guest");
    await page.getByRole("button", { name: "Join Room" }).click();
    await expect(page.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });

    const workspace = page.locator("[data-wtf-live-bento-workspace]");
    await expect(workspace).toBeVisible();
    for (const panel of ["connection", "sharing", "screens", "attendance", "chat"]) {
      await expect(page.locator(`[data-wtf-live-bento-tile='${panel}']`)).toBeVisible();
    }
    await expect(page.locator("[data-wtf-live-bento-tile='testing']")).toHaveCount(0);
    await expect(page.locator("[data-wtf-live-bento-tile='settings']")).toHaveCount(0);
    await expect(page.locator("[data-wtf-live-sharing-testing-toggle]")).toBeVisible();
    await expect(page.locator("[data-wtf-live-sharing-settings-toggle]")).toBeVisible();
    await expect(page.locator("[data-wtf-live-sharing-testing-drawer]")).toBeHidden();
    await expect(page.locator("[data-wtf-live-sharing-settings-drawer]")).toBeHidden();

    const metrics = await page.evaluate(() => {
      const room = document.querySelector("[data-wtf-live-room-frame]")?.getBoundingClientRect();
      const workspaceBox = document.querySelector("[data-wtf-live-bento-workspace]")?.getBoundingClientRect();
      const tiles = Array.from(document.querySelectorAll("[data-wtf-live-bento-tile]")).map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          panel: node.getAttribute("data-wtf-live-bento-tile"),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        };
      });
      const uniqueColumns = new Set(tiles.map((tile) => Math.round(tile.left / 16))).size;
      return {
        roomBackground: room ? getComputedStyle(document.querySelector("[data-wtf-live-room-frame]")).backgroundColor : "",
        roomWidth: room?.width ?? 0,
        workspaceWidth: workspaceBox?.width ?? 0,
        uniqueColumns,
        tiles,
      };
    });
    expect(metrics.roomWidth).toBeGreaterThan(900);
    expect(metrics.workspaceWidth).toBeGreaterThan(880);
    expect(metrics.uniqueColumns).toBeGreaterThan(1);
    expect(metrics.roomBackground).toMatch(/rgba\(/);
    for (const tile of metrics.tiles) {
      expect.soft(tile.width, `${tile.panel} tile width`).toBeGreaterThan(180);
      expect.soft(tile.height, `${tile.panel} tile height`).toBeGreaterThan(120);
    }

    await page.locator("[data-wtf-live-sharing-testing-toggle]").click();
    await expect(page.locator("[data-wtf-live-sharing-testing-drawer]")).toBeVisible();
    await page.locator("[data-wtf-live-sharing-settings-toggle]").click();
    await expect(page.locator("[data-wtf-live-sharing-settings-drawer]")).toBeVisible();
    const roomFontOptions = await page.locator("[data-wtf-live-room-default-font] option").evaluateAll((options) =>
      options.map((option) => option.getAttribute("value")),
    );
    expect(roomFontOptions).not.toContain("mek-type");
    await page.locator("[data-wtf-live-room-default-font]").selectOption("serif-press");
    await page.locator("[data-wtf-live-chat-text]").fill("receiver default font");
    await page.locator("[data-wtf-live-chat-send]").click();
    const defaultFontMessage = page.locator("[data-wtf-live-chat-message]").filter({ hasText: "receiver default font" }).last();
    await expect(defaultFontMessage).toBeVisible();
    const defaultFontFamily = await defaultFontMessage.locator("[data-wtf-live-chat-message-text]").evaluate((node) =>
      getComputedStyle(node).fontFamily.toLowerCase(),
    );
    expect(defaultFontFamily).toMatch(/georgia|times/);

    await page.locator("[data-wtf-live-toggle-camera]").click();
    await page.locator("[data-wtf-live-toggle-screen]").click();
    const stageEntries = page.locator("[data-wtf-live-stage-entry]");
    await expect(stageEntries).toHaveCount(2);
    await stageEntries.nth(0).dragTo(stageEntries.nth(1));
    const screenGrid = page.locator("[data-wtf-live-screen-grid]");
    await expect(screenGrid).toBeVisible();
    await expect(screenGrid.locator("[data-wtf-live-screen-grid-item]")).toHaveCount(2);
    const gridPopout = screenGrid.locator("[data-wtf-live-grid-popout]").first();
    await expect
      .poll(async () => gridPopout.evaluate((node) => getComputedStyle(node).opacity))
      .toBe("0");
    await screenGrid.locator("[data-wtf-live-screen-grid-item]").first().hover();
    await expect
      .poll(async () => Number(await gridPopout.evaluate((node) => getComputedStyle(node).opacity)))
      .toBeGreaterThan(0.8);

    await page.locator("[data-wtf-live-popout-chat]").click();
    const chatPopout = page.locator("[data-wtf-live-panel-popout='chat']");
    await expect(chatPopout).toBeVisible();
    await expect(page.locator("[data-wtf-live-bento-tile='chat']")).toHaveCount(0);
    await page.locator("[data-wtf-live-popout-pin='panel-chat']").click();
    await expect(chatPopout).toHaveAttribute("data-wtf-live-popout-pinned", "true");
    await page.locator("[data-wtf-live-popout-popin='panel-chat']").click();
    await expect(page.locator("[data-wtf-live-panel-popout='chat']")).toHaveCount(0);
    await expect(page.locator("[data-wtf-live-bento-tile='chat']")).toBeVisible();

    expect(fatalErrors(errors)).toEqual([]);
  });

  test("signed-in room attendance uses wtfOS names and WIM buddy actions", async ({
    browser,
    request,
  }) => {
    await setAdmin(request);
    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const wimContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const guestContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const admin = await adminContext.newPage();
    const wimUser = await wimContext.newPage();
    const guest = await guestContext.newPage();
    const errors = [];
    capturePageErrors(admin, errors, "admin-attendance");
    capturePageErrors(wimUser, errors, "wim-user-attendance");
    capturePageErrors(guest, errors, "guest-attendance");
    await mockAuthUser(wimContext, { id: 2, username: "wim-online", displayName: "WIM Online" });
    await mockAnonymousUser(guestContext);

    try {
      await admin.goto("/live/r/wtf-live", { waitUntil: "domcontentloaded" });
      await expect(admin.locator("[data-wtf-live-account-identity]")).toContainText("wtf-admin");
      await expect(admin.getByPlaceholder("Display name")).toHaveCount(0);
      await admin.getByRole("button", { name: "Join Room" }).click();
      await expect(admin.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });
      await admin.locator("[data-wtf-live-attendance-toggle]").click();

      const selfRow = admin.locator("[data-wtf-live-attendee='self']");
      await expect(selfRow).toContainText("wtf-admin");
      await expect(selfRow).toHaveAttribute("data-wtf-live-attendee-user-id", "1");
      await expect(admin.locator("[data-wtf-live-wim-add]")).toHaveCount(0);

      await wimUser.goto("/live/r/wtf-live", { waitUntil: "domcontentloaded" });
      await expect(wimUser.locator("[data-wtf-live-account-identity]")).toContainText("wim-online");
      await wimUser.getByRole("button", { name: "Join Room" }).click();
      await expect(wimUser.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });

      const remoteRow = admin.locator("[data-wtf-live-attendee][data-wtf-live-attendee-user-id='2']");
      await expect(remoteRow).toContainText("wim-online");
      await expect(remoteRow).toHaveAttribute("data-wtf-live-attendee-wtf-user", "true");
      const rowHeights = await admin.locator("[data-wtf-live-attendee]").evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
      );
      expect(rowHeights.every((height) => height <= 42)).toBeTruthy();

      const addButton = remoteRow.locator("[data-wtf-live-wim-add='2']");
      await expect(addButton).toBeVisible();
      await addButton.click();
      await expect(addButton).toHaveAttribute("data-wtf-live-wim-state", "buddy");
      await expect(addButton).toContainText("Buddy");
      await expect
        .poll(() =>
          admin.evaluate(() => JSON.parse(localStorage.getItem("wtf:wim:friends:1") || "[]")),
        )
        .toEqual([2]);

      await guest.goto("/live/r/wtf-live", { waitUntil: "domcontentloaded" });
      await guest.getByPlaceholder("Display name").fill("Guest Viewer");
      await guest.getByRole("button", { name: "Join Room" }).click();
      await expect(guest.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });
      await guest.locator("[data-wtf-live-attendance-toggle]").click();
      await expect(guest.locator("[data-wtf-live-attendee]").filter({ hasText: "wim-online" })).toBeVisible();
      await expect(guest.locator("[data-wtf-live-wim-add]")).toHaveCount(0);
      expect(fatalErrors(errors)).toEqual([]);
    } finally {
      await Promise.all([adminContext.close(), wimContext.close(), guestContext.close()]);
    }
  });

  test("signed-in room users can send owned WTF LIVE tip items", async ({
    browser,
    request,
  }) => {
    await setAdmin(request);
    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const wimContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const admin = await adminContext.newPage();
    const wimUser = await wimContext.newPage();
    const errors = [];
    capturePageErrors(admin, errors, "admin-tip");
    capturePageErrors(wimUser, errors, "wim-user-tip");
    await mockAuthUser(wimContext, { id: 2, username: "wim-online", displayName: "WIM Online" });

    try {
      await admin.goto("/live/r/wtf-live", { waitUntil: "domcontentloaded" });
      await admin.getByRole("button", { name: "Join Room" }).click();
      await expect(admin.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });
      await admin.locator("[data-wtf-live-attendance-toggle]").click();

      await wimUser.goto("/live/r/wtf-live", { waitUntil: "domcontentloaded" });
      await wimUser.getByRole("button", { name: "Join Room" }).click();
      await expect(wimUser.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });

      const remoteRow = admin.locator("[data-wtf-live-attendee][data-wtf-live-attendee-user-id='2']");
      await expect(remoteRow).toContainText("wim-online");
      await remoteRow.locator("[data-wtf-live-tip-open='2']").click();
      await expect(admin.locator("[data-wtf-live-tip-tray]")).toBeVisible();
      await admin.locator("[data-wtf-live-tip-item]").selectOption("wtf-live-rose");
      await admin.locator("[data-wtf-live-tip-send]").click();
      await expect(admin.locator("[data-wtf-live-tip-status]")).toContainText("WTF LIVE Rose sent to WIM Online");
      await expect(wimUser.locator("[data-wtf-live-chat-log]")).toContainText("tipped WIM Online with WTF LIVE Rose");

      const market = await (await request.get("/api/in-app-market?category=wtf_live")).json();
      const marketSkus = market.items.map((item) => item.sku);
      expect(marketSkus).toEqual(
        expect.arrayContaining([
          "wtf-live-jalapeno",
          "wtf-live-flaming-heart",
          "wtf-live-pauls-panties",
        ]),
      );
      expect(marketSkus).not.toContain("wtf-live-golden-kazoo");
      expect(market.items.find((item) => item.sku === "wtf-live-rose").quantityOwned).toBe(1);
      expect(market.tipLedger.sent.some((transfer) => transfer.receiverUserId === 2 && transfer.sku === "wtf-live-rose")).toBeTruthy();
      expect(fatalErrors(errors)).toEqual([]);
    } finally {
      await Promise.all([adminContext.close(), wimContext.close()]);
    }
  });

  test("received WTF LIVE tips redeem through WTFIAM into earned WTF", async ({
    page,
    request,
  }) => {
    await setAdmin(request);
    const errors = [];
    capturePageErrors(page, errors, "wtfiam-tip-redeem");

    await page.goto("/wtfiam?category=wtf_live", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-wtfiam-tip-ledger]")).toBeVisible();
    const transferRow = page.locator("[data-wtfiam-tip-transfer='1']");
    await expect(transferRow).toContainText("Rubber Chicken");
    await transferRow.locator("[data-wtfiam-tip-redeem='1']").click();
    await expect(page.getByText("Tip redeemed for 5 earned WTF.")).toBeVisible();
    await expect(transferRow.locator("[data-wtfiam-tip-redeem='1']")).toContainText("Redeemed");

    const market = await (await request.get("/api/in-app-market?category=wtf_live")).json();
    expect(market.balances.rewardWtf).toBe(5);
    expect(market.tipLedger.received.find((transfer) => transfer.id === 1).status).toBe("redeemed");
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("owned stages expose close reopen and delete controls", async ({
    page,
    request,
  }) => {
    await setAdmin(request);
    const errors = [];
    capturePageErrors(page, errors, "stage-controls");

    await page.goto("/live?tab=stages", { waitUntil: "domcontentloaded" });
    await page.locator("select").first().selectOption("my-stage");
    const stageCard = page.locator("[data-wtf-live-stage-card='my-stage']");
    await expect(stageCard).toBeVisible();
    await expect(stageCard).toHaveAttribute("data-wtf-live-owned-stage", "true");
    await expect(stageCard.getByRole("button", { name: "Join Stage Room" })).toBeVisible();
    await expect(stageCard.locator("[data-wtf-live-stage-access-editor='my-stage']")).toBeVisible();
    await expect(stageCard.locator("[data-wtf-live-stage-speaker-list='my-stage']")).toHaveValue("wtf-user");
    await stageCard.locator("[data-wtf-live-stage-host-list='my-stage']").fill("wtf-host");
    await stageCard.locator("[data-wtf-live-stage-speaker-list='my-stage']").fill("wtf-user\nwtf-speaker");
    await stageCard.locator("[data-wtf-live-stage-access-save='my-stage']").click();
    await expect(page.getByText("My Stage stage hosts and speakers saved.")).toBeVisible();
    const roleState = await (await request.get("/api/wtf-live/stages/my-stage/access")).json();
    expect(roleState.members.map((member) => `${member.role}:${member.username}`)).toEqual([
      "host:wtf-host",
      "speaker:wtf-user",
      "speaker:wtf-speaker",
    ]);
    await stageCard.getByRole("button", { name: "Close Stage" }).click();
    await expect(page.getByText("My Stage stage room is closed to guests.")).toBeVisible();
    await expect(stageCard.getByRole("button", { name: "Reopen Stage" })).toBeVisible();
    await stageCard.getByRole("button", { name: "Reopen Stage" }).click();
    await expect(page.getByText("My Stage stage room is open to guests.")).toBeVisible();

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("Delete My Stage?");
      await dialog.accept();
    });
    await stageCard.getByRole("button", { name: "Delete Stage" }).click();
    await expect(page.getByText("My Stage deleted.")).toBeVisible();
    await expect(page.locator("[data-wtf-live-stage-card='my-stage']")).toHaveCount(0);
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("stage rooms gate audience sharing while owners keep in-room role controls", async ({
    browser,
    page,
    request,
  }) => {
    await setAdmin(request);
    const errors = [];
    capturePageErrors(page, errors, "stage-owner-room");
    await installMediaMocks(page, "#3357a4");

    await page.goto("/live/r/my-stage", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-wtf-live-room-frame='stage']")).toBeVisible();
    await page.getByRole("button", { name: "Join Stage" }).click();
    await expect(page.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });
    await expect(page.locator("[data-wtf-live-stage-room-policy]")).toHaveAttribute("data-wtf-live-stage-role", "owner");
    await expect(page.locator("[data-wtf-live-stage-room-policy]")).toHaveAttribute("data-wtf-live-stage-can-share", "true");
    await expect(page.locator("[data-wtf-live-stage-room-host-list]")).toBeVisible();
    await page.locator("[data-wtf-live-stage-room-host-list]").fill("wtf-host");
    await page.locator("[data-wtf-live-stage-room-speaker-list]").fill("wtf-user");
    await page.locator("[data-wtf-live-stage-room-access-save]").click();
    await expect(page.getByText("Stage hosts and speakers saved.")).toBeVisible();
    await expect(page.locator("[data-wtf-live-toggle-mic]")).toBeEnabled();
    await expect(page.locator("[data-wtf-live-toggle-camera]")).toBeEnabled();
    await expect(page.locator("[data-wtf-live-toggle-screen]")).toBeEnabled();

    const audienceContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await mockAnonymousUser(audienceContext);
    const audience = await audienceContext.newPage();
    capturePageErrors(audience, errors, "stage-audience-room");
    try {
      await audience.goto("/live/r/my-stage", { waitUntil: "domcontentloaded" });
      await expect(audience.locator("[data-wtf-live-room-frame='stage']")).toBeVisible();
      await audience.getByPlaceholder("Display name").fill("Audience Guest");
      await audience.getByRole("button", { name: "Join Stage" }).click();
      await expect(audience.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });
      await expect(audience.locator("[data-wtf-live-stage-room-policy]")).toHaveAttribute("data-wtf-live-stage-role", "audience");
      await expect(audience.locator("[data-wtf-live-stage-room-policy]")).toHaveAttribute("data-wtf-live-stage-can-share", "false");
      await expect(audience.locator("[data-wtf-live-toggle-mic]")).toBeDisabled();
      await expect(audience.locator("[data-wtf-live-toggle-camera]")).toBeDisabled();
      await expect(audience.locator("[data-wtf-live-toggle-screen]")).toBeDisabled();
      await expect(audience.locator("[data-wtf-live-media-load]")).toBeDisabled();
    } finally {
      await audienceContext.close();
    }
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("public room guests receive each other's media streams, keyboard chat, and room chat attachments", async ({
    browser,
    request,
  }) => {
    await setAnonymous(request);
    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();
    const alice = await aliceContext.newPage();
    const bob = await bobContext.newPage();
    const errors = [];
    capturePageErrors(alice, errors, "alice");
    capturePageErrors(bob, errors, "bob");
    await installMediaMocks(alice, "#1f6feb");
    await installMediaMocks(bob, "#238636");

    try {
      await Promise.all([
        alice.goto("/live/r/wtf-live", { waitUntil: "domcontentloaded" }),
        bob.goto("/live/r/wtf-live", { waitUntil: "domcontentloaded" }),
      ]);
      await alice.getByPlaceholder("Display name").fill("Alice");
      await bob.getByPlaceholder("Display name").fill("Bob");
	      await alice.getByRole("button", { name: "Join Room" }).click();
	      await bob.getByRole("button", { name: "Join Room" }).click();
	      await alice.locator("[data-wtf-live-attendance-toggle]").click();
	      await bob.locator("[data-wtf-live-attendance-toggle]").click();

	      const bobAttendanceAlice = bob.locator("[data-wtf-live-attendee]").filter({ hasText: "Alice" });
	      const aliceAttendanceBob = alice.locator("[data-wtf-live-attendee]").filter({ hasText: "Bob" });
      await expect(bobAttendanceAlice).toBeVisible();
      await expect(aliceAttendanceBob).toBeVisible();
      await expect(bob.locator("[data-wtf-live-stage-peer]").filter({ hasText: "Alice" })).toHaveCount(0);
      await expect(alice.locator("[data-wtf-live-stage-peer]").filter({ hasText: "Bob" })).toHaveCount(0);
      await expect(alice.locator("[data-wtf-live-room-reactions]")).toBeVisible();
      await alice.locator("[data-wtf-live-room-reaction='👏']").click();
      await expect(
        bob.locator("[data-wtf-live-reaction-burst][data-wtf-live-reaction-emoji='👏']").filter({ hasText: "Alice" }),
      ).toBeVisible();

      await bob.locator("[data-wtf-live-avatar-file]").setInputFiles({
        name: "avatar.gif",
        mimeType: "image/gif",
        buffer: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64"),
	      });
	      await bob.locator("[data-wtf-live-toggle-mic]").click();
	      await expect(alice.locator("[data-wtf-live-stage-peer]").filter({ hasText: "Bob" })).toHaveCount(0);
	      await expect(aliceAttendanceBob).toHaveAttribute("data-wtf-live-attendee-state", "mic live");
	      await bob.locator("[data-wtf-live-push-to-talk-toggle]").click();
	      await expect(aliceAttendanceBob).toHaveAttribute("data-wtf-live-attendee-state", "mic ready");
	      await bob.locator("[data-wtf-live-push-to-talk-hold]").dispatchEvent("pointerdown", { button: 0 });
	      await expect(aliceAttendanceBob).toHaveAttribute("data-wtf-live-attendee-state", "mic live");
	      await bob.locator("[data-wtf-live-push-to-talk-hold]").dispatchEvent("pointerup", { button: 0 });
	      await expect(aliceAttendanceBob).toHaveAttribute("data-wtf-live-attendee-state", "mic ready");

      await alice.locator("[data-wtf-live-toggle-camera]").click();
      await expect(alice.locator("[data-wtf-live-active-share]")).toHaveAttribute("data-wtf-live-active-share", "camera");
      const bobAliceCamera = bob.locator("[data-wtf-live-stage-source='camera']").filter({ hasText: "Alice" });
      await expect(bobAliceCamera).toBeVisible();
      await expect(bobAliceCamera).toHaveAttribute("data-wtf-live-remote-active-video", "camera");
      await expect(bobAliceCamera.getByText("Camera live", { exact: true })).toBeVisible();
	      const remoteVideo = bobAliceCamera.locator("video[data-wtf-live-remote-video]").first();
	      await expect(remoteVideo).toBeVisible();
	      await expect
	        .poll(async () => remoteVideo.evaluate((video) => video.srcObject?.getVideoTracks().length ?? 0))
	        .toBeGreaterThan(0);
	      await bob.locator("[data-wtf-live-open-stage-popout]").first().click();
	      const bobPopout = bob.locator("[data-wtf-live-popout-frame]").first();
	      await expect(bobPopout).toBeVisible();
	      await bob.locator("[data-wtf-live-popout-maximize]").first().click();
	      await expect(bobPopout).toBeVisible();
	      await bob.locator("[data-wtf-live-popout-close]").first().click();
	      await expect(bob.locator("[data-wtf-live-popout-frame]")).toHaveCount(0);

      await alice.locator("[data-wtf-live-toggle-screen]").click();
      await expect(alice.locator("[data-wtf-live-active-share]")).toHaveAttribute("data-wtf-live-active-share", "screen");
      const bobAliceScreen = bob.locator("[data-wtf-live-stage-source='screen']").filter({ hasText: "Alice" });
      await expect(bobAliceCamera).toBeVisible();
      await expect(bobAliceScreen).toBeVisible();
      await expect(bobAliceScreen).toHaveAttribute("data-wtf-live-remote-active-video", "screen");
      await expect(bobAliceScreen.getByText("Screen live", { exact: true })).toBeVisible();

      await alice.locator("[data-wtf-live-share-camera]").click();
      await expect(alice.locator("[data-wtf-live-active-share]")).toHaveAttribute("data-wtf-live-active-share", "camera");
      await expect(bobAliceCamera).toBeVisible();
      await expect(bobAliceScreen).toBeVisible();

      await alice.locator("[data-wtf-live-share-screen]").click();
      await expect(alice.locator("[data-wtf-live-active-share]")).toHaveAttribute("data-wtf-live-active-share", "screen");
      await expect(bobAliceCamera).toBeVisible();
      await expect(bobAliceScreen).toBeVisible();

      await expect(alice.locator("[data-wtf-live-media-deck]")).toBeVisible();
      await alice.locator("[data-wtf-live-media-file]").setInputFiles({
        name: "backing.wav",
        mimeType: "audio/wav",
        buffer: tinyWavBuffer(),
      });
      await expect(alice.locator("[data-wtf-live-media-deck-info]")).toContainText("backing.wav");
      await alice.locator("[data-wtf-live-media-play]").click();
      await expect(alice.locator("[data-wtf-live-media-deck]")).toContainText("Playing");
      const bobAliceMedia = bob.locator("[data-wtf-live-stage-source='media']").filter({ hasText: "Alice" });
      await expect(bobAliceMedia).toBeVisible({ timeout: 10_000 });
      await expect(bobAliceMedia).toContainText("backing.wav");
      await expect(bobAliceCamera).toBeVisible();
      await expect(bobAliceScreen).toBeVisible();

      await alice.locator("[data-wtf-live-toggle-camera]").click();
      await expect(alice.locator("[data-wtf-live-active-share]")).toHaveAttribute("data-wtf-live-active-share", "screen");
      await expect(bobAliceCamera).toHaveCount(0);
      await expect(bobAliceScreen).toBeVisible();
      await expect(bobAliceMedia).toBeVisible();
      await expect
        .poll(async () => bobAliceScreen.locator("video[data-wtf-live-remote-video]").first().evaluate((video) => video.srcObject?.getVideoTracks().length ?? 0))
        .toBeGreaterThan(0);

      const aliceChatInput = alice.locator("[data-wtf-live-chat-text]");
      const bobChatLog = bob.locator("[data-wtf-live-chat-log]");
      await aliceChatInput.fill("enter submits live chat");
      await aliceChatInput.press("Enter");
      await expect(aliceChatInput).toHaveValue("");
      await expect(bobChatLog.getByText("enter submits live chat")).toBeVisible();

      await aliceChatInput.fill("keyboard line one");
      await aliceChatInput.press("Shift+Enter");
      await aliceChatInput.type("keyboard line two");
      await expect(aliceChatInput).toHaveValue("keyboard line one\nkeyboard line two");
      await expect(bobChatLog.getByText("keyboard line one")).toHaveCount(0);
      await aliceChatInput.press("Enter");
      await expect(aliceChatInput).toHaveValue("");
      await expect(bobChatLog.getByText("keyboard line one keyboard line two")).toBeVisible();

      const aliceToolbox = alice.locator("[data-wtf-live-chat-tools]");
      await expect(aliceToolbox).toBeVisible();
      await expect(alice.locator("[data-wtf-live-chat-style-panel]")).toHaveCount(0);
      const toolboxSize = await aliceToolbox.boundingBox();
      expect(toolboxSize?.height ?? 0).toBeGreaterThanOrEqual(32);
      expect(toolboxSize?.height ?? 0).toBeLessThanOrEqual(44);
      const styleTargetSizes = await aliceToolbox.locator("button, select").evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
      );
      expect(styleTargetSizes).toHaveLength(2);
      for (const target of styleTargetSizes) {
        expect.soft(target.width).toBeGreaterThanOrEqual(24);
        expect.soft(target.height).toBeGreaterThanOrEqual(24);
      }
      await alice.locator("[data-wtf-live-chat-emoji-toggle]").click();
      const aliceEmojiPanel = alice.locator("[data-wtf-live-chat-emoji-panel]");
      await expect(aliceEmojiPanel).toBeVisible();
      const emojiTargetSizes = await aliceEmojiPanel.locator("button").evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
      );
      expect(emojiTargetSizes.length).toBeGreaterThanOrEqual(20);
      for (const target of emojiTargetSizes) {
        expect.soft(target.width).toBeGreaterThanOrEqual(24);
        expect.soft(target.height).toBeGreaterThanOrEqual(24);
      }
      await alice.locator("[data-wtf-live-chat-emoji='🔥']").click();
      await expect(aliceChatInput).toHaveValue("🔥");
      await aliceChatInput.press("Enter");
      await expect(bobChatLog.getByText("🔥")).toBeVisible();
      await alice.locator("[data-wtf-live-chat-style-toggle]").click();
      const aliceStylePanel = alice.locator("[data-wtf-live-chat-style-panel]");
      await expect(aliceStylePanel).toBeVisible();
      const panelTargetSizes = await aliceStylePanel.locator("button, select").evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
      );
      for (const target of panelTargetSizes) {
        expect.soft(target.width).toBeGreaterThanOrEqual(24);
        expect.soft(target.height).toBeGreaterThanOrEqual(24);
      }
      const sizeOptions = await alice.locator("[data-wtf-live-chat-font-size] option").evaluateAll((options) =>
        options.map((option) => option.getAttribute("value")),
      );
      expect(sizeOptions).toEqual(["8", "9", "10", "11", "12", "13", "14"]);
      const fontOptions = await alice.locator("[data-wtf-live-chat-font] option").evaluateAll((options) =>
        options.map((option) => option.getAttribute("value")),
      );
      expect(fontOptions).toEqual(["classic-95", "terminal", "serif-press"]);
      await alice.locator("[data-wtf-live-chat-font]").selectOption("terminal");
      await alice.locator("[data-wtf-live-chat-font-size]").selectOption("14");
      await alice.locator("[data-wtf-live-chat-color='red']").click();
      await alice.locator("[data-wtf-live-chat-bold]").click();
      await alice.locator("[data-wtf-live-chat-italic]").click();
      await expect(aliceChatInput).toHaveCSS("font-size", "14px");
      await alice.locator("[data-wtf-live-chat-style-done]").click();
      await expect(alice.locator("[data-wtf-live-chat-style-panel]")).toHaveCount(0);
      await aliceChatInput.fill("styled chat arrives");
      await aliceChatInput.press("Enter");
      const styledMessage = bobChatLog
        .locator("[data-wtf-live-chat-message-text]")
        .filter({ hasText: "styled chat arrives" });
      await expect(styledMessage).toBeVisible();
      const renderedStyle = await styledMessage.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          color: style.color,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontStyle: style.fontStyle,
          fontWeight: style.fontWeight,
        };
      });
      expect(renderedStyle.fontSize).toBe("14px");
      expect(renderedStyle.fontStyle).toBe("italic");
      expect(renderedStyle.color).toBe("rgb(143, 29, 44)");
      expect(renderedStyle.fontFamily.toLowerCase()).toMatch(/mono|consolas|courier/);
      const renderedWeight = renderedStyle.fontWeight === "bold" ? 700 : Number(renderedStyle.fontWeight);
      expect(renderedWeight).toBeGreaterThanOrEqual(600);

      await alice.locator("[data-wtf-live-chat-file]").setInputFiles({
        name: "tiny.gif",
        mimeType: "image/gif",
        buffer: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64"),
      });
      await alice.locator("[data-wtf-live-chat-text]").fill("hello Bob, media is live");
      await alice.locator("[data-wtf-live-chat-send]").click();

	      await expect(bobChatLog.getByText("hello Bob, media is live")).toBeVisible();
	      await expect(bobChatLog.getByText(/tiny\.gif/)).toBeVisible();
	      const bobChatImage = bobChatLog.locator("img[alt='tiny.gif']");
	      await expect(bobChatImage).toBeVisible();
	      await bobChatImage.click();
	      await expect(bob.locator("[data-wtf-live-lightbox]")).toBeVisible();
	      await bob.locator("[data-wtf-live-popout-close]").first().click();
	      await expect(bob.locator("[data-wtf-live-lightbox]")).toHaveCount(0);
      expect(fatalErrors(errors)).toEqual([]);
    } finally {
      await aliceContext.close();
      await bobContext.close();
    }
  });

  test("public room exposes leave and close window controls", async ({
    page,
    request,
  }) => {
    await setAnonymous(request);
    const errors = [];
    capturePageErrors(page, errors, "public-room-exit");

    await page.goto("/live/r/wtf-live", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      window.__wtfLiveCloseCalled = false;
      window.close = () => {
        window.__wtfLiveCloseCalled = true;
      };
    });

    await expect(page.getByRole("button", { name: "Leave Room" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close Window" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Leave Room" })).toBeDisabled();

    await page.getByPlaceholder("Display name").fill("Exit Alice");
    await page.getByRole("button", { name: "Join Room" }).click();
    await expect(page.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Leave Room" })).toBeEnabled();

    await page.getByRole("button", { name: "Leave Room" }).click();
    await expect(page.getByRole("button", { name: "Join Room" })).toBeEnabled();
    await expect(page.locator("[data-wtf-live-chat-text]")).toBeDisabled();
    await expect(page.getByText("Left room.")).toBeVisible();

    await page.getByRole("button", { name: "Close Window" }).click();
    await expect
      .poll(() => page.evaluate(() => Boolean(window.__wtfLiveCloseCalled)))
      .toBeTruthy();
    await expect(page.getByText("Browser blocked auto-close")).toBeVisible();
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("public room keeps chat reachable when many guests join without media", async ({
    browser,
    request,
  }) => {
    await setAnonymous(request);
    const contexts = [];
    const errors = [];

    async function joinGuest(displayName) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      contexts.push(context);
      const page = await context.newPage();
      capturePageErrors(page, errors, displayName);
      await page.goto("/live/r/wtf-live", { waitUntil: "domcontentloaded" });
      await page.getByPlaceholder("Display name").fill(displayName);
      await page.getByRole("button", { name: "Join Room" }).click();
      await expect(page.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });
      return page;
    }

	    try {
	      const alice = await joinGuest("Layout Alice");
	      const guestNames = Array.from({ length: 7 }, (_, index) => `Layout Guest ${index + 1}`);
	      await Promise.all(guestNames.map((guestName) => joinGuest(guestName)));
	      await alice.locator("[data-wtf-live-attendance-toggle]").click();

	      for (const guestName of guestNames) {
	        await expect(
          alice.locator("[data-wtf-live-attendee]").filter({ hasText: guestName }),
        ).toBeVisible({ timeout: 10_000 });
      }
      await expect(alice.locator("[data-wtf-live-stage-peer]")).toHaveCount(0);
      await expect(alice.locator("video[data-wtf-live-remote-video]")).toHaveCount(0);

      const stageMetrics = await alice.locator("[data-wtf-live-stage-grid]").evaluate((node) => ({
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
      }));
      expect(stageMetrics.clientHeight).toBeGreaterThan(0);
      expect(stageMetrics.scrollHeight).toBeGreaterThanOrEqual(stageMetrics.clientHeight);

	      const layoutMetrics = await alice.evaluate(() => {
	        const stage = document.querySelector("[data-wtf-live-stage-area]")?.getBoundingClientRect();
	        const rail = document.querySelector("[data-wtf-live-control-rail]")?.getBoundingClientRect();
	        const attendance = document.querySelector("[data-wtf-live-bento-tile='attendance']")?.getBoundingClientRect();
	        const chat = document.querySelector("[data-wtf-live-bento-tile='chat']")?.getBoundingClientRect();
	        const workspace = document.querySelector("[data-wtf-live-bento-workspace]")?.getBoundingClientRect();
	        return stage && rail && attendance && chat && workspace
	          ? {
	              stageWidth: stage.width,
	              railWidth: rail.width,
	              attendanceWidth: attendance.width,
	              chatWidth: chat.width,
	              workspaceWidth: workspace.width,
	              chatX: chat.x,
	              railX: rail.x,
	              stageX: stage.x,
	            }
	          : null;
	      });
	      expect(layoutMetrics).not.toBeNull();
	      expect(layoutMetrics.stageWidth).toBeGreaterThan(layoutMetrics.attendanceWidth * 1.2);
	      expect(layoutMetrics.stageWidth).toBeGreaterThan(layoutMetrics.railWidth * 1.2);
	      expect(layoutMetrics.chatWidth).toBeGreaterThan(180);
	      expect(layoutMetrics.railX).toBeLessThan(layoutMetrics.stageX);
	      expect(layoutMetrics.chatX).toBeGreaterThan(layoutMetrics.stageX);

      const composerBox = await alice.locator("[data-wtf-live-chat-composer]").evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          viewportHeight: window.innerHeight,
        };
      });
      expect(composerBox.height).toBeGreaterThan(0);
      expect(composerBox.top).toBeGreaterThanOrEqual(0);
      expect(composerBox.bottom).toBeLessThanOrEqual(composerBox.viewportHeight);

      await alice.locator("[data-wtf-live-chat-text]").fill("chat stays reachable in a crowded idle room");
      await alice.locator("[data-wtf-live-chat-send]").click();
      await expect(
        alice.locator("[data-wtf-live-chat-log]").getByText("chat stays reachable in a crowded idle room"),
      ).toBeVisible();
      expect(fatalErrors(errors)).toEqual([]);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
