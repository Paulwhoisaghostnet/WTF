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

    const popupPromise = page.waitForEvent("popup");
    await officialRoom.getByRole("button", { name: "Join in New Tab" }).click();
    const roomPage = await popupPromise;
    await roomPage.waitForLoadState("domcontentloaded");

    expect(new URL(roomPage.url()).pathname).toBe("/live/r/wtf-live");
    await expect(page).toHaveURL(/\/live$/);
    await expect(page.getByText("Opened WTF LIVE in a new browser tab.")).toBeVisible();
    await roomPage.close();
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

  test("public room guests receive each other's media streams and room chat attachments", async ({
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

      const bobSeesAlice = bob.locator("[data-wtf-live-remote-peer]").filter({ hasText: "Alice" });
      const aliceSeesBob = alice.locator("[data-wtf-live-remote-peer]").filter({ hasText: "Bob" });
      await expect(bobSeesAlice).toBeVisible();
      await expect(aliceSeesBob).toBeVisible();

      await alice.getByRole("button", { name: /Camera/ }).click();
      await expect(bobSeesAlice.getByText("Camera", { exact: true })).toBeVisible();
      const remoteVideo = bobSeesAlice.locator("video[data-wtf-live-remote-video]").first();
      await expect(remoteVideo).toBeVisible();
      await expect
        .poll(async () => remoteVideo.evaluate((video) => video.srcObject?.getVideoTracks().length ?? 0))
        .toBeGreaterThan(0);

      await alice.locator("[data-wtf-live-chat-file]").setInputFiles({
        name: "tiny.gif",
        mimeType: "image/gif",
        buffer: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64"),
      });
      await alice.locator("[data-wtf-live-chat-text]").fill("hello Bob, media is live");
      await alice.locator("[data-wtf-live-chat-send]").click();

      const bobChatLog = bob.locator("[data-wtf-live-chat-log]");
      await expect(bobChatLog.getByText("hello Bob, media is live")).toBeVisible();
      await expect(bobChatLog.getByText(/tiny\.gif/)).toBeVisible();
      await expect(bobChatLog.locator("img[alt='tiny.gif']")).toBeVisible();
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

      for (const guestName of guestNames) {
        await expect(
          alice.locator("[data-wtf-live-remote-peer]").filter({ hasText: guestName }),
        ).toBeVisible({ timeout: 10_000 });
      }
      await expect(alice.locator("video[data-wtf-live-remote-video]")).toHaveCount(0);

      const remoteGridMetrics = await alice.locator("[data-wtf-live-remote-grid]").evaluate((node) => ({
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
      }));
      expect(remoteGridMetrics.clientHeight).toBeGreaterThan(0);
      expect(remoteGridMetrics.scrollHeight).toBeGreaterThanOrEqual(remoteGridMetrics.clientHeight);

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
