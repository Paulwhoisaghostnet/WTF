import { test, expect } from "@playwright/test";

async function setAdmin(request) {
  const res = await request.post("/__test/state", { data: { userRole: "admin" } });
  expect(res.ok()).toBeTruthy();
}

function fatalErrors(errors) {
  return errors.filter((error) => !/(favicon|ResizeObserver|WebGL|wallet|beacon|taquito)/i.test(error));
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
        getDisplayMedia: async () => makeVideoStream("screen"),
      },
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

  test("mobile room setup controls are first and desktop chat plus attendance pop out", async ({
    page,
    request,
  }) => {
    await setAdmin(request);
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

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Display name").fill("Panel Alice");
    await page.getByRole("button", { name: "Join Room" }).click();
    await expect(page.locator("[data-wtf-live-chat-text]")).toBeEnabled({ timeout: 10_000 });
    await page.locator("[data-wtf-live-attendance-toggle]").click();
    const before = await page.evaluate(() => {
      const stage = document.querySelector("[data-wtf-live-stage-area]")?.getBoundingClientRect();
      const sidebar = document.querySelector("[data-wtf-live-sidebar]")?.getBoundingClientRect();
      return stage && sidebar ? { stageWidth: stage.width, sidebarWidth: sidebar.width } : null;
    });
    expect(before).not.toBeNull();

    await page.locator("[data-wtf-live-popout-attendance]").click();
    await expect(page.locator("[data-wtf-live-panel-popout='attendance']")).toBeVisible();
    await expect(page.locator("[data-wtf-live-attendance-detached]")).toBeVisible();
    await page.locator("[data-wtf-live-popout-chat]").click();
    await expect(page.locator("[data-wtf-live-panel-popout='chat']")).toBeVisible();
    await expect(page.locator("[data-wtf-live-sidebar]")).toHaveCount(0);
    const after = await page.evaluate(() => {
      const stage = document.querySelector("[data-wtf-live-stage-area]")?.getBoundingClientRect();
      return stage ? { stageWidth: stage.width } : null;
    });
    expect(after).not.toBeNull();
    expect(after.stageWidth).toBeGreaterThan(before.stageWidth + before.sidebarWidth * 0.5);
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
    await stageCard.getByRole("button", { name: "Close Stage" }).click();
    await expect(page.getByText("My Stage is closed for stage broadcasts.")).toBeVisible();
    await expect(stageCard.getByRole("button", { name: "Reopen Stage" })).toBeVisible();
    await stageCard.getByRole("button", { name: "Reopen Stage" }).click();
    await expect(page.getByText("My Stage is open for stage broadcasts.")).toBeVisible();

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("Delete My Stage?");
      await dialog.accept();
    });
    await stageCard.getByRole("button", { name: "Delete Stage" }).click();
    await expect(page.getByText("My Stage deleted.")).toBeVisible();
    await expect(page.locator("[data-wtf-live-stage-card='my-stage']")).toHaveCount(0);
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("public room guests receive each other's media streams, keyboard chat, and room chat attachments", async ({
    browser,
    request,
  }) => {
    await setAdmin(request);
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
      const bobSeesAlice = bob.locator("[data-wtf-live-remote-peer]").filter({ hasText: "Alice" });
      await expect(bobSeesAlice).toBeVisible();
      await expect(bobSeesAlice).toHaveAttribute("data-wtf-live-remote-active-video", "camera");
      await expect(bobSeesAlice.getByText("Viewing camera", { exact: true })).toBeVisible();
	      const remoteVideo = bobSeesAlice.locator("video[data-wtf-live-remote-video]").first();
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
      await expect(bobSeesAlice).toHaveAttribute("data-wtf-live-remote-active-video", "screen");
      await expect(bobSeesAlice.getByText("Viewing screen", { exact: true })).toBeVisible();

      await alice.locator("[data-wtf-live-share-camera]").click();
      await expect(alice.locator("[data-wtf-live-active-share]")).toHaveAttribute("data-wtf-live-active-share", "camera");
      await expect(bobSeesAlice).toHaveAttribute("data-wtf-live-remote-active-video", "camera");

      await alice.locator("[data-wtf-live-share-screen]").click();
      await expect(alice.locator("[data-wtf-live-active-share]")).toHaveAttribute("data-wtf-live-active-share", "screen");
      await expect(bobSeesAlice).toHaveAttribute("data-wtf-live-remote-active-video", "screen");

      await alice.locator("[data-wtf-live-toggle-camera]").click();
      await expect(alice.locator("[data-wtf-live-active-share]")).toHaveAttribute("data-wtf-live-active-share", "screen");
      await expect(bobSeesAlice).toHaveAttribute("data-wtf-live-remote-active-video", "screen");
      await expect
        .poll(async () => remoteVideo.evaluate((video) => video.srcObject?.getVideoTracks().length ?? 0))
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
    await setAdmin(request);
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
    await setAdmin(request);
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
	      for (const guestName of guestNames) {
	        await joinGuest(guestName);
	      }
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
	        const sidebar = document.querySelector("[data-wtf-live-sidebar]")?.getBoundingClientRect();
	        const rail = document.querySelector("[data-wtf-live-control-rail]")?.getBoundingClientRect();
	        return stage && sidebar && rail
	          ? { stageWidth: stage.width, sidebarWidth: sidebar.width, railWidth: rail.width, sidebarX: sidebar.x, stageX: stage.x }
	          : null;
	      });
	      expect(layoutMetrics).not.toBeNull();
	      expect(layoutMetrics.stageWidth).toBeGreaterThan(layoutMetrics.sidebarWidth * 1.5);
	      expect(layoutMetrics.stageWidth).toBeGreaterThan(layoutMetrics.railWidth * 2.2);
	      expect(layoutMetrics.sidebarX).toBeGreaterThan(layoutMetrics.stageX);

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
