import { expect, test } from "@playwright/test";

async function setPlayer(request, overrides = {}) {
  const response = await request.post("/__test/state", {
    data: {
      userRole: "contestant",
      userId: 77,
      username: "watch-history-player",
      welcomePending: true,
      hasSeenIntroVideo: false,
      ...overrides,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function watchedVideos(request) {
  const response = await request.get("/api/profile/watched-videos");
  expect(response.ok()).toBeTruthy();
  return (await response.json()).videos;
}

async function finishVideo(video) {
  await video.evaluate((player) => player.load());
  await expect.poll(() => video.evaluate((player) =>
    player.readyState >= 1 && Number.isFinite(player.duration) && player.duration > 0
  )).toBe(true);
  await video.evaluate(async (player) => {
    player.muted = true;
    await player.play();
    player.currentTime = Math.max(0, player.duration - 0.15);
  });
  await expect.poll(() => video.evaluate((player) => player.ended)).toBe(true);
}

async function logIn(page, username) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("harness-password");
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

async function trackBootAppearances(page) {
  await page.evaluate(() => {
    window.__wtfosBootSeen = Boolean(document.querySelector('[data-wtfos-boot="true"]'));
    const observer = new MutationObserver(() => {
      if (document.querySelector('[data-wtfos-boot="true"]')) window.__wtfosBootSeen = true;
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

test.describe("interaction inventory - watched video history", () => {
  test("previewing or skipping Paul's intro does not mark it watched, so it returns at login", async ({ page, request }) => {
    await setPlayer(request);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const welcome = page.getByRole("dialog");
    await expect(welcome.getByLabel("paulwhoisaclippy's welcome and wtfOS navigation video")).toBeVisible();
    expect(await watchedVideos(request)).toEqual([]);

    await welcome.getByRole("button", { name: "Skip and enter desktop" }).click();
    await expect(welcome).toHaveCount(0);
    expect(await watchedVideos(request)).toEqual([]);
    const oldWelcomeState = await (await request.get("/api/auth/user")).json();
    expect(oldWelcomeState.welcomedToWtfOs).toBe(true);
    expect(oldWelcomeState.hasSeenIntroVideo).toBe(false);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await request.post("/api/auth/logout");
    await logIn(page, "watch-history-player");
    await expect(page.getByRole("dialog").getByLabel("paulwhoisaclippy's welcome and wtfOS navigation video"))
      .toBeVisible();
    await expect(page.locator('[data-wtfos-boot="true"]')).toHaveCount(0);
  });

  test("finishing the intro records one account completion and boots after the next login", async ({ page, request }) => {
    await setPlayer(request, { userId: 78, username: "intro-completer" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const welcome = page.getByRole("dialog");
    await finishVideo(welcome.getByLabel("paulwhoisaclippy's welcome and wtfOS navigation video"));
    await expect.poll(async () => (await watchedVideos(request)).map((item) => item.videoId))
      .toContain("paul/intro");
    const firstRecord = (await watchedVideos(request))[0];
    expect(firstRecord.title).toContain("wtfOS");

    await welcome.getByRole("button", { name: "Skip and enter desktop" }).click();
    await request.post("/api/auth/logout");
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await trackBootAppearances(page);
    await page.getByLabel("Username").fill("intro-completer");
    await page.getByLabel("Password").fill("harness-password");
    await page.getByRole("button", { name: "Log In", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await expect.poll(() => page.evaluate(() => window.__wtfosBootSeen)).toBe(true);
    const enter = page.getByRole("button", { name: "Enter desktop now" });
    if (await enter.isVisible()) await enter.click();
    await expect(page.locator('[data-wtfos-boot="true"]')).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-profile-section="watched-videos"]'))
      .toContainText(firstRecord.title);
    await expect(page.locator('[data-watched-video-id="paul/intro"]')).toHaveCount(1);
    const replay = await request.post("/api/profile/watched-videos", { data: { videoId: "paul/intro" } });
    expect(replay.ok()).toBe(true);
    expect((await replay.json()).watchedAt).toBe(firstRecord.watchedAt);
    expect((await watchedVideos(request)).filter((item) => item.videoId === "paul/intro"))
      .toHaveLength(1);
  });

  test("Paul and Tommy completions reach My Profile, while partial play does not", async ({ page, request }) => {
    await setPlayer(request, {
      userId: 79,
      username: "lesson-player",
      welcomePending: false,
      hasSeenIntroVideo: true,
    });
    await page.goto("/faq", { waitUntil: "domcontentloaded" });
    const paul = page.locator('[data-paul-tutorial-series="true"]');
    await paul.locator('[data-paul-tutorial-card="mission-control"]').click();
    const paulVideo = paul.locator('[data-paul-tutorial-player="mission-control"]');
    await paulVideo.evaluate((player) => player.load());
    await expect.poll(() => paulVideo.evaluate((player) => player.readyState >= 1)).toBe(true);
    await paulVideo.evaluate(async (player) => {
      player.muted = true;
      await player.play();
      player.pause();
    });
    expect(await watchedVideos(request)).toEqual([]);
    await finishVideo(paulVideo);
    await expect.poll(async () => (await watchedVideos(request)).map((item) => item.videoId))
      .toContain("paul/mission-control");

    await page.getByRole("button", { name: "Watch Find and open wtfOS tools" }).click();
    const tommyVideo = page.locator('[data-faq-tutorial-viewer="true"] video');
    // The private Tommy stream is not served by the offline harness; exercise its completion handler.
    await tommyVideo.evaluate((player) => player.dispatchEvent(new Event("ended", { bubbles: true })));
    await expect.poll(async () => (await watchedVideos(request)).map((item) => item.videoId))
      .toContain("tommy/find-and-open-tools");

    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    const history = page.locator('[data-profile-section="watched-videos"]');
    await expect(history.locator('[data-watched-video-id="paul/mission-control"]')).toHaveCount(1);
    await expect(history.locator('[data-watched-video-id="tommy/find-and-open-tools"]')).toHaveCount(1);
    const unknown = await request.post("/api/profile/watched-videos", { data: { videoId: "paul/unknown" } });
    expect(unknown.status()).toBe(400);
  });

  test("history is per account and a video roster requires user-management permission", async ({ page, request }) => {
    await setPlayer(request, {
      userId: 80,
      username: "alice-viewer",
      welcomePending: false,
      hasSeenIntroVideo: true,
    });
    expect((await request.post("/api/profile/watched-videos", {
      data: { videoId: "paul/desktop-basics" },
    })).ok()).toBe(true);
    expect((await watchedVideos(request)).map((item) => item.videoId)).toEqual(["paul/desktop-basics"]);
    const rosterPath = "/api/admin/video-watch-roster?videoId=paul%2Fdesktop-basics";
    expect((await request.get(rosterPath)).status()).toBe(403);

    await setPlayer(request, {
      userId: 81,
      username: "bob-viewer",
      welcomePending: false,
      hasSeenIntroVideo: true,
      preserveVideoWatchHistory: true,
    });
    expect(await watchedVideos(request)).toEqual([]);
    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-profile-section="watched-videos"]'))
      .toContainText("You have not finished a guide video yet.");
    expect((await request.get(rosterPath)).status()).toBe(403);

    await setPlayer(request, {
      userRole: "anonymous",
      preserveVideoWatchHistory: true,
    });
    expect((await request.get("/api/profile/watched-videos")).status()).toBe(401);
    expect((await request.post("/api/profile/watched-videos", { data: { videoId: "paul/intro" } })).status())
      .toBe(401);
    expect((await request.get(rosterPath)).status()).toBe(401);

    await setPlayer(request, {
      userRole: "cohost",
      userId: 84,
      username: "roster-manager",
      manageUsersPermission: true,
      preserveVideoWatchHistory: true,
      welcomePending: false,
      hasSeenIntroVideo: true,
    });
    expect((await request.get(rosterPath)).ok()).toBe(true);

    await setPlayer(request, {
      userRole: "admin",
      userId: 1,
      username: "roster-admin",
      preserveVideoWatchHistory: true,
      welcomePending: false,
      hasSeenIntroVideo: true,
    });
    const rosterResponse = await request.get(rosterPath);
    expect(rosterResponse.ok()).toBe(true);
    expect(await rosterResponse.json()).toMatchObject({
      videoId: "paul/desktop-basics",
      viewers: [{ userId: 80, username: "alice-viewer" }],
    });
  });

  test("a GitHub login handoff boots once and clears its return marker", async ({ page, request }) => {
    await setPlayer(request, {
      userId: 82,
      username: "github-returner",
      welcomePending: false,
      hasSeenIntroVideo: true,
    });
    await page.addInitScript(() => {
      window.__wtfosBootSeen = false;
      const observe = () => {
        const observer = new MutationObserver(() => {
          if (document.querySelector('[data-wtfos-boot="true"]')) window.__wtfosBootSeen = true;
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
      };
      if (document.documentElement) observe();
      else document.addEventListener("DOMContentLoaded", observe, { once: true });
    });
    await page.goto("/dashboard?wtfosLogin=github", { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.evaluate(() => window.__wtfosBootSeen)).toBe(true);
    await expect(page).not.toHaveURL(/wtfosLogin=/);
    await expect(page.locator('[data-wtfos-boot="true"]')).toHaveCount(0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Open Stuffs menu" })).toBeVisible();
    expect(await page.evaluate(() => window.__wtfosBootSeen)).toBe(false);
  });

  test("reduced motion keeps the return boot easy to enter", async ({ page, request }) => {
    await setPlayer(request, {
      userId: 83,
      username: "reduced-motion-player",
      welcomePending: false,
      hasSeenIntroVideo: true,
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await request.post("/api/auth/logout");
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Username").fill("reduced-motion-player");
    await page.getByLabel("Password").fill("harness-password");
    await page.getByRole("button", { name: "Log In", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/");
    const boot = page.locator('[data-wtfos-boot="true"]');
    await expect(boot).toBeVisible();
    await expect(boot.getByRole("button", { name: "Enter desktop now" })).toBeVisible();
    expect(await boot.evaluate((element) => [...element.querySelectorAll("*")]
      .every((child) => getComputedStyle(child).animationName === "none"))).toBe(true);
    await boot.getByRole("button", { name: "Enter desktop now" }).click();
    await expect(boot).toHaveCount(0);
  });
});
