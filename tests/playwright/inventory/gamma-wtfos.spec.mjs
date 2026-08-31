import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, expect, test } from "@playwright/test";

async function setHarnessState(request, state = {}) {
  const role = String(state.userRole || state.role || "admin");
  const data = {
    ...(role !== "anonymous" && !Object.prototype.hasOwnProperty.call(state, "ownedAppPasses")
      ? { ownedAppPasses: "all" }
      : {}),
    ...state,
  };
  const res = await request.post("/__test/state", { data });
  expect(res.ok()).toBeTruthy();
}

async function expectGammaRouteReady(page, routePath) {
  await expect(page.locator("[data-gamma-wtfos]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", routePath, {
    timeout: 30_000,
  });
  await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  await expect(page.locator("[data-gamma-route-loading]")).toHaveCount(0, { timeout: 30_000 });
}

async function gotoGammaRoute(page, urlPath, routePath = urlPath) {
  await page.goto(`/gamma${urlPath}`, { waitUntil: "domcontentloaded" });
  await expectGammaRouteReady(page, routePath);
}

const gammaSourcePath = path.resolve(process.cwd(), "client/src/pages/GammaWtfos.tsx");

test.describe("interaction inventory - WTFOS gamma arcade OS shell", () => {
  test("keeps the source-level visual contract tight", async () => {
    const source = readFileSync(gammaSourcePath, "utf8");
    const colors = new Set(source.match(/#[0-9a-fA-F]{6}\b/g) || []);
    expect([...colors].sort()).toEqual(["#00d2ff", "#070706", "#11110f", "#d6ff3f", "#f2ead9"]);
    expect(source.match(/linear-gradient\(/g) || []).toHaveLength(0);
    expect(source).not.toMatch(/\bfilter\s*:/i);
    expect(source).not.toMatch(/\bblur\(/i);
    expect(source).not.toMatch(/\bbox-shadow\s*:/i);
    expect(source).not.toMatch(/\bkeyframes\b/i);
    expect(source).not.toMatch(/purple|violet|magenta/i);
    expect(source).not.toMatch(/\bWhat do you do first\b/i);
    expect(source).not.toMatch(/\bwhat to do next\b/i);
    expect(source).not.toMatch(/\bcomplete something now\b/i);
  });

  test("renders an inhabited app arcade with communication in the floor plan", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "anonymous" });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });

    const shell = page.locator("[data-gamma-wtfos]");
    await expect(shell).toBeVisible();
    await expect(shell).toHaveAttribute("data-color-budget", "5");
    await expect(shell).toHaveAttribute("data-gradient-budget", "0");
    await expect(shell).toHaveAttribute("data-hard-lines", "thin-operational");
    await expect(shell).toHaveAttribute("data-radius-max", "6");
    await expect(shell).toContainText("Make art. Publish it.");
    await expect(shell).toContainText("Tezos arcade operating floor");
    await expect(shell).not.toContainText("First-Minute Wayfinder");
    await expect(shell).not.toContainText("DISCOVERY_REPORT");
    const bootAccount = page.locator("[data-gamma-boot-account]");
    await expect(bootAccount).toBeVisible();
    await expect(bootAccount).toHaveAttribute("data-gamma-boot-account-state", "guest");
    await expect(bootAccount).toHaveAttribute("data-gamma-boot-resume-target", "/dashboard");
    await expect(bootAccount).toHaveAttribute("data-gamma-launch", "/login?return=%2Fdashboard");
    await expect(bootAccount).toContainText("Guest");
    await expect(bootAccount).toContainText("Dashboard");
    await expect(page.locator("[data-gamma-session-checklist]")).toBeVisible();
    await expect(page.locator("[data-gamma-session-check]")).toHaveCount(3);
    await expect(page.locator('[data-gamma-session-check="apps"]')).toHaveAttribute("data-gamma-launch", "/wtfiam?category=apps");
    await expect(page.locator('[data-gamma-session-check="daily"]')).toHaveAttribute("data-gamma-launch", "/side-quests");
    await expect(page.locator('[data-gamma-session-check="people"]')).toHaveAttribute("data-gamma-launch", "/w");
    await expect(page.locator("[data-gamma-session-console]")).toBeVisible();
    await expect(page.locator("[data-gamma-session-console]")).toHaveAttribute(
      "data-gamma-session-console-state",
      "guest"
    );
    const sessionMount = page.locator("[data-gamma-session-mount]");
    await expect(sessionMount).toBeVisible();
    await expect(sessionMount).toHaveAttribute("data-gamma-session-mount-state", "locked");
    await expect(sessionMount).toHaveAttribute("data-gamma-session-mount-workspace", "/dashboard");
    await expect(sessionMount.locator("[data-gamma-session-mount-row]")).toHaveCount(4);
    await expect(sessionMount.locator('[data-gamma-session-mount-row="account"]')).toHaveAttribute(
      "data-gamma-launch",
      "/login?return=%2Fdashboard"
    );
    await expect(sessionMount.locator('[data-gamma-session-mount-row="workspace"]')).toHaveAttribute(
      "data-gamma-launch",
      "/login?return=%2Fdashboard"
    );
    await expect(sessionMount.locator('[data-gamma-session-mount-row="apps"]')).toHaveAttribute(
      "data-gamma-launch",
      "/wtfiam?category=apps"
    );
    await expect(sessionMount.locator('[data-gamma-session-mount-row="shell"]')).toHaveAttribute(
      "data-gamma-launch",
      "/"
    );
    await expect(page.locator("[data-gamma-session-shortcut]")).toHaveCount(4);
    await expect(page.locator("[data-gamma-session-resume-action]")).toHaveCount(3);
    await expect(page.locator("[data-gamma-daily-return]")).toBeVisible();
    await expect(page.locator("[data-gamma-daily-return]")).toContainText("Return for a small proof");
    await expect(page.locator("[data-gamma-daily-action]")).toHaveCount(4);
    await expect(page.locator('[data-gamma-daily-action="sidequests"]')).toHaveAttribute("data-gamma-launch", "/side-quests");
    await expect(page.locator('[data-gamma-daily-action="challenges"]')).toHaveAttribute("data-gamma-launch", "/challenges");
    await expect(page.locator('[data-gamma-daily-action="people"]')).toHaveAttribute("data-gamma-launch", "/w");
    await expect(page.locator('[data-gamma-daily-action="notifications"]')).toHaveAttribute("data-gamma-launch", "/notifications");

    const typography = await page.evaluate(() => {
      const shellNode = document.querySelector("[data-gamma-wtfos]");
      const headline = document.querySelector("[data-gamma-copy] h1");
      const wordmark = document.querySelector("[data-gamma-wordmark]");
      return {
        shell: shellNode ? window.getComputedStyle(shellNode).fontFamily : "",
        headline: headline ? window.getComputedStyle(headline).fontFamily : "",
        wordmark: wordmark ? window.getComputedStyle(wordmark).fontFamily : "",
      };
    });
    expect(typography.shell).toMatch(/Inter|sans-serif/i);
    expect(typography.headline).toMatch(/Inter|sans-serif/i);
    expect(typography.wordmark).not.toBe(typography.headline);

    await expect(page.locator("[data-gamma-peer]")).toHaveCount(5);
    await expect(page.locator("[data-gamma-live-summary]")).toContainText("visible people");
    await expect(page.locator("[data-gamma-comms-action]")).toHaveCount(5);
    await expect(page.locator("[data-gamma-cabinet]")).toHaveCount(15);
    await expect(page.locator("[data-gamma-buried-progression]")).toContainText("XP rings");
    await expect(page.locator("[data-gamma-buried-progression]")).toContainText("Witness / Make / Relay / Host");

    for (const route of [
      "/gallery",
      "/studio",
      "/tools/broot",
      "/tools/macaroni",
      "/ipfs-pinning",
      "/arcade",
      "/marketplace",
      "/leaderboard",
      "/w",
      "/wim",
      "/live/r/wtf-live",
      "/skywire?standalone=1",
      "/admin",
    ]) {
      await expect(page.locator(`[data-gamma-launch="${route}"]`).first()).toBeVisible();
    }

    const borderMetrics = await page.locator("[data-gamma-wtfos] *").evaluateAll((nodes) => {
      const borderedNodes = nodes.filter((node) => {
        const style = window.getComputedStyle(node);
        return [
          style.borderTopWidth,
          style.borderRightWidth,
          style.borderBottomWidth,
          style.borderLeftWidth,
        ].some((value) => Number.parseFloat(value || "0") > 0);
      });
      const maxBorderWidth = Math.max(
        0,
        ...nodes.flatMap((node) => {
          const style = window.getComputedStyle(node);
          return [
            style.borderTopWidth,
            style.borderRightWidth,
            style.borderBottomWidth,
            style.borderLeftWidth,
          ].map((value) => Number.parseFloat(value || "0"));
        })
      );
      const maxRadius = Math.max(
        0,
        ...nodes.flatMap((node) => {
          const style = window.getComputedStyle(node);
          return [
            style.borderTopLeftRadius,
            style.borderTopRightRadius,
            style.borderBottomRightRadius,
            style.borderBottomLeftRadius,
          ].map((value) => Number.parseFloat(value || "0"));
        })
      );
      return { borderedCount: borderedNodes.length, maxBorderWidth, maxRadius };
    });
    expect(borderMetrics.borderedCount).toBeGreaterThan(0);
    expect(borderMetrics.maxBorderWidth).toBeLessThanOrEqual(1);
    expect(borderMetrics.maxRadius).toBeLessThanOrEqual(6);

    const stationMetrics = await page.locator("[data-gamma-cabinet]").evaluateAll((stations) =>
      stations.slice(0, 4).map((station) => {
        const style = window.getComputedStyle(station);
        return {
          display: style.display,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          height: station.getBoundingClientRect().height,
        };
      })
    );
    expect(stationMetrics).toHaveLength(4);
    expect(stationMetrics.every((station) => station.display === "grid")).toBe(true);
    expect(stationMetrics.every((station) => station.borderWidth > 0)).toBe(true);
    expect(stationMetrics.every((station) => station.radius <= 6)).toBe(true);
    expect(stationMetrics.every((station) => station.height >= 100)).toBe(true);
  });

  test("routes the Gamma boot account tile like an OS login tile", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "anonymous" });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });

    const guestAccount = page.locator("[data-gamma-boot-account]");
    await expect(guestAccount).toHaveAttribute("data-gamma-boot-account-state", "guest");
    await expect(guestAccount).toHaveAttribute("data-gamma-launch", "/login?return=%2Fdashboard");
    await expect(guestAccount).toHaveAttribute("data-gamma-boot-resume-target", "/dashboard");
    await guestAccount.click();
    await expect(page).toHaveURL(/\/gamma\/login\?return=%2Fdashboard$/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-account",
      displayName: "Gamma Account",
    });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    const signedInAccount = page.locator("[data-gamma-boot-account]");
    await expect(signedInAccount).toHaveAttribute("data-gamma-boot-account-state", "signed-in");
    await expect(signedInAccount).toHaveAttribute("data-gamma-launch", "/user/gamma-account");
    await expect(signedInAccount).toHaveAttribute("data-gamma-boot-resume-target", "/dashboard");
    await expect(signedInAccount).toContainText("@gamma-account");
    await signedInAccount.click();
    await expect(page).toHaveURL(/\/gamma\/user\/gamma-account$/);
    await expectGammaRouteReady(page, "/user/gamma-account");
  });

  test("renders a signed-in OS session console with route-preserving shortcuts", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-home",
      displayName: "Gamma Home",
    });
    await page.addInitScript(() => window.localStorage.removeItem("wtfos.gamma.recentRoutes"));
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });

    const consoleSurface = page.locator("[data-gamma-session-console]");
    await expect(consoleSurface).toBeVisible();
    await expect(consoleSurface).toHaveAttribute("data-gamma-session-console-state", "signed-in");
    await expect(consoleSurface.locator("[data-gamma-session-console-identity]")).toContainText("@gamma-home");
    const sessionMount = consoleSurface.locator("[data-gamma-session-mount]");
    await expect(sessionMount).toBeVisible();
    await expect(sessionMount).toHaveAttribute("data-gamma-session-mount-state", "mounted");
    await expect(sessionMount).toHaveAttribute("data-gamma-session-mount-workspace", "/dashboard");
    await expect(sessionMount.locator("[data-gamma-session-mount-row]")).toHaveCount(4);
    await expect(sessionMount.locator('[data-gamma-session-mount-row="account"]')).toHaveAttribute(
      "data-gamma-launch",
      "/user/gamma-home"
    );
    await expect(sessionMount.locator('[data-gamma-session-mount-row="workspace"]')).toHaveAttribute(
      "data-gamma-launch",
      "/dashboard"
    );
    await expect(sessionMount.locator('[data-gamma-session-mount-row="workspace"]')).toContainText("Dashboard");
    await expect(sessionMount.locator('[data-gamma-session-mount-row="shell"]')).toContainText("Gamma");
    await expect(consoleSurface.locator("[data-gamma-session-shortcut]")).toHaveCount(4);
    await expect(consoleSurface.locator('[data-gamma-session-shortcut="home"]')).toHaveAttribute(
      "data-gamma-launch",
      "/dashboard"
    );
    await expect(consoleSurface.locator('[data-gamma-session-shortcut="inbox"]')).toHaveAttribute(
      "data-gamma-launch",
      "/messages"
    );
    await expect(consoleSurface.locator('[data-gamma-session-shortcut="apps"]')).toHaveAttribute(
      "data-gamma-launch",
      "/wtfiam?category=apps"
    );
    await expect(consoleSurface.locator('[data-gamma-session-shortcut="settings"]')).toHaveAttribute(
      "data-gamma-launch",
      "/settings"
    );
    await expect(consoleSurface.locator('[data-gamma-session-resume-action="daily"]')).toHaveAttribute(
      "data-gamma-launch",
      "/side-quests"
    );
    await expect(consoleSurface.locator('[data-gamma-session-resume-action="people"]')).toHaveAttribute(
      "data-gamma-launch",
      "/w"
    );
    await expect(consoleSurface.locator('[data-gamma-session-resume-action="gallery"]')).toHaveAttribute(
      "data-gamma-launch",
      "/gallery"
    );

    await consoleSurface.locator('[data-gamma-session-shortcut="settings"]').click();
    await expect(page).toHaveURL(/\/gamma\/settings$/);
    await expectGammaRouteReady(page, "/settings");

    await page.evaluate(() => window.localStorage.removeItem("wtfos.gamma.recentRoutes"));
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await page.locator('[data-gamma-session-resume-action="people"]').click();
    await expect(page).toHaveURL(/\/gamma\/w$/);
    await expectGammaRouteReady(page, "/w");
  });

  test("prioritizes a Gamma wake queue from recent route, inbox, daily, people, and apps", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-wake",
      displayName: "Gamma Wake",
    });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.localStorage.removeItem("wtfos.gamma.recentRoutes"));
    await gotoGammaRoute(page, "/gallery");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("wtfos.gamma.recentRoutes")))
      .toContain("/gallery");
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });

    const wakeQueue = page.locator("[data-gamma-wake-queue]");
    await expect(wakeQueue).toBeVisible();
    await expect(wakeQueue).toHaveAttribute("data-gamma-wake-state", "signed-in");
    await expect(wakeQueue.locator("[data-gamma-wake-action]")).toHaveCount(5);
    await expect(wakeQueue.locator('[data-gamma-wake-action="resume"]')).toHaveAttribute(
      "data-gamma-wake-rank",
      "1"
    );
    await expect(wakeQueue.locator('[data-gamma-wake-action="resume"]')).toHaveAttribute(
      "data-gamma-launch",
      "/gallery"
    );
    await expect(wakeQueue.locator('[data-gamma-wake-action="inbox"]')).toHaveAttribute(
      "data-gamma-launch",
      "/messages"
    );
    await expect(wakeQueue.locator('[data-gamma-wake-action="daily"]')).toHaveAttribute(
      "data-gamma-launch",
      "/side-quests"
    );
    await expect(wakeQueue.locator('[data-gamma-wake-action="people"]')).toHaveAttribute(
      "data-gamma-launch",
      "/w"
    );
    await expect(wakeQueue.locator('[data-gamma-wake-action="apps"]')).toHaveAttribute(
      "data-gamma-launch",
      "/wtfiam?category=apps"
    );

    await wakeQueue.locator('[data-gamma-wake-action="daily"]').click();
    await expect(page).toHaveURL(/\/gamma\/side-quests$/);
    await expectGammaRouteReady(page, "/side-quests");
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await page.locator('[data-gamma-wake-action="people"]').click();
    await expect(page).toHaveURL(/\/gamma\/w$/);
    await expectGammaRouteReady(page, "/w");
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await page.locator('[data-gamma-wake-action="apps"]').click();
    await expect(page).toHaveURL(/\/gamma\/wtfiam\?category=apps$/);
    await expectGammaRouteReady(page, "/wtfiam");
  });

  test("keeps a persistent system tray on Gamma home and app routes", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-tray",
      displayName: "Gamma Tray",
    });
    await page.setViewportSize({ width: 390, height: 760 });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });

    const tray = page.locator("[data-gamma-system-tray]");
    await expect(tray).toBeVisible();
    await expect(tray).toHaveAttribute("data-gamma-system-state", "online");
    await expect(tray.locator("[data-gamma-tray-status='online']")).toContainText("Gamma session online");
    await expect(tray.locator("[data-gamma-tray-action]")).toHaveCount(7);
    await expect(tray.locator('[data-gamma-tray-action="session"]')).toHaveAttribute(
      "data-gamma-launch",
      "/user/gamma-tray"
    );
    const clock = tray.locator('[data-gamma-tray-action="clock"]');
    await expect(clock).toHaveAttribute("data-gamma-launch", "/calendar");
    await expect(clock).toHaveAttribute("data-gamma-system-clock", "tray");
    const clockSnapshot = await clock.evaluate((button) => ({
      iso: button.getAttribute("data-gamma-clock-iso") || "",
      time: button.getAttribute("data-gamma-clock-time") || "",
      date: button.getAttribute("data-gamma-clock-date") || "",
    }));
    expect(clockSnapshot.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(clockSnapshot.time.length).toBeGreaterThan(0);
    expect(clockSnapshot.date.length).toBeGreaterThan(0);
    await expect(tray.locator('[data-gamma-tray-action="network"]')).toHaveAttribute(
      "data-gamma-launch",
      "/settings"
    );
    await expect(tray.locator('[data-gamma-tray-action="network"]')).toHaveAttribute("data-gamma-live", "true");
    await expect(tray.locator('[data-gamma-tray-action="network"]')).toContainText("Online");
    const signals = tray.locator('[data-gamma-tray-action="signals"]');
    await expect(signals).toHaveAttribute("data-gamma-launch", "/notifications");
    await expect(signals).toHaveAttribute("data-gamma-tray-action-state", "unread");
    await expect(signals).toHaveAttribute("data-gamma-tray-unread-count", "1");
    await expect(signals).toHaveAttribute("data-gamma-live", "true");
    await expect(signals).toContainText("1 unread");
    await expect(tray.locator('[data-gamma-tray-action="daily"]')).toHaveAttribute(
      "data-gamma-launch",
      "/side-quests"
    );
    await expect(tray.locator('[data-gamma-tray-action="apps"]')).toHaveAttribute(
      "data-gamma-launch",
      "/wtfiam?category=apps"
    );
    await expect(tray.locator('[data-gamma-tray-action="people"]')).toHaveAttribute(
      "data-gamma-launch",
      "/w"
    );
    const powerMenu = page.locator("[data-gamma-power-menu]");
    await expect(powerMenu).toBeVisible();
    await expect(powerMenu).toHaveAttribute("data-gamma-power-state", "signed-in");
    await expect(powerMenu.locator("[data-gamma-power-action]")).toHaveCount(4);
    await expect(powerMenu.locator('[data-gamma-power-action="desk"]')).toHaveAttribute(
      "data-gamma-launch",
      "/"
    );
    await expect(powerMenu.locator('[data-gamma-power-action="settings"]')).toHaveAttribute(
      "data-gamma-launch",
      "/settings"
    );
    await expect(powerMenu.locator('[data-gamma-power-action="lock"]')).toHaveAttribute(
      "data-gamma-launch",
      "/"
    );
    await expect(powerMenu.locator('[data-gamma-power-action="lock"]')).toHaveAttribute(
      "data-gamma-power-session",
      "retained"
    );
    await expect(powerMenu.locator('[data-gamma-power-action="signout"]')).toHaveAttribute(
      "data-gamma-launch",
      "/"
    );
    const trayTargetHeights = await tray.locator("[data-gamma-tray-action]").evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height)
    );
    expect(trayTargetHeights.every((height) => height >= 44)).toBe(true);
    const powerTargetHeights = await powerMenu.locator("button").evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height)
    );
    expect(powerTargetHeights.every((height) => height >= 44)).toBe(true);

    await clock.click();
    await expect(page).toHaveURL(/\/gamma\/calendar$/);
    await expectGammaRouteReady(page, "/calendar");
    await expect(page.locator("[data-gamma-system-tray]")).toBeVisible();

    await signals.click();
    await expect(page).toHaveURL(/\/gamma\/notifications$/);
    await expectGammaRouteReady(page, "/notifications");
    await expect(page.locator("[data-gamma-system-tray]")).toBeVisible();

    await page.locator('[data-gamma-tray-action="network"]').click();
    await expect(page).toHaveURL(/\/gamma\/settings$/);
    await expectGammaRouteReady(page, "/settings");

    await page.locator('[data-gamma-tray-action="daily"]').click();
    await expect(page).toHaveURL(/\/gamma\/side-quests$/);
    await expectGammaRouteReady(page, "/side-quests");

    await page.goto("/gamma/gallery", { waitUntil: "domcontentloaded" });
    await expectGammaRouteReady(page, "/gallery");
    await expect(page.locator("[data-gamma-system-tray]")).toBeVisible();
    await page.locator('[data-gamma-tray-action="apps"]').click();
    await expect(page).toHaveURL(/\/gamma\/wtfiam\?category=apps$/);
    await expectGammaRouteReady(page, "/wtfiam");
  });

  test("locks Gamma back to the desk without ending the signed-in session", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-lock",
      displayName: "Gamma Lock",
    });
    await gotoGammaRoute(page, "/settings");

    const powerMenu = page.locator("[data-gamma-power-menu]");
    await expect(powerMenu).toHaveAttribute("data-gamma-power-state", "signed-in");
    const lockAction = powerMenu.locator('[data-gamma-power-action="lock"]');
    await expect(lockAction).toHaveAttribute("data-gamma-power-session", "retained");
    await lockAction.click();
    await expect(page).toHaveURL(/\/gamma\/?$/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
    await expect(page.locator("[data-gamma-boot-desk]")).toHaveAttribute("data-gamma-session-state", "signed-in");
    await expect(page.locator("[data-gamma-boot-account]")).toContainText("@gamma-lock");
    await expect(page.locator("[data-gamma-power-menu]")).toHaveAttribute("data-gamma-power-state", "signed-in");

    await gotoGammaRoute(page, "/leaderboard");
    await expectGammaRouteReady(page, "/leaderboard");
    await page.keyboard.press("Control+Alt+L");
    await expect(page).toHaveURL(/\/gamma\/?$/);
    await expect(page.locator("[data-gamma-boot-desk]")).toHaveAttribute("data-gamma-session-state", "signed-in");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("signs out from Gamma session controls without leaving the shell", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-power",
      displayName: "Gamma Power",
    });
    await gotoGammaRoute(page, "/settings");

    const powerMenu = page.locator("[data-gamma-power-menu]");
    await expect(powerMenu).toBeVisible();
    await expect(powerMenu).toHaveAttribute("data-gamma-power-state", "signed-in");
    await powerMenu.locator('[data-gamma-power-action="signout"]').click();
    await expect(page).toHaveURL(/\/gamma\/?$/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
    await expect(page.locator("[data-gamma-boot-desk]")).toHaveAttribute("data-gamma-session-state", "guest");

    const guestPowerMenu = page.locator("[data-gamma-power-menu]");
    await expect(guestPowerMenu).toHaveAttribute("data-gamma-power-state", "guest");
    await expect(guestPowerMenu.locator('[data-gamma-power-action="login"]')).toHaveAttribute(
      "data-gamma-launch",
      "/login?return=%2Fdashboard"
    );
    await guestPowerMenu.locator('[data-gamma-power-action="login"]').click();
    await expect(page).toHaveURL(/\/gamma\/login\?return=%2Fdashboard$/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("surfaces degraded shared API status in the Gamma system tray with Settings recovery", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-degraded",
      displayName: "Gamma Degraded",
    });
    await page.route("**/api/leaderboard/rewards/exp**", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "xp unavailable" }),
      });
    });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });

    const tray = page.locator("[data-gamma-system-tray]");
    await expect(tray).toHaveAttribute("data-gamma-system-state", "degraded");
    await expect(tray.locator('[data-gamma-tray-status="degraded"]')).toContainText("Gamma session degraded");
    const network = tray.locator('[data-gamma-tray-action="network"]');
    await expect(network).toContainText("Degraded");
    await expect(network).toContainText("Settings");
    await expect(network).toHaveAttribute("data-gamma-live", "false");

    await network.click();
    await expect(page).toHaveURL(/\/gamma\/settings$/);
    await expectGammaRouteReady(page, "/settings");
  });

  test("launches known routes from Gamma command search before Gallery fallback", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-command",
      displayName: "Gamma Command",
    });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });

    const bootCommand = page.locator("[data-gamma-boot-command-search]");
    await expect(bootCommand).toBeVisible();
    await bootCommand.locator("input").fill("Broot");
    const bootBroot = bootCommand.locator('[data-gamma-command-route="/tools/broot"]').first();
    await expect(bootBroot).toBeVisible();
    await expect(bootBroot).toContainText("Broot");
    await expect(bootBroot).toHaveAttribute("data-gamma-command-locked", "false");
    await bootBroot.click();
    await expect(page).toHaveURL(/\/gamma\/tools\/broot$/);
    await expectGammaRouteReady(page, "/tools/broot");

    const routeCommand = page.locator("[data-gamma-route-command-search]");
    await expect(routeCommand).toBeVisible();
    await routeCommand.locator("input").fill("Settings");
    const settingsResult = routeCommand.locator('[data-gamma-command-route="/settings"]').first();
    await expect(settingsResult).toBeVisible();
    await expect(settingsResult).toContainText("Settings");
    await settingsResult.click();
    await expect(page).toHaveURL(/\/gamma\/settings$/);
    await expectGammaRouteReady(page, "/settings");

    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-boot-command-search]")).toBeVisible();
    await page.locator("[data-gamma-boot-command-search] input").fill("unmatched comet");
    const fallback = page
      .locator("[data-gamma-boot-command-search]")
      .locator('[data-gamma-command-result="gallery-search"]');
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText("Search Gallery");
    await fallback.click();
    await expect(page).toHaveURL(/\/gamma\/gallery\?search=unmatched(?:\+|%20)comet$/);
    await expectGammaRouteReady(page, "/gallery");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("focuses Gamma command search from the OS keyboard shortcut", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-keyboard",
      displayName: "Gamma Keyboard",
    });

    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    const bootInput = page.locator('[data-gamma-boot-command-search] input[data-gamma-command-input="true"]');
    await expect(bootInput).toBeVisible();
    await page.keyboard.press("Control+K");
    await expect(bootInput).toBeFocused();
    await page.keyboard.type("Broot");
    await expect(bootInput).toHaveValue("Broot");
    await expect(
      page.locator('[data-gamma-boot-command-search] [data-gamma-command-route="/tools/broot"]').first()
    ).toBeVisible();

    await page.goto("/gamma/gallery", { waitUntil: "domcontentloaded" });
    await expectGammaRouteReady(page, "/gallery");
    const routeInput = page.locator('[data-gamma-route-command-search] input[data-gamma-command-input="true"]');
    await page.locator("[data-gamma-taskbar-current-app]").click();
    await page.keyboard.press("Control+K");
    await expect(routeInput).toBeFocused();
    await page.keyboard.type("Settings");
    await expect(routeInput).toHaveValue("Settings");

    const settingsResult = page
      .locator("[data-gamma-route-command-search]")
      .locator('[data-gamma-command-route="/settings"]')
      .first();
    await expect(settingsResult).toBeVisible();
    await settingsResult.click();
    await expect(page).toHaveURL(/\/gamma\/settings$/);
    await expectGammaRouteReady(page, "/settings");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("continues from the Gamma boot desk with Enter", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "anonymous" });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-boot-desk]")).toHaveAttribute(
      "data-gamma-session-state",
      "guest"
    );
    await expect(page.locator("[data-gamma-primary-boot-action]")).toHaveAttribute(
      "data-gamma-primary-boot-action",
      "/login?return=%2Fdashboard"
    );
    await expect(page.locator("[data-gamma-primary-boot-action]")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/gamma\/login\?return=%2Fdashboard$/);
    await expectGammaRouteReady(page, "/login");
    await expect(page.locator("[data-gamma-application-content]")).toContainText("Gamma dashboard ready");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-enter",
      displayName: "Gamma Enter",
    });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-boot-desk]")).toHaveAttribute(
      "data-gamma-session-state",
      "signed-in"
    );
    await expect(page.locator("[data-gamma-primary-boot-action]")).toHaveAttribute(
      "data-gamma-primary-boot-action",
      "/dashboard"
    );
    await expect(page.locator("[data-gamma-primary-boot-action]")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/gamma\/dashboard$/);
    await expectGammaRouteReady(page, "/dashboard");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("logs into the Gamma dashboard from the boot desk with Enter", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "anonymous" });
    let loggedIn = false;
    const authUser = {
      id: 45,
      username: "gamma-boot-login",
      displayName: "Gamma Boot Login",
      role: "user",
      roles: ["user"],
      welcomedToWtfOs: true,
      gmWelcomeUtcDay: "2026-07-14",
      gmWelcomeLastSeenAt: "2026-07-14T00:00:00.000Z",
      gmWelcome: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      effectivePermissions: {},
    };

    await page.route("**/api/auth/user", async (route) => {
      if (!loggedIn) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Not authenticated" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(authUser),
      });
    });
    await page.route("**/api/auth/login", async (route) => {
      loggedIn = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(authUser),
      });
    });

    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-primary-boot-action]")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/gamma\/login\?return=%2Fdashboard$/);
    await expectGammaRouteReady(page, "/login");
    await expect(page.getByLabel("Username")).toBeFocused();

    await page.getByLabel("Username").fill(authUser.username);
    await page.getByLabel("Password").fill("correct-password");
    await page
      .locator("[data-gamma-application-content]")
      .getByRole("button", { name: "Log In", exact: true })
      .click();

    await expect(page).toHaveURL(/\/gamma\/dashboard$/);
    await expectGammaRouteReady(page, "/dashboard");
    await expect(page.locator("[data-gamma-application-content]")).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("launches Gamma command results from keyboard focus movement", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-command-arrows",
      displayName: "Gamma Command Arrows",
    });

    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    const bootInput = page.locator('[data-gamma-boot-command-search] input[data-gamma-command-input="true"]');
    await expect(bootInput).toBeVisible();
    await page.keyboard.press("Control+K");
    await expect(bootInput).toBeFocused();
    await page.keyboard.type("Broot");

    const bootBroot = page
      .locator("[data-gamma-boot-command-search]")
      .locator('[data-gamma-command-route="/tools/broot"]')
      .first();
    await expect(bootBroot).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(bootBroot).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(bootInput).toBeFocused();
    await expect(bootInput).toHaveValue("Broot");
    await page.keyboard.press("ArrowDown");
    await expect(bootBroot).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/gamma\/tools\/broot$/);
    await expectGammaRouteReady(page, "/tools/broot");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await page.goto("/gamma/gallery", { waitUntil: "domcontentloaded" });
    await expectGammaRouteReady(page, "/gallery");
    const routeInput = page.locator('[data-gamma-route-command-search] input[data-gamma-command-input="true"]');
    await page.locator("[data-gamma-taskbar-current-app]").click();
    await page.keyboard.press("Control+K");
    await expect(routeInput).toBeFocused();
    await page.keyboard.type("unmatched comet");

    const fallback = page
      .locator("[data-gamma-route-command-search]")
      .locator('[data-gamma-command-result="gallery-search"]');
    await expect(fallback).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(fallback).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(routeInput).toBeFocused();
    await expect(routeInput).toHaveValue("unmatched comet");
    await page.keyboard.press("ArrowDown");
    await expect(fallback).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/gamma\/gallery\?search=unmatched(?:\+|%20)comet$/);
    await expectGammaRouteReady(page, "/gallery");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("dismisses Gamma command search with Escape without leaving Gamma", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-escape",
      displayName: "Gamma Escape",
    });

    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    const bootInput = page.locator('[data-gamma-boot-command-search] input[data-gamma-command-input="true"]');
    await expect(bootInput).toBeVisible();
    await page.keyboard.press("Control+K");
    await expect(bootInput).toBeFocused();
    await page.keyboard.type("Broot");
    await expect(bootInput).toHaveValue("Broot");
    await page.keyboard.press("Escape");
    await expect(bootInput).toHaveValue("");
    await expect(bootInput).not.toBeFocused();
    await expect(page).toHaveURL(/\/gamma$/);
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await page.goto("/gamma/gallery", { waitUntil: "domcontentloaded" });
    await expectGammaRouteReady(page, "/gallery");
    const routeInput = page.locator('[data-gamma-route-command-search] input[data-gamma-command-input="true"]');
    await page.locator("[data-gamma-taskbar-current-app]").click();
    await page.keyboard.press("Control+K");
    await expect(routeInput).toBeFocused();
    await page.keyboard.type("Settings");
    await expect(routeInput).toHaveValue("Settings");
    await page.keyboard.press("Escape");
    await expect(routeInput).toHaveValue("");
    await expect(routeInput).not.toBeFocused();
    await expect(page).toHaveURL(/\/gamma\/gallery$/);
    await expectGammaRouteReady(page, "/gallery");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("returns from a Gamma app route to the desk with the OS keyboard shortcut", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-desk-keyboard",
      displayName: "Gamma Desk Keyboard",
    });

    await page.goto("/gamma/gallery", { waitUntil: "domcontentloaded" });
    await expectGammaRouteReady(page, "/gallery");
    const routeInput = page.locator('[data-gamma-route-command-search] input[data-gamma-command-input="true"]');
    await routeInput.focus();
    await page.keyboard.press("Alt+Home");
    await expect(page).toHaveURL(/\/gamma\/gallery$/);
    await expectGammaRouteReady(page, "/gallery");

    await page.locator("[data-gamma-taskbar-current-app]").click();
    await page.keyboard.press("Alt+Home");
    await expect(page).toHaveURL(/\/gamma$/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("restores recent route restore from browser-local Gamma session state", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-recents",
      displayName: "Gamma Recents",
    });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.localStorage.removeItem("wtfos.gamma.recentRoutes"));
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.locator("[data-gamma-session-resume]")).toHaveAttribute(
      "data-gamma-session-recents-state",
      "fallback"
    );
    await expect(page.locator('[data-gamma-session-resume-action="daily"]')).toHaveAttribute(
      "data-gamma-session-recent-fallback",
      "true"
    );

    await page.goto("/gamma/gallery", { waitUntil: "domcontentloaded" });
    await expectGammaRouteReady(page, "/gallery");
    await page.goto("/gamma/settings", { waitUntil: "domcontentloaded" });
    await expectGammaRouteReady(page, "/settings");
    await expect
      .poll(async () =>
        page.evaluate(() => JSON.parse(window.localStorage.getItem("wtfos.gamma.recentRoutes") || "[]"))
      )
      .toEqual(["/settings", "/gallery"]);

    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-session-resume]")).toHaveAttribute(
      "data-gamma-session-recents-state",
      "stored"
    );
    const sessionDock = page.locator("[data-gamma-session-dock]");
    await expect(sessionDock).toBeVisible();
    await expect(sessionDock).toHaveAttribute("data-gamma-session-dock-state", "open");
    await expect(sessionDock).toHaveAttribute("data-gamma-session-dock-keyboard-target", "/settings");
    await expect(page.locator('[data-gamma-start-action="continue"]')).toHaveAttribute(
      "data-gamma-launch",
      "/settings"
    );
    await expect(page.locator('[data-gamma-session-dock-route="/settings"]')).toHaveAttribute(
      "data-gamma-session-dock-front",
      "true"
    );
    await expect(page.locator('[data-gamma-session-dock-route="/gallery"]')).toHaveAttribute(
      "data-gamma-session-dock-front",
      "false"
    );
    await expect(page.locator('[data-gamma-session-recent-route="/settings"]')).toBeVisible();
    await expect(page.locator('[data-gamma-session-recent-route="/gallery"]')).toBeVisible();
    await expect(page.locator('[data-gamma-session-recent-route="/settings"]')).toHaveAttribute(
      "data-gamma-session-recent-fallback",
      "false"
    );

    const bootInput = page.locator('[data-gamma-boot-command-search] input[data-gamma-command-input="true"]');
    await bootInput.focus();
    await page.keyboard.press("Alt+PageDown");
    await expect(page).toHaveURL(/\/gamma$/);
    await expect(page.locator("[data-gamma-boot-desk]")).toBeVisible();

    await bootInput.evaluate((input) => input.blur());
    await expect(bootInput).not.toBeFocused();
    await page.keyboard.press("Alt+PageDown");
    await expect(page).toHaveURL(/\/gamma\/settings$/);
    await expectGammaRouteReady(page, "/settings");

    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await page.locator('[data-gamma-session-recent-route="/gallery"]').click();
    await expect(page).toHaveURL(/\/gamma\/gallery$/);
    await expectGammaRouteReady(page, "/gallery");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("keeps route history recovery inside the Gamma shell", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-history",
      displayName: "Gamma History",
    });

    await page.goto("/gamma/gallery", { waitUntil: "domcontentloaded" });
    await expectGammaRouteReady(page, "/gallery");

    const historyControls = page.locator("[data-gamma-history-controls]");
    await expect(historyControls).toBeVisible();
    await expect(historyControls.locator('[data-gamma-history-action="back"]')).toBeDisabled();
    await expect(historyControls.locator('[data-gamma-history-action="forward"]')).toBeDisabled();
    await expect(historyControls.locator('[data-gamma-history-action="desk"]')).toHaveAttribute(
      "data-gamma-history-target",
      "/"
    );

    await page.locator('[data-gamma-taskbar-action="settings"]').click();
    await expect(page).toHaveURL(/\/gamma\/settings$/);
    await expectGammaRouteReady(page, "/settings");
    await expect(historyControls).toHaveAttribute("data-gamma-history-back-target", "/gallery");
    await expect(historyControls.locator('[data-gamma-history-action="back"]')).toHaveAttribute(
      "data-gamma-history-target",
      "/gallery"
    );
    await expect(historyControls.locator('[data-gamma-history-action="forward"]')).toBeDisabled();

    await historyControls.locator('[data-gamma-history-action="back"]').click();
    await expect(page).toHaveURL(/\/gamma\/gallery$/);
    await expectGammaRouteReady(page, "/gallery");
    await expect(historyControls).toHaveAttribute("data-gamma-history-forward-target", "/settings");

    await historyControls.locator('[data-gamma-history-action="forward"]').click();
    await expect(page).toHaveURL(/\/gamma\/settings$/);
    await expectGammaRouteReady(page, "/settings");

    await page.keyboard.press("Alt+ArrowLeft");
    await expect(page).toHaveURL(/\/gamma\/gallery$/);
    await expectGammaRouteReady(page, "/gallery");

    await page.keyboard.press("Alt+ArrowRight");
    await expect(page).toHaveURL(/\/gamma\/settings$/);
    await expectGammaRouteReady(page, "/settings");

    await historyControls.locator('[data-gamma-history-action="desk"]').click();
    await expect(page).toHaveURL(/\/gamma$/);
    await expect(page.locator("[data-gamma-boot-desk]")).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("keeps launched application routes inside the Gamma shell", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "anonymous" });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });

    await page.locator('[data-gamma-primary-actions] [data-gamma-launch="/gallery"]').click();
    await expect(page).toHaveURL(/\/gamma\/gallery$/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/gallery");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
    await expect(page.locator("[data-gamma-ux-switcher]")).toBeVisible();
    await expect(page.locator("[data-gamma-ux-switcher]").getByRole("link", { name: "Classic" })).toHaveAttribute(
      "href",
      "https://wtfos.app/gallery"
    );
    await expect(page.locator("[data-gamma-ux-switcher]").getByRole("link", { name: "Beta" })).toHaveAttribute(
      "href",
      "https://beta.wtfos.app/gallery"
    );
    await expect(page.locator("[data-gamma-app-taskbar]")).toBeVisible();
    await expect(page.locator("[data-gamma-taskbar-current-app]")).toContainText("Gallery");
    await expect(page.locator('[data-gamma-route-focus-target="active-app"]')).toBeFocused();
    await expect(page.locator('[data-gamma-taskbar-action="close"]')).toHaveAttribute("data-gamma-launch", "/");
    await expect(page.locator('[data-gamma-taskbar-action="inbox"]')).toHaveAttribute("data-gamma-launch", "/messages");
    await expect(page.locator('[data-gamma-taskbar-action="daily"]')).toHaveAttribute("data-gamma-launch", "/side-quests");
    await expect(page.locator('[data-gamma-taskbar-action="apps"]')).toHaveAttribute("data-gamma-launch", "/wtfiam?category=apps");
    await expect(page.locator('[data-gamma-taskbar-action="settings"]')).toHaveAttribute("data-gamma-launch", "/settings");
    await expect(page.locator("[data-gamma-application-content]")).toBeVisible();
    await expect(page.locator("[data-gamma-inline-app-window]")).toContainText("Gallery");

    await page.locator('[data-gamma-side-rail] [data-gamma-launch="/tools/broot"]').click();
    await expect(page).toHaveURL(/\/gamma\/tools\/broot$/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
    await expect(page.locator('[data-gamma-route-gate="auth-required"]')).toBeVisible();
    await expect(page.locator('[data-gamma-route-focus-target="active-app"]')).toHaveCount(0);
    await expect(page.locator("[data-gamma-breadcrumbs]")).toContainText("Broot");
  });

  test("keeps app-route taskbar navigation inside the Gamma shell", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-taskbar",
      displayName: "Gamma Taskbar",
    });
    await page.setViewportSize({ width: 390, height: 760 });
    await page.goto("/gamma/gallery", { waitUntil: "domcontentloaded" });
    await expectGammaRouteReady(page, "/gallery");

    const taskbar = page.locator("[data-gamma-app-taskbar]");
    await expect(taskbar).toBeVisible();
    await expect(taskbar.locator("[data-gamma-taskbar-current-app]")).toContainText("Gallery");
    await expect(taskbar.locator('[data-gamma-route-focus-target="active-app"]')).toBeFocused();
    await expect(taskbar.locator("[data-gamma-taskbar-action]")).toHaveCount(6);
    const taskbarHeights = await taskbar.locator("[data-gamma-taskbar-action]").evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height)
    );
    expect(taskbarHeights.every((height) => height >= 44)).toBe(true);

    await taskbar.locator('[data-gamma-taskbar-action="daily"]').click();
    await expect(page).toHaveURL(/\/gamma\/side-quests$/);
    await expectGammaRouteReady(page, "/side-quests");
    await expect(page.locator("[data-gamma-taskbar-current-app]")).toContainText("Side Quests");
    await expect(page.locator('[data-gamma-route-focus-target="active-app"]')).toBeFocused();

    await page.locator('[data-gamma-taskbar-action="inbox"]').click();
    await expect(page).toHaveURL(/\/gamma\/messages$/);
    await expectGammaRouteReady(page, "/messages");
    await expect(page.locator('[data-gamma-route-focus-target="active-app"]')).toBeFocused();

    await page.locator('[data-gamma-taskbar-action="close"]').click();
    await expect(page).toHaveURL(/\/gamma$/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("switches between recent app routes from the Gamma app taskbar", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-switcher",
      displayName: "Gamma Switcher",
    });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.localStorage.removeItem("wtfos.gamma.recentRoutes"));

    await page.goto("/gamma/gallery", { waitUntil: "domcontentloaded" });
    await expectGammaRouteReady(page, "/gallery");
    await page.goto("/gamma/settings", { waitUntil: "domcontentloaded" });
    await expectGammaRouteReady(page, "/settings");
    await page.goto("/gamma/leaderboard", { waitUntil: "domcontentloaded" });
    await expectGammaRouteReady(page, "/leaderboard");
    await expect
      .poll(async () =>
        page.evaluate(() => JSON.parse(window.localStorage.getItem("wtfos.gamma.recentRoutes") || "[]"))
      )
      .toEqual(["/leaderboard", "/settings", "/gallery"]);

    const switcher = page.locator("[data-gamma-taskbar-switcher]");
    await expect(switcher).toBeVisible();
    await expect(switcher).toHaveAttribute("data-gamma-taskbar-switcher-state", "stored");
    await expect(switcher).toHaveAttribute("data-gamma-taskbar-keyboard-switch", "/settings");
    await expect(switcher.locator('[data-gamma-taskbar-switch-route="/settings"]')).toBeVisible();
    await expect(switcher.locator('[data-gamma-taskbar-switch-route="/gallery"]')).toBeVisible();
    await expect(switcher.locator('[data-gamma-taskbar-switch-route="/leaderboard"]')).toHaveCount(0);
    await expect(switcher.locator('[data-gamma-taskbar-switch-route="/settings"]')).toHaveAttribute(
      "data-gamma-taskbar-switch-fallback",
      "false"
    );

    const routeInput = page.locator('[data-gamma-route-command-search] input[data-gamma-command-input="true"]');
    await routeInput.focus();
    await page.keyboard.press("Alt+PageDown");
    await expect(page).toHaveURL(/\/gamma\/leaderboard$/);
    await expectGammaRouteReady(page, "/leaderboard");

    await page.locator("[data-gamma-taskbar-current-app]").click();
    await page.keyboard.press("Alt+PageDown");
    await expect(page).toHaveURL(/\/gamma\/settings$/);
    await expectGammaRouteReady(page, "/settings");
    await expect(page.locator("[data-gamma-taskbar-current-app]")).toContainText("Settings");
    await expect(page.locator('[data-gamma-taskbar-switch-route="/leaderboard"]')).toBeVisible();
    await expect(page.locator("[data-gamma-taskbar-switcher]")).toHaveAttribute(
      "data-gamma-taskbar-keyboard-switch",
      "/leaderboard"
    );

    await page.locator('[data-gamma-taskbar-switch-route="/leaderboard"]').click();
    await expect(page).toHaveURL(/\/gamma\/leaderboard$/);
    await expectGammaRouteReady(page, "/leaderboard");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("routes daily return actions through the Gamma shell", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-daily", displayName: "Gamma Daily" });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-daily-return]")).toBeVisible();

    await page.locator('[data-gamma-daily-action="sidequests"]').click();
    await expect(page).toHaveURL(/\/gamma\/side-quests$/);
    await expectGammaRouteReady(page, "/side-quests");

    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await page.locator('[data-gamma-daily-action="people"]').click();
    await expect(page).toHaveURL(/\/gamma\/w$/);
    await expectGammaRouteReady(page, "/w");

    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await page.locator('[data-gamma-daily-action="notifications"]').click();
    await expect(page).toHaveURL(/\/gamma\/notifications$/);
    await expectGammaRouteReady(page, "/notifications");
  });

  test("starts the daily side quest handoff from Gamma and keeps reward next steps in shell", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-quester",
      displayName: "Gamma Quester",
    });

    await page.route("**/api/challenge-automation/daily-loops", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          completionKey: "2026-07-14",
          resetAtUtc: "2026-07-15T00:00:00.000Z",
          loops: [
            {
              id: 601,
              title: "Daily social check-in",
              description: "Post one useful signal on the messageboard.",
              route: "/messageboard",
              actionLabel: "Post on Message Board",
              category: "social",
              order: 1,
              rewards: { xp: 25, wtf: 1 },
              completedByCount: 15,
              verifiedByCount: 3,
              claimableToday: false,
              verifiedToday: false,
              claimedToday: false,
              completedToday: false,
            },
            {
              id: 602,
              title: "Verified daily proof",
              description: "WTF OS already verified this signal.",
              route: "/messageboard",
              actionLabel: "Review proof",
              category: "social",
              order: 2,
              rewards: { xp: 30, wtf: 2 },
              completedByCount: 7,
              verifiedByCount: 7,
              claimableToday: true,
              verifiedToday: true,
              claimedToday: false,
              completedToday: false,
            },
          ],
        }),
      });
    });
    await page.route("**/api/challenge-automation/daily-loops/602/claim", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await page.route("**/api/side-quests", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("**/api/side-quests/my/completions", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("**/api/rewards/account", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          balances: {
            totalEarnedWtf: 9,
            availableWtf: 4,
            pendingCashoutWtf: 0,
            alreadyPaidWtf: 0,
            marketSpentWtf: 0,
          },
          cashout: { minimumWtf: 20 },
          primaryWallet: { walletAddress: "tz1GammaDailyWallet0000000000000000" },
        }),
      });
    });

    const channel = {
      id: 1,
      title: "Daily Signals",
      body: "Gamma daily check-in channel",
      categoryId: 1,
      channelType: "general",
      topic: "One visible proof per day.",
      position: 1,
      slowModeSeconds: 0,
      viewRoles: ["witness", "contestant", "admin"],
      replyRoles: ["witness", "contestant", "admin"],
      active: true,
      pinned: false,
      locked: false,
      messageCount: 1,
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    };
    await page.route("**/api/board/categories", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([{ id: 1, name: "General", position: 1, collapsed: false }]),
      });
    });
    await page.route("**/api/board/channels", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([channel]) });
    });
    await page.route("**/api/board/channels/1/messages**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          channel: { ...channel, canPost: true, canManage: false },
          messages: [
            {
              id: 71,
              threadId: 1,
              userId: 71,
              username: "gamma-quester",
              displayName: "Gamma Quester",
              avatarUrl: null,
              role: "contestant",
              content: "Daily check-in proof stays in Gamma.",
              attachments: [],
              pinned: false,
              parentReplyId: null,
              webhookId: null,
              createdAt: "2026-07-14T12:00:00.000Z",
              editedAt: null,
              reactions: [],
            },
          ],
        }),
      });
    });

    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-daily-return]")).toBeVisible();
    await page.locator('[data-gamma-daily-action="sidequests"]').click();
    await expect(page).toHaveURL(/\/gamma\/side-quests$/);
    await expectGammaRouteReady(page, "/side-quests");

    const sideQuestSurface = page.locator('[data-gamma-application-content] [data-progression-surface="side-quests"]');
    await expect(sideQuestSurface).toHaveAttribute("data-progression-presentation-host", "gamma");
    await expect(sideQuestSurface).toContainText("Daily social check-in");
    await expect(sideQuestSurface).toContainText("Verified daily proof");

    await sideQuestSurface.getByRole("button", { name: "Post on Message Board" }).click();
    await expect(page).toHaveURL(/\/gamma\/messageboard$/);
    await expectGammaRouteReady(page, "/messageboard");
    const boardSurface = page.locator('[data-gamma-application-content] [data-board-surface="messageboard"]');
    await expect(boardSurface).toHaveAttribute("data-board-presentation-host", "gamma");
    await expect(boardSurface).toContainText("Daily check-in proof stays in Gamma.");

    await page.goto("/gamma/side-quests", { waitUntil: "domcontentloaded" });
    await expectGammaRouteReady(page, "/side-quests");
    await sideQuestSurface.getByRole("button", { name: "Claim" }).click();
    await expect(sideQuestSurface).toContainText("You earned WTF");

    await sideQuestSurface.getByRole("link", { name: /Market/ }).click();
    await expect(page).toHaveURL(/\/gamma\/wtfiam$/);
    await expectGammaRouteReady(page, "/wtfiam");
  });

  test("persists the Gamma shell for same-session canonical route changes", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "anonymous" });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();

    await page.evaluate(() => {
      window.history.pushState({}, "", "/gallery");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await expect(page).toHaveURL(/\/gallery$/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/gallery");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await page.locator('[data-gamma-side-rail] [data-gamma-launch="/tools/broot"]').click();
    await expect(page).toHaveURL(/\/tools\/broot$/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("keeps production Gamma hostname direct routes inside the Gamma shell", async ({ request }) => {
    await setHarnessState(request, { userRole: "anonymous" });
    const port = Number(process.env.HARNESS_PORT || 4173);
    const browser = await chromium.launch({
      headless: true,
      args: ["--host-resolver-rules=MAP gamma.wtfos.app 127.0.0.1"],
    });
    const context = await browser.newContext({
      baseURL: `http://gamma.wtfos.app:${port}`,
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    try {
      await page.goto("/gallery", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`^http://gamma\\.wtfos\\.app:${port}/gallery$`));
      await expectGammaRouteReady(page, "/gallery");
      await expect(page.locator("[data-gamma-application-content]")).toBeVisible();
      await expect(page.locator("[data-gamma-ux-switcher]").getByRole("link", { name: "Classic" })).toHaveAttribute(
        "href",
        "https://wtfos.app/gallery"
      );

      await page.locator('[data-gamma-side-rail] [data-gamma-launch="/leaderboard"]').click();
      await expect(page).toHaveURL(new RegExp(`^http://gamma\\.wtfos\\.app:${port}/leaderboard$`));
      await expectGammaRouteReady(page, "/leaderboard");
      await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
    } finally {
      await context.close();
      await browser.close();
    }
  });

  test("keeps app-owned hard route jumps inside the local Gamma harness path", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin" });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();

    await page.goto("/recovery-mode", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/recovery-mode$/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/recovery-mode");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await page.getByRole("button", { name: "Reload OS" }).click();
    await expect(page).toHaveURL(/\/gamma\/recovery-mode$/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/recovery-mode");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("keeps app-content internal links in Gamma while allowing explicit interface switches", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user" });
    await page.goto("/gamma/wtf-subdomains", { waitUntil: "domcontentloaded" });

    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/wtf-subdomains");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
    await expect(page.locator('[data-gamma-application-content] [data-gamma-ui="groupbox"]').first()).toBeVisible();
    await expect(page.locator('[data-gamma-application-content] [data-gamma-ui="button"]').first()).toBeVisible();
    await expect(page.locator('[data-gamma-application-content] [data-gamma-ui="text-input"]').first()).toBeVisible();

    const appProfileLink = page.locator('[data-gamma-application-content] a[href="/user/skllzrmy"]').first();
    await expect(appProfileLink).toBeVisible();
    await appProfileLink.click();
    await expect(page).toHaveURL(/\/gamma\/user\/skllzrmy$/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
    await expect(page.locator("[data-gamma-breadcrumbs]")).toContainText("User Profile");

    await expect(page.locator("[data-gamma-ux-switcher]").getByRole("link", { name: "Classic" })).toHaveAttribute(
      "data-gamma-interface-switch",
      "true"
    );
    await expect(page.locator("[data-gamma-route-meta]").getByRole("link", { name: "Open Classic route" })).toHaveAttribute(
      "data-gamma-interface-switch",
      "true"
    );
  });

  test("routes locked app-store routes to WTFIAM Apps instead of a dead Gamma placeholder", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-locked",
      displayName: "Gamma Locked",
      ownedAppPasses: [],
    });

    await page.goto("/gamma/tv", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/tv");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const lockedGate = page.locator('[data-gamma-route-gate="app-disabled"]');
    await expect(lockedGate).toHaveAttribute("data-gamma-route-gate-app", "tv");
    await expect(lockedGate).toContainText("WTF TV is not installed for this session");
    const appsButton = lockedGate.locator('[data-gamma-locked-app-action="apps"]');
    await expect(appsButton).toHaveAttribute("data-gamma-launch", "/wtfiam?category=apps");
    await appsButton.click();
    await expect(page).toHaveURL(/\/gamma\/wtfiam\?category=apps$/);
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/wtfiam");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("keeps documented static nested and console routes inside the Gamma shell", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "admin",
      username: "gamma-route-auditor",
      displayName: "Gamma Route Auditor",
    });

    const documentedRoutes = [
      { path: "/beta", title: "WTFOS Beta" },
      { path: "/links", title: "Links" },
      { path: "/faq", title: "Help & Start Here" },
      { path: "/discord/terms", title: "Discord Terms" },
      { path: "/discord/privacy", title: "Discord Privacy" },
      { path: "/discord/linked-roles", title: "Discord Linked Roles" },
      { path: "/messages/dms/1", title: "Messages" },
      { path: "/console", title: "WTF Console" },
    ];

    for (const route of documentedRoutes) {
      await gotoGammaRoute(page, route.path);
      await expect(page.locator("[data-gamma-breadcrumbs]")).toContainText(route.title);
      await expect(page.locator("[data-gamma-application-content]")).toBeVisible();
      await expect(page.locator("[data-gamma-route-missing]")).toHaveCount(0);
      await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
    }
  });

  test("hosts Mission Control route hub chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-user", displayName: "Gamma User" });
    await gotoGammaRoute(page, "/mission-control");

    const missionSurface = page.locator(
      '[data-gamma-application-content] [data-mission-control-surface="mission-control"]'
    );
    await expect(missionSurface).toHaveAttribute("data-mission-control-presentation-host", "gamma");
    await expect(missionSurface).toContainText("Where am I?");
    await expect(missionSurface).toContainText("Gamma User");
    await expect(missionSurface).toContainText("Side Quests");
    await expect(missionSurface).toContainText("Harness system notice");

    const missionMetrics = await missionSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.matches(selector) ? surface : surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Math.max(
            Number.parseFloat(style.borderTopWidth || "0"),
            Number.parseFloat(style.borderRightWidth || "0"),
            Number.parseFloat(style.borderBottomWidth || "0"),
            Number.parseFloat(style.borderLeftWidth || "0")
          ),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Math.max(
            Number.parseFloat(style.borderTopLeftRadius || "0"),
            Number.parseFloat(style.borderTopRightRadius || "0"),
            Number.parseFloat(style.borderBottomRightRadius || "0"),
            Number.parseFloat(style.borderBottomLeftRadius || "0")
          ),
          textShadow: style.textShadow,
        };
      };
      return {
        surface: read('[data-mission-control-region="surface"]'),
        actions: read('[data-mission-control-region="actions"]'),
        metric: read('[data-mission-control-region="metric"]'),
        row: read('[data-mission-control-region="row"]'),
        progress: read('[data-mission-control-region="progress"]'),
        button: read('[data-mission-control-region="button"]'),
        meter: read('[data-mission-control-region="meter"]'),
      };
    });

    expect(missionMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const [key, region] of Object.entries(missionMetrics)) {
      expect(region, `missing Mission Control metric: ${key}`).not.toBeNull();
      expect(region.backgroundImage).toBe("none");
      expect(region.boxShadow).toBe("none");
      expect(region.textShadow).toBe("none");
      expect(region.radius).toBeLessThanOrEqual(6);
      expect(region.borderWidth).toBeLessThanOrEqual(1);
    }
    expect(missionMetrics.button?.color).toBe("rgb(0, 210, 255)");

    await missionSurface
      .locator('[data-mission-control-region="actions"]')
      .getByRole("button", { name: "Open challenges" })
      .click();
    await expect(page).toHaveURL(/\/gamma\/challenges$/);
    await expectGammaRouteReady(page, "/challenges");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts Command Palette route hub chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-user", displayName: "Gamma User" });
    await gotoGammaRoute(page, "/command-palette");

    const commandSurface = page.locator(
      '[data-gamma-application-content] [data-command-palette-surface="command-palette"]'
    );
    await expect(commandSurface).toHaveAttribute("data-command-palette-presentation-host", "gamma");
    await expect(commandSurface).toContainText("Commands");
    await expect(commandSurface).toContainText("Browser Boundaries");

    await commandSurface.getByLabel("Search commands").fill("browser boundaries");
    const boundaryCommand = commandSurface.locator(
      '[data-command-palette-region="result-list"] [data-command-palette-command-id="app:/browser-boundaries"]'
    );
    await expect(boundaryCommand).toContainText("Browser Boundaries");

    const commandMetrics = await commandSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.matches(selector) ? surface : surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Math.max(
            Number.parseFloat(style.borderTopWidth || "0"),
            Number.parseFloat(style.borderRightWidth || "0"),
            Number.parseFloat(style.borderBottomWidth || "0"),
            Number.parseFloat(style.borderLeftWidth || "0")
          ),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Math.max(
            Number.parseFloat(style.borderTopLeftRadius || "0"),
            Number.parseFloat(style.borderTopRightRadius || "0"),
            Number.parseFloat(style.borderBottomRightRadius || "0"),
            Number.parseFloat(style.borderBottomLeftRadius || "0")
          ),
          textShadow: style.textShadow,
        };
      };
      return {
        surface: read('[data-command-palette-region="surface"]'),
        statusCell: read('[data-command-palette-region="status-cell"]'),
        searchBox: read('[data-command-palette-region="search-box"]'),
        searchInput: read('[data-command-palette-region="search-input"]'),
        resultRow: read('[data-command-palette-region="result-row"]'),
        glyph: read('[data-command-palette-region="glyph"]'),
        openButton: read('[data-command-palette-region="open-button"]'),
      };
    });

    expect(commandMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const [key, region] of Object.entries(commandMetrics)) {
      expect(region, `missing Command Palette metric: ${key}`).not.toBeNull();
      expect(region.backgroundImage).toBe("none");
      expect(region.boxShadow).toBe("none");
      expect(region.textShadow).toBe("none");
      expect(region.radius).toBeLessThanOrEqual(6);
      expect(region.borderWidth).toBeLessThanOrEqual(1);
    }
    expect(commandMetrics.glyph?.color).toBe("rgb(0, 210, 255)");
    expect(commandMetrics.openButton?.color).toBe("rgb(0, 210, 255)");

    await boundaryCommand.getByRole("button", { name: "Open" }).click();
    await expect(page).toHaveURL(/\/gamma\/browser-boundaries$/);
    await expectGammaRouteReady(page, "/browser-boundaries");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts desktop utility routes and handoffs in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });
    await page.route("**/api/browser/allowlist", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ hosts: ["objkt.com", "teia.art", "wtfos.app"] }),
      });
    });

    const assertUtilitySurface = async (routePath, surfaceId, expectedText) => {
      await gotoGammaRoute(page, routePath);
      const surface = page.locator(
        `[data-gamma-application-content] [data-gamma-utility-surface="${surfaceId}"]`
      );
      await expect(surface).toHaveAttribute("data-gamma-utility-presentation-host", "gamma");
      await expect(surface).toContainText(expectedText);
      await expect(
        surface.locator('[data-gamma-utility-region="button"], [data-gamma-utility-region="tab"]').first()
      ).toBeVisible();

      const metrics = await surface.evaluate((node) => {
        const read = (selector) => {
          const target = node.matches(selector) ? node : node.querySelector(selector);
          if (!target) return null;
          const style = window.getComputedStyle(target);
          return {
            backgroundImage: style.backgroundImage,
            borderWidth: Math.max(
              Number.parseFloat(style.borderTopWidth || "0"),
              Number.parseFloat(style.borderRightWidth || "0"),
              Number.parseFloat(style.borderBottomWidth || "0"),
              Number.parseFloat(style.borderLeftWidth || "0")
            ),
            boxShadow: style.boxShadow,
            color: style.color,
            fontFamily: style.fontFamily,
            radius: Math.max(
              Number.parseFloat(style.borderTopLeftRadius || "0"),
              Number.parseFloat(style.borderTopRightRadius || "0"),
              Number.parseFloat(style.borderBottomRightRadius || "0"),
              Number.parseFloat(style.borderBottomLeftRadius || "0")
            ),
            textShadow: style.textShadow,
          };
        };
        return {
          surface: read('[data-gamma-utility-region="surface"]'),
          statusCell: read(
            '[data-gamma-utility-region="status-cell"], [data-gamma-utility-region="tab"], [data-gamma-utility-region="toolbar"], [data-gamma-utility-region="cli-status"]'
          ),
          row: read(
            '[data-gamma-utility-region="row"], [data-gamma-utility-region="command-row"], [data-gamma-utility-region="dwelling-row"], [data-gamma-utility-region="process-table"], [data-gamma-utility-region="viewport"], [data-gamma-utility-region="cli-output"]'
          ),
          button: read('[data-gamma-utility-region="button"], [data-gamma-utility-region="tab"]'),
        };
      });

      expect(metrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
      for (const [key, region] of Object.entries(metrics)) {
        expect(region, `missing desktop utility Gamma metric: ${surfaceId}:${key}`).not.toBeNull();
        expect(region.backgroundImage).toBe("none");
        expect(region.boxShadow).toBe("none");
        expect(region.textShadow).toBe("none");
        expect(region.radius).toBeLessThanOrEqual(6);
        expect(region.borderWidth).toBeLessThanOrEqual(1);
      }

      return surface;
    };

    const recoverySurface = await assertUtilitySurface("/recovery-mode", "recovery-mode", "Local repairs");
    await recoverySurface.getByRole("button", { name: "Open terminal" }).click();
    await expect(page).toHaveURL(/\/gamma\/terminal$/);
    await expectGammaRouteReady(page, "/terminal");

    const terminalSurface = await assertUtilitySurface("/terminal", "terminal", "No arbitrary shell");
    await terminalSurface.getByRole("button", { name: "Access" }).click();
    await expect(page).toHaveURL(/\/gamma\/browser-boundaries$/);
    await expectGammaRouteReady(page, "/browser-boundaries");

    const boundariesSurface = await assertUtilitySurface(
      "/browser-boundaries",
      "browser-boundaries",
      "Browser Modes"
    );
    await boundariesSurface.getByRole("button", { name: "Open Terminal" }).click();
    await expect(page).toHaveURL(/\/gamma\/terminal$/);
    await expectGammaRouteReady(page, "/terminal");

    const fileManagerSurface = await assertUtilitySurface("/file-manager", "file-manager", "WTF dwellings");
    await fileManagerSurface.getByRole("button", { name: "Open Projects" }).click();
    await expect(page).toHaveURL(/\/gamma\/studio$/);
    await expectGammaRouteReady(page, "/studio");

    const taskManagerSurface = await assertUtilitySurface("/task-manager", "task-manager", "WTF Task Manager");
    await taskManagerSurface.getByRole("tab", { name: "Performance" }).click();
    await expect(taskManagerSurface.locator('[data-gamma-utility-region="panel"]')).toContainText("System resources");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await assertUtilitySurface("/browser", "browser", "Allowed hosts: objkt.com");

    const cliSurface = await assertUtilitySurface("/cli", "cli", "wtfOS CLI shell ready");
    await cliSurface.getByLabel("CLI command").fill("open /mission-control");
    await cliSurface.getByRole("button", { name: "Run" }).click();
    await expect(page).toHaveURL(/\/gamma\/mission-control$/);
    await expectGammaRouteReady(page, "/mission-control");
  });

  test("hosts Agent native workspace chrome in the Gamma presentation style", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });

    await page.route("**/api/mcp/tokens", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          endpoint: "https://gamma.wtfos.app/mcp",
          tokens: [
            {
              id: 84,
              name: "Gamma Agent",
              tokenPrefix: "wtf_gamma",
              scopes: ["agent:pair", "agent:read"],
              lastUsedAt: null,
              revokedAt: null,
              createdAt: "2026-06-29T12:00:00.000Z",
            },
          ],
        }),
      });
    });

    await gotoGammaRoute(page, "/agent");

    const surface = page.locator('[data-gamma-application-content] [data-agent-surface="workspace"]');
    await expect(surface).toHaveAttribute("data-agent-presentation-host", "gamma");
    await expect(surface).toHaveAttribute("data-agent-provider", "openai");
    await expect(surface).toContainText("Agent");
    await expect(surface).toContainText("Provider");
    await expect(surface).toContainText("Project State");
    await expect(surface.locator('[data-agent-region="chat-bubble"]').first()).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const readAgentMetrics = async (selectors) =>
      surface.evaluate((root, selectorMap) => {
        const read = (selector) => {
          const node = root.matches(selector) ? root : root.querySelector(selector);
          if (!node) return null;
          const style = window.getComputedStyle(node);
          return {
            backgroundImage: style.backgroundImage,
            borderWidth: Math.max(
              Number.parseFloat(style.borderTopWidth || "0"),
              Number.parseFloat(style.borderRightWidth || "0"),
              Number.parseFloat(style.borderBottomWidth || "0"),
              Number.parseFloat(style.borderLeftWidth || "0")
            ),
            boxShadow: style.boxShadow,
            color: style.color,
            fontFamily: style.fontFamily,
            radius: Math.max(
              Number.parseFloat(style.borderTopLeftRadius || "0"),
              Number.parseFloat(style.borderTopRightRadius || "0"),
              Number.parseFloat(style.borderBottomRightRadius || "0"),
              Number.parseFloat(style.borderBottomLeftRadius || "0")
            ),
            textShadow: style.textShadow,
          };
        };
        return Object.fromEntries(
          Object.entries(selectorMap).map(([key, selector]) => [key, read(selector)])
        );
      }, selectors);

    const chatMetrics = await readAgentMetrics({
      surface: '[data-agent-region="surface"]',
      header: '[data-agent-region="header"]',
      agentMark: '[data-agent-region="agent-mark"]',
      tab: '[data-agent-region="tab"]',
      statusCell: '[data-agent-region="status-cell"]',
      badge: '[data-agent-region="badge"]',
      chatBubble: '[data-agent-region="chat-bubble"]',
    });
    expect(chatMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);

    await surface.locator('[data-agent-tab="workbench"]').click();
    await expect(surface.locator('[data-agent-region="editor"]')).toBeVisible();
    await expect(surface.locator('[data-agent-region="diff-pane"]').first()).toBeVisible();
    await expect(surface.locator('[data-agent-region="terminal-pane"]')).toBeVisible();
    await expect(page).toHaveURL(/\/gamma\/agent$/);
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const workbenchMetrics = await readAgentMetrics({
      fileButton: '[data-agent-region="file-button"]',
      editor: '[data-agent-region="editor"]',
      previewPane: '[data-agent-region="preview-pane"]',
      diffPane: '[data-agent-region="diff-pane"]',
      terminalPane: '[data-agent-region="terminal-pane"]',
      actionRow: '[data-agent-region="action-row"]',
    });

    await surface.locator('[data-agent-tab="permissions"]').click();
    await expect(surface.locator("[data-agent-mcp-preview]")).toBeVisible();
    await expect(surface).toContainText("MCP Access Preview");
    await expect(surface).toContainText("Gamma Agent");
    await expect(page).toHaveURL(/\/gamma\/agent$/);
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const permissionMetrics = await readAgentMetrics({
      permissionRow: '[data-agent-region="permission-row"]',
      actionRow: '[data-agent-region="action-row"]',
    });

    for (const [key, region] of Object.entries({
      ...chatMetrics,
      ...workbenchMetrics,
      ...permissionMetrics,
    })) {
      expect(region, `missing Agent metric: ${key}`).not.toBeNull();
      expect(region.backgroundImage).toBe("none");
      expect(region.boxShadow).toBe("none");
      expect(region.textShadow).toBe("none");
      expect(region.radius).toBeLessThanOrEqual(6);
      expect(region.borderWidth).toBeLessThanOrEqual(1);
    }
  });

  test("hosts Map Lab graph workspace chrome in the Gamma presentation style", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });
    await page.addInitScript(() => {
      window.localStorage.removeItem("wtfos.map-lab.repo-draft.v1");
      window.localStorage.removeItem("wtf-os.window-session.v1");
    });

    await gotoGammaRoute(page, "/map-lab");

    const surface = page.locator('[data-gamma-application-content] [data-map-lab-surface="workspace"]');
    await expect(surface).toHaveAttribute("data-map-lab-presentation-host", "gamma");
    await expect(surface).toHaveAttribute("data-map-lab-mode", "draft");
    await expect(surface).toHaveAttribute("data-map-lab-readonly", "false");
    await expect(surface).toContainText("Workflow map");
    await expect(surface).toContainText("Map Lab graph");
    await expect(surface.locator('[data-map-lab-viewport="true"]')).toBeVisible();
    await expect(surface.locator('[data-map-lab-node-key="map-lab"]')).toBeVisible();
    await expect(surface.locator('[data-map-lab-template="gradio-space"]')).toBeEnabled();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const readMapLabMetrics = async (selectors) =>
      surface.evaluate((root, selectorMap) => {
        const read = (selector) => {
          const node = root.matches(selector) ? root : root.querySelector(selector);
          if (!node) return null;
          const style = window.getComputedStyle(node);
          return {
            backgroundImage: style.backgroundImage,
            borderWidth: Math.max(
              Number.parseFloat(style.borderTopWidth || "0"),
              Number.parseFloat(style.borderRightWidth || "0"),
              Number.parseFloat(style.borderBottomWidth || "0"),
              Number.parseFloat(style.borderLeftWidth || "0")
            ),
            boxShadow: style.boxShadow,
            color: style.color,
            filter: style.filter,
            fontFamily: style.fontFamily,
            radius: Math.max(
              Number.parseFloat(style.borderTopLeftRadius || "0"),
              Number.parseFloat(style.borderTopRightRadius || "0"),
              Number.parseFloat(style.borderBottomRightRadius || "0"),
              Number.parseFloat(style.borderBottomLeftRadius || "0")
            ),
            textShadow: style.textShadow,
          };
        };
        return Object.fromEntries(
          Object.entries(selectorMap).map(([key, selector]) => [key, read(selector)])
        );
      }, selectors);

    const draftMetrics = await readMapLabMetrics({
      surface: '[data-map-lab-region="surface"]',
      panel: '[data-map-lab-region="panel"]',
      toolbar: '[data-map-lab-region="toolbar"]',
      viewport: '[data-map-lab-region="viewport"]',
      board: '[data-map-lab-region="board"]',
      nodeCard: '[data-map-lab-region="node-card"]',
      port: '[data-map-lab-region="port"]',
      templateButton: '[data-map-lab-region="template-button"]',
      routeListItem: '[data-map-lab-region="route-list-item"]',
      runMetric: '[data-map-lab-region="run-metric"]',
      minimap: '[data-map-lab-region="minimap"]',
      statusPill: '[data-map-lab-region="status-pill"]',
    });
    expect(draftMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);

    await surface.locator('[data-map-lab-open-demo="true"]').click();
    await expect(surface).toHaveAttribute("data-map-lab-mode", "wtfos-demo");
    await expect(surface).toHaveAttribute("data-map-lab-readonly", "true");
    await expect(surface.locator('[data-map-lab-mode-badge="true"]')).toContainText("Read-only demo");
    await expect(surface.locator('[data-map-lab-node-key="wtfos-demo-desktop-shell"]')).toBeVisible();
    await expect(surface.locator('[data-map-lab-template="gradio-space"]')).toBeDisabled();
    await expect(page).toHaveURL(/\/gamma\/map-lab$/);
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await surface.getByRole("button", { name: "Run workflow map" }).click();
    // The demo is generated from live registries, so route/node totals grow.
    await expect(surface.locator('[data-map-lab-run-summary="true"]')).toHaveText(
      /Last run activated \d+ routes across \d+ connected nodes\./
    );
    await expect(surface.locator("[data-map-lab-route-list-item='demo-wire-1']")).toContainText("active");
    await expect(page).toHaveURL(/\/gamma\/map-lab$/);
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const demoMetrics = await readMapLabMetrics({
      nodeCard: '[data-map-lab-region="node-card"]',
      routeListItem: '[data-map-lab-region="route-list-item"]',
      runMetric: '[data-map-lab-region="run-metric"]',
      statusPill: '[data-map-lab-region="status-pill"]',
    });

    for (const [key, region] of Object.entries({ ...draftMetrics, ...demoMetrics })) {
      expect(region, `missing Map Lab metric: ${key}`).not.toBeNull();
      expect(region.backgroundImage).toBe("none");
      expect(region.boxShadow).toBe("none");
      expect(region.filter).toBe("none");
      expect(region.textShadow).toBe("none");
      expect(region.radius).toBeLessThanOrEqual(6);
      expect(region.borderWidth).toBeLessThanOrEqual(1);
    }
  });

  test("hosts Theme Builder and Desktop Settings aliases in the Gamma presentation style", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });

    const appearance = {
      appearanceStyleKey: "classic-95",
      colorSchemeKey: "wtf-teal",
      fontPackKey: "mek-type",
      chatTypographyPresetKey: "wtfos-default",
      wimChatStyle: {
        fontFamily: "Helvetica",
        fontSize: 12,
        color: "#06135f",
        bold: false,
        italic: false,
        underline: false,
      },
      wtfLiveChatStyle: {
        font: "classic-95",
        color: "ink",
        size: 12,
        bold: false,
        italic: false,
      },
      desktopColor: "#008080",
      windowColor: "#c0c0c0",
      activeTitleColor: "#000080",
      activeTitleTextColor: "#ffffff",
      inactiveTitleColor: "#808080",
      inactiveTitleTextColor: "#c0c0c0",
      textColor: "#111111",
      highlightColor: "#000080",
      buttonFace: "#c0c0c0",
      backgroundImageUrl: null,
      backgroundFit: "cover",
      cursorStyle: "eggplant",
      desktopPhysicsEnabled: true,
      desktopGravityMode: "on",
      desktopPetEnabled: true,
    };
    const pet = {
      name: "Gamma Niblet",
      colorSchemeKey: "golden",
      genetics: {
        version: 1,
        seed: "gamma-settings-proof",
        generation: 0,
        rarityTier: "common",
        baseStats: {
          metabolism: 50,
          speed: 50,
          strength: 50,
          intelligence: 50,
          stamina: 50,
          sociability: 50,
          grit: 50,
          luck: 50,
        },
        statBonuses: {
          metabolism: 0,
          speed: 0,
          strength: 0,
          intelligence: 0,
          stamina: 0,
          sociability: 0,
          grit: 0,
          luck: 0,
        },
        effectiveStats: {
          metabolism: 50,
          speed: 50,
          strength: 50,
          intelligence: 50,
          stamina: 50,
          sociability: 50,
          grit: 50,
          luck: 50,
        },
        attributes: [],
        phenotype: {
          sizeClass: "standard",
          forcedColorSchemeKey: null,
          glow: false,
          stealth: false,
          visualTags: [],
        },
        ancestry: { parents: [] },
      },
      alive: true,
      hunger: 72,
      thirst: 72,
      happiness: 68,
      hygiene: 70,
      energy: 64,
      sick: false,
      sicknessRisk: 0,
      medicineDoses: 0,
      restDoses: 0,
      poopExposure: 0,
      bondXp: 0,
      bondLevel: 1,
      happinessIndexScore: 68,
      happinessSampleCount: 0,
      trauma: 0,
      level: 3,
      xpEarned: 120,
      carePoints: 9,
      missedCareDays: 0,
      careStreak: 2,
      lastCareDate: null,
      lastInteractionAt: null,
      interactionCounts: {},
    };

    await page.route("**/api/desktop/settings", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ appearance, iconLayout: {}, updatedAt: null }),
      });
    });
    await page.route("**/api/desktop/pet", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          pet,
          events: [
            {
              id: 901,
              action: "water",
              xpAmount: 4,
              createdAt: "2026-06-29T12:00:00.000Z",
            },
          ],
        }),
      });
    });
    await page.route("**/api/media/mine**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 91,
            title: "Gamma Snapshot",
            sourceType: "upload",
            sourceUrl: "/api/media/91/file",
            playbackUrl: "/api/media/91/file",
            posterUrl: null,
            mimeType: "image/png",
            mediaCategory: "image",
          },
        ]),
      });
    });
    await page.route("**/api/profile/tokens**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: 77,
              contract: "KT1GammaTheme",
              tokenId: "7",
              name: "Gamma Token",
              thumbnail: "/api/media/91/file",
              metadata: { formats: [{ mimeType: "image/png", uri: "/api/media/91/file" }] },
              balance: "1",
            },
          ],
          total: 1,
        }),
      });
    });
    await page.route("**/api/media/91/file", async (route) => {
      await route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#00d2ff"/></svg>',
      });
    });
    await page.route("**/api/mcp/tokens", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          endpoint: "https://gamma.wtfos.app/mcp",
          tokens: [
            {
              id: 42,
              name: "Gamma Agent",
              tokenPrefix: "wtf_gamma",
              scopes: ["agent:pair"],
              lastUsedAt: null,
              revokedAt: null,
              createdAt: "2026-06-29T12:00:00.000Z",
            },
          ],
        }),
      });
    });

    await gotoGammaRoute(page, "/theme-builder");

    const surface = page.locator(
      '[data-gamma-application-content] [data-desktop-settings-surface="theme-builder"]'
    );
    await expect(surface).toHaveAttribute("data-desktop-settings-presentation-host", "gamma");
    await expect(surface.getByTestId("desktop-settings-tab-background")).toBeVisible();
    await expect(surface.getByTestId("desktop-settings-global-save")).toHaveAttribute(
      "data-save-state",
      "recorded"
    );
    await surface.getByTestId("desktop-settings-tab-appearance").click();
    await expect(surface).toContainText("OS appearance");
    await surface.getByTestId("desktop-settings-tab-font").click();
    await expect(surface).toContainText("System typography");
    await surface.getByTestId("desktop-settings-tab-background").click();
    await expect(surface).toContainText("Gamma Snapshot");
    await expect(surface).toContainText("Gamma Token");
    await surface.getByTestId("desktop-settings-tab-pet").click();
    await expect(surface).toContainText("Gamma Niblet");
    await expect(surface.locator('[data-desktop-settings-region="pet-box"]')).toBeVisible();
    await surface.getByTestId("desktop-settings-tab-agent").click();
    await expect(surface).toContainText("Gamma Agent");

    const settingsMetrics = await surface.evaluate((root) => {
      const read = (selector) => {
        const node = root.matches(selector) ? root : root.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Math.max(
            Number.parseFloat(style.borderTopWidth || "0"),
            Number.parseFloat(style.borderRightWidth || "0"),
            Number.parseFloat(style.borderBottomWidth || "0"),
            Number.parseFloat(style.borderLeftWidth || "0")
          ),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Math.max(
            Number.parseFloat(style.borderTopLeftRadius || "0"),
            Number.parseFloat(style.borderTopRightRadius || "0"),
            Number.parseFloat(style.borderBottomRightRadius || "0"),
            Number.parseFloat(style.borderBottomLeftRadius || "0")
          ),
          textShadow: style.textShadow,
        };
      };
      return {
        surface: read('[data-desktop-settings-region="surface"]'),
        settingsNav: read('[data-desktop-settings-region="settings-nav"]'),
        settingsTab: read('[data-desktop-settings-region="settings-tab"]'),
        tabPanel: read('[data-desktop-settings-region="tab-panel"]'),
        appearancePanel: read('[data-desktop-settings-region="appearance-panel"]'),
        styleButton: read('[data-desktop-settings-region="style-button"]'),
        stylePreview: read('[data-desktop-settings-region="style-preview"]'),
        fontPanel: read('[data-desktop-settings-region="font-panel"]'),
        fontPackButton: read('[data-desktop-settings-region="font-pack-button"]'),
        chatPresetButton: read('[data-desktop-settings-region="chat-preset-button"]'),
        desktopPanel: read('[data-desktop-settings-region="desktop-panel"]'),
        cursorPanel: read('[data-desktop-settings-region="cursor-panel"]'),
        physicsPanel: read('[data-desktop-settings-region="physics-panel"]'),
        sourceButton: read('[data-desktop-settings-region="source-button"]'),
        segmentButton: read('[data-desktop-settings-region="segment-button"]'),
        toolbarButton: read('[data-desktop-settings-region="toolbar-button"]'),
        petPanel: read('[data-desktop-settings-region="pet-panel"]'),
        petBox: read('[data-desktop-settings-region="pet-box"]'),
        statBar: read('[data-desktop-settings-region="stat-bar"]'),
        agentPanel: read('[data-desktop-settings-region="agent-panel"]'),
        tokenRow: read('[data-desktop-settings-region="token-row"]'),
        globalSave: read('[data-desktop-settings-region="global-save"]'),
      };
    });

    expect(settingsMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const [key, region] of Object.entries(settingsMetrics)) {
      expect(region, `missing Theme Builder metric: ${key}`).not.toBeNull();
      expect(region.backgroundImage).toBe("none");
      expect(region.boxShadow).toBe("none");
      expect(region.textShadow).toBe("none");
      expect(region.radius).toBeLessThanOrEqual(6);
      expect(region.borderWidth).toBeLessThanOrEqual(1);
    }
    expect(settingsMetrics.stylePreview?.color).toBeTruthy();

    await surface.getByTestId("desktop-settings-tab-font").click();
    await expect(surface.getByTestId("font-pack-wtfos-soft-system")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(surface.getByTestId("font-pack-terminal")).toHaveCount(0);
    await surface.getByTestId("font-pack-wtfos-soft-system").click();
    await expect(page).toHaveURL(/\/gamma\/theme-builder$/);
    await expectGammaRouteReady(page, "/theme-builder");

    await gotoGammaRoute(page, "/desktop-settings");
    const aliasSurface = page.locator(
      '[data-gamma-application-content] [data-desktop-settings-surface="theme-builder"]'
    );
    await expect(aliasSurface).toHaveAttribute("data-desktop-settings-presentation-host", "gamma");
    await aliasSurface.getByTestId("desktop-settings-tab-background").click();
    await expect(aliasSurface).toContainText("Gamma Snapshot");
    await aliasSurface.getByTestId("desktop-settings-tab-agent").click();
    await expect(aliasSurface).toContainText("Agent pairing");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts System Settings hub chrome and owner-route handoffs in the Gamma presentation style", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });
    await gotoGammaRoute(page, "/settings");

    const settingsSurface = page.locator(
      '[data-gamma-application-content] [data-system-settings-surface="settings"]'
    );
    await expect(settingsSurface).toHaveAttribute("data-system-settings-presentation-host", "gamma");
    await expect(settingsSurface).toContainText("System settings");
    await expect(settingsSurface).toContainText("Subdomain Setup");
    await expect(settingsSurface).toContainText("Settings ownership stays with each app");

    const settingsMetrics = await settingsSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.matches(selector) ? surface : surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Math.max(
            Number.parseFloat(style.borderTopWidth || "0"),
            Number.parseFloat(style.borderRightWidth || "0"),
            Number.parseFloat(style.borderBottomWidth || "0"),
            Number.parseFloat(style.borderLeftWidth || "0")
          ),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Math.max(
            Number.parseFloat(style.borderTopLeftRadius || "0"),
            Number.parseFloat(style.borderTopRightRadius || "0"),
            Number.parseFloat(style.borderBottomRightRadius || "0"),
            Number.parseFloat(style.borderBottomLeftRadius || "0")
          ),
          textShadow: style.textShadow,
        };
      };
      return {
        surface: read('[data-system-settings-region="surface"]'),
        statusCell: read('[data-system-settings-region="status-cell"]'),
        panel: read('[data-system-settings-region="panel"]'),
        card: read('[data-system-settings-region="card"]'),
        icon: read('[data-system-settings-region="icon"]'),
        openButton: read('[data-system-settings-region="open-button"]'),
      };
    });

    expect(settingsMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const [key, region] of Object.entries(settingsMetrics)) {
      expect(region, `missing System Settings metric: ${key}`).not.toBeNull();
      expect(region.backgroundImage).toBe("none");
      expect(region.boxShadow).toBe("none");
      expect(region.textShadow).toBe("none");
      expect(region.radius).toBeLessThanOrEqual(6);
      expect(region.borderWidth).toBeLessThanOrEqual(1);
    }
    expect(settingsMetrics.icon?.color).toBe("rgb(0, 210, 255)");

    await settingsSurface.getByRole("button", { name: "Open Subdomain Setup" }).click();
    await expect(page).toHaveURL(/\/gamma\/wtf-subdomains\/setup$/);
    await expectGammaRouteReady(page, "/wtf-subdomains/setup");
  });

  test("hosts remote Applications apphost chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });
    const transparentPixel =
      "data:image/gif;base64,R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
    await page.route("**/api/apphost/apps", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          activeSession: {
            appId: "paintbox",
            appName: "Paintbox",
            state: "running",
            owner: {
              userId: "222",
              username: "gamma-host",
              displayName: "Gamma Host",
              label: "Gamma Host",
            },
            progress: { phase: "ready", label: "Ready", detail: "The application is open.", percent: 100 },
          },
          apps: [
            {
              id: "paintbox",
              name: "Paintbox",
              category: "Party game",
              summary: "Remote-hosted title selection with a private launch flow.",
              coverImageUrl: transparentPixel,
              coverImageAlt: "Paintbox cover art",
              displayRequired: true,
              audioRequired: false,
              startupTimeout: 15000,
              healthCheck: { type: "http" },
            },
            {
              id: "synth-rack",
              name: "Synth Rack",
              category: "Party game",
              summary: "A second remote title that must wait for the active session.",
              coverImageUrl: transparentPixel,
              coverImageAlt: "Synth Rack cover art",
              displayRequired: true,
              audioRequired: true,
              startupTimeout: 20000,
              healthCheck: { type: "process" },
            },
          ],
        }),
      });
    });
    await page.route("**/api/apphost/apps/*/status", async (route) => {
      const appId = route.request().url().includes("synth-rack") ? "synth-rack" : "paintbox";
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          status: {
            appId,
            state: appId === "paintbox" ? "running" : "stopped",
            pid: appId === "paintbox" ? 4242 : null,
            startedAt: "2026-06-29T12:00:00.000Z",
            stoppedAt: null,
            exitCode: null,
            health: { ok: appId === "paintbox", type: "http" },
            progress:
              appId === "paintbox"
                ? { phase: "ready", label: "Ready", detail: "The application is open.", percent: 100 }
                : {
                    phase: "idle",
                    label: "Ready to open",
                    detail: "Select Open when you are ready.",
                    percent: 0,
                  },
            owner:
              appId === "paintbox"
                ? {
                    userId: "222",
                    username: "gamma-host",
                    displayName: "Gamma Host",
                    label: "Gamma Host",
                  }
                : null,
            diagnostics: { display: "ready", source: "gamma-apphost-proof" },
          },
        }),
      });
    });

    await gotoGammaRoute(page, "/applications");

    const applicationsSurface = page.locator(
      '[data-gamma-application-content] [data-applications-surface="applications"]'
    );
    await expect(applicationsSurface).toHaveAttribute("data-applications-presentation-host", "gamma");
    await expect(applicationsSurface).toContainText("Paintbox");
    await expect(applicationsSurface).toContainText("Ready");
    await expect(applicationsSurface).toContainText('Sorry, try joining user "Gamma Host" in "Paintbox".');
    await expect(applicationsSurface.locator('[data-applications-region="title-carousel"]')).toBeVisible();
    await expect(applicationsSurface.locator('[data-applications-region="cover-image"]')).toHaveCount(2);
    await expect(applicationsSurface).not.toContainText("gamma-apphost-proof");
    await expect(applicationsSurface.locator('[data-applications-app-id="paintbox"]')).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    const applicationsMetrics = await applicationsSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.matches(selector) ? surface : surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Math.max(
            Number.parseFloat(style.borderTopWidth || "0"),
            Number.parseFloat(style.borderRightWidth || "0"),
            Number.parseFloat(style.borderBottomWidth || "0"),
            Number.parseFloat(style.borderLeftWidth || "0")
          ),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Math.max(
            Number.parseFloat(style.borderTopLeftRadius || "0"),
            Number.parseFloat(style.borderTopRightRadius || "0"),
            Number.parseFloat(style.borderBottomRightRadius || "0"),
            Number.parseFloat(style.borderBottomLeftRadius || "0")
          ),
          textShadow: style.textShadow,
        };
      };
      return {
        surface: read('[data-applications-region="surface"]'),
        toolbar: read('[data-applications-region="toolbar"]'),
        carouselShell: read('[data-applications-region="carousel-shell"]'),
        titleCard: read('[data-applications-region="title-card"]'),
        coverFrame: read('[data-applications-region="cover-frame"]'),
        cardPill: read('[data-applications-region="card-pill"]'),
        icon: read('[data-applications-region="icon"]'),
        launchWindow: read('[data-applications-region="launch-window"]'),
        conflictBanner: read('[data-applications-region="conflict-banner"]'),
        statusBlock: read('[data-applications-region="status-block"]'),
        statePill: read('[data-applications-region="state-pill"]'),
        progressTrack: read('[data-applications-region="progress-track"]'),
        progressFill: read('[data-applications-region="progress-fill"]'),
        actionButton: read('[data-applications-region="action-button"]'),
        supportNote: read('[data-applications-region="support-note"]'),
      };
    });

    expect(applicationsMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const [key, region] of Object.entries(applicationsMetrics)) {
      expect(region, `missing Applications metric: ${key}`).not.toBeNull();
      expect(region.backgroundImage).toBe("none");
      expect(region.boxShadow).toBe("none");
      expect(region.textShadow).toBe("none");
      expect(region.radius).toBeLessThanOrEqual(6);
      expect(region.borderWidth).toBeLessThanOrEqual(1);
    }
    expect(applicationsMetrics.icon?.color).toBe("rgb(0, 210, 255)");
    expect(applicationsMetrics.statePill?.color).toBe("rgb(7, 7, 6)");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("renders auth and data-heavy app primitives through Gamma presentation adapters", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "anonymous" });
    await page.goto("/gamma/login", { waitUntil: "domcontentloaded" });

    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/login");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
    await expect(page.locator('[data-gamma-application-content] [data-gamma-ui="window"]').first()).toBeVisible();
    await expect(page.locator('[data-gamma-application-content] [data-gamma-ui="window-header"]').first()).toBeVisible();
    await expect(page.locator('[data-gamma-application-content] [data-gamma-ui="text-input"]').first()).toBeVisible();

    await page.goto("/gamma/leaderboard", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/leaderboard");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
    await expect(page.locator('[data-gamma-application-content] [data-gamma-ui="tabs"]').first()).toBeVisible();
    await expect(page.locator('[data-gamma-application-content] [data-gamma-ui="table"]').first()).toBeVisible();
  });

  test("preserves the attempted Gamma route through auth return", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "anonymous" });

    let loggedIn = false;
    const authUser = {
      id: 44,
      username: "gamma-login-return",
      displayName: "Gamma Login Return",
      role: "user",
      roles: ["user"],
      welcomedToWtfOs: true,
      gmWelcomeUtcDay: "2026-07-14",
      gmWelcomeLastSeenAt: "2026-07-14T00:00:00.000Z",
      gmWelcome: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      effectivePermissions: {},
    };

    await page.route("**/api/auth/user", async (route) => {
      if (!loggedIn) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Not authenticated" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(authUser),
      });
    });
    await page.route("**/api/auth/login", async (route) => {
      loggedIn = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(authUser),
      });
    });

    await page.goto("/gamma/tools/broot", { waitUntil: "domcontentloaded" });
    await expectGammaRouteReady(page, "/tools/broot");
    const gate = page.locator('[data-gamma-route-gate="auth-required"]');
    await expect(gate).toBeVisible();
    const returnButton = gate.locator('[data-gamma-auth-primary-action="enter-return"]');
    await expect(returnButton).toHaveAttribute("data-gamma-auth-return", "/tools/broot");
    await expect(returnButton).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/gamma\/login\?return=%2Ftools%2Fbroot$/);
    await expectGammaRouteReady(page, "/login");
    await expect(page.locator("[data-gamma-application-content]")).toContainText(
      "the Gamma route you opened"
    );
    await expect(page.getByLabel("Username")).toBeFocused();

    await page.getByLabel("Username").fill(authUser.username);
    await page.getByLabel("Password").fill("correct-password");
    await page
      .locator("[data-gamma-application-content]")
      .getByRole("button", { name: "Log In", exact: true })
      .click();

    await expect(page).toHaveURL(/\/gamma\/tools\/broot$/);
    await expectGammaRouteReady(page, "/tools/broot");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts creation tool iframe chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-creator", displayName: "Gamma Creator" });
    await gotoGammaRoute(page, "/tools/broot");

    const toolSurface = page.locator('[data-gamma-application-content] [data-creation-tool-surface="iframe-shell"]');
    await expect(toolSurface).toHaveAttribute("data-creation-tool-presentation-host", "gamma");
    await expect(toolSurface).toHaveAttribute("data-creation-tool-id", "broot");
    await expect(toolSurface).toHaveAttribute("data-tool-domain", "visual-art");
    await expect(toolSurface).toContainText("Tezos-native Photoshop alternative");
    await expect(toolSurface.locator('iframe[title="Broot"]')).toHaveAttribute("src", "/creation-tools/broot/index.html");
    await expect(toolSurface.locator('iframe[title="Broot"]')).toBeVisible();

    const toolMetrics = await toolSurface.evaluate((surface) => {
      const read = (node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          textShadow: style.textShadow,
        };
      };
      const header = surface.querySelector('[data-creation-tool-region="header"]');
      const title = surface.querySelector('[data-creation-tool-region="title-block"]');
      const attribution = surface.querySelector('[data-creation-tool-region="attribution"]');
      const iframe = surface.querySelector('[data-creation-tool-region="iframe"]');
      return {
        surface: read(surface),
        header: header ? read(header) : null,
        title: title ? read(title) : null,
        attribution: attribution ? read(attribution) : null,
        iframe: iframe ? read(iframe) : null,
      };
    });

    for (const [key, region] of Object.entries(toolMetrics)) {
      expect(region, `missing creation tool Gamma metric: ${key}`).not.toBeNull();
      expect(region.backgroundImage).toBe("none");
      expect(region.boxShadow).toBe("none");
      expect(region.textShadow).toBe("none");
      expect(region.radius).toBeLessThanOrEqual(6);
    }
    expect(toolMetrics.surface.fontFamily).toMatch(/Inter|sans-serif/i);
    expect(toolMetrics.header?.borderWidth).toBeLessThanOrEqual(1);
    expect(toolMetrics.iframe?.borderColor).toMatch(/0,\s*210,\s*255/);
  });

  test("hosts media creation tool iframe suite in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });

    const mediaTools = [
      {
        id: "particle-painter",
        route: "/tools/particle-painter",
        title: "PArticle Painter",
        subtitle: "Audio-reactive particle studio",
        domain: "particle-art",
        src: "/creation-tools/particle-painter/index.html",
        attribution: false,
      },
      {
        id: "industrializer",
        route: "/tools/industrializer",
        title: "INDUSTR1ALIZER",
        subtitle: "JACK INDUSTRIES image processing terminal",
        domain: "visual-art",
        src: "/creation-tools/industrializer/index.html",
        attribution: false,
      },
      {
        id: "pauls-particles-v1",
        route: "/tools/pauls-particles-v1",
        title: "Paul's Particles V1.0",
        subtitle: "Original particle capture tool",
        domain: "particle-art",
        src: "/creation-tools/pauls-particles-v1/index.html",
        attribution: false,
      },
      {
        id: "nikshumika-paint",
        route: "/tools/nikshumika-paint",
        title: "Nikshumika Paint",
        subtitle: "Cell-art painting grid",
        domain: "visual-art",
        src: "/creation-tools/nikshumika-paint/index.html",
        attribution: true,
      },
      {
        id: "kandinsky-composer",
        route: "/tools/kandinsky-composer",
        title: "Kandinsky Composer",
        subtitle: "Shape-and-motion composition studio",
        domain: "visual-art",
        src: "/creation-tools/kandinsky-composer/index.html",
        attribution: true,
      },
      {
        id: "macaroni",
        route: "/tools/macaroni",
        title: "Macaroni",
        subtitle: "Blind-mint drop studio",
        domain: "drop-studio",
        src: "/creation-tools/macaroni/index.html",
        attribution: true,
      },
      {
        id: "pixel-patterns",
        route: "/tools/pixel-patterns",
        title: "PixelPatterns",
        subtitle: "Procedural tiling pattern studio",
        domain: "pattern-art",
        src: "/creation-tools/pixel-patterns/index.html",
        attribution: true,
      },
      {
        id: "penrose-backgrounds",
        route: "/tools/penrose-backgrounds",
        title: "PenRose Backgrounds",
        subtitle: "Infinite aperiodic Penrose tiling backgrounds",
        domain: "pattern-art",
        src: "/creation-tools/penrose-backgrounds/index.html",
        attribution: true,
      },
    ];

    const readGammaMetrics = async (surface, selectors) =>
      surface.evaluate((node, selectorMap) => {
        const read = (selector) => {
          const target = node.matches(selector) ? node : node.querySelector(selector);
          if (!target) return null;
          const style = window.getComputedStyle(target);
          return {
            backgroundImage: style.backgroundImage,
            borderWidth: Math.max(
              Number.parseFloat(style.borderTopWidth || "0"),
              Number.parseFloat(style.borderRightWidth || "0"),
              Number.parseFloat(style.borderBottomWidth || "0"),
              Number.parseFloat(style.borderLeftWidth || "0")
            ),
            boxShadow: style.boxShadow,
            color: style.color,
            fontFamily: style.fontFamily,
            radius: Math.max(
              Number.parseFloat(style.borderTopLeftRadius || "0"),
              Number.parseFloat(style.borderTopRightRadius || "0"),
              Number.parseFloat(style.borderBottomRightRadius || "0"),
              Number.parseFloat(style.borderBottomLeftRadius || "0")
            ),
            textShadow: style.textShadow,
          };
        };
        return Object.fromEntries(Object.entries(selectorMap).map(([key, selector]) => [key, read(selector)]));
      }, selectors);

    for (const tool of mediaTools) {
      await gotoGammaRoute(page, tool.route);

      const toolSurface = page.locator(
        '[data-gamma-application-content] [data-creation-tool-surface="iframe-shell"]'
      );
      await expect(toolSurface).toHaveAttribute("data-creation-tool-presentation-host", "gamma");
      await expect(toolSurface).toHaveAttribute("data-creation-tool-id", tool.id);
      await expect(toolSurface).toHaveAttribute("data-tool-domain", tool.domain);
      await expect(toolSurface).toContainText(tool.title);
      await expect(toolSurface).toContainText(tool.subtitle);
      await expect(toolSurface.locator(`iframe[title="${tool.title}"]`)).toHaveAttribute("src", tool.src);
      await expect(toolSurface.locator(`iframe[title="${tool.title}"]`)).toBeVisible();
      await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

      if (tool.attribution) {
        await expect(toolSurface.locator('[data-creation-tool-region="attribution"]')).toBeVisible();
      } else {
        await expect(toolSurface.locator('[data-creation-tool-region="attribution"]')).toHaveCount(0);
      }

      const selectors = {
        surface: '[data-creation-tool-surface="iframe-shell"]',
        header: '[data-creation-tool-region="header"]',
        title: '[data-creation-tool-region="title-block"]',
        iframe: '[data-creation-tool-region="iframe"]',
      };
      if (tool.attribution) {
        selectors.attribution = '[data-creation-tool-region="attribution"]';
      }
      const toolMetrics = await readGammaMetrics(toolSurface, selectors);

      expect(toolMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
      for (const [key, region] of Object.entries(toolMetrics)) {
        expect(region, `missing media creation tool Gamma metric: ${tool.id}:${key}`).not.toBeNull();
        expect(region.backgroundImage).toBe("none");
        expect(region.boxShadow).toBe("none");
        expect(region.textShadow).toBe("none");
        expect(region.radius).toBeLessThanOrEqual(6);
        expect(region.borderWidth).toBeLessThanOrEqual(1);
      }
    }
  });

  test("hosts Pasta Protocol publisher suite and Colander chrome in the Gamma presentation style", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-pasta", displayName: "Gamma Pasta" });

    const pastaPublishers = [
      {
        id: "spaghetti",
        route: "/tools/spaghetti",
        title: "Spaghetti",
        subtitle: "Standard collection and token-product publisher",
        src: "/creation-tools/spaghetti/index.html",
      },
      {
        id: "gnocchi",
        route: "/tools/gnocchi",
        title: "Gnocchi",
        subtitle: "Open-edition publisher",
        src: "/creation-tools/gnocchi/index.html",
      },
      {
        id: "ravioli",
        route: "/tools/ravioli",
        title: "Ravioli",
        subtitle: "Bundle publisher",
        src: "/creation-tools/ravioli/index.html",
      },
      {
        id: "rotini",
        route: "/tools/rotini",
        title: "Rotini",
        subtitle: "Generative publisher",
        src: "/creation-tools/rotini/index.html",
      },
      {
        id: "penne",
        route: "/tools/penne",
        title: "Penne",
        subtitle: "Distribution publisher",
        src: "/creation-tools/penne/index.html",
      },
      {
        id: "lasagna",
        route: "/tools/lasagna",
        title: "Lasagna",
        subtitle: "On-chain curation and exhibition publisher",
        src: "/creation-tools/lasagna/index.html",
      },
    ];

    const readGammaMetrics = async (surface, selectors) =>
      surface.evaluate((node, selectorMap) => {
        const read = (selector) => {
          const target = node.matches(selector) ? node : node.querySelector(selector);
          if (!target) return null;
          const style = window.getComputedStyle(target);
          return {
            backgroundImage: style.backgroundImage,
            borderWidth: Math.max(
              Number.parseFloat(style.borderTopWidth || "0"),
              Number.parseFloat(style.borderRightWidth || "0"),
              Number.parseFloat(style.borderBottomWidth || "0"),
              Number.parseFloat(style.borderLeftWidth || "0")
            ),
            boxShadow: style.boxShadow,
            color: style.color,
            fontFamily: style.fontFamily,
            radius: Math.max(
              Number.parseFloat(style.borderTopLeftRadius || "0"),
              Number.parseFloat(style.borderTopRightRadius || "0"),
              Number.parseFloat(style.borderBottomRightRadius || "0"),
              Number.parseFloat(style.borderBottomLeftRadius || "0")
            ),
            textShadow: style.textShadow,
          };
        };
        return Object.fromEntries(Object.entries(selectorMap).map(([key, selector]) => [key, read(selector)]));
      }, selectors);

    for (const publisher of pastaPublishers) {
      await gotoGammaRoute(page, publisher.route);

      const toolSurface = page.locator(
        '[data-gamma-application-content] [data-creation-tool-surface="iframe-shell"]'
      );
      await expect(toolSurface).toHaveAttribute("data-creation-tool-presentation-host", "gamma");
      await expect(toolSurface).toHaveAttribute("data-creation-tool-id", publisher.id);
      await expect(toolSurface).toHaveAttribute("data-tool-domain", "pasta-protocol");
      await expect(toolSurface).toContainText(publisher.title);
      await expect(toolSurface).toContainText(publisher.subtitle);
      await expect(toolSurface.locator(`iframe[title="${publisher.title}"]`)).toHaveAttribute("src", publisher.src);
      await expect(toolSurface.locator(`iframe[title="${publisher.title}"]`)).toBeVisible();

      const toolMetrics = await readGammaMetrics(toolSurface, {
        surface: '[data-creation-tool-surface="iframe-shell"]',
        header: '[data-creation-tool-region="header"]',
        title: '[data-creation-tool-region="title-block"]',
        attribution: '[data-creation-tool-region="attribution"]',
        iframe: '[data-creation-tool-region="iframe"]',
      });

      expect(toolMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
      for (const [key, region] of Object.entries(toolMetrics)) {
        expect(region, `missing Pasta publisher Gamma metric: ${publisher.id}:${key}`).not.toBeNull();
        expect(region.backgroundImage).toBe("none");
        expect(region.boxShadow).toBe("none");
        expect(region.textShadow).toBe("none");
        expect(region.radius).toBeLessThanOrEqual(6);
        expect(region.borderWidth).toBeLessThanOrEqual(1);
      }
    }

    await gotoGammaRoute(page, "/tools/colander");

    const colanderSurface = page.locator('[data-gamma-application-content] [data-colander-surface="control-panel"]');
    await expect(colanderSurface).toHaveAttribute("data-colander-presentation-host", "gamma");
    await expect(colanderSurface).toContainText("Pasta Protocol ownership");
    await expect(colanderSurface).toContainText("Open a contract to manage it");
    await expect(colanderSurface.getByTestId("colander-address")).toHaveAttribute("placeholder", "KT1…");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const colanderMetrics = await readGammaMetrics(colanderSurface, {
      surface: '[data-colander-surface="control-panel"]',
      header: '[data-colander-region="header"]',
      brand: '[data-colander-region="brand"]',
      wallet: '[data-colander-region="wallet"]',
      toolbar: '[data-colander-region="toolbar"]',
      field: '[data-colander-region="field"]',
      input: '[data-colander-region="input"]',
      primaryButton: '[data-colander-region="primary-button"]',
      empty: '[data-colander-region="empty"]',
      status: '[data-colander-region="status"]',
      chip: '[data-colander-region="chip"]',
    });

    expect(colanderMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const [key, region] of Object.entries(colanderMetrics)) {
      expect(region, `missing Colander Gamma metric: ${key}`).not.toBeNull();
      expect(region.backgroundImage).toBe("none");
      expect(region.boxShadow).toBe("none");
      expect(region.textShadow).toBe("none");
      expect(region.radius).toBeLessThanOrEqual(6);
      expect(region.borderWidth).toBeLessThanOrEqual(1);
    }
    expect(colanderMetrics.primaryButton?.color).toBe("rgb(7, 7, 6)");
  });

  test("hosts CH-EASE package routes and handoffs in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });

    const packageSummary = {
      id: 1,
      title: "Gamma handoff package",
      description: "Gamma route containment proof.",
      status: "finalized",
      itemCount: 1,
      totalBytes: 1024,
      averageBytes: 1024,
      csvCid: "bafyGammaCsv",
      manifestCid: "bafyGammaManifest",
      dropConfig: {
        exportTarget: "drop-art",
        layout: "multi-page",
        theme: "arcade",
        headline: "Gamma Package",
        intro: "A package that proves CH-EASE remains inside Gamma.",
        callToAction: "Open the proof",
        modules: {
          dropStory: true,
          mintPanel: true,
          tokenGrid: true,
          recentMints: true,
          mintGallery: true,
          leaderboard: true,
          collectionCompletion: true,
        },
      },
      finalizedAt: "2026-06-29T12:00:00.000Z",
      updatedAt: "2026-06-29T12:00:00.000Z",
    };
    const packageDetail = {
      package: packageSummary,
      items: [
        {
          id: 7,
          packageId: 1,
          tokenId: 1,
          originalFilename: "Gamma Salad FINAL.png",
          originalTitle: "Gamma Salad FINAL",
          normalizedFilename: "1.png",
          tokenName: "Gamma Salad Deluxe",
          tokenDescription: "A routed package proof.",
          mimeType: "image/png",
          sizeBytes: 1024,
          mediaCid: "bafyGammaMedia",
          metadataCid: "bafyGammaMetadata",
          tags: ["gamma", "chease"],
          attributes: [{ name: "route", value: "gamma" }],
          readiness: {
            hasMedia: true,
            hasMetadata: true,
            hasName: true,
            readyForMint: true,
            warnings: [],
          },
        },
      ],
    };

    await page.route("**/api/macaroni/packages**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/macaroni/packages") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ packages: [packageSummary] }),
        });
        return;
      }
      if (url.pathname === "/api/macaroni/packages/1") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(packageDetail),
        });
        return;
      }
      if (url.pathname === "/api/macaroni/packages/1/source") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ ok: true, package: packageSummary, items: packageDetail.items }),
        });
        return;
      }
      if (url.pathname === "/api/macaroni/packages/1/config" || url.pathname === "/api/macaroni/packages/1/finalize") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(packageDetail),
        });
        return;
      }
      await route.fallback();
    });

    const readGammaMetrics = async (surface, selectors) =>
      surface.evaluate((node, selectorMap) => {
        const read = (selector) => {
          const target = node.matches(selector) ? node : node.querySelector(selector);
          if (!target) return null;
          const style = window.getComputedStyle(target);
          return {
            backgroundImage: style.backgroundImage,
            borderWidth: Math.max(
              Number.parseFloat(style.borderTopWidth || "0"),
              Number.parseFloat(style.borderRightWidth || "0"),
              Number.parseFloat(style.borderBottomWidth || "0"),
              Number.parseFloat(style.borderLeftWidth || "0")
            ),
            boxShadow: style.boxShadow,
            color: style.color,
            fontFamily: style.fontFamily,
            radius: Math.max(
              Number.parseFloat(style.borderTopLeftRadius || "0"),
              Number.parseFloat(style.borderTopRightRadius || "0"),
              Number.parseFloat(style.borderBottomRightRadius || "0"),
              Number.parseFloat(style.borderBottomLeftRadius || "0")
            ),
            textShadow: style.textShadow,
          };
        };
        return Object.fromEntries(Object.entries(selectorMap).map(([key, selector]) => [key, read(selector)]));
      }, selectors);

    for (const routePath of ["/tools/ch-ease", "/tools/macaroni-packager"]) {
      await gotoGammaRoute(page, routePath);

      const cheaseSurface = page.locator('[data-gamma-application-content] [data-chease-surface="packager"]');
      await expect(cheaseSurface).toHaveAttribute("data-chease-presentation-host", "gamma");
      await expect(cheaseSurface).toContainText("CH-EASE");
      await expect(cheaseSurface).toContainText("Creator Handoff: Edit, Arrange, Stage, Export");
      await expect(cheaseSurface).toContainText("Gamma handoff package");
      await expect(cheaseSurface).toContainText("Gamma Salad Deluxe");
      await expect(cheaseSurface).toContainText("Gamma Package");
      await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

      const cheaseMetrics = await readGammaMetrics(cheaseSurface, {
        surface: '[data-chease-region="surface"]',
        header: '[data-chease-region="header"]',
        toolbar: '[data-chease-region="toolbar"]',
        step: '[data-chease-region="step"]',
        targetStrip: '[data-chease-region="target-strip"]',
        targetButton: '[data-chease-region="target-button"]',
        handoffStrip: '[data-chease-region="handoff-strip"]',
        pastaToolbar: '[data-chease-region="pasta-toolbar"]',
        panel: '[data-chease-region="panel"]',
        panelHeader: '[data-chease-region="panel-header"]',
        mediaCard: '[data-chease-region="media-card"]',
        dropPreview: '[data-chease-region="drop-preview"]',
        button: '[data-chease-region="button"]',
        fieldControl: '[data-chease-region="field-control"]',
        status: '[data-chease-region="status"]',
      });

      expect(cheaseMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
      for (const [key, region] of Object.entries(cheaseMetrics)) {
        expect(region, `missing CH-EASE Gamma metric: ${routePath}:${key}`).not.toBeNull();
        expect(region.backgroundImage).toBe("none");
        expect(region.boxShadow).toBe("none");
        expect(region.textShadow).toBe("none");
        expect(region.radius).toBeLessThanOrEqual(6);
        expect(region.borderWidth).toBeLessThanOrEqual(1);
      }
    }

    const openAndAssertGammaPopup = async (buttonName, expectedPath) => {
      const popupPromise = page.waitForEvent("popup");
      await page.getByRole("button", { name: buttonName }).click();
      const popup = await popupPromise;
      await popup.waitForLoadState("domcontentloaded");
      await expect(popup).toHaveURL(new RegExp(`/gamma${expectedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      await expect(popup.locator("[data-gamma-wtfos]")).toBeVisible({ timeout: 30_000 });
      await expect(popup.locator("[data-wtf-desktop]")).toHaveCount(0);
      await popup.close();
    };

    await openAndAssertGammaPopup("Open Studio", "/studio");
    await openAndAssertGammaPopup("WTF Domains", "/wtf-subdomains/setup");
    await openAndAssertGammaPopup("IPFS storage", "/ipfs-pinning");
    await openAndAssertGammaPopup("Load package in Macaroni", "/tools/macaroni");
    await openAndAssertGammaPopup("Open in Pasta app", "/tools/spaghetti");
  });

  test("hosts Studio project list and workspace chrome in the Gamma presentation style", async ({ page, request }) => {
    const now = "2026-06-28T12:00:00.000Z";
    const transparentPixel =
      "data:image/gif;base64,R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });

    await page.route("**/api/auth/user", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 1,
          username: "the-count",
          displayName: "The Count",
          role: "admin",
          roles: ["admin"],
          welcomedToWtfOs: true,
          welcomedToWtfOsAt: "2026-01-01T00:00:00Z",
          gmWelcomeUtcDay: "2026-06-28",
          gmWelcomeLastSeenAt: now,
          gmWelcome: null,
          createdAt: "2026-01-01T00:00:00Z",
          effectivePermissions: {
            access_admin_panel: true,
            access_studio: true,
            create_studio_projects: true,
            manage_roles: true,
          },
        }),
      });
    });
    await page.route("**/api/studio/projects**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/studio/projects/909") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            project: {
              id: 909,
              name: "Gamma creator room",
              description: "Review the next WTFOS drop without leaving Gamma.",
              ownerUserId: 1,
              coverImageUrl: null,
              storageBackend: "local_disk",
              storageContext: null,
              storageQuotaBytes: 250000000,
              storageUsedBytes: 42000000,
              conversationId: 330,
              workflow: {
                phase: "refine",
                useCase: "collection",
                targetNetwork: "shadownet",
                checklist: { feedback_resolved: false, metadata_ready: true },
                references: {},
              },
              archived: false,
              createdAt: now,
              updatedAt: now,
            },
            role: "owner",
            isPlatformModerator: true,
            members: [
              { userId: 1, username: "the-count", displayName: "The Count", avatarUrl: null, role: "owner" },
              { userId: 2, username: "gamma-creator", displayName: "Gamma Creator", avatarUrl: null, role: "editor" },
            ],
            folders: [{ id: 77, name: "Drop review", parentFolderId: null, position: 0 }],
            files: [
              {
                id: 501,
                folderId: 77,
                name: "signal-board.png",
                mimeType: "image/png",
                sizeBytes: 1048576,
                previewUrl: transparentPixel,
                thumbnailUrl: transparentPixel,
                currentVersion: 1,
                uploaderId: 2,
                uploaderDisplayName: "Gamma Creator",
                metadata: null,
                position: 0,
                updatedAt: now,
              },
            ],
            userState: { lastOpenProjectId: 909, state: {}, updatedAt: now },
          }),
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          projects: [
            {
              id: 909,
              name: "Gamma creator room",
              description: "Review the next WTFOS drop without leaving Gamma.",
              role: "owner",
              memberCount: 2,
              fileCount: 1,
              unresolvedAnnotations: 1,
              archived: false,
              storageBackend: "local_disk",
              storageQuotaBytes: 250000000,
              storageUsedBytes: 42000000,
              createdAt: now,
              updatedAt: now,
              workflow: {
                phase: "refine",
                useCase: "collection",
                targetNetwork: "shadownet",
                checklist: { feedback_resolved: false, metadata_ready: true },
                references: {},
              },
            },
          ],
        }),
      });
    });
    await page.route("**/api/studio/user-state", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({ status: 204, body: "" });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ lastOpenProjectId: null, state: {}, updatedAt: null }),
      });
    });
    await page.route("**/api/studio/drive/status", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          envConfigured: true,
          cryptoConfigured: true,
          canConnect: true,
          configured: true,
          connected: true,
          accountEmail: "count@gamma.wtfos",
          scopes: "drive.file",
          connectedAt: now,
          lastRefreshedAt: now,
          hasDedicatedRedirect: true,
          appUsage: { bytes: 42000000, fileCount: 4 },
          dependentProjectCount: 1,
        }),
      });
    });
    await page.route("**/api/studio/files/501/annotations", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          annotations: [
            {
              id: 601,
              fileId: 501,
              versionId: 1,
              authorUserId: 2,
              authorDisplayName: "Gamma Creator",
              kind: "pin",
              data: { x: 0.45, y: 0.35, body: "Make this surface feel alive." },
              color: null,
              resolved: false,
              createdAt: now,
              updatedAt: now,
              comments: [],
            },
          ],
        }),
      });
    });
    await page.route("**/api/messages/dms/330/messages**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 7001,
            conversationId: 330,
            senderId: 2,
            username: "gamma-creator",
            displayName: "Gamma Creator",
            avatarUrl: null,
            role: "creator",
            content: "First proof is ready for Count review.",
            messageType: "user",
            metadata: null,
            pinned: true,
            createdAt: now,
            editedAt: null,
          },
        ]),
      });
    });
    await page.route("**/api/messages/dms/330/pins", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 7001,
            conversationId: 330,
            senderId: 2,
            username: "gamma-creator",
            displayName: "Gamma Creator",
            avatarUrl: null,
            role: "creator",
            content: "First proof is ready for Count review.",
            messageType: "user",
            metadata: null,
            pinned: true,
            createdAt: now,
            editedAt: null,
          },
        ]),
      });
    });

    await gotoGammaRoute(page, "/studio");

    const listSurface = page.locator('[data-gamma-application-content] [data-studio-surface="project-list"]');
    await expect(listSurface).toHaveAttribute("data-studio-presentation-host", "gamma");
    await expect(listSurface.locator('[data-studio-region="project-card"]')).toContainText("Gamma creator room");
    await expect(listSurface.locator('[data-studio-region="drive-panel"]')).toContainText("count@gamma.wtfos");

    const listMetrics = await listSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          textShadow: style.textShadow,
        };
      };
      return {
        card: read('[data-studio-region="project-card"]'),
        drive: read('[data-studio-region="drive-panel"]'),
        create: read('[data-studio-region="create-panel"]'),
      };
    });
    for (const key of ["card", "drive", "create"]) {
      expect(listMetrics[key], `missing Studio list metric: ${key}`).not.toBeNull();
      expect(listMetrics[key].backgroundImage).toBe("none");
      expect(listMetrics[key].boxShadow).toBe("none");
      expect(listMetrics[key].textShadow).toBe("none");
      expect(listMetrics[key].radius).toBeLessThanOrEqual(6);
      expect(listMetrics[key].borderWidth).toBeLessThanOrEqual(1);
    }

    await listSurface.locator('[data-studio-region="project-card"]').click();
    await expect(page).toHaveURL(/\/gamma\/studio\/909$/);
    await expectGammaRouteReady(page, "/studio/909");

    const workspace = page.locator('[data-gamma-application-content] [data-studio-surface="project-workspace"]');
    await expect(workspace).toHaveAttribute("data-studio-presentation-host", "gamma");
    await expect(workspace).toHaveAttribute("data-studio-project-id", "909");
    await expect(workspace.locator('[data-studio-region="project-journey"]')).toHaveAttribute("data-studio-phase", "refine");
    await expect(workspace.locator('[data-studio-region="project-journey"]')).toContainText("Connected wtfOS workflow");
    await expect(workspace.locator('[data-studio-region="project-journey"]')).toContainText("Pasta Protocol");
    await expect(workspace.getByRole("button", { name: "Coordinate in WIM" })).toBeVisible();
    await expect(workspace.getByRole("button", { name: "Create in broot" })).toBeVisible();
    await expect(workspace.getByRole("button", { name: "Prepare wtf Live" })).toBeVisible();
    await expect(workspace.locator('[data-studio-region="project-header"]')).toContainText("Gamma creator room");
    await expect(
      workspace.locator('[data-studio-region="tree-node"]').filter({ hasText: "signal-board.png" }).first()
    ).toBeVisible();
    await expect(workspace.locator('[data-studio-region="preview-stage"]')).toBeVisible();
    await expect(workspace.locator('[data-studio-region="chat-message"]')).toContainText("First proof is ready");
    await expect(workspace.locator('[data-studio-region="presence-chip"]')).toContainText("just you");

    const workspaceMetrics = await workspace.evaluate((surface) => {
      const readNode = (node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          textShadow: style.textShadow,
        };
      };
      const read = (selector) => {
        const node = surface.querySelector(selector);
        return node ? readNode(node) : null;
      };
      return {
        shell: readNode(surface),
        header: read('[data-studio-region="project-header"]'),
        toolbar: read('[data-studio-region="toolbar"]'),
        panel: read('[data-studio-region="panel-body"]'),
        preview: read('[data-studio-region="preview-stage"]'),
        message: read('[data-studio-region="chat-message"]'),
        presence: read('[data-studio-region="presence-chip"]'),
      };
    });
    for (const key of ["header", "toolbar", "panel", "preview", "message", "presence"]) {
      expect(workspaceMetrics[key], `missing Studio workspace metric: ${key}`).not.toBeNull();
      expect(workspaceMetrics[key].backgroundImage).toBe("none");
      expect(workspaceMetrics[key].boxShadow).toBe("none");
      expect(workspaceMetrics[key].textShadow).toBe("none");
      expect(workspaceMetrics[key].radius).toBeLessThanOrEqual(6);
      expect(workspaceMetrics[key].borderWidth).toBeLessThanOrEqual(1);
    }
    expect(workspaceMetrics.shell?.fontFamily).toMatch(/Inter|sans-serif/i);
    expect(workspaceMetrics.presence?.borderColor).toMatch(/214,\s*255,\s*63/);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(workspace.locator('[data-studio-region="project-journey"]')).toBeVisible();
    await expect(workspace.locator('[data-studio-region="journey-grid"]')).toBeVisible();
    const narrowJourneyColumns = await workspace
      .locator('[data-studio-region="journey-grid"]')
      .evaluate((node) => window.getComputedStyle(node).gridTemplateColumns.split(" ").length);
    expect(narrowJourneyColumns).toBe(1);
    await expect(workspace.getByRole("button", { name: "Save release evidence" })).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts Game Studio SDK chrome in the Gamma presentation style", async ({ page, request }) => {
    const now = "2026-06-28T12:00:00.000Z";
    const transparentPixel =
      "data:image/gif;base64,R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
    const projectFiles = {
      "index.html": "<canvas id=\"game\" width=\"960\" height=\"540\"></canvas>",
      "game.js": "await window.WTFConsole.ready();\nawait window.WTFConsole.updateScore(100);",
      "styles.css": "body { margin: 0; background: #070706; color: #f2ead9; }",
    };

    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });
    await page.route("**/api/game-studio/templates", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          templates: [
            {
              id: "endless-runner",
              title: "Gamma Runner",
              engine: "vanilla-canvas",
              genre: "arcade",
              description: "A compact Gamma proof game scaffold.",
              files: ["index.html", "game.js", "styles.css"],
              sdkHooks: ["ready", "startSession", "updateScore"],
            },
          ],
        }),
      });
    });
    await page.route("**/api/game-studio/templates/endless-runner/scaffold", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          template: {
            id: "endless-runner",
            title: "Gamma Runner",
            engine: "vanilla-canvas",
            genre: "arcade",
            description: "A compact Gamma proof game scaffold.",
            files: ["index.html", "game.js", "styles.css"],
            sdkHooks: ["ready", "startSession", "updateScore"],
          },
          files: projectFiles,
        }),
      });
    });
    await page.route("**/api/game-studio/assets", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          assets: [
            {
              id: "cyan-sprite",
              title: "Cyan Runner",
              kind: "sprite",
              tags: ["runner", "gamma"],
              license: "CC0",
              sourceName: "Gamma kit",
              uri: transparentPixel,
              bundlePath: "assets/cyan-runner.png",
              importSnippet: "const runner = window.WTFStudio.asset('assets/cyan-runner.png');",
            },
          ],
        }),
      });
    });
    await page.route("**/api/game-studio/snippets", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          snippets: [
            {
              id: "score-loop",
              title: "Score loop",
              category: "sdk",
              description: "Award a quick SDK score pulse.",
              tags: ["score", "loop"],
              targetFile: "game.js",
              code: "await window.WTFConsole.updateScore(100);",
            },
          ],
        }),
      });
    });
    await page.route("**/api/game-studio/projects", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          projects: [
            {
              id: 909,
              slug: "gamma-runner",
              title: "Gamma Runner",
              description: "The Count's Gamma-contained Game Studio proof.",
              templateId: "endless-runner",
              selectedAssetIds: ["cyan-sprite"],
              localAssets: [],
              files: projectFiles,
              lastSubmittedGameId: null,
              lastBuiltAt: now,
              updatedAt: now,
            },
          ],
        }),
      });
    });
    await page.route("**/api/game-studio/projects/909/builds**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          builds: [
            {
              id: 5001,
              projectId: 909,
              buildNumber: 12,
              filename: "gamma-runner.zip",
              mimeType: "application/zip",
              sizeBytes: 4096,
              checksumSha256: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
              createdAt: now,
            },
          ],
        }),
      });
    });
    await page.route("**/api/arcade/my-games", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ games: [] }) });
    });

    await gotoGammaRoute(page, "/game-studio");

    const surface = page.locator('[data-gamma-application-content] [data-game-studio-surface="workspace"]');
    await expect(surface).toHaveAttribute("data-game-studio-presentation-host", "gamma");
    await expect(surface.locator('[data-game-studio-region="project-card"]')).toContainText("Gamma Runner");
    await expect(surface.locator('[data-game-studio-region="template-card"]')).toContainText("Gamma Runner");
    await expect(surface.locator('[data-game-studio-region="asset-card"]')).toContainText("Cyan Runner");
    await expect(surface.locator('[data-game-studio-region="snippet-card"]')).toContainText("Score loop");

    await surface.locator('[data-game-studio-region="project-card"]').click();
    await surface.locator('[data-game-studio-region="file-button"]').filter({ hasText: "game.js" }).click();
    await expect(surface.locator('[data-game-studio-region="source-editor"]')).toHaveValue(/window\.WTFConsole/);
    await expect(surface.locator('[data-game-studio-region="asset-inspector"]')).toContainText("assets/cyan-runner.png");
    await expect(surface.locator('[data-game-studio-region="publish-panel"]')).toContainText("Ship Game");
    await expect(surface.locator('[data-game-studio-region="build-item"]')).toContainText("#12");

    const frame = surface.locator('[data-game-studio-region="preview-frame"]');
    await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    await expect(frame).toHaveAttribute("srcdoc", /WTFConsole/);

    const metrics = await surface.evaluate((root) => {
      const read = (selector) => {
        const node = root.matches(selector) ? root : root.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          textShadow: style.textShadow,
        };
      };
      return {
        surface: read('[data-game-studio-region="workspace"]'),
        templateRail: read('[data-game-studio-region="template-rail"]'),
        toolbar: read('[data-game-studio-region="toolbar"]'),
        projectCard: read('[data-game-studio-region="project-card"]'),
        previewPane: read('[data-game-studio-region="preview-pane"]'),
        previewStage: read('[data-game-studio-region="preview-stage"]'),
        previewFrame: read('[data-game-studio-region="preview-frame"]'),
        sourceEditor: read('[data-game-studio-region="source-editor"]'),
        publishPanel: read('[data-game-studio-region="publish-panel"]'),
        assetRail: read('[data-game-studio-region="asset-rail"]'),
        assetCard: read('[data-game-studio-region="asset-card"]'),
        snippetPanel: read('[data-game-studio-region="snippet-panel"]'),
        assetInspector: read('[data-game-studio-region="asset-inspector"]'),
      };
    });

    expect(metrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const [key, region] of Object.entries(metrics)) {
      expect(region, `missing Game Studio metric: ${key}`).not.toBeNull();
      expect(region.backgroundImage).toBe("none");
      expect(region.boxShadow).toBe("none");
      expect(region.textShadow).toBe("none");
      expect(region.radius).toBeLessThanOrEqual(6);
      expect(region.borderWidth).toBeLessThanOrEqual(1);
    }
    expect(metrics.assetCard?.borderColor).toMatch(/0,\s*210,\s*255/);
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts Arcade catalog and play chrome in the Gamma presentation style", async ({ page, request }) => {
    const transparentPixel =
      "data:image/gif;base64,R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
    const payment = {
      sku: "arcade-play-ticket",
      currency: "wtf",
      feeWtfUnits: "1000000000000000000",
      feeWtfFormatted: "1",
      contractAddress: null,
      routerListingId: 0,
      configured: false,
    };
    const game = {
      id: "gamma-breach",
      slug: "gamma-breach",
      title: "Gamma Breach",
      description: "A compact arcade containment proof.",
      mimeType: "text/html",
      thumbnailUri: transparentPixel,
      artifactUri: "/arcade/gamma-breach/index.html",
      tokenContract: "KT1GammaArcade000000000000000000000",
      tokenId: "12",
      isDemo: false,
      isPublished: true,
      kind: "html5",
      category: "action",
      builderName: "The Count",
      sourceUrl: "https://example.com/gamma-breach",
      sourceLabel: "Gamma source",
      licenseName: "CC0",
      playCount: 321,
      playerCount: 44,
      leaderboardEnabled: true,
      arcadeCreditsRequired: true,
      arcadeCreditPrice: 2,
    };

    await setHarnessState(request, {
      userRole: "admin",
      username: "the-count",
      displayName: "The Count",
    });
    await page.route("**/api/arcade/games", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          demos: [],
          published: [game],
          mine: [],
          all: [game],
          payment,
        }),
      });
    });
    await page.route("**/api/arcade/stats", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          totalGames: 1,
          publishedGames: 1,
          pendingGames: 0,
          sourceArcadeGames: 1,
          creatorGames: 0,
          gameStudioGames: 1,
          totalPlays: 321,
          totalPlayers: 44,
          totalScores: 88,
          totalConsoleXp: 6400,
          openReports: 0,
          latestSourceArcadeImportAt: "2026-06-29T12:00:00.000Z",
          latestConsoleActivityAt: "2026-06-29T12:00:00.000Z",
          topCategories: [{ category: "action", games: 1, plays: 321 }],
        }),
      });
    });
    await page.route("**/api/arcade/discovery**", async (route) => {
      const shelfItem = {
        id: 12,
        slug: "gamma-breach",
        title: "Gamma Breach",
        description: "A compact arcade containment proof.",
        category: "action",
        coverUri: transparentPixel,
        builderName: "The Count",
        sourceUrl: "https://example.com/gamma-breach",
        sourceLabel: "Gamma source",
        licenseName: "CC0",
        playCount: 321,
        playerCount: 44,
        updatedAt: "2026-06-29T12:00:00.000Z",
      };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          popular: [shelfItem],
          newest: [shelfItem],
          sourceArcade: [shelfItem],
          creator: [],
          studio: [shelfItem],
        }),
      });
    });
    await page.route("**/api/arcade/champions**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          champions: [
            {
              slug: "gamma-breach",
              title: "Gamma Breach",
              coverUri: transparentPixel,
              category: "action",
              userId: 1,
              username: "the-count",
              displayName: "The Count",
              score: 12000,
              submittedAt: "2026-06-29T12:00:00.000Z",
            },
          ],
        }),
      });
    });
    await page.route("**/api/arcade/players/top**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          players: [
            {
              rank: 1,
              userId: 1,
              username: "the-count",
              displayName: "The Count",
              gamesPlayed: 1,
              totalPlays: 22,
              totalScore: 12000,
              bestScore: 12000,
              firstPlaceCount: 1,
              consoleXp: 6400,
              lastPlayedAt: "2026-06-29T12:00:00.000Z",
            },
          ],
        }),
      });
    });
    await page.route("**/api/arcade/recent**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          scores: [
            {
              id: 12,
              slug: "gamma-breach",
              title: "Gamma Breach",
              gameSlug: "gamma-breach",
              gameTitle: "Gamma Breach",
              category: "action",
              userId: 1,
              username: "the-count",
              displayName: "The Count",
              score: 12000,
              submittedAt: "2026-06-29T12:00:00.000Z",
            },
          ],
        }),
      });
    });
    await page.route("**/api/arcade/play-fee", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ payment }) });
    });
    await page.route("**/api/arcade/play-status", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          userId: 1,
          sku: "arcade-play-ticket",
          cardSku: "arcade-play-card",
          cardsOwned: 1,
          ticketsOwned: 7,
          creditsRequired: true,
          creditsPerPlay: 2,
          bypass: false,
          canPlay: true,
          payment,
        }),
      });
    });
    await page.route("**/api/arcade/session", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "gamma-arcade-session",
          slug: "gamma-breach",
          player: { username: "the-count" },
          signed: true,
        }),
      });
    });
    await page.route("**/api/arcade/games/gamma-breach/report", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await gotoGammaRoute(page, "/arcade");

    const surface = page.locator('[data-gamma-application-content] [data-arcade-console-surface="arcade"]');
    await expect(surface).toHaveAttribute("data-arcade-console-presentation-host", "gamma");
    await expect(surface).toHaveAttribute("data-arcade-console-view", "library");
    await expect(surface.locator('[data-arcade-console-region="stats-strip"]')).toContainText("live games");
    await expect(surface.locator('[data-arcade-console-region="game-card"]')).toContainText("Gamma Breach");
    await expect(surface.locator('[data-arcade-console-region="discovery-card"]')).toContainText("Gamma Breach");
    await expect(surface.locator('[data-arcade-console-region="champion-card"]')).toContainText("The Count");
    await expect(surface.locator('[data-arcade-console-region="top-player-card"]')).toContainText("6400 XP");
    await expect(surface.locator('[data-arcade-console-region="recent-score-card"]')).toContainText("12,000");

    const card = surface.locator('[data-arcade-console-region="game-card"]').filter({ hasText: "Gamma Breach" });
    await card.locator('[data-arcade-console-region="report-button"]').click();
    await expect(surface.locator('[data-arcade-console-region="report-dialog"]')).toContainText("Report Gamma Breach");

    const metrics = await surface.evaluate((root) => {
      const read = (selector) => {
        const node = selector === "root" ? root : root.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Math.max(
            Number.parseFloat(style.borderTopWidth || "0"),
            Number.parseFloat(style.borderRightWidth || "0"),
            Number.parseFloat(style.borderBottomWidth || "0"),
            Number.parseFloat(style.borderLeftWidth || "0")
          ),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Math.max(
            Number.parseFloat(style.borderTopLeftRadius || "0"),
            Number.parseFloat(style.borderTopRightRadius || "0"),
            Number.parseFloat(style.borderBottomRightRadius || "0"),
            Number.parseFloat(style.borderBottomLeftRadius || "0")
          ),
          textShadow: style.textShadow,
        };
      };
      return {
        root: read("root"),
        chassis: read('[data-arcade-console-region="chassis"]'),
        topStrip: read('[data-arcade-console-region="top-strip"]'),
        screen: read('[data-arcade-console-region="screen"]'),
        stats: read('[data-arcade-console-region="stats-strip"]'),
        statChip: read('[data-arcade-console-region="stat-chip"]'),
        catalogPane: read('[data-arcade-console-region="catalog-pane"]'),
        gameCard: read('[data-arcade-console-region="game-card"]'),
        gameArt: read('[data-arcade-console-region="game-art"]'),
        rail: read('[data-arcade-console-region="activity-rail"]'),
        railSection: read('[data-arcade-console-region="rail-section"]'),
        discoveryCard: read('[data-arcade-console-region="discovery-card"]'),
        reportDialog: read('[data-arcade-console-region="report-dialog"]'),
        controlBar: read('[data-arcade-console-region="control-bar"]'),
      };
    });

    expect(metrics.root?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const [key, region] of Object.entries(metrics)) {
      expect(region, `missing Arcade metric: ${key}`).not.toBeNull();
      expect(region.backgroundImage).toBe("none");
      expect(region.boxShadow).toBe("none");
      expect(region.textShadow).toBe("none");
      expect(region.radius).toBeLessThanOrEqual(6);
      expect(region.borderWidth).toBeLessThanOrEqual(1);
    }
    expect(metrics.gameCard?.borderColor).toMatch(/242,\s*234,\s*217|0,\s*210,\s*255/);

    await surface.locator('[data-arcade-console-region="mini-button"]').filter({ hasText: "CANCEL" }).click();
    await card.click();
    await expect(surface).toHaveAttribute("data-arcade-console-view", "provenance");
    await expect(surface.locator('[data-arcade-console-region="provenance-pane"]')).toContainText("Creator Provenance");
    await surface.locator('[data-arcade-console-region="mini-button"]').filter({ hasText: "PLAY" }).click();
    await expect(surface).toHaveAttribute("data-arcade-console-view", "playing");
    const frame = surface.locator('[data-arcade-console-region="game-frame"]');
    await expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-pointer-lock allow-forms allow-downloads");
    await expect(frame).toHaveAttribute("src", /gamma-breach/);
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts Dashboard cockpit and portfolio chrome in the Gamma presentation style", async ({ page, request }) => {
    const walletAddress = "tz1GammaDashboard00000000000000000000001";
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-dashboard",
      displayName: "Gamma Dashboard",
    });
    await page.route("**/api/wallets", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 7,
            walletAddress,
            isPrimary: true,
            preferredTezosDomain: "gamma.tez",
            tezDomain: "gamma.tez",
            ownedTezosDomains: ["gamma.tez"],
            tokenCount: 12,
          },
        ]),
      });
    });
    await page.route(`**/api/wallets/${walletAddress}/balance`, async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ balance: "123456789" }) });
    });
    await page.route(`**/api/wallets/${walletAddress}/tokens?limit=1`, async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], pagination: { total: 12 } }) });
    });
    await page.route("**/api/seasons", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([{ id: 1, number: 9, name: "Gamma Season", status: "active" }]),
      });
    });
    await page.route("**/api/challenges", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([{ id: 31, title: "Gamma Proof Challenge", status: "active" }]),
      });
    });
    await page.route("**/api/cockpit/overview", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ holdings: { totalTokens: 12, totalContracts: 4 }, wallets: [], sync: { status: "idle" } }),
      });
    });
    await page.route("**/api/cockpit/sync/status", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          status: "idle",
          jobs: [{ name: "portfolio-index", intervalMs: 60000, latest: { status: "ok", finishedAt: "2026-06-27T00:00:00.000Z" } }],
        }),
      });
    });
    await page.route("**/api/portfolio/summary", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          pnlMethod: "lot_fifo",
          totals: {
            wallets: 1,
            tokensHeld: 12,
            contractsHeld: 4,
            costBasisMutez: "12000000",
            costBasisUsd: "8.40",
            estimatedValueMutez: "15000000",
            estimatedValueUsd: "10.50",
            unrealizedPnlMutez: "3000000",
            unrealizedPnlUsd: "2.10",
            realizedPnlMutez: "1000000",
            realizedProceedsMutez: "7000000",
            pricedPositions: 11,
            tokensWithUnknownCost: 1,
            binTrapPositions: 0,
            acquisitionConfidence: { purchase: 4, mint: 2, free_transfer: 1 },
          },
          perWallet: [
            {
              walletAddress,
              tokensHeld: 12,
              costBasisMutez: "12000000",
              estimatedValueMutez: "15000000",
            },
          ],
        }),
      });
    });
    await page.route("**/api/portfolio/activity/acquisitions?limit=6", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          rows: [
            {
              opHash: "ooGammaAcq",
              thumbnailUri: "/__test/media/harness-alpha-token.png",
              tokenName: "Gamma Purchase",
              tokenContract: "KT1GammaDash",
              tokenId: "7",
              acquisitionType: "purchase",
              acquiredAt: "2026-06-27T00:00:00.000Z",
              walletAddress,
              marketplace: "objkt",
              priceMutez: "3000000",
            },
          ],
        }),
      });
    });
    await page.route("**/api/portfolio/activity/sales?limit=6", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          rows: [
            {
              opHash: "ooGammaSale",
              thumbnailUri: "/__test/media/harness-alpha-token.png",
              tokenName: "Gamma Sale",
              tokenContract: "KT1GammaDash",
              tokenId: "8",
              soldAt: "2026-06-27T00:00:00.000Z",
              walletAddress,
              marketplace: "objkt",
              priceMutez: "7000000",
              realizedPnlMutez: "1000000",
            },
          ],
        }),
      });
    });
    await page.route("**/api/discovery/random-artist", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          address: walletAddress,
          domain: "gamma.tez",
          displayName: "Gamma Artist",
          avatarUri: "/__test/media/harness-alpha-token.png",
          collectionCount: 3,
          source: "harness",
        }),
      });
    });
    await page.route("**/api/discovery/random-nft", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          contractAddress: "KT1GammaDash",
          tokenId: "9",
          title: "Gamma Discovery",
          description: "Gamma dashboard proof",
          artifactUri: "/__test/media/harness-alpha-token.png",
          displayUri: "/__test/media/harness-alpha-token.png",
          creatorAddress: walletAddress,
          source: "harness",
        }),
      });
    });

    await gotoGammaRoute(page, "/dashboard");

    const dashboardSurface = page.locator('[data-gamma-application-content] [data-dashboard-surface="cockpit"]');
    await expect(dashboardSurface).toHaveAttribute("data-dashboard-presentation-host", "gamma");
    await expect(dashboardSurface).toContainText("Gamma Dashboard");
    await expect(dashboardSurface).toContainText("Gamma Season");
    await expect(dashboardSurface.locator('[data-dashboard-region="metric"]').first()).toContainText("Tokens");
    await expect(dashboardSurface.locator('[data-dashboard-region="wallet-row"]').filter({ hasText: "gamma.tez" })).toBeVisible();
    await expect(dashboardSurface.locator('[data-dashboard-region="activity-row"]').filter({ hasText: "Gamma Purchase" })).toBeVisible();
    await expect(dashboardSurface.locator('[data-dashboard-region="activity-row"]').filter({ hasText: "Gamma Sale" })).toBeVisible();
    await expect(dashboardSurface.locator('[data-dashboard-region="discovery"]')).toContainText("Gamma Discovery");
    const nextActions = dashboardSurface.locator("[data-dashboard-gamma-next-actions]");
    await expect(nextActions).toBeVisible();
    await expect(nextActions.locator('[data-dashboard-gamma-action="daily"]')).toContainText("Daily proof");
    await expect(nextActions.locator('[data-dashboard-gamma-action="challenges"]')).toContainText("Challenges");
    await expect(nextActions.locator('[data-dashboard-gamma-action="people"]')).toContainText("People");
    await expect(nextActions.locator('[data-dashboard-gamma-action="apps"]')).toContainText("Apps");
    await expect(nextActions.locator('[data-dashboard-gamma-action="inbox"]')).toContainText("Inbox");
    await expect(nextActions.locator('[data-dashboard-gamma-action="profile"]')).toContainText("Profile");

    const dashboardMetrics = await dashboardSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.matches(selector) ? surface : surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          textShadow: style.textShadow,
        };
      };
      const discoveryGradientNodes = Array.from(surface.querySelectorAll('[data-dashboard-region="discovery"] *')).filter(
        (node) => window.getComputedStyle(node).backgroundImage !== "none"
      ).length;
      return {
        surface: read('[data-dashboard-region="surface"]'),
        tabs: read('[data-dashboard-region="tabs"]'),
        nextActions: read('[data-dashboard-region="gamma-daily-actions"]'),
        nextActionButton: read('[data-dashboard-region="gamma-daily-action"]'),
        panel: read('[data-dashboard-region="panel"]'),
        metric: read('[data-dashboard-region="metric"]'),
        walletRow: read('[data-dashboard-region="wallet-row"]'),
        activityRow: read('[data-dashboard-region="activity-row"]'),
        thumb: read('[data-dashboard-region="thumb"]'),
        pnl: read('[data-dashboard-region="pnl"]'),
        discovery: read('[data-dashboard-region="discovery"]'),
        discoveryGradientNodes,
      };
    });

    expect(dashboardMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const metrics of Object.values(dashboardMetrics).filter((value) => value && typeof value === "object")) {
      expect(metrics.backgroundImage).toBe("none");
      expect(metrics.boxShadow).toBe("none");
      expect(metrics.textShadow).toBe("none");
      expect(metrics.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics.radius).toBeLessThanOrEqual(6);
    }
    expect(dashboardMetrics.pnl?.borderWidth).toBeLessThanOrEqual(1);
    expect(dashboardMetrics.pnl?.borderWidth).toBeGreaterThan(0);
    expect(dashboardMetrics.discoveryGradientNodes).toBe(0);
    const nextActionHeights = await nextActions.locator("[data-dashboard-gamma-action]").evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height)
    );
    expect(nextActionHeights.every((height) => height >= 44)).toBe(true);
    await nextActions.locator('[data-dashboard-gamma-action="daily"]').click();
    await expectGammaRouteReady(page, "/side-quests");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts Profile identity, wallet, and avatar chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-profile",
      displayName: "Gamma Profile",
    });
    await page.route("**/api/wallets", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("**/api/profile/social", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          emailPublic: false,
          twitterHandle: "wtfos",
          twitterVerified: true,
          twitterPublic: true,
          discordHandle: "gamma#0001",
          discordVerified: true,
          discordPublic: false,
          atprotoHandle: "gamma-profile.bsky.social",
          atprotoDisplayName: "Gamma Profile",
          atprotoAvatarUrl: "/__test/media/harness-alpha-token.png",
          pfpTokenContract: "KT1GammaProfile",
          pfpTokenId: "1",
          pfpImageUrl: "/__test/media/harness-alpha-token.png",
        }),
      });
    });
    await page.route("**/api/auth/social/config", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          twitter: true,
          twitterOauth2: true,
          discord: true,
          publicSiteUrl: "https://gamma.wtfos.app",
        }),
      });
    });
    await page.route("**/api/etherlink/wallets", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("**/api/profile/pfp-candidates**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: 1,
              tokenContract: "KT1GammaProfile",
              tokenId: "1",
              tokenName: "Gamma Avatar Token",
              tokenThumbnail: "/__test/media/harness-alpha-token.png",
              metadata: {
                tags: ["pfp"],
                thumbnailUri: "/__test/media/harness-alpha-token.png",
              },
            },
          ],
          total: 1,
          limit: 100,
          offset: 0,
        }),
      });
    });

    await page.goto("/gamma/profile", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/profile");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const profileSurface = page.locator('[data-gamma-application-content] [data-profile-surface="account-home"]');
    await expect(profileSurface).toHaveAttribute("data-profile-presentation-host", "gamma");
    await expect(profileSurface.locator('[data-profile-section="account"]')).toContainText("Gamma Profile");
    await expect(profileSurface.locator('[data-profile-section="social"]')).toContainText("@gamma-profile.bsky.social");
    await expect(profileSurface.locator('[data-profile-section="linked-wallets"]')).toContainText("No linked wallets yet");
    await expect(profileSurface.locator('[data-profile-section="owned-tokens"]')).toContainText("No linked wallet");

    const profileMetrics = await profileSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        };
      };
      return {
        account: read('[data-profile-section="account"]'),
        social: read('[data-profile-section="social"]'),
        linkedWallets: read('[data-profile-section="linked-wallets"]'),
        avatar: read('[data-profile-region="avatar-button"]'),
        avatarUpload: read('[data-profile-region="avatar-upload"]'),
        socialRow: read('[data-profile-region="social-row"]'),
      };
    });
    for (const metrics of [
      profileMetrics.account,
      profileMetrics.social,
      profileMetrics.linkedWallets,
      profileMetrics.avatarUpload,
    ]) {
      expect(metrics?.backgroundImage).toBe("none");
      expect(metrics?.boxShadow).toBe("none");
      expect(metrics?.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics?.radius).toBeLessThanOrEqual(6);
    }
    expect(profileMetrics.avatar?.backgroundImage).toBe("none");
    expect(profileMetrics.avatar?.boxShadow).toBe("none");
    expect(profileMetrics.avatar?.borderWidth).toBeLessThanOrEqual(1);
    expect(profileMetrics.socialRow?.borderWidth).toBeLessThanOrEqual(1);
    expect(profileMetrics.account?.fontFamily).toMatch(/Inter|sans-serif/i);

    await page.getByRole("button", { name: "Choose profile picture" }).click();
    const picker = profileSurface.locator('[data-profile-region="modal-window"]').first();
    await expect(picker).toBeVisible();
    await expect(picker).toContainText("Choose profile picture token");
    await expect(profileSurface.locator('[data-profile-region="pfp-candidate"]')).toContainText("Profile");

    const pickerMetrics = await profileSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        };
      };
      return {
        modal: read('[data-profile-region="modal-window"]'),
        grid: read('[data-profile-region="pfp-grid"]'),
        candidate: read('[data-profile-region="pfp-candidate"]'),
      };
    });
    for (const metrics of Object.values(pickerMetrics)) {
      expect(metrics?.backgroundImage).toBe("none");
      expect(metrics?.boxShadow).toBe("none");
      expect(metrics?.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics?.radius).toBeLessThanOrEqual(6);
    }

    await page.getByRole("button", { name: "Edit Gamma Avatar Token as profile picture" }).click();
    await expect(profileSurface.locator('[data-profile-region="editor-toolbar"]')).toBeVisible();
    await expect(profileSurface.locator('[data-profile-region="editor-canvas"]')).toBeVisible();
    const editorMetrics = await profileSurface.evaluate((surface) => {
      const toolbar = surface.querySelector('[data-profile-region="editor-toolbar"]');
      const canvas = surface.querySelector('[data-profile-region="editor-canvas"]');
      const read = (node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        };
      };
      return {
        toolbar: toolbar ? read(toolbar) : null,
        canvas: canvas ? read(canvas) : null,
      };
    });
    expect(editorMetrics.toolbar?.backgroundImage).toBe("none");
    expect(editorMetrics.toolbar?.boxShadow).toBe("none");
    expect(editorMetrics.toolbar?.borderWidth).toBeLessThanOrEqual(1);
    expect(editorMetrics.toolbar?.radius).toBeLessThanOrEqual(6);
    expect(editorMetrics.canvas?.boxShadow).toBe("none");
    expect(editorMetrics.canvas?.borderWidth).toBeLessThanOrEqual(1);
    expect(editorMetrics.canvas?.radius).toBeLessThanOrEqual(6);
    expect(editorMetrics.canvas?.borderColor).toMatch(/0,\s*210,\s*255/);
  });

  test("hosts final mixed routes in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "admin",
      username: "count-admin",
      displayName: "The Count",
    });

    await page.route("**/api/tezos-intel/sources", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          sources: [{ name: "Gamma Source", status: "indexed" }],
          importCommands: [],
        }),
      });
    });
    await page.route("**/api/tezos-intel/market-pulse**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          saleCount: 12,
          volumeMutez: 34000000,
          activeListingCount: 8,
          primarySaleCount: 5,
          secondarySaleCount: 7,
          topMarketplaces: [{ marketplace: "Gamma Mart", volumeMutez: 21000000, saleCount: 6 }],
        }),
      });
    });
    await page.route("**/api/tezos-intel/creator/**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          creatorAddress: "tz1GammaCreator",
          score: 88,
          grade: "A",
          tokenCount: 9,
          totalVolumeMutez: 12000000,
          saleCount: 4,
          collectorCount: 3,
          activeListingCount: 2,
        }),
      });
    });
    await page.route("**/api/tezos-intel/compare**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          creators: [
            {
              creatorAddress: "tz1GammaA",
              score: 72,
              grade: "B",
              tokenCount: 5,
              totalVolumeMutez: 8000000,
              saleCount: 3,
              collectorCount: 2,
              activeListingCount: 1,
            },
            {
              creatorAddress: "tz1GammaB",
              score: 61,
              grade: "C",
              tokenCount: 4,
              totalVolumeMutez: 6000000,
              saleCount: 2,
              collectorCount: 2,
              activeListingCount: 1,
            },
          ],
        }),
      });
    });
    await page.route("**/api/users/wtf-admin/listings", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 501,
            tokenContract: "KT1GammaListing",
            tokenId: "1",
            tokenName: "Gamma Listed Token",
            amount: 2,
            priceFormatted: "42",
            listingType: "fixed",
            createdAt: "2026-06-30T10:00:00Z",
          },
        ]),
      });
    });

    await gotoGammaRoute(page, "/dues");
    const duesSurface = page.locator('[data-gamma-application-content] [data-dues-surface="club-dues"]');
    await expect(duesSurface).toHaveAttribute("data-dues-presentation-host", "gamma");
    await expect(duesSurface.locator('[data-dues-region="payment-panel"]')).toContainText("Pay or renew dues");
    await expect(duesSurface.locator('[data-dues-region="customization-panel"]')).toContainText("Compile Template");
    await expect(duesSurface.locator('[data-dues-region="registry-panel"]')).toContainText("E2E Club");
    await expect(duesSurface.locator('[data-dues-region="admin-panel"]')).toContainText("Admin operations");
    await expect(duesSurface.locator('[data-dues-region="status-line"]')).toContainText("Ready.");

    const readChromeMetrics = async (surface, selectors) =>
      surface.evaluate((node, selectorMap) => {
        const read = (selector) => {
          const target = node.matches(selector) ? node : node.querySelector(selector);
          if (!target) return null;
          const style = window.getComputedStyle(target);
          return {
            backgroundImage: style.backgroundImage,
            borderBottomColor: style.borderBottomColor,
            borderColor: style.borderTopColor,
            borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
            boxShadow: style.boxShadow,
            fontFamily: style.fontFamily,
            radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
            textShadow: style.textShadow,
          };
        };
        return Object.fromEntries(Object.entries(selectorMap).map(([key, selector]) => [key, read(selector)]));
      }, selectors);

    const duesMetrics = await readChromeMetrics(duesSurface, {
      surface: '[data-dues-surface="club-dues"]',
      header: '[data-dues-region="header"]',
      actionTile: '[data-dues-region="action-tile"]',
      customization: '[data-dues-region="customization-panel"]',
      contract: '[data-dues-region="contract-card"]',
      admin: '[data-dues-region="admin-panel"]',
      status: '[data-dues-region="status-line"]',
    });
    expect(duesMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const metrics of Object.values(duesMetrics)) {
      expect(metrics?.backgroundImage).toBe("none");
      expect(metrics?.boxShadow).toBe("none");
      expect(metrics?.textShadow).toBe("none");
      expect(metrics?.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics?.radius).toBeLessThanOrEqual(6);
    }

    await duesSurface.getByRole("button", { name: "Open Inbox" }).click();
    await expect(page).toHaveURL(/\/gamma\/messages$/);
    await expectGammaRouteReady(page, "/messages");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await gotoGammaRoute(page, "/tezos-intel");
    const intelSurface = page.locator('[data-gamma-application-content] [data-tezos-intel-surface="market-intel"]');
    await expect(intelSurface).toHaveAttribute("data-tezos-intel-presentation-host", "gamma");
    await expect(intelSurface.locator('[data-tezos-intel-panel="market-pulse"]')).toContainText("12");
    await expect(intelSurface.locator('[data-tezos-intel-panel="sources"]')).toContainText("Gamma Source");
    await intelSurface.locator('[data-tezos-intel-control="creator-input"]').fill("tz1GammaCreator");
    await intelSurface.locator('[data-tezos-intel-control="analyze-button"]').click();
    await expect(intelSurface.locator('[data-tezos-intel-panel="creator-score"]')).toContainText("88");
    await intelSurface.locator('[data-tezos-intel-control="compare-input"]').fill("tz1GammaA\ntz1GammaB");
    await intelSurface.locator('[data-tezos-intel-control="compare-button"]').click();
    await expect(intelSurface.locator('[data-tezos-intel-panel="creator-compare"]')).toContainText("tz1GammaA");

    const intelMetrics = await readChromeMetrics(intelSurface, {
      surface: '[data-tezos-intel-surface="market-intel"]',
      grid: '[data-tezos-intel-region="grid"]',
      panel: '[data-tezos-intel-region="panel"]',
      title: '[data-tezos-intel-region="panel-title"]',
      metric: '[data-tezos-intel-region="metric"]',
      input: '[data-tezos-intel-control="creator-input"]',
      textarea: '[data-tezos-intel-control="compare-input"]',
    });
    expect(intelMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const metrics of Object.values(intelMetrics)) {
      expect(metrics?.backgroundImage).toBe("none");
      expect(metrics?.boxShadow).toBe("none");
      expect(metrics?.textShadow).toBe("none");
      expect(metrics?.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics?.radius).toBeLessThanOrEqual(6);
    }
    await gotoGammaRoute(page, "/user/wtf-admin");
    const publicProfileSurface = page.locator(
      '[data-gamma-application-content] [data-public-profile-surface="public-profile"]'
    );
    await expect(publicProfileSurface).toHaveAttribute("data-public-profile-presentation-host", "gamma");
    await expect(publicProfileSurface.locator('[data-public-profile-region="about-panel"]')).toContainText("WTF Admin");
    await expect(publicProfileSurface.locator('[data-public-profile-region="social-panel"]')).toContainText("@wtf_admin");
    await expect(publicProfileSurface.locator('[data-public-profile-region="wallet-panel"]')).toContainText("tz1-test-wallet");
    await publicProfileSurface.locator('[data-public-profile-region="tab"]').filter({ hasText: "Trade Board" }).click();
    await expect(publicProfileSurface.locator('[data-public-profile-region="token-card"]')).toContainText("Signal Piece");
    await publicProfileSurface.locator('[data-public-profile-region="tab"]').filter({ hasText: "Listings" }).click();
    await expect(publicProfileSurface.locator('[data-public-profile-region="listings-table"]')).toContainText(
      "Gamma Listed Token"
    );
    await publicProfileSurface.locator('[data-public-profile-region="tab"]').filter({ hasText: "Activity" }).click();
    await expect(publicProfileSurface.locator('[data-public-profile-region="activity-table"]')).toContainText(
      "daily_loop:public_progress_check"
    );
    await publicProfileSurface.locator('[data-public-profile-region="tab"]').filter({ hasText: "Messages" }).click();
    await expect(publicProfileSurface.locator('[data-public-profile-region="dm-panel"]')).toContainText("Say hello");

    const publicProfileMetrics = await readChromeMetrics(publicProfileSurface, {
      surface: '[data-public-profile-surface="public-profile"]',
      tabs: '[data-public-profile-region="tabs"]',
      tabBody: '[data-public-profile-region="tab-body"]',
      dmPanel: '[data-public-profile-region="dm-panel"]',
      input: '[data-public-profile-region="dm-composer"] input',
    });
    expect(publicProfileMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const [key, metrics] of Object.entries(publicProfileMetrics)) {
      expect(metrics, `${key} should render inside the public profile Gamma shell`).not.toBeNull();
      expect(metrics?.backgroundImage).toBe("none");
      expect(metrics?.boxShadow).toBe("none");
      expect(metrics?.textShadow).toBe("none");
      expect(metrics?.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics?.radius).toBeLessThanOrEqual(6);
    }
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts Skywire social bridge chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "test_subject",
      username: "gamma-skywire",
      displayName: "Gamma Skywire",
      skywireHandle: "gamma-skywire.bsky.social",
    });
    const liveStatus = await request.post("/api/skywire/live-status", {
      data: {
        liveUrl: "/live/r/wtf-live",
        title: "Gamma Live Room",
        description: "Gamma live containment proof.",
        durationMinutes: 30,
      },
    });
    expect(liveStatus.ok()).toBeTruthy();

    await page.goto("/gamma/skywire", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/skywire");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const skywireSurface = page.locator('[data-gamma-application-content] [data-skywire-surface="skywire-shell"]');
    await expect(skywireSurface).toHaveAttribute("data-skywire-presentation-host", "gamma");
    await expect(skywireSurface.locator('[data-skywire-region="header"]')).toContainText("Skywire");
    await expect(skywireSurface.locator('[data-skywire-region="status-badge"]').first()).toContainText(
      "@gamma-skywire.bsky.social"
    );
    await expect(skywireSurface.locator('[data-skywire-live-banner="active"]')).toContainText("Gamma Live Room");
    await expect(skywireSurface.locator('[data-skywire-live-banner="active"]')).toContainText("/live/r/wtf-live");
    await expect(skywireSurface.locator('[data-skywire-region="compose-box"]')).toContainText("What's happening?");
    await expect(skywireSurface.locator('[data-skywire-feed-card="true"]').first()).toContainText("Harness Skywire");
    await expect(skywireSurface.locator('[data-skywire-feed-card="true"]').first()).toContainText(
      "Fresh Skywire context"
    );

    const skywireMetrics = await skywireSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.matches(selector) ? surface : surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          textShadow: style.textShadow,
        };
      };
      return {
        surface: read('[data-skywire-surface="skywire-shell"]'),
        header: read('[data-skywire-region="header"]'),
        sidebar: read('[data-skywire-region="sidebar"]'),
        activeNav: read('[data-skywire-region="nav-button"][data-skywire-active="true"]'),
        content: read('[data-skywire-region="content-body"]'),
        compose: read('[data-skywire-region="compose-box"]'),
        liveBanner: read('[data-skywire-live-banner="active"]'),
        feedCard: read('[data-skywire-feed-card="true"]'),
        feedMedia: read('[data-skywire-feed-media="true"]'),
        tokenPreview: read('[data-skywire-token-preview="true"]'),
      };
    });

    expect(skywireMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const metrics of Object.values(skywireMetrics)) {
      expect(metrics?.backgroundImage).toBe("none");
      expect(metrics?.boxShadow).toBe("none");
      expect(metrics?.textShadow).toBe("none");
      expect(metrics?.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics?.radius).toBeLessThanOrEqual(6);
    }
    expect(skywireMetrics.activeNav?.borderColor).toMatch(/0,\s*210,\s*255/);
    expect(skywireMetrics.liveBanner?.borderWidth).toBeGreaterThan(0);
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts tz2at identity and market analytics chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-tz2at",
      displayName: "Gamma tz2at",
    });

    await page.goto("/gamma/tz2at", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/tz2at");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const tz2atSurface = page.locator('[data-gamma-application-content] [data-tz2at-surface="identity-market-analytics"]');
    await expect(tz2atSurface).toHaveAttribute("data-tz2at-presentation-host", "gamma");
    await expect(tz2atSurface.locator('[data-tz2at-region="tabs"]')).toContainText("Tezos Market");
    await expect(tz2atSurface.locator('[data-tz2at-region="readout-panel"]')).toContainText("Executive Readout");
    await expect(tz2atSurface.locator('[data-tz2at-region="metric"]').first()).toContainText("Capital in from CEX");
    await expect(tz2atSurface.locator('[data-tz2at-region="chart-panel"]').first()).toContainText("Liquidity By Network");

    const marketMetrics = await tz2atSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.matches(selector) ? surface : surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          textShadow: style.textShadow,
        };
      };
      return {
        surface: read('[data-tz2at-region="surface"]'),
        tabs: read('[data-tz2at-region="tabs"]'),
        activeTab: read('button[data-tz2at-active="true"]'),
        fieldGrid: read('[data-tz2at-region="field-grid"]'),
        metric: read('[data-tz2at-region="metric"]'),
        readout: read('[data-tz2at-region="readout-panel"]'),
        interpretation: read('[data-tz2at-region="interpretation"]'),
        chart: read('[data-tz2at-region="chart-panel"]'),
        barTrack: read('[data-tz2at-region="bar-track"]'),
        barFill: read('[data-tz2at-region="bar-fill"]'),
      };
    });

    expect(marketMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const metrics of Object.values(marketMetrics)) {
      expect(metrics?.backgroundImage).toBe("none");
      expect(metrics?.boxShadow).toBe("none");
      expect(metrics?.textShadow).toBe("none");
      expect(metrics?.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics?.radius).toBeLessThanOrEqual(6);
    }
    expect(marketMetrics.activeTab?.borderColor).toMatch(/0,\s*210,\s*255/);

    await tz2atSurface.getByRole("button", { name: "Identity Proof" }).click();
    await expect(tz2atSurface.locator('[data-tz2at-region="step"]').first()).toContainText("Connect DID");
    await expect(
      tz2atSurface.locator('[data-tz2at-region="item"]').filter({ hasText: "No imported or published wallet proofs yet." })
    ).toBeVisible();

    const identityMetrics = await tz2atSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          textShadow: style.textShadow,
        };
      };
      return {
        step: read('[data-tz2at-region="step"]'),
        item: read('[data-tz2at-region="item"]'),
      };
    });
    for (const metrics of Object.values(identityMetrics)) {
      expect(metrics?.backgroundImage).toBe("none");
      expect(metrics?.boxShadow).toBe("none");
      expect(metrics?.textShadow).toBe("none");
      expect(metrics?.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics?.radius).toBeLessThanOrEqual(6);
    }
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts The Count admin suite chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });
    await page.route("**/api/admin/challenge-automation/registry", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          triggers: [],
          predicates: [],
          rewardActions: [],
        }),
      });
    });
    await page.route("**/api/admin/challenge-automation/challenges", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ challenges: [] }) });
    });
    await page.route("**/api/admin/challenge-automation/events?limit=100", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ events: [] }) });
    });
    await page.route("**/api/admin/challenge-automation/audit?limit=150", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ audit: [] }) });
    });
    await page.goto("/gamma/admin", { waitUntil: "domcontentloaded" });

    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/admin");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const adminSurface = page.locator('[data-gamma-application-content] [data-admin-surface="control-suite"]');
    await expect(adminSurface).toHaveAttribute("data-admin-presentation-host", "gamma");
    await expect(adminSurface.locator('[data-admin-region="suite-title"]')).toContainText("Control Suite");
    await expect(adminSurface.locator('[data-admin-region="overview-box"]')).toContainText("Live inventory");
    await expect(adminSurface.locator('[data-admin-region="suite-nav"]')).toContainText("Identity & Access");
    await expect(adminSurface.locator('[data-admin-region="tab-body"]')).toHaveAttribute("data-admin-active-section", "Users");

    const adminMetrics = await adminSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.matches(selector) ? surface : surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        };
      };
      return {
        frame: read('[data-admin-region="frame"]'),
        title: read('[data-admin-region="suite-title"]'),
        overview: read('[data-admin-region="overview-box"]'),
        stat: read('[data-admin-region="stat-tile"]'),
        nav: read('[data-admin-region="suite-nav"]'),
        navButton: read('[data-admin-region="nav-button"]'),
        tabBody: read('[data-admin-region="tab-body"]'),
        activeBadge: read('[data-admin-region="active-panel-badge"]'),
      };
    });
    for (const metrics of Object.values(adminMetrics)) {
      expect(metrics?.backgroundImage).toBe("none");
      expect(metrics?.boxShadow).toBe("none");
      expect(metrics?.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics?.radius).toBeLessThanOrEqual(6);
    }
    expect(adminMetrics.activeBadge?.borderColor).toMatch(/0,\s*210,\s*255/);

    for (const [section, label] of [
      ["Roles", "Roles"],
      ["In-App Market", "Market"],
      ["Automation", "Automation"],
    ]) {
      await adminSurface.locator(`[data-admin-section="${section}"]`).click();
      await expect(adminSurface.locator('[data-admin-region="tab-body"]')).toHaveAttribute(
        "data-admin-active-section",
        section
      );
      await expect(adminSurface.locator('[data-admin-region="active-panel-header"]')).toContainText(label);
      await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
    }
  });

  test("hosts native admin route cluster in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });

    await page.route("**/api/cockpit/backup/restore-proof", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          jobName: "cockpit-backup",
          latestRun: {
            id: 900,
            status: "success",
            startedAt: "2026-06-30T08:00:00.000Z",
            finishedAt: "2026-06-30T08:02:00.000Z",
            itemsIn: 24,
            itemsOut: 24,
            error: null,
          },
          restoreProof: {
            status: "safe_to_claim",
            canClaimSafety: true,
            generatedAt: "2026-06-30T08:04:00.000Z",
            requirements: [
              { key: "pg_dump", ok: true, detail: "Latest logical backup exists." },
              { key: "restore_drill", ok: true, detail: "Row-count restore drill passed." },
            ],
            backup: {
              filename: "wtfos-2026-06-30.dump",
              bytes: 42000000,
              sha256: "abcdef1234567890abcdef1234567890",
              createdAt: "2026-06-30T08:02:00.000Z",
            },
            targets: [
              { name: "local-retention", status: "ok", bytes: 42000000, sha256Match: true },
            ],
            restoreDrill: {
              status: "passed",
              restoredAt: "2026-06-30T08:03:00.000Z",
              source: "local-retention",
              rowCounts: [{ table: "users", backupRows: 12, restoredRows: 12 }],
              mediaManifest: {
                status: "passed",
                expectedRows: 3,
                restoredRows: 3,
                checksumSha256: "facefeed",
                checkedObjects: 3,
                missingObjects: 0,
              },
            },
          },
          canClaimSafety: true,
          fetchedAt: "2026-06-30T08:05:00.000Z",
        }),
      });
    });
    await page.route("**/api/factory/templates", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          kilnUrl: "https://tezos-shadownet.octez.io/",
          templates: [
            {
              id: 1,
              kind: "teia_one_of_one",
              label: "Teia-style 1/1",
              summary: "Harness FA2 template",
              sourcePath: "contracts/templates/teia_one_of_one.py",
            },
          ],
        }),
      });
    });
    await page.route("**/api/factory/contracts", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          contracts: [
            {
              id: 1,
              templateKind: "teia_one_of_one",
              name: "Harness Factory Drop",
              address: "KT1HarnessFactory",
              network: "shadownet",
              status: "live",
              opHash: "ooHarnessFactory",
              deployedAt: "2026-06-30T08:10:00.000Z",
              errorMessage: null,
            },
          ],
        }),
      });
    });
    await page.route("**/api/operator-wallet/summary", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          operatorWallet: "tz1CountOperatorWallet",
          signerConfigured: true,
          balances: [
            {
              assetKind: "xtz",
              assetContract: null,
              assetTokenId: null,
              balance: "9000000",
              lowThreshold: "1000000",
              checkedAt: "2026-06-30T08:12:00.000Z",
            },
            {
              assetKind: "fa2",
              assetContract: "KT1WTF",
              assetTokenId: "0",
              balance: "12300000000",
              lowThreshold: "1000000000",
              checkedAt: "2026-06-30T08:12:00.000Z",
            },
          ],
          lowBalances: [],
          pendingRewards: { count: 1, totalWtf: "500000000" },
          recentRuns: [
            {
              id: 77,
              intent: "reward_disbursement",
              assetKind: "fa2",
              status: "confirmed",
              totalRecipients: 1,
              totalAmount: "500000000",
              opHash: "ooOperatorRun",
              startedAt: "2026-06-30T08:13:00.000Z",
              finishedAt: "2026-06-30T08:14:00.000Z",
              errorMessage: null,
            },
          ],
        }),
      });
    });
    await page.route("**/api/operator-wallet/ledger/unpaid", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          rows: [
            {
              id: 501,
              userId: 12,
              amountWtf: 500000000,
              reason: "sidequest_completion",
              sourceType: "sidequest",
              sourceId: 44,
              createdAt: "2026-06-30T08:15:00.000Z",
              username: "gamma-builder",
              walletAddress: "tz1GammaBuilderWallet",
            },
          ],
          uniqueUsers: 1,
          totalWtf: "500000000",
        }),
      });
    });
    await page.route("**/api/seasons", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([{ id: 1, name: "Harness Season", number: 3, status: "active" }]),
      });
    });
    await page.route("**/api/rounds?*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([{ id: 1, seasonId: 1, number: 1, name: "Harness Round", status: "active" }]),
      });
    });
    await page.route("**/api/seasons/*/contestants", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 1,
            userId: 12,
            username: "gamma-builder",
            displayName: "Gamma Builder",
            status: "active",
            rankAtLock: 4,
            eliminatedAt: null,
            eliminatedRoundId: null,
            eliminationReason: null,
            notes: "Needs a build challenge.",
          },
        ]),
      });
    });
    await page.route("**/api/control-board/feed?*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          feed: [
            {
              id: 1,
              actorUserId: 1,
              actorUsername: "the-count",
              actionKind: "challenge.updated",
              targetKind: "challenge",
              targetId: 42,
              payloadJson: { title: "Gamma containment proof" },
              createdAt: "2026-06-30T08:16:00.000Z",
            },
          ],
          drafts: [],
        }),
      });
    });

    async function expectAdminNativeRoute(routePath, selector, hostAttribute, regions) {
      await gotoGammaRoute(page, routePath);
      const surface = page.locator(`[data-gamma-application-content] ${selector}`).first();
      await expect(surface).toBeVisible();
      await expect(surface).toHaveAttribute(hostAttribute, "gamma");
      await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
      const regionPrefix = hostAttribute.replace(/^data-/, "").replace("-presentation-host", "");
      for (const region of regions) {
        await expect(surface.locator(`[data-${regionPrefix}-region="${region}"]`).first()).toBeVisible();
      }
      const metrics = await surface.evaluate((node) => {
        const read = (target) => {
          const style = window.getComputedStyle(target);
          return {
            backgroundImage: style.backgroundImage,
            boxShadow: style.boxShadow,
            radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
            color: style.color,
          };
        };
        return {
          surface: read(node),
          firstRegion: node.querySelector("[data-control-board-region], [data-backup-manager-region], [data-contract-factory-region], [data-operator-wallet-region], [data-ux-lab-region]")
            ? read(node.querySelector("[data-control-board-region], [data-backup-manager-region], [data-contract-factory-region], [data-operator-wallet-region], [data-ux-lab-region]"))
            : null,
        };
      });
      expect(metrics.surface.backgroundImage).toBe("none");
      expect(metrics.surface.boxShadow).toBe("none");
      expect(metrics.surface.radius).toBeLessThanOrEqual(6);
    }

    await expectAdminNativeRoute(
      "/control-board",
      '[data-control-board-surface="gameshow-admin"]',
      "data-control-board-presentation-host",
      ["season-row", "tab-body", "contestant-table"]
    );
    await expect(page.locator('[data-gamma-application-content] [data-control-board-region="tab-body"]')).toHaveAttribute(
      "data-control-board-active-tab",
      "cohort"
    );

    await expectAdminNativeRoute(
      "/backup-manager",
      '[data-backup-manager-surface="restore-proof"]',
      "data-backup-manager-presentation-host",
      ["status-grid", "actions", "panel"]
    );
    await page.locator('[data-gamma-application-content] [data-backup-manager-region="button"]').filter({ hasText: "Open Admin logs" }).click();
    await expectGammaRouteReady(page, "/admin");

    await expectAdminNativeRoute(
      "/contract-factory",
      '[data-contract-factory-surface="factory"]',
      "data-contract-factory-presentation-host",
      ["deploy-tab", "panel", "table"]
    );

    await expectAdminNativeRoute(
      "/operator-wallet",
      '[data-operator-wallet-surface="operator-wallet"]',
      "data-operator-wallet-presentation-host",
      ["panel", "actions", "table"]
    );

    await expectAdminNativeRoute(
      "/dev/ux-lab",
      '[data-ux-lab-surface="collection-workspace"]',
      "data-ux-lab-presentation-host",
      []
    );
    await expect(page.locator('[data-gamma-application-content] [data-ux-lab-surface="collection-workspace"]')).toContainText(
      "Collected across linked wallets"
    );
    await page.locator('[data-gamma-application-content]').getByRole("button", { name: "Open marketplace" }).click();
    await expectGammaRouteReady(page, "/marketplace");
  });

  test("hosts marketplace listing cards in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-buyer", displayName: "Gamma Buyer" });

    await page.route("**/api/marketplace/onchain", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          contractAddress: "KT1GammaMarket",
          legacyContractAddress: null,
          contractVersion: "v2",
          admin: "tz1GammaAdmin0000000000000000000000000000",
          paused: false,
          listings: [
            {
              id: 44,
              seller: "tz1GammaSeller00000000000000000000000000",
              sellerUserId: 12,
              sellerUsername: "gamma-seller",
              sellerDisplayName: "Gamma Seller",
              tokenContract: "KT1GammaToken",
              tokenId: "44",
              tokenAmount: "1",
              remainingQuantity: "1",
              tokenName: "Gamma Market Signal",
              tokenThumbnail: "/__test/media/harness-alpha-token.png",
              metadata: { name: "Gamma Market Signal" },
              provenance: null,
              priceWtf: "4200000000",
              unitPriceWtf: "4200000000",
              royaltyRecipient: null,
              royaltyBps: "0",
              active: true,
              contractVersion: "v2",
            },
          ],
          auctions: [],
          offers: [],
          counts: { listings: 1, auctions: 0, offers: 0 },
        }),
      });
    });
    await page.route("**/api/marketplace/trade-board**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          contractAddress: "KT1GammaMarket",
          legacyContractAddress: null,
          contractVersion: "v2",
          items: [],
          pagination: { limit: 200, offset: 0, count: 0, hasMore: false, nextOffset: 0 },
        }),
      });
    });

    await page.goto("/gamma/marketplace", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/marketplace");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const marketSurface = page.locator('[data-gamma-application-content] [data-marketplace-surface="marketplace"]');
    await expect(marketSurface).toHaveAttribute("data-marketplace-presentation-host", "gamma");
    await expect(marketSurface).toContainText("Gamma Market Signal");
    await expect(marketSurface).toContainText("1 active listing");

    const marketMetrics = await marketSurface.evaluate((surface) => {
      const summary = surface.querySelector('[data-marketplace-region="summary-bar"]');
      const card = surface.querySelector('[data-marketplace-region="listing-card"]');
      const titlebar = surface.querySelector('[data-marketplace-region="listing-titlebar"]');
      const image = surface.querySelector('[data-marketplace-region="token-image"]');
      const body = surface.querySelector('[data-marketplace-region="listing-body"]');
      const actions = surface.querySelector('[data-marketplace-region="listing-actions"]');
      const price = surface.querySelector('[data-marketplace-region="listing-body"] div');
      const read = (node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          textShadow: style.textShadow,
        };
      };
      return {
        surface: read(surface),
        summary: summary ? read(summary) : null,
        card: card ? read(card) : null,
        titlebar: titlebar ? read(titlebar) : null,
        image: image ? read(image) : null,
        body: body ? read(body) : null,
        actions: actions ? read(actions) : null,
        price: price ? read(price) : null,
      };
    });
    expect(marketMetrics.surface.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const region of [
      marketMetrics.summary,
      marketMetrics.card,
      marketMetrics.titlebar,
      marketMetrics.image,
      marketMetrics.body,
      marketMetrics.actions,
    ]) {
      expect(region?.backgroundImage).toBe("none");
      expect(region?.boxShadow).toBe("none");
      expect(region?.textShadow).toBe("none");
      expect(region?.radius).toBeLessThanOrEqual(6);
    }
    expect(marketMetrics.summary?.borderWidth).toBeLessThanOrEqual(1);
    expect(marketMetrics.card?.borderWidth).toBeLessThanOrEqual(1);
    expect(marketMetrics.titlebar?.borderWidth).toBeLessThanOrEqual(1);
    expect(marketMetrics.image?.borderWidth).toBeLessThanOrEqual(1);
    expect(marketMetrics.actions?.borderWidth).toBeLessThanOrEqual(1);
    expect(marketMetrics.titlebar?.fontFamily).toMatch(/monospace/i);
    expect(marketMetrics.price?.color).toMatch(/rgb\(0,\s*210,\s*255\)/);
  });

  test("hosts trade boards route chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-trader", displayName: "Gamma Trader" });

    let latestTradeBoardQuery = "";

    await page.route("**/api/marketplace/onchain", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          contractAddress: "KT1GammaMarket",
          legacyContractAddress: null,
          contractVersion: "v2",
          admin: "tz1GammaAdmin0000000000000000000000000000",
          paused: false,
          listings: [],
          auctions: [],
          offers: [],
          counts: { listings: 0, auctions: 0, offers: 0 },
        }),
      });
    });
    await page.route("**/api/marketplace/trade-board**", async (route) => {
      latestTradeBoardQuery = new URL(route.request().url()).searchParams.get("q") ?? "";
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          contractAddress: "KT1GammaMarket",
          legacyContractAddress: null,
          contractVersion: "v2",
          items: [
            {
              ownerWallet: "tz1GammaTradeOwner0000000000000000000000",
              ownerUserId: 88,
              ownerUsername: "gamma-trader",
              ownerDisplayName: "Gamma Trader",
              tokenContract: "KT1GammaTradeToken",
              tokenId: "808",
              tokenAmount: "2",
              tradeBoardQuantity: 2,
              walletBalance: "4",
              tokenName: "Gamma Trade Signal",
              tokenThumbnail: "/__test/media/harness-alpha-token.png",
              metadata: { name: "Gamma Trade Signal" },
              creatorName: "Gamma Creator",
              creatorAddress: "tz1GammaCreator000000000000000000000000",
              collectionName: "Gamma Set",
              provenance: null,
              activeOffer: null,
            },
          ],
          pagination: { limit: 200, offset: 0, count: 1, hasMore: false, nextOffset: 0 },
        }),
      });
    });
    await page.route("**/api/wallets", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });
    await page.route("**/api/marketplace/external/mine", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ rows: [], fetchedAt: new Date(0).toISOString() }),
      });
    });

    await gotoGammaRoute(page, "/trade-boards");

    const tradeSurface = page.locator('[data-gamma-application-content] [data-marketplace-surface="trade-boards"]');
    await expect(tradeSurface).toHaveAttribute("data-marketplace-presentation-host", "gamma");
    await expect(tradeSurface).toHaveAttribute("data-marketplace-active-tab", "2");
    await expect(tradeSurface.locator('[data-marketplace-region="trade-board-toolbar"]')).toContainText("Offer Board");
    await expect(tradeSurface.locator('[data-marketplace-region="trade-board-toolbar"]')).toContainText("Barter Board");
    await expect(tradeSurface.locator('[data-marketplace-mode-active="true"]').first()).toContainText("Offer Board");
    await expect(tradeSurface.locator('[data-marketplace-region="trade-board-search"] input')).toBeVisible();
    await expect(tradeSurface).toContainText("Gamma Trade Signal");
    await expect(tradeSurface).toContainText("Trade board qty: 2 / Wallet balance: 4");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await tradeSurface.locator('[data-marketplace-region="trade-board-search"] input').fill("gamma");
    await expect.poll(() => latestTradeBoardQuery).toBe("gamma");
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/trade-boards");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const tradeMetrics = await tradeSurface.evaluate((surface) => {
      const readNode = (node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          textShadow: style.textShadow,
        };
      };
      const read = (selector) => {
        const node = surface.matches(selector) ? surface : surface.querySelector(selector);
        return node ? readNode(node) : null;
      };
      return {
        surface: readNode(surface),
        tabs: read('[data-marketplace-region="tabs"]'),
        toolbar: read('[data-marketplace-region="trade-board-toolbar"]'),
        activeMode: read('[data-marketplace-mode-active="true"] button'),
        searchInput: read('[data-marketplace-region="trade-board-search"] input'),
        grid: read('[data-marketplace-region="trade-board-grid"]'),
        card: read('[data-marketplace-region="listing-card"]'),
        titlebar: read('[data-marketplace-region="listing-titlebar"]'),
        image: read('[data-marketplace-region="token-image"]'),
        body: read('[data-marketplace-region="listing-body"]'),
        actions: read('[data-marketplace-region="listing-actions"]'),
        actionButton: read('[data-marketplace-region="listing-actions"] button'),
        actionInput: read('[data-marketplace-region="listing-actions"] input'),
      };
    });
    expect(tradeMetrics.surface.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const region of Object.values(tradeMetrics)) {
      expect(region?.backgroundImage).toBe("none");
      expect(region?.boxShadow).toBe("none");
      expect(region?.textShadow).toBe("none");
      expect(region?.radius).toBeLessThanOrEqual(6);
      expect(region?.borderWidth).toBeLessThanOrEqual(1);
    }
    expect(tradeMetrics.titlebar?.fontFamily).toMatch(/monospace/i);
    expect(tradeMetrics.titlebar?.color).toMatch(/rgb\(0,\s*210,\s*255\)/);
    expect(tradeMetrics.activeMode?.borderColor).toMatch(/0,\s*210,\s*255/);
  });

  test("hosts WTFIAM economy chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", userId: 1, username: "gamma-economist", displayName: "Gamma Economist" });

    await page.goto("/gamma/wtfiam?category=desktop_pet", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/wtfiam");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const economySurface = page.locator('[data-gamma-application-content] [data-wtfiam-surface="marketplace"]');
    await expect(economySurface).toHaveAttribute("data-wtfiam-presentation-host", "gamma");
    await expect(economySurface.locator('[data-wtfiam-region="title"]')).toContainText("WTF In-App Marketplace");
    await expect(economySurface.locator('[data-wtfiam-region="meter"]')).toContainText("EXP:");
    await expect(economySurface.locator('[data-wtfiam-region="tabs"]')).toBeVisible();
    await expect(economySurface.locator('[data-wtfiam-region="item-card"]').first()).toContainText(
      /Arcade|Desktop|Signal|Mop|Vacuum/
    );
    await expect(economySurface.locator('[data-wtfiam-region="cart-panel"]')).toContainText("Cart");

    await economySurface.locator('[data-wtfiam-action="add-ticket"]').first().click();
    await expect(economySurface.locator('[data-wtfiam-region="cart-row"]').first()).toBeVisible();
    await economySurface.locator('[data-wtfiam-currency="exp"]').click();
    await expect(economySurface.locator('[data-wtfiam-currency="exp"]')).toHaveAttribute(
      "data-wtfiam-currency-active",
      "true"
    );

    const economyMetrics = await economySurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.matches(selector) ? surface : surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          textShadow: style.textShadow,
        };
      };
      return {
        shell: read('[data-wtfiam-region="shell"]'),
        titleBlock: read('[data-wtfiam-region="title-block"]'),
        meter: read('[data-wtfiam-region="meter"]'),
        tabButton: read('[data-wtfiam-region="tab-button"]'),
        itemCard: read('[data-wtfiam-region="item-card"]'),
        itemTitlebar: read('[data-wtfiam-region="item-titlebar"]'),
        itemMark: read('[data-wtfiam-region="item-mark"]'),
        cartPanel: read('[data-wtfiam-region="cart-panel"]'),
        cartRow: read('[data-wtfiam-region="cart-row"]'),
        currencyActive: read('[data-wtfiam-currency-active="true"]'),
      };
    });
    expect(economyMetrics.shell?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const metrics of Object.values(economyMetrics)) {
      expect(metrics?.backgroundImage).toBe("none");
      expect(metrics?.boxShadow).toBe("none");
      expect(metrics?.textShadow).toBe("none");
      expect(metrics?.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics?.radius).toBeLessThanOrEqual(6);
    }
    expect(economyMetrics.currencyActive?.borderColor).toMatch(/0,\s*210,\s*255/);
    expect(economyMetrics.itemMark?.color).toMatch(/rgb\(0,\s*210,\s*255\)/);

    await economySurface.locator('[data-wtfiam-category="wtf_live"]').click();
    await expect(economySurface.locator('[data-wtfiam-region="tip-ledger"]')).toBeVisible();
    await expect(economySurface.locator('[data-wtfiam-tip-transfer="1"]')).toBeVisible();
    const tipLedgerMetrics = await economySurface.locator('[data-wtfiam-region="tip-ledger"]').evaluate((ledger) => {
      const style = window.getComputedStyle(ledger);
      return {
        backgroundImage: style.backgroundImage,
        borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
        boxShadow: style.boxShadow,
        radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
      };
    });
    expect(tipLedgerMetrics.backgroundImage).toBe("none");
    expect(tipLedgerMetrics.boxShadow).toBe("none");
    expect(tipLedgerMetrics.borderWidth).toBeLessThanOrEqual(1);
    expect(tipLedgerMetrics.radius).toBeLessThanOrEqual(6);
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts Rat Race urgency cards in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-collector", displayName: "Gamma Collector" });

    await page.route("**/api/rat-race/hot-tokens**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          limit: 24,
          windowHours: 24,
          mintedWithinDays: 7,
          minSoldPercent: 50,
          minRecentSales: 2,
          generatedAt: "2026-06-27T00:00:00.000Z",
          diagnostics: {
            source: "tz2at-replay",
            sourceFreshness: {
              ok: true,
              state: "fresh",
              lastLevel: 100,
              headLevel: 102,
              headLagBlocks: 2,
              maxHeadLagBlocks: 20,
              processedLevel: 100,
              intakeLevel: 102,
              processedLagBlocks: 2,
              updatedAt: "2026-06-27T00:00:00.000Z",
              ageMs: 1200,
              maxStaleMs: 60000,
            },
            replayScan: {
              requestedWindowHours: 24,
              requestedBlocks: 1440,
              chunkBlocks: 120,
              maxPages: 12,
              pagesScanned: 3,
              fromLevel: 1,
              toLevel: 100,
              scannedFromLevel: 1,
              scannedToLevel: 100,
              estimatedScannedHours: 24,
              completedWindow: true,
              stopReason: "window-covered",
              replayEventCount: 12,
              collectRecordCount: 6,
              listingSignalRecordCount: 4,
              transferRecordCount: 2,
              pageCapHitCount: 0,
              pageErrorCount: 0,
              oldestEventAt: "2026-06-26T00:00:00.000Z",
              newestEventAt: "2026-06-27T00:00:00.000Z",
              oldestCollectAt: "2026-06-26T00:00:00.000Z",
            },
            supplementSources: [{ source: "objkt", used: true, purpose: "listing hydration" }],
            localCandidateRows: 2,
            tz2atCandidateRows: 6,
            rankedItems: 1,
            rejectedByUnknownSupply: 0,
            rejectedByNoActiveListing: 0,
            rejectedByMintWindow: 0,
            rejectedByRecentSales: 1,
            rejectedBySoldPercent: 1,
            nearMisses: [],
            note: "Gamma Rat Race proof feed.",
          },
          items: [
            {
              tokenContract: "KT1GammaRat",
              tokenId: "77",
              tokenName: "Gamma Urgency Edition",
              tokenThumbnail: "/__test/media/harness-alpha-token.png",
              creatorAddress: "tz1GammaCreator0000000000000000000000000",
              totalEditions: 100,
              soldEditions: 82,
              soldPercent: 82,
              recentSaleCount: 7,
              recentEditionsSold: 7,
              activeListingCount: 3,
              floorMutez: "1234000",
              mintedAt: "2026-06-26T00:00:00.000Z",
              firstListedAt: "2026-06-26T01:00:00.000Z",
              lastSaleAt: "2026-06-27T00:00:00.000Z",
              estimatedSelloutAt: "2026-06-27T06:00:00.000Z",
              hoursToSellout: 6,
              urgencyScore: 91,
              salesVelocityPerHour: 0.29,
              remainingEditions: 18,
              marketUrl: "https://objkt.com/tokens/KT1GammaRat/77",
              source: "tz2at-firehose",
              purchaseIntent: {
                supported: false,
                reason: "External proof only",
                marketplaceContract: "KT1ObjktMarket",
                marketplaceName: "OBJKT",
                entrypoint: null,
                listingId: "gamma-listing-77",
                amount: 1,
                priceMutez: "1234000",
                totalMutez: "1234000",
              },
            },
          ],
        }),
      });
    });
    await page.route("**/api/rat-race/events", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/gamma/rat-race", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/rat-race");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const ratRaceSurface = page.locator('[data-gamma-application-content] [data-rat-race-surface="rat-race"]');
    await expect(ratRaceSurface).toHaveAttribute("data-rat-race-presentation-host", "gamma");
    await expect(ratRaceSurface).toContainText("Gamma Urgency Edition");
    await expect(ratRaceSurface).toContainText("tz2at rows");

    const ratRaceMetrics = await ratRaceSurface.evaluate((surface) => {
      const header = surface.querySelector('[data-rat-race-region="header"]');
      const diagnostics = surface.querySelector('[data-rat-race-region="diagnostic-grid"]');
      const card = surface.querySelector('[data-rat-race-region="card"]');
      const thumb = surface.querySelector('[data-rat-race-region="thumb-frame"]');
      const stat = surface.querySelector('[data-rat-race-region="stat"]');
      const meter = surface.querySelector('[data-rat-race-region="meter"]');
      const meterFill = surface.querySelector('[data-rat-race-region="meter-fill"]');
      const actions = surface.querySelector('[data-rat-race-region="actions"]');
      const title = surface.querySelector("h2");
      const read = (node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          textShadow: style.textShadow,
        };
      };
      return {
        surface: read(surface),
        header: header ? read(header) : null,
        diagnostics: diagnostics ? read(diagnostics) : null,
        card: card ? read(card) : null,
        thumb: thumb ? read(thumb) : null,
        stat: stat ? read(stat) : null,
        meter: meter ? read(meter) : null,
        meterFill: meterFill ? read(meterFill) : null,
        actions: actions ? read(actions) : null,
        title: title ? read(title) : null,
      };
    });
    expect(ratRaceMetrics.surface.backgroundImage).toBe("none");
    expect(ratRaceMetrics.surface.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const region of [
      ratRaceMetrics.header,
      ratRaceMetrics.diagnostics,
      ratRaceMetrics.card,
      ratRaceMetrics.thumb,
      ratRaceMetrics.stat,
      ratRaceMetrics.meter,
      ratRaceMetrics.meterFill,
      ratRaceMetrics.actions,
    ]) {
      expect(region?.backgroundImage).toBe("none");
      expect(region?.boxShadow).toBe("none");
      expect(region?.textShadow).toBe("none");
      expect(region?.radius).toBeLessThanOrEqual(6);
    }
    expect(ratRaceMetrics.header?.borderWidth).toBeLessThanOrEqual(1);
    expect(ratRaceMetrics.card?.borderWidth).toBeLessThanOrEqual(1);
    expect(ratRaceMetrics.thumb?.borderWidth).toBeLessThanOrEqual(1);
    expect(ratRaceMetrics.stat?.borderWidth).toBeLessThanOrEqual(1);
    expect(ratRaceMetrics.meter?.borderWidth).toBeLessThanOrEqual(1);
    expect(ratRaceMetrics.meterFill?.backgroundColor).toMatch(/rgb\(0,\s*210,\s*255\)/);
    expect(ratRaceMetrics.title?.color).toMatch(/rgb\(0,\s*210,\s*255\)/);
  });

  test("hosts Casino lobby chrome and handoffs in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-player", displayName: "Gamma Player" });

    await page.route("**/api/casino/status", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          userId: 1,
          appPass: {
            sku: "casino-app-pass",
            owned: false,
            quantity: 0,
            marketCategory: "casino",
          },
          membership: {
            active: true,
            expiresAt: "2026-07-27T00:00:00.000Z",
            walletAddress: "tz1GammaCasino0000000000000000000000000",
            purchaseRef: "casino:gamma-proof",
          },
          canEnter: true,
          wageringEnabled: false,
          config: {
            network: "inventory-gamma",
            contractAddress: "KT1GammaCasino0000000000000000000000000",
            treasuryAddress: "tz1GammaTreasury00000000000000000000000",
            feeMutez: 1000000,
            feeTez: "1",
            durationDays: 30,
            configured: true,
          },
        }),
      });
    });
    await page.route("**/api/casino/games", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          canEnter: true,
          wageringEnabled: false,
          games: [
            {
              key: "wtf-button",
              title: "Gamma Button Table",
              tagline: "Press audit table.",
              summary: "Gamma shell proof table for the Casino lobby.",
              mode: "multi_player",
              status: "mocked_playable",
              tableKind: "live_multiplayer",
              wagerAsset: "XTZ",
              wageringEnabled: false,
              minPlayers: 1,
              maxPlayers: null,
              defaultHouseTakeBps: 1500,
              requiredContracts: ["WtfCasinoMembership", "WtfButtonEscrow"],
              highlights: ["Gamma route", "wagers disabled"],
            },
            {
              key: "rug-pull",
              title: "Gamma Pressure Table",
              tagline: "Pressure audit table.",
              summary: "Second installed table for grid proof.",
              mode: "multi_player",
              status: "mocked_playable",
              tableKind: "live_multiplayer",
              wagerAsset: "XTZ",
              wageringEnabled: false,
              minPlayers: 1,
              maxPlayers: null,
              defaultHouseTakeBps: 2000,
              requiredContracts: ["WtfCasinoMembership"],
              highlights: ["No live wagers"],
            },
          ],
        }),
      });
    });

    await page.goto("/gamma/casino", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/casino");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const casinoSurface = page.locator('[data-gamma-application-content] [data-casino-surface="lobby"]');
    await expect(casinoSurface).toHaveAttribute("data-casino-presentation-host", "gamma");
    await expect(casinoSurface).toContainText("Gamma Button Table");
    await expect(casinoSurface).toContainText("inventory-gamma");
    await expect(casinoSurface).toContainText("Access verified.");

    const casinoMetrics = await casinoSurface.evaluate((surface) => {
      const readNode = (node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          textShadow: style.textShadow,
        };
      };
      const read = (selector) => {
        const node = surface.querySelector(selector);
        if (!node) return null;
        return readNode(node);
      };
      return {
        surface: readNode(surface),
        titlePanel: read('[data-casino-region="title-panel"]'),
        meter: read('[data-casino-region="meter"]'),
        gameGrid: read('[data-casino-region="game-grid"]'),
        card: read('[data-casino-region="game-card"]'),
        badge: read('[data-casino-region="status-badge"]'),
        entryControls: read('[data-casino-region="entry-controls"]'),
        statusLine: read('[data-casino-region="status-line"]'),
      };
    });
    for (const [key, region] of Object.entries(casinoMetrics)) {
      expect(region, `missing Casino Gamma metric: ${key}`).not.toBeNull();
      expect(region.backgroundImage).toBe("none");
      expect(region.boxShadow).toBe("none");
      expect(region.textShadow).toBe("none");
      expect(region.radius).toBeLessThanOrEqual(6);
    }
    expect(casinoMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
    expect(casinoMetrics.titlePanel?.borderWidth).toBeLessThanOrEqual(1);
    expect(casinoMetrics.meter?.borderWidth).toBeLessThanOrEqual(1);
    expect(casinoMetrics.card?.borderWidth).toBeLessThanOrEqual(1);
    expect(casinoMetrics.badge?.color).toMatch(/40,\s*215,\s*255|242,\s*234,\s*217/);

    await page.getByRole("button", { name: "Open Table" }).first().click();
    await expect(page).toHaveURL(/\/gamma\/casino\/wtf-button/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await page.goto("/gamma/casino", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Buy App" }).click();
    await expect(page).toHaveURL(/\/gamma\/wtfiam/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts Casino table apps in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-player", displayName: "Gamma Player" });

    const tableRoutes = [
      {
        route: "/casino/wtf-button",
        slug: "wtf-button",
        text: "WTF Does This Button Do?!!?",
        regions: ["title-panel", "wallet", "card", "stage", "giant-button", "panel", "stat"],
      },
      {
        route: "/casino/rug-pull",
        slug: "rug-pull",
        text: "Rug Pull: The Game",
        regions: ["title-panel", "wallet", "button-panel", "cursed-button", "stat", "row"],
      },
      {
        route: "/casino/guinea-pig-raceway",
        slug: "guinea-pig-raceway",
        text: "Guinea Pig Raceway",
        regions: ["title-panel", "wallet", "scene", "racer-card", "thumb", "meter", "stat"],
      },
    ];

    for (const table of tableRoutes) {
      await gotoGammaRoute(page, table.route);

      const tableSurface = page.locator(`[data-gamma-application-content] [data-casino-table="${table.slug}"]`);
      await expect(tableSurface).toHaveAttribute("data-casino-table-presentation-host", "gamma");
      await expect(tableSurface).toContainText(table.text);

      const tableMetrics = await tableSurface.evaluate((surface, regions) => {
        const readNode = (node) => {
          const style = window.getComputedStyle(node);
          return {
            backgroundImage: style.backgroundImage,
            borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
            boxShadow: style.boxShadow,
            color: style.color,
            fontFamily: style.fontFamily,
            radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
            textShadow: style.textShadow,
          };
        };
        const metrics = { surface: readNode(surface) };
        for (const region of regions) {
          const node = surface.querySelector(`[data-casino-table-region="${region}"]`);
          metrics[region] = node ? readNode(node) : null;
        }
        return metrics;
      }, table.regions);

      for (const [key, region] of Object.entries(tableMetrics)) {
        expect(region, `missing Casino table Gamma metric: ${table.slug}:${key}`).not.toBeNull();
        expect(region.backgroundImage).toBe("none");
        expect(region.boxShadow).toBe("none");
        expect(region.textShadow).toBe("none");
        expect(region.radius).toBeLessThanOrEqual(6);
      }
      expect(tableMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
      expect(tableMetrics["title-panel"]?.borderWidth).toBeLessThanOrEqual(1);
      expect(tableMetrics.wallet?.borderWidth).toBeLessThanOrEqual(1);

      if (table.slug === "guinea-pig-raceway") {
        const canvas = tableSurface.locator('[data-casino-table-region="canvas"]');
        await expect(canvas).toBeVisible();
        await page.waitForTimeout(250);
        const canvasSignal = await canvas.evaluate((node) => {
          const canvasNode = node;
          const copy = document.createElement("canvas");
          copy.width = 32;
          copy.height = 32;
          const ctx = copy.getContext("2d");
          if (!ctx) return { nonBlank: 0, width: canvasNode.width, height: canvasNode.height };
          ctx.drawImage(canvasNode, 0, 0, 32, 32);
          const data = ctx.getImageData(0, 0, 32, 32).data;
          let nonBlank = 0;
          for (let index = 0; index < data.length; index += 4) {
            if (data[index] || data[index + 1] || data[index + 2] || data[index + 3]) nonBlank += 1;
          }
          return { nonBlank, width: canvasNode.width, height: canvasNode.height };
        });
        expect(canvasSignal.width).toBeGreaterThan(0);
        expect(canvasSignal.height).toBeGreaterThan(0);
        expect(canvasSignal.nonBlank).toBeGreaterThan(0);
      }

      await page.getByRole("button", { name: "Casino Lobby" }).click();
      await expect(page).toHaveURL(/\/gamma\/casino$/);
      await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
      await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
    }
  });

  test("hosts WIM custom window chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user" });
    await page.goto("/gamma/wim", { waitUntil: "domcontentloaded" });

    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/wim");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const wimSurface = page.locator('[data-gamma-application-content] [data-wim-desktop-surface="true"]');
    await expect(wimSurface).toHaveAttribute("data-wim-presentation-host", "gamma");
    const wimWindow = page.locator('[data-gamma-application-content] [data-wim-window-kind]').first();
    await expect(wimWindow).toBeVisible();

    const chromeMetrics = await wimWindow.evaluate((frame) => {
      const titlebar = frame.querySelector(":scope > div");
      const frameStyle = window.getComputedStyle(frame);
      const titlebarStyle = titlebar ? window.getComputedStyle(titlebar) : null;
      return {
        frameBackgroundImage: frameStyle.backgroundImage,
        frameBoxShadow: frameStyle.boxShadow,
        frameRadius: Number.parseFloat(frameStyle.borderTopLeftRadius || "0"),
        titlebarBackgroundImage: titlebarStyle?.backgroundImage || "",
        titlebarBoxShadow: titlebarStyle?.boxShadow || "",
      };
    });
    expect(chromeMetrics.frameBackgroundImage).toBe("none");
    expect(chromeMetrics.frameBoxShadow).toBe("none");
    expect(chromeMetrics.frameRadius).toBeLessThanOrEqual(6);
    expect(chromeMetrics.titlebarBackgroundImage).toBe("none");
    expect(chromeMetrics.titlebarBoxShadow).toBe("none");
  });

  test("hosts shared token detail modals in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user" });
    await page.route("**/api/gallery/mine**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: 9001,
              walletAddress: "tz1GammaHarness",
              contract: "KT1GammaHarnessToken",
              tokenId: "42",
              balance: "1",
              thumbnailUri: null,
              displayUri: null,
              artifactUri: null,
              mimeType: "image/png",
              title: "Gamma Proof Token",
              description: "Harness object for Gamma modal containment.",
              creatorName: "Gamma Harness",
              creatorAddress: "tz1GammaCreator",
              collectionName: "Presentation Proof",
              mintedAtIso: "2026-06-27T00:00:00.000Z",
              tags: ["gamma"],
              royalties: null,
              editions: "1",
              acquiredAtIso: "2026-06-27T00:00:00.000Z",
              metadata: {
                name: "Gamma Proof Token",
                description: "Harness object for Gamma modal containment.",
                tags: ["gamma"],
              },
              provenance: null,
            },
          ],
          pagination: { limit: 60, offset: 0, total: 1 },
          facets: {
            creators: [{ name: "Gamma Harness", count: 1 }],
            collections: [{ name: "Presentation Proof", count: 1 }],
            wallets: [{ address: "tz1GammaHarness", count: 1 }],
            mediaKinds: [{ kind: "image", count: 1 }],
          },
          sort: "acquired_desc",
        }),
      });
    });
    await page.route("**/api/media/mine**", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.goto("/gamma/my-gallery", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/my-gallery");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await page.getByTestId("gallery-tile-9001").click();

    const overlay = page.locator('[data-gamma-application-content] [data-token-detail-modal="true"]');
    await expect(overlay).toHaveAttribute("data-token-detail-presentation-host", "gamma");
    const dialog = page.getByRole("dialog", { name: "Token details: Gamma Proof Token" });
    await expect(dialog).toBeVisible();

    const modalMetrics = await dialog.evaluate((frame) => {
      const titlebar = frame.querySelector(":scope > div");
      const frameStyle = window.getComputedStyle(frame);
      const titlebarStyle = titlebar ? window.getComputedStyle(titlebar) : null;
      return {
        frameBackgroundImage: frameStyle.backgroundImage,
        frameBoxShadow: frameStyle.boxShadow,
        frameRadius: Number.parseFloat(frameStyle.borderTopLeftRadius || "0"),
        titlebarBackgroundImage: titlebarStyle?.backgroundImage || "",
        titlebarBoxShadow: titlebarStyle?.boxShadow || "",
      };
    });
    expect(modalMetrics.frameBackgroundImage).toBe("none");
    expect(modalMetrics.frameBoxShadow).toBe("none");
    expect(modalMetrics.frameRadius).toBeLessThanOrEqual(6);
    expect(modalMetrics.titlebarBackgroundImage).toBe("none");
    expect(modalMetrics.titlebarBoxShadow).toBe("none");
  });

  test("hosts media delete confirmation dialogs in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user" });
    await page.route("**/api/media/mine?category=video", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 77,
            title: "Gamma Cutscene",
            description: "Harness video for Gamma dialog containment.",
            sourceType: "upload",
            sourceUrl: "/api/media/77/file",
            playbackUrl: "/api/media/77/file",
            posterUrl: null,
            mimeType: "video/mp4",
            durationSeconds: 8,
            status: "ready",
            tokenContract: null,
            tokenId: null,
            mediaCategory: "video",
            fileSize: 4096,
            metadata: { wtfTvOverlay: { creatorName: "Gamma Harness" } },
            createdAt: "2026-06-27T00:00:00.000Z",
          },
        ]),
      });
    });
    await page.route("**/api/profile/tokens**", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) });
    });
    await page.route("**/api/tv/channels?mine=1", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("**/api/tv/bumpers", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("**/api/media/77/usage", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          mediaItemId: 77,
          channels: [],
          bumpers: [],
          summary: { channels: 0, playlists: 0, bumpers: 0 },
        }),
      });
    });
    await page.route("**/api/media/77/file", async (route) => {
      await route.fulfill({ contentType: "video/mp4", body: "" });
    });

    await page.goto("/gamma/my-videos", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/my-videos");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await page.getByRole("button", { name: "Delete video from library" }).click();

    const overlay = page.locator('[data-gamma-application-content] [data-media-delete-modal="true"]');
    await expect(overlay).toHaveAttribute("data-media-delete-presentation-host", "gamma");
    const dialog = page.getByRole("dialog", { name: "Delete video: Gamma Cutscene" });
    await expect(dialog).toBeVisible();

    const modalMetrics = await dialog.evaluate((frame) => {
      const frameStyle = window.getComputedStyle(frame);
      return {
        backgroundImage: frameStyle.backgroundImage,
        boxShadow: frameStyle.boxShadow,
        radius: Number.parseFloat(frameStyle.borderTopLeftRadius || "0"),
      };
    });
    expect(modalMetrics.backgroundImage).toBe("none");
    expect(modalMetrics.boxShadow).toBe("none");
    expect(modalMetrics.radius).toBeLessThanOrEqual(6);
  });

  test("hosts My Videos library, channel, bumper, and upload chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-video", displayName: "Gamma Video" });
    const channel = {
      id: 12,
      slug: "gamma-channel",
      title: "Gamma Channel",
      dialNumber: 7,
    };
    const mediaItem = {
      id: 107,
      title: "Gamma Reel",
      description: "Harness video for Gamma My Videos containment.",
      sourceType: "upload",
      sourceUrl: "/api/media/107/file",
      playbackUrl: "/api/media/107/file",
      posterUrl: null,
      mimeType: "video/mp4",
      durationSeconds: 12,
      status: "ready",
      tokenContract: null,
      tokenId: null,
      mediaCategory: "video",
      fileSize: 6144,
      metadata: { wtfTvOverlay: { creatorName: "Gamma Video Desk", collectionName: "Gamma Reels" } },
      createdAt: "2026-06-27T00:00:00.000Z",
    };

    await page.route("**/api/media/mine?category=video", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([mediaItem]) });
    });
    await page.route("**/api/profile/tokens**", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) });
    });
    await page.route("**/api/tv/channels?mine=1", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([channel]) });
    });
    await page.route("**/api/tv/channels/12", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          channel,
          videos: [
            {
              id: 88,
              channelId: 12,
              mediaItemId: 107,
              sourceUri: "/api/media/107/file",
              title: "Gamma Reel",
              mimeType: "video/mp4",
              thumbnailUri: null,
            },
          ],
        }),
      });
    });
    await page.route("**/api/tv/bumpers", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 501,
            title: "Gamma Reel",
            mediaItemId: 107,
            category: "community",
            mimeType: "video/mp4",
            fileSize: 6144,
            durationMs: 12000,
            createdAt: "2026-06-27T00:00:00.000Z",
          },
        ]),
      });
    });
    await page.route("**/api/media/107/file", async (route) => {
      await route.fulfill({ contentType: "video/mp4", body: "" });
    });

    await page.goto("/gamma/my-videos", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/my-videos");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const surface = page.locator('[data-gamma-application-content] [data-my-videos-presentation-host="gamma"]');
    await expect(surface).toBeVisible();
    await expect(surface.locator('[data-my-videos-region="media-card"]')).toContainText("Gamma Reel");
    await expect(surface.locator('[data-my-videos-region="media-info"]')).toContainText("Gamma Video Desk");
    await expect(surface.locator('[data-my-videos-region="bumper-toggle"]')).toBeVisible();

    const libraryMetrics = await surface.evaluate((root) => {
      const card = root.querySelector('[data-my-videos-region="media-card"]');
      const thumb = root.querySelector('[data-my-videos-region="media-thumb"]');
      const bumper = root.querySelector('[data-my-videos-region="bumper-toggle"]');
      const actions = root.querySelector('[data-my-videos-region="card-actions"]');
      const read = (node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        };
      };
      return {
        card: card ? read(card) : null,
        thumb: thumb ? read(thumb) : null,
        bumper: bumper ? read(bumper) : null,
        actions: actions ? read(actions) : null,
      };
    });
    expect(libraryMetrics.card?.backgroundImage).toBe("none");
    expect(libraryMetrics.card?.boxShadow).toBe("none");
    expect(libraryMetrics.card?.borderWidth).toBeLessThanOrEqual(1);
    expect(libraryMetrics.card?.radius).toBeLessThanOrEqual(6);
    expect(libraryMetrics.thumb?.backgroundImage).toBe("none");
    expect(libraryMetrics.thumb?.boxShadow).toBe("none");
    expect(libraryMetrics.bumper?.backgroundImage).toBe("none");
    expect(libraryMetrics.bumper?.boxShadow).toBe("none");
    expect(libraryMetrics.bumper?.borderWidth).toBeLessThanOrEqual(1);
    expect(libraryMetrics.bumper?.radius).toBeLessThanOrEqual(6);
    expect(libraryMetrics.actions?.borderWidth).toBeLessThanOrEqual(1);

    await page.getByText("Channels", { exact: true }).click();
    const channelCard = surface.locator('[data-my-videos-region="channel-media-card"]').first();
    await expect(channelCard).toContainText("Gamma Reel");
    const channelMetrics = await channelCard.evaluate((node) => {
      const style = window.getComputedStyle(node);
      return {
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
        borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
        radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
      };
    });
    expect(channelMetrics.backgroundImage).toBe("none");
    expect(channelMetrics.boxShadow).toBe("none");
    expect(channelMetrics.borderWidth).toBeLessThanOrEqual(1);
    expect(channelMetrics.radius).toBeLessThanOrEqual(6);

    await page.getByText("Upload", { exact: true }).click();
    const uploadArea = surface.locator('[data-my-videos-region="upload-area"]');
    await expect(uploadArea).toBeVisible();
    const uploadMetrics = await uploadArea.evaluate((node) => {
      const style = window.getComputedStyle(node);
      return {
        backgroundImage: style.backgroundImage,
        borderColor: style.borderTopColor,
        borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
        boxShadow: style.boxShadow,
        radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
      };
    });
    expect(uploadMetrics.backgroundImage).toBe("none");
    expect(uploadMetrics.boxShadow).toBe("none");
    expect(uploadMetrics.borderColor).toMatch(/0,\s*210,\s*255/);
    expect(uploadMetrics.borderWidth).toBeLessThanOrEqual(1);
    expect(uploadMetrics.radius).toBeLessThanOrEqual(6);
  });

  test("hosts Side Quests and Challenges progression chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });

    await page.route("**/api/challenge-automation/daily-loops", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          completionKey: "2026-06-27",
          resetAtUtc: "2026-06-28T00:00:00.000Z",
          loops: [
            {
              id: 201,
              title: "Gamma daily proof",
              description: "Post one useful signal without leaving Gamma.",
              route: "/w",
              actionLabel: "Post proof",
              category: "social",
              order: 1,
              rewards: { xp: 25, wtf: 1 },
              completedByCount: 12,
              verifiedByCount: 4,
              claimableToday: false,
              verifiedToday: false,
              claimedToday: false,
              completedToday: false,
            },
            {
              id: 202,
              title: "Gamma claimable proof",
              description: "The verifier has already seen this one.",
              route: "/gallery",
              actionLabel: "Inspect proof",
              category: "creative",
              order: 2,
              rewards: { xp: 40, wtf: 2 },
              completedByCount: 8,
              verifiedByCount: 8,
              claimableToday: true,
              verifiedToday: true,
              claimedToday: false,
              completedToday: false,
            },
          ],
        }),
      });
    });
    await page.route("**/api/side-quests", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 301,
            title: "Gamma special quest",
            description: "A Count-reviewed side quest.",
            criteria: "Submit proof through the shared side-quest endpoint.",
            status: "active",
            persistent: true,
            autoVerifyType: "manual",
            rewardAmountWtf: 3,
            rewardXp: 50,
            approvedCompletionCount: 2,
          },
        ]),
      });
    });
    await page.route("**/api/side-quests/my/completions", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("**/api/rewards/account", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          balances: {
            totalEarnedWtf: 44,
            availableWtf: 12,
            pendingCashoutWtf: 3,
            alreadyPaidWtf: 7,
            marketSpentWtf: 5,
          },
          cashout: { minimumWtf: 20 },
          primaryWallet: { walletAddress: "tz1GammaCountWallet000000000000000" },
        }),
      });
    });

    await page.goto("/gamma/side-quests", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/side-quests");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const sideQuestSurface = page.locator('[data-gamma-application-content] [data-progression-surface="side-quests"]');
    await expect(sideQuestSurface).toHaveAttribute("data-progression-presentation-host", "gamma");
    await expect(sideQuestSurface.locator('[data-progression-region="quest-card"]').first()).toContainText("Gamma daily proof");
    await expect(sideQuestSurface.locator('[data-progression-region="reward-account"]')).toContainText("12 WTF");

    const sideQuestMetrics = await sideQuestSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        };
      };
      return {
        intro: read('[data-progression-region="intro-panel"]'),
        progress: read('[data-progression-region="progress-track"]'),
        account: read('[data-progression-region="reward-account"]'),
        metric: read('[data-progression-region="account-metric"]'),
        card: read('[data-progression-region="quest-card"]'),
      };
    });
    for (const metrics of Object.values(sideQuestMetrics)) {
      expect(metrics?.backgroundImage).toBe("none");
      expect(metrics?.boxShadow).toBe("none");
      expect(metrics?.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics?.radius).toBeLessThanOrEqual(6);
    }
    expect(sideQuestMetrics.progress?.borderColor).toMatch(/0,\s*210,\s*255/);

    await sideQuestSurface.getByRole("button", { name: "Post proof" }).click();
    await expect(page).toHaveURL(/\/gamma\/w$/);
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/w");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await page.route("**/api/challenges", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 401,
            title: "Gamma challenge arc",
            description: "A challenge that proves the shell contains progression.",
            criteria: "Submit a shared challenge proof.",
            rules: "Do not change challenge logic.",
            status: "active",
            deadline: "2026-06-30T00:00:00.000Z",
            rewardAmountWtf: 4,
            rewardXp: 80,
          },
          {
            id: 402,
            title: "Gamma archived challenge",
            description: "Past proof.",
            status: "completed",
            rewardAmountWtf: 1,
            rewardXp: 20,
          },
        ]),
      });
    });
    await page.route("**/api/challenges/401", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          cockpitProgress: {
            holdingsWithBalance: 3,
            nonWtfHoldingsWithBalance: 2,
            mintEventCount: 1,
            tradeBoardListedQuantity: 1,
          },
          submissions: [
            {
              id: 501,
              userId: 1,
              grade: "pending",
              contentText: "The Count reviewed Gamma shell proof.",
              contentUrl: "https://gamma.wtfos.app/proof",
              feedback: null,
              rewardDistributed: false,
            },
          ],
        }),
      });
    });

    await page.goto("/gamma/challenges", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/challenges");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const challengeSurface = page.locator('[data-gamma-application-content] [data-progression-surface="challenges"]');
    await expect(challengeSurface).toHaveAttribute("data-progression-presentation-host", "gamma");
    await expect(challengeSurface.locator('[data-progression-region="challenge-card"]').first()).toContainText("Gamma challenge arc");
    await challengeSurface.getByRole("button", { name: "View Details" }).first().click();
    await expect(challengeSurface.locator('[data-progression-region="activity-stats"]')).toContainText("Holdings with balance");
    await expect(challengeSurface.locator('[data-progression-region="submission-box"]')).toContainText("The Count reviewed Gamma shell proof.");

    const challengeMetrics = await challengeSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        };
      };
      return {
        intro: read('[data-progression-region="intro-panel"]'),
        stat: read('[data-progression-region="stat"]'),
        card: read('[data-progression-region="challenge-card"]'),
        stats: read('[data-progression-region="activity-stats"]'),
        submission: read('[data-progression-region="submission-box"]'),
      };
    });
    for (const metrics of Object.values(challengeMetrics)) {
      expect(metrics?.backgroundImage).toBe("none");
      expect(metrics?.boxShadow).toBe("none");
      expect(metrics?.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics?.radius).toBeLessThanOrEqual(6);
    }
  });

  test("hosts Rounds and Round Detail progression chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });

    const gammaSeason = {
      id: 707,
      number: 12,
      name: "Gamma Season",
      description: "A shell-contained season that still uses shared gameshow APIs.",
      status: "active",
    };
    const gammaRound = {
      id: 901,
      number: 3,
      name: "Gamma Round",
      description: "The Count checks whether rounds stay in the Gamma shell.",
      rules: "Preserve round logic and only adapt presentation chrome.",
      status: "active",
      startingContestants: 12,
      eliminatedAtEnd: 2,
      rewardXp: 120,
      requiredPlatforms: ["WTFOS"],
      prizes: ["Gamma trophy"],
      previousWinners: ["Genesis collector"],
      leaderboard: [{ label: "the-count", score: 999 }],
      eliminatedContestants: ["classic fallback"],
      calendarEvent: {
        startsAt: "2026-06-28T12:00:00.000Z",
        endsAt: "2026-06-28T13:00:00.000Z",
      },
    };
    const gammaChallenge = {
      id: 801,
      roundId: 901,
      title: "Gamma round challenge",
      description: "Inspect the round detail without leaving Gamma.",
      criteria: "Open the challenge from the shared round detail app.",
      rules: "No app logic forks.",
      status: "active",
      rewardAmountWtf: 4,
      rewardXp: 80,
    };

    await page.route("**/api/seasons", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([gammaSeason]) });
    });
    await page.route("**/api/rounds**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/rounds/901") {
        await route.fulfill({ contentType: "application/json", body: JSON.stringify(gammaRound) });
        return;
      }
      if (url.pathname === "/api/rounds") {
        await route.fulfill({ contentType: "application/json", body: JSON.stringify([gammaRound]) });
        return;
      }
      await route.continue();
    });
    await page.route("**/api/challenges**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/challenges") {
        await route.fulfill({ contentType: "application/json", body: JSON.stringify([gammaChallenge]) });
        return;
      }
      await route.continue();
    });

    await page.goto("/gamma/rounds", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/rounds");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const roundsSurface = page.locator('[data-gamma-application-content] [data-rounds-surface="rounds"]');
    await expect(roundsSurface).toHaveAttribute("data-rounds-presentation-host", "gamma");
    await expect(roundsSurface.locator('[data-rounds-region="season-panel"]')).toContainText("Gamma Season");
    await expect(roundsSurface.locator('[data-rounds-region="launch-board"]')).toContainText("Gamma Season");
    await expect(roundsSurface.locator('[data-rounds-region="round-card"]').first()).toContainText("Gamma Round");
    await expect(roundsSurface.locator('[data-rounds-region="info-meta"]').first()).toContainText("Competing");
    await expect(roundsSurface.locator('[data-rounds-region="mini-list"]').first()).toContainText("Gamma trophy");

    const roundsMetrics = await roundsSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          fontFamily: style.fontFamily,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        };
      };
      const surfaceStyle = window.getComputedStyle(surface);
      return {
        surfaceFontFamily: surfaceStyle.fontFamily,
        season: read('[data-rounds-region="season-panel"]'),
        launch: read('[data-rounds-region="launch-board"]'),
        metric: read('[data-rounds-region="launch-metric"]'),
        card: read('[data-rounds-region="round-card"]'),
        infoCard: read('[data-rounds-region="info-card"]'),
        infoMeta: read('[data-rounds-region="info-meta"]'),
        status: read('[data-rounds-region="status-badge"]'),
      };
    });
    expect(roundsMetrics.surfaceFontFamily.toLowerCase()).toContain("inter");
    for (const metrics of Object.values(roundsMetrics).filter((entry) => typeof entry === "object")) {
      expect(metrics?.backgroundImage).toBe("none");
      expect(metrics?.boxShadow).toBe("none");
      expect(metrics?.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics?.radius).toBeLessThanOrEqual(6);
    }
    expect(roundsMetrics.status?.borderColor).toMatch(/rgb\((198|214),\s*255,\s*(63|79)\)/);

    await roundsSurface.getByRole("button", { name: "Side Quests" }).click();
    await expect(page).toHaveURL(/\/gamma\/side-quests$/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await page.goto("/gamma/rounds", { waitUntil: "domcontentloaded" });
    await page.locator('[data-gamma-application-content] [data-rounds-region="round-card"]').first().click();
    await expect(page).toHaveURL(/\/gamma\/rounds\/901$/);
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/rounds/901");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const detailSurface = page.locator('[data-gamma-application-content] [data-rounds-surface="round-detail"]');
    await expect(detailSurface).toHaveAttribute("data-rounds-presentation-host", "gamma");
    await expect(detailSurface.locator('[data-rounds-region="info-card"]')).toContainText("Gamma Round");
    await expect(detailSurface.locator('[data-rounds-region="challenge-card"]')).toContainText("Gamma round challenge");

    const detailMetrics = await detailSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        };
      };
      return {
        infoCard: read('[data-rounds-region="info-card"]'),
        infoMeta: read('[data-rounds-region="info-meta"]'),
        challengeCard: read('[data-rounds-region="challenge-card"]'),
      };
    });
    for (const metrics of Object.values(detailMetrics)) {
      expect(metrics?.backgroundImage).toBe("none");
      expect(metrics?.boxShadow).toBe("none");
      expect(metrics?.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics?.radius).toBeLessThanOrEqual(6);
    }

    await detailSurface.getByRole("button", { name: "View Challenge" }).click();
    await expect(page).toHaveURL(/\/gamma\/challenges$/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts remaining gameshow native routes in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });

    await page.addInitScript(() => {
      class FakeDedRoomsWebSocket {
        constructor(url) {
          this.url = url;
          this.readyState = 0;
          this.listeners = new Map();
          setTimeout(() => {
            this.readyState = 1;
            this.dispatch("open", {});
            this.dispatch("message", {
              data: JSON.stringify({
                type: "ded_rooms_presence_snapshot",
                peers: [{ userId: 71, username: "other-contestant", role: "contestant" }],
              }),
            });
          }, 0);
        }

        addEventListener(type, listener) {
          const listeners = this.listeners.get(type) || [];
          listeners.push(listener);
          this.listeners.set(type, listeners);
        }

        removeEventListener(type, listener) {
          const listeners = this.listeners.get(type) || [];
          this.listeners.set(
            type,
            listeners.filter((entry) => entry !== listener)
          );
        }

        dispatch(type, event) {
          for (const listener of this.listeners.get(type) || []) listener(event);
          const handler = this[`on${type}`];
          if (typeof handler === "function") handler(event);
        }

        send() {}

        close() {
          this.readyState = 3;
          this.dispatch("close", {});
        }
      }

      window.WebSocket = FakeDedRoomsWebSocket;
    });

    const dedRoomsState = {
      status: "exploring",
      departed: false,
      isAdmin: true,
      campaign: {
        mode: "active",
        targetDepartures: 12,
        departureCount: 3,
        progress: {
          required: ["look", "listen", "depart"],
          completed: ["look"],
          sharedUnlocked: false,
        },
      },
      player: {
        locationId: "gamma-room",
        placedRoomId: "gamma-room",
        coordinate: { x: 1, y: 2, z: 3 },
        coordinateKey: "1,2,3",
        status: "exploring",
        weightLimit: 12,
        inventoryWeight: 2,
        commands: ["look", "listen", "map"],
        attuned: true,
        sheet: {
          name: "The Count",
          level: 4,
          attributes: { mind: 4 },
          skills: { counting: 12, listening: 3 },
        },
      },
      room: {
        id: "gamma-room",
        title: "Sunset Path With One Shoe",
        region: "Gamma MUD",
        description: "The command line smells faintly of fresh cyan paint.",
        exits: { north: "threshold" },
        doors: [{ key: "north", label: "North", kind: "door", resolvedToRoomId: "threshold" }],
        tags: ["gamma"],
      },
      doors: [{ key: "north", label: "North", kind: "door", resolvedToRoomId: "threshold" }],
      map: {
        placedCount: 6,
        deckRemaining: 102,
        currentCoordinate: { x: 1, y: 2, z: 3 },
        currentCoordinateKey: "1,2,3",
        currentPlacedRoomId: "gamma-room",
        greenRoomPlaced: false,
        anchors: [{ key: "thng", roomId: "thng", title: "THNG", discovered: true, coordinate: null }],
      },
      npcs: [{ key: "counting-usher", name: "Counting Usher", mood: "precise", wants: ["proof"] }],
      resources: [{ key: "quiet-moss", label: "quiet moss", family: "moss", farmYield: 1 }],
      minigames: [{ key: "count-ants", title: "Count ants", command: "count ants", rewardKey: "quiet-moss" }],
      inventory: [{ itemKey: "quiet-moss", label: "quiet moss", tier: 1, quantity: 2, weight: 1 }],
      nearby: [{ userId: 44, username: "gamma-builder", displayName: "Gamma Builder", mark: "ally" }],
      transcript: [
        {
          id: 1,
          eventType: "ded_rooms.command.look",
          message: "The Count sees Gamma shell chrome around the transcript.",
          visibility: "private",
          locationId: "gamma-room",
          createdAt: "2026-06-30T12:00:00.000Z",
        },
      ],
      seedSummary: {
        roomCount: 108,
        npcCount: 38,
        puzzleHookCount: 100,
        minigameCount: 40,
        resourceFamilyCount: 8,
      },
    };

    await page.route("**/api/dedrooms/state", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(dedRoomsState) });
    });
    await page.route("**/api/dedrooms/command", async (route) => {
      dedRoomsState.transcript = [
        ...dedRoomsState.transcript,
        {
          id: 2,
          eventType: "ded_rooms.command.look",
          message: "Gamma shell proof acknowledged the command without changing MUD logic.",
          visibility: "private",
          locationId: "gamma-room",
          createdAt: "2026-06-30T12:01:00.000Z",
        },
      ];
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          lines: ["Gamma shell proof acknowledged the command without changing MUD logic."],
          state: dedRoomsState,
        }),
      });
    });
    await page.route("**/api/dedrooms/admin/content", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          campaign: dedRoomsState.campaign,
          records: [
            {
              id: 7,
              kind: "dialogue",
              key: "gamma-proof",
              title: "Gamma proof",
              body: "The Count keeps the MUD admin panel in Gamma.",
              dataJson: {},
              status: "published",
              version: 1,
            },
          ],
          seed: {
            summary: dedRoomsState.seedSummary,
            puzzleHooks: [],
            minigames: dedRoomsState.minigames,
          },
        }),
      });
    });
    await page.route("**/api/dedrooms/admin/campaign", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.route("**/api/wtf-recapture/leaderboard**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          operatorWallet: "tz1OperatorGamma000000000000000000000",
          entries: [
            {
              userId: 1,
              walletAddress: "tz1CountGamma00000000000000000000000",
              totalWtf: "1200000000",
              eventCount: 3,
              lastAt: "2026-06-30T12:00:00.000Z",
              user: {
                id: 1,
                username: "the-count",
                displayName: "The Count",
                avatarUrl: null,
              },
            },
          ],
        }),
      });
    });
    await page.route("**/api/buyback-windows/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/buyback-windows/active") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            windows: [
              {
                id: 1,
                label: "Harness buyback",
                contractAddress: "KT1GammaBuyback0000000000000000000",
                network: "shadownet",
                status: "open",
                rateMutezPerWtf: "1000000",
                perSellerCapWtf: "1000000000",
                totalXtzBudgetMutez: "5000000",
                opensAt: "2026-06-30T10:00:00.000Z",
                closesAt: "2026-07-01T10:00:00.000Z",
                merkleRoot: null,
                swapsObserved: 2,
                wtfRecaptured: "200000000",
                xtzDispensedMutez: "2000000",
              },
            ],
          }),
        });
        return;
      }
      if (url.pathname === "/api/buyback-windows/1/eligibility") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            window: null,
            eligibility: [
              {
                id: 44,
                walletAddress: "tz1CountGamma00000000000000000000000",
                maxWtf: "1000000000",
                merkleProof: ["0xabc"],
                eligibilityReason: "The Count is counting the shell proof.",
                swappedWtf: "100000000",
                swappedAt: null,
                swapOpHash: null,
              },
            ],
          }),
        });
        return;
      }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await page.route("**/api/wtf-auctions**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/wtf-auctions/1") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            auction: null,
            bids: [
              { id: 1, amountWtf: "180000000", userId: 1, username: "the-count", createdAt: "2026-06-30T12:00:00.000Z" },
            ],
          }),
        });
        return;
      }
      if (url.pathname === "/api/wtf-auctions/1/bids") {
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          auctions: [
            {
              id: 1,
              title: "Harness Auction",
              description: "The Count checks auction chrome inside Gamma.",
              perkKind: "perk",
              startsAt: "2026-06-30T10:00:00.000Z",
              endsAt: "2026-07-01T10:00:00.000Z",
              minBidWtf: "100000000",
              bidIncrementWtf: "10000000",
              status: "live",
              winningBidId: null,
              settlementOpHash: null,
            },
          ],
        }),
      });
    });
    await page.route("**/api/wtf-recapture/mine", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          events: [
            {
              id: 17,
              walletAddress: "tz1CountGamma00000000000000000000000",
              source: "buyback",
              amountWtf: "100000000",
              opHash: "ooGammaRecapture",
              observedAt: "2026-06-30T12:00:00.000Z",
            },
          ],
        }),
      });
    });

    await page.route("**/api/mint-portal/challenges", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          wallet: { count: 1, addresses: ["tz1CountGamma00000000000000000000000"] },
          challenges: [
            {
              id: 301,
              roundId: 901,
              title: "Gamma mint proof",
              description: "Mint a shell-contained artifact while keeping shared mint logic.",
              status: "active",
              deadline: "2026-07-02T12:00:00.000Z",
              rewardAmountWtf: 5,
              rewardXp: 120,
              submissionContract: "KT1GammaMint000000000000000000000",
              submissionTag: "gamma-proof",
              submissionCuration: "gamma-curation",
              roundTitle: "Gamma Round",
              seasonId: 707,
              seasonTitle: "Gamma Season",
              mySubmissions: [
                {
                  id: 33,
                  challengeId: 301,
                  submittedAt: "2026-06-30T12:00:00.000Z",
                  grade: null,
                  rewardDistributed: false,
                  source: "mint_auto",
                  mintTokenContract: "KT1GammaMint000000000000000000000",
                  mintTokenId: "0",
                  mintOpHash: "ooGammaMint",
                  contentUrl: "ipfs://gamma-proof",
                },
              ],
            },
          ],
        }),
      });
    });
    await page.route("**/api/mint-portal/contracts**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          contracts: [
            {
              id: 1,
              name: "Gamma Mint",
              address: "KT1GammaMint000000000000000000000",
              network: "shadownet",
              opHash: "ooGammaContract",
              deployedAt: "2026-06-30T12:00:00.000Z",
            },
          ],
        }),
      });
    });
    await page.route("**/api/mint-portal/match", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, mintsScanned: 1, submissionsCreated: 0, bindingsActive: 1 }),
      });
    });

    const readGammaMetrics = async (surface, selectors) =>
      surface.evaluate((root, selectorMap) => {
        const read = (selector) => {
          const node = root.matches(selector) ? root : root.querySelector(selector);
          if (!node) return null;
          const style = window.getComputedStyle(node);
          return {
            backgroundImage: style.backgroundImage,
            borderWidth: Math.max(
              Number.parseFloat(style.borderTopWidth || "0"),
              Number.parseFloat(style.borderRightWidth || "0"),
              Number.parseFloat(style.borderBottomWidth || "0"),
              Number.parseFloat(style.borderLeftWidth || "0")
            ),
            boxShadow: style.boxShadow,
            fontFamily: style.fontFamily,
            radius: Math.max(
              Number.parseFloat(style.borderTopLeftRadius || "0"),
              Number.parseFloat(style.borderTopRightRadius || "0"),
              Number.parseFloat(style.borderBottomRightRadius || "0"),
              Number.parseFloat(style.borderBottomLeftRadius || "0")
            ),
            textShadow: style.textShadow,
          };
        };
        return Object.fromEntries(Object.entries(selectorMap).map(([key, selector]) => [key, read(selector)]));
      }, selectors);

    const expectGammaMetrics = (metrics, label) => {
      for (const [key, region] of Object.entries(metrics)) {
        expect(region, `missing ${label} metric: ${key}`).not.toBeNull();
        expect(region.backgroundImage).toBe("none");
        expect(region.boxShadow).toBe("none");
        expect(region.textShadow).toBe("none");
        expect(region.radius).toBeLessThanOrEqual(6);
        expect(region.borderWidth).toBeLessThanOrEqual(1);
      }
    };

    await gotoGammaRoute(page, "/dedrooms");
    const dedRoomsSurface = page.locator('[data-gamma-application-content] [data-dedrooms-surface="mud"]');
    await expect(dedRoomsSurface).toHaveAttribute("data-dedrooms-presentation-host", "gamma");
    await expect(dedRoomsSurface.locator('[data-dedrooms-region="room-title"]')).toContainText("Sunset Path With One Shoe");
    await expect(dedRoomsSurface.locator('[data-dedrooms-region="status-rail"]')).toContainText("quiet moss");
    await expect(dedRoomsSurface.locator('[data-dedrooms-region="admin-panel"]')).toContainText("ADM");
    await dedRoomsSurface.getByLabel("DedRooms command").fill("look");
    await dedRoomsSurface.getByTitle("Send command").click();
    await expect(dedRoomsSurface).toContainText("Gamma shell proof acknowledged");
    expectGammaMetrics(
      await readGammaMetrics(dedRoomsSurface, {
        surface: '[data-dedrooms-region="surface"]',
        transcript: '[data-dedrooms-region="transcript"]',
        statusRail: '[data-dedrooms-region="status-rail"]',
        prompt: '[data-dedrooms-region="prompt-bar"]',
        commandInput: '[data-dedrooms-region="command-input"]',
        commandButton: '[data-dedrooms-region="command-button"]',
        adminPanel: '[data-dedrooms-region="admin-panel"]',
      }),
      "DedRooms"
    );
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await gotoGammaRoute(page, "/wtf-recapture");
    const recaptureSurface = page.locator('[data-gamma-application-content] [data-wtf-recapture-surface="recapture"]');
    await expect(recaptureSurface).toHaveAttribute("data-wtf-recapture-presentation-host", "gamma");
    await expect(recaptureSurface.locator('[data-wtf-recapture-region="payment-boundary"]')).toContainText(
      "Manual wallet step — verified on-chain.",
    );
    await expect(recaptureSurface.locator('[data-wtf-recapture-region="payment-boundary"]')).toContainText(
      "placing a bid does not send or reserve WTF",
    );
    await expect(recaptureSurface.locator('[data-wtf-recapture-region="leader-row"]').first()).toContainText("The Count");
    await recaptureSurface.getByRole("button", { name: "Buyback Windows" }).click();
    await expect(recaptureSurface.locator('[data-wtf-recapture-region="buyback-window"]')).toContainText("Harness buyback");
    await recaptureSurface.getByRole("button", { name: "WTF Auctions" }).click();
    await expect(recaptureSurface.locator('[data-wtf-recapture-region="auction-card"]')).toContainText("Harness Auction");
    await expect(recaptureSurface.getByRole("button", { name: "Record off-chain bid" })).toBeVisible();
    expectGammaMetrics(
      await readGammaMetrics(recaptureSurface, {
        surface: '[data-wtf-recapture-region="surface"]',
        tabs: '[data-wtf-recapture-region="tabs"]',
        tabButton: '[data-wtf-recapture-region="tab-button"]',
        auctionCard: '[data-wtf-recapture-region="auction-card"]',
        statusPill: '[data-wtf-recapture-region="status-pill"]',
        metricsGrid: '[data-wtf-recapture-region="metrics-grid"]',
      }),
      "WTF Recapture"
    );
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await gotoGammaRoute(page, "/mint-portal");
    const mintSurface = page.locator('[data-gamma-application-content] [data-mint-portal-surface="mint-portal"]');
    await expect(mintSurface).toHaveAttribute("data-mint-portal-presentation-host", "gamma");
    await expect(mintSurface.locator('[data-mint-portal-region="direct-mint"]')).toContainText("Gamma Mint");
    await expect(mintSurface.locator('[data-mint-portal-region="challenge-card"]')).toContainText("Gamma mint proof");
    await mintSurface.getByRole("tab", { name: "Generative Art" }).click();
    await expect(mintSurface.locator('[data-generative-art-surface="mint-portal-generative"]')).toBeVisible();
    await expect(mintSurface.locator('[data-generative-art-region="editor"]')).toBeVisible();
    await expect(mintSurface.locator('[data-generative-art-region="guide"]')).toContainText("Minting guide");
    expectGammaMetrics(
      await readGammaMetrics(mintSurface, {
        surface: '[data-mint-portal-region="surface"]',
        tabs: '[data-mint-portal-region="tabs"]',
        tabBody: '[data-mint-portal-region="tab-body"]',
        generativeTab: '[data-mint-portal-region="generative-tab"]',
        editorPanel: '[data-generative-art-region="editor-panel"]',
        editor: '[data-generative-art-region="editor"]',
        actions: '[data-generative-art-region="actions"]',
        guide: '[data-generative-art-region="guide"]',
      }),
      "Mint Portal"
    );
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts Calendar events and TTC handoff chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "anonymous" });

    const now = new Date();
    const gammaEventStart = new Date(now);
    gammaEventStart.setHours(14, 0, 0, 0);
    const gammaEventEnd = new Date(gammaEventStart.getTime() + 60 * 60 * 1000);

    await page.route("**/api/calendar/events**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 909,
            kind: "x_space",
            title: "Gamma calendar signal",
            description: "A public return-loop event rendered through Gamma chrome.",
            startsAt: gammaEventStart.toISOString(),
            endsAt: gammaEventEnd.toISOString(),
            allDay: false,
            sourceKind: "ttc",
            sourceId: null,
            sourceProvider: "ttc",
            sourceRank: 2,
            visibility: "public",
            status: "published",
            linksJson: [{ label: "Event room", url: "https://example.com/gamma-calendar" }],
            location: "WTF LIVE",
            categories: ["Tezos", "WTFOS"],
            imageUrl: "/__test/media/harness-alpha-token.png",
            externalId: "gamma-calendar-signal",
            sourceUrl: "https://thetezos.com/events/gamma-calendar-signal/",
            creatorName: "Gamma TTC Creator",
            creatorUrl: "https://thetezos.com/author/gamma-creator/",
          },
        ]),
      });
    });

    await gotoGammaRoute(page, "/calendar");

    const calendarSurface = page.locator('[data-gamma-application-content] [data-calendar-surface="calendar"]');
    await expect(calendarSurface).toHaveAttribute("data-calendar-presentation-host", "gamma");
    await expect(calendarSurface).toHaveAttribute("data-calendar-active-tab", "browse");
    await expect(calendarSurface.locator('[data-calendar-region="source-links"]')).toContainText("/api/calendar/feed.ics");
    await expect(calendarSurface.locator('[data-calendar-region="tabs"]')).toContainText("Browse");
    await expect(calendarSurface.locator('[data-calendar-region="event-card"]')).toContainText("Gamma calendar signal");
    await calendarSurface.getByRole("button", { name: /Gamma calendar signal/ }).click();
    await expect(calendarSurface.locator('[data-calendar-region="source-badge"]')).toContainText("TTC");
    await expect(calendarSurface.locator('[data-calendar-region="kind-badge"]')).toContainText("x_space");
    await expect(calendarSurface.locator('[data-calendar-region="event-creator"]')).toContainText("Gamma TTC Creator");
    await expect(calendarSurface.locator('[data-calendar-region="event-source-link"] a')).toHaveAttribute(
      "href",
      "https://thetezos.com/events/gamma-calendar-signal/"
    );
    await expect(calendarSurface.locator('[data-calendar-region="source-panel"]')).toContainText("Personal entries stay");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const periodLabel = calendarSurface.locator('[data-calendar-region="period-label"]');
    await expect(calendarSurface.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
    await calendarSurface.getByRole("button", { name: "Day", exact: true }).click();
    await expect(calendarSurface.locator('[data-calendar-region="calendar-grid"]')).toHaveAttribute("data-calendar-view", "day");
    await expect(calendarSurface.locator('[data-calendar-region="calendar-grid"] section')).toHaveCount(1);
    const todayLabel = await periodLabel.textContent();
    await calendarSurface.getByRole("button", { name: "Previous day" }).click();
    await expect(periodLabel).not.toHaveText(todayLabel || "");
    await calendarSurface.getByRole("button", { name: "Today", exact: true }).click();
    await expect(periodLabel).toHaveText(todayLabel || "");

    await calendarSurface.getByRole("button", { name: "Month", exact: true }).click();
    await expect(calendarSurface.locator('[data-calendar-region="calendar-grid"]')).toHaveAttribute("data-calendar-view", "month");
    await expect(calendarSurface.locator('[data-calendar-region="month-day"]')).toHaveCount(42);
    await expect(calendarSurface.locator('[data-calendar-region="event-card"]').filter({ hasText: "Gamma calendar signal" })).toBeVisible();
    const currentMonthLabel = await periodLabel.textContent();
    await calendarSurface.getByRole("button", { name: "Next month" }).click();
    await expect(periodLabel).not.toHaveText(currentMonthLabel || "");
    await calendarSurface.getByRole("button", { name: "Today", exact: true }).click();
    await expect(periodLabel).toHaveText(currentMonthLabel || "");
    await calendarSurface.getByRole("button", { name: "Week", exact: true }).click();
    await expect(calendarSurface.locator('[data-calendar-region="calendar-grid"]')).toHaveAttribute("data-calendar-view", "week");
    await calendarSurface.getByRole("button", { name: "Agenda", exact: true }).click();
    await expect(calendarSurface.locator('[data-calendar-region="calendar-grid"]')).toHaveAttribute("data-calendar-view", "agenda");
    await expect(calendarSurface.getByRole("button", { name: /Gamma calendar signal/ })).toBeVisible();

    const calendarMetrics = await calendarSurface.evaluate((surface) => {
      const readNode = (node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          textShadow: style.textShadow,
        };
      };
      const read = (selector) => {
        const node = surface.matches(selector) ? surface : surface.querySelector(selector);
        return node ? readNode(node) : null;
      };
      return {
        surface: readNode(surface),
        sourceLinks: read('[data-calendar-region="source-links"]'),
        tabs: read('[data-calendar-region="tabs"]'),
        tabBody: read('[data-calendar-region="tab-body"]'),
        browseActions: read('[data-calendar-region="browse-actions"]'),
        calendarGrid: read('[data-calendar-region="calendar-grid"]'),
        eventCard: read('[data-calendar-region="event-card"]'),
        eventDetail: read('[data-calendar-region="event-detail"]'),
        sourcePanel: read('[data-calendar-region="source-panel"]'),
        sourceFieldset: read('[data-calendar-region="source-panel"] fieldset'),
        sourceBadge: read('[data-calendar-region="source-badge"]'),
        kindBadge: read('[data-calendar-region="kind-badge"]'),
      };
    });
    expect(calendarMetrics.surface.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const metrics of Object.values(calendarMetrics)) {
      expect(metrics?.backgroundImage).toBe("none");
      expect(metrics?.boxShadow).toBe("none");
      expect(metrics?.textShadow).toBe("none");
      expect(metrics?.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics?.radius).toBeLessThanOrEqual(6);
    }
    expect(calendarMetrics.sourceBadge?.color).toMatch(/rgb\(0,\s*210,\s*255\)/);
    expect(calendarMetrics.kindBadge?.borderColor).toMatch(/0,\s*210,\s*255/);

    await calendarSurface.getByRole("button", { name: "Add personal entry" }).click();
    const personalForm = calendarSurface.locator('[data-calendar-region="personal-form"]');
    await expect(calendarSurface).toHaveAttribute("data-calendar-active-tab", "personal");
    await personalForm.locator("input").first().fill("Gamma personal return");
    await personalForm.getByRole("button", { name: "Add to my view" }).click();
    await expect(calendarSurface).toHaveAttribute("data-calendar-active-tab", "browse");
    await expect(
      calendarSurface.locator('[data-calendar-region="event-card"]').filter({ hasText: "Gamma personal return" }).first()
    ).toBeVisible();

    await page.setViewportSize({ width: 640, height: 760 });
    await calendarSurface.getByRole("button", { name: "Month", exact: true }).click();
    await expect(calendarSurface.locator('[data-calendar-region="calendar-grid"]')).toBeVisible();
    await expect(calendarSurface.locator('[data-calendar-region="month-day"]')).toHaveCount(42);
    expect(
      await calendarSurface.evaluate((surface) => surface.scrollWidth <= surface.clientWidth + 2)
    ).toBe(true);

    await calendarSurface.getByRole("tab", { name: "Submit to WTF" }).click();
    await expect(calendarSurface).toHaveAttribute("data-calendar-active-tab", "submit");
    await expect(calendarSurface.locator('[data-calendar-region="submit-form"]')).toContainText(
      "Sign in to submit a WTF calendar event for review."
    );
    await calendarSurface.locator('[data-calendar-region="submit-form"]').getByRole("button", { name: "Submit to TTC" }).click();

    const ttcModal = page.locator('[data-calendar-region="ttc-modal"]');
    await expect(ttcModal).toBeVisible();
    await expect(ttcModal.locator('[data-calendar-region="ttc-header"]')).toContainText("Submit event to TTC");
    await expect(ttcModal.locator('iframe[title="Submit event to TheTezosCommunity"]')).toHaveAttribute(
      "src",
      "https://thetezos.com/submit-event/"
    );
    await expect(ttcModal.locator('iframe[title="Submit event to TheTezosCommunity"]')).toHaveAttribute(
      "sandbox",
      "allow-forms allow-popups allow-same-origin allow-scripts"
    );
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const modalMetrics = await ttcModal.evaluate((modal) => {
      const read = (selector) => {
        const node = modal.matches(selector) ? modal : modal.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          textShadow: style.textShadow,
        };
      };
      return {
        modal: read('[data-calendar-region="ttc-modal"]'),
        header: read('[data-calendar-region="ttc-header"]'),
        body: read('[data-calendar-region="ttc-body"]'),
        frame: read('[data-calendar-region="ttc-frame"]'),
      };
    });
    for (const metrics of Object.values(modalMetrics)) {
      expect(metrics?.backgroundImage).toBe("none");
      expect(metrics?.boxShadow).toBe("none");
      expect(metrics?.textShadow).toBe("none");
      expect(metrics?.borderWidth).toBeLessThanOrEqual(1);
      expect(metrics?.radius).toBeLessThanOrEqual(6);
    }
    expect(modalMetrics.header?.color).toMatch(/rgb\(0,\s*210,\s*255\)/);
  });

  test("hosts My Photos library and upload chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-media", displayName: "Gamma Media" });
    await page.route("**/api/media/mine?category=image", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 91,
            title: "Gamma Snapshot",
            description: "Harness image for Gamma media-library containment.",
            sourceType: "upload",
            sourceUrl: "/api/media/91/file",
            playbackUrl: "/api/media/91/file",
            posterUrl: null,
            mimeType: "image/png",
            status: "ready",
            tokenContract: null,
            tokenId: null,
            mediaCategory: "image",
            fileSize: 2048,
            metadata: { wtfTvOverlay: { creatorName: "Gamma Lens", collectionName: "Gamma Field Notes" } },
            createdAt: "2026-06-27T00:00:00.000Z",
          },
        ]),
      });
    });
    await page.route("**/api/profile/tokens**", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) });
    });
    await page.route("**/api/media/91/file", async (route) => {
      await route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#00d2ff"/></svg>',
      });
    });

    await page.goto("/gamma/my-photos", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/my-photos");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const surface = page.locator('[data-gamma-application-content] [data-my-photos-presentation-host="gamma"]');
    await expect(surface).toBeVisible();
    await expect(surface.locator('[data-my-photos-region="photo-card"]')).toContainText("Gamma Snapshot");
    await expect(surface.locator('[data-my-photos-region="photo-info"]')).toContainText("Gamma Lens");

    const libraryMetrics = await surface.evaluate((root) => {
      const card = root.querySelector('[data-my-photos-region="photo-card"]');
      const thumb = root.querySelector('[data-my-photos-region="photo-thumb"]');
      const grid = root.querySelector('[data-my-photos-region="library-grid"]');
      const cardStyle = card ? window.getComputedStyle(card) : null;
      const thumbStyle = thumb ? window.getComputedStyle(thumb) : null;
      const gridStyle = grid ? window.getComputedStyle(grid) : null;
      return {
        cardBackgroundImage: cardStyle?.backgroundImage || "",
        cardBoxShadow: cardStyle?.boxShadow || "",
        cardRadius: Number.parseFloat(cardStyle?.borderTopLeftRadius || "0"),
        cardBorderWidth: Number.parseFloat(cardStyle?.borderTopWidth || "0"),
        thumbBackgroundImage: thumbStyle?.backgroundImage || "",
        thumbBoxShadow: thumbStyle?.boxShadow || "",
        gridBoxShadow: gridStyle?.boxShadow || "",
      };
    });
    expect(libraryMetrics.cardBackgroundImage).toBe("none");
    expect(libraryMetrics.cardBoxShadow).toBe("none");
    expect(libraryMetrics.cardRadius).toBeLessThanOrEqual(6);
    expect(libraryMetrics.cardBorderWidth).toBeLessThanOrEqual(1);
    expect(libraryMetrics.thumbBackgroundImage).toBe("none");
    expect(libraryMetrics.thumbBoxShadow).toBe("none");
    expect(libraryMetrics.gridBoxShadow).toBe("none");

    await page.getByText("Upload", { exact: true }).click();
    const uploadArea = surface.locator('[data-my-photos-region="upload-area"]');
    await expect(uploadArea).toBeVisible();

    const uploadMetrics = await uploadArea.evaluate((node) => {
      const style = window.getComputedStyle(node);
      return {
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
        radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
        borderColor: style.borderTopColor,
      };
    });
    expect(uploadMetrics.backgroundImage).toBe("none");
    expect(uploadMetrics.boxShadow).toBe("none");
    expect(uploadMetrics.radius).toBeLessThanOrEqual(6);
    expect(uploadMetrics.borderWidth).toBeLessThanOrEqual(1);
    expect(uploadMetrics.borderColor).toMatch(/0,\s*210,\s*255/);
  });

  test("hosts My Music library and upload chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-audio", displayName: "Gamma Audio" });
    await page.route("**/api/media/mine?category=audio", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 104,
            title: "Gamma Field Recording",
            sourceUrl: "/api/media/104/file",
            playbackUrl: "/api/media/104/file",
            mimeType: "audio/mpeg",
            tokenContract: null,
            tokenId: null,
            metadata: { provenance: { creator: "Gamma Audio Desk" } },
            fileSize: 8192,
            createdAt: "2026-06-27T00:00:00.000Z",
          },
        ]),
      });
    });
    await page.route("**/api/media/104/file", async (route) => {
      await route.fulfill({ contentType: "audio/mpeg", body: "" });
    });

    await page.goto("/gamma/my-music", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/my-music");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const surface = page.locator('[data-gamma-application-content] [data-my-music-presentation-host="gamma"]');
    await expect(surface).toBeVisible();
    await expect(surface.locator('[data-my-music-region="track-card"]')).toContainText("Gamma Field Recording");
    await expect(surface.locator('[data-my-music-region="track-meta"]')).toContainText("audio/mpeg");
    await expect(surface.locator('[data-my-music-region="audio-player"]')).toBeVisible();

    const musicMetrics = await surface.evaluate((root) => {
      const toolbar = root.querySelector('[data-my-music-region="toolbar"]');
      const upload = root.querySelector('[data-my-music-region="upload-button"]');
      const panel = root.querySelector('[data-my-music-region="library-panel"]') || root.querySelector("fieldset");
      const track = root.querySelector('[data-my-music-region="track-card"]');
      const audio = root.querySelector('[data-my-music-region="audio-player"]');
      const read = (node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderColor: style.borderTopColor,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        };
      };
      return {
        toolbar: toolbar ? read(toolbar) : null,
        upload: upload ? read(upload) : null,
        panel: panel ? read(panel) : null,
        track: track ? read(track) : null,
        audio: audio ? read(audio) : null,
      };
    });
    expect(musicMetrics.toolbar?.backgroundImage).toBe("none");
    expect(musicMetrics.toolbar?.boxShadow).toBe("none");
    expect(musicMetrics.toolbar?.borderWidth).toBeLessThanOrEqual(1);
    expect(musicMetrics.toolbar?.radius).toBeLessThanOrEqual(6);
    expect(musicMetrics.upload?.backgroundImage).toBe("none");
    expect(musicMetrics.upload?.boxShadow).toBe("none");
    expect(musicMetrics.upload?.borderColor).toMatch(/0,\s*210,\s*255/);
    expect(musicMetrics.panel?.boxShadow).toBe("none");
    expect(musicMetrics.panel?.radius).toBeLessThanOrEqual(6);
    expect(musicMetrics.track?.backgroundImage).toBe("none");
    expect(musicMetrics.track?.boxShadow).toBe("none");
    expect(musicMetrics.track?.borderWidth).toBeLessThanOrEqual(1);
    expect(musicMetrics.track?.radius).toBeLessThanOrEqual(6);
    expect(musicMetrics.audio?.boxShadow).toBe("none");
  });

  test("hosts media infrastructure routes in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-media",
      displayName: "Gamma Media",
      wtfUserSiteClaimed: true,
    });
    await page.route("**/api/media/mine?category=audio", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 704,
            title: "Gamma Infrastructure Beat",
            sourceUrl: "/api/media/704/file",
            playbackUrl: "/api/media/704/file",
            mimeType: "audio/mpeg",
          },
        ]),
      });
    });
    await page.route("**/api/media/704/file", async (route) => {
      await route.fulfill({ contentType: "audio/mpeg", body: "" });
    });
    await page.route("**/api/music/playlists", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
    });

    const readMetrics = async (surface, selectors) =>
      surface.evaluate((root, selectorMap) => {
        const read = (selector) => {
          const node = root.matches(selector) ? root : root.querySelector(selector);
          if (!node) return null;
          const style = window.getComputedStyle(node);
          return {
            backgroundImage: style.backgroundImage,
            borderWidth: Math.max(
              Number.parseFloat(style.borderTopWidth || "0"),
              Number.parseFloat(style.borderRightWidth || "0"),
              Number.parseFloat(style.borderBottomWidth || "0"),
              Number.parseFloat(style.borderLeftWidth || "0")
            ),
            boxShadow: style.boxShadow,
            radius: Math.max(
              Number.parseFloat(style.borderTopLeftRadius || "0"),
              Number.parseFloat(style.borderTopRightRadius || "0"),
              Number.parseFloat(style.borderBottomRightRadius || "0"),
              Number.parseFloat(style.borderBottomLeftRadius || "0")
            ),
            textShadow: style.textShadow,
          };
        };
        return Object.fromEntries(Object.entries(selectorMap).map(([key, selector]) => [key, read(selector)]));
      }, selectors);

    const expectGammaMetrics = (metrics, label) => {
      for (const [key, region] of Object.entries(metrics)) {
        expect(region, `missing ${label} Gamma metric: ${key}`).not.toBeNull();
        expect(region.backgroundImage).toBe("none");
        expect(region.boxShadow).toBe("none");
        expect(region.textShadow).toBe("none");
        expect(region.radius).toBeLessThanOrEqual(6);
        expect(region.borderWidth).toBeLessThanOrEqual(1);
      }
    };

    await gotoGammaRoute(page, "/music");
    const musicSurface = page.locator('[data-gamma-application-content] [data-music-surface="tezosbeats"]');
    await expect(musicSurface).toHaveAttribute("data-music-presentation-host", "gamma");
    await expect(musicSurface.locator('[data-music-region="now-playing"]')).toContainText("No track selected");
    await expect(musicSurface.locator('[data-music-region="info-note"]')).toContainText("Connect a Tezos wallet");
    await musicSurface.getByText("My Music", { exact: true }).click();
    await expect(musicSurface.locator('[data-music-region="track-row"]')).toContainText("Gamma Infrastructure Beat");
    await musicSurface.getByText("Playlists", { exact: true }).click();
    await expect(musicSurface.locator('[data-music-region="playlist-empty"]')).toContainText("No playlists yet.");
    expectGammaMetrics(
      await readMetrics(musicSurface, {
        layout: '[data-music-region="layout"]',
        deck: '[data-music-region="deck-panel"]',
        nowPlaying: '[data-music-region="now-playing"]',
        visualizer: '[data-music-region="visualizer"]',
        queue: '[data-music-region="queue-panel"]',
        playlistPanel: '[data-music-region="playlist-panel"]',
        credit: '[data-music-region="credit"]',
      }),
      "TezosBeats"
    );
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await gotoGammaRoute(page, "/tezamp");
    const tezampSurface = page.locator('[data-gamma-application-content] [data-tezamp-surface="player"]');
    await expect(tezampSurface).toHaveAttribute("data-tezamp-presentation-host", "gamma");
    await expect(tezampSurface.locator('[data-tezamp-region="now-playing"]')).toContainText("Gamma Infrastructure Beat");
    await expect(tezampSurface.locator('[data-tezamp-region="audio-player"]')).toBeVisible();
    expectGammaMetrics(
      await readMetrics(tezampSurface, {
        layout: '[data-tezamp-region="layout"]',
        deck: '[data-tezamp-region="deck"]',
        visualizer: '[data-tezamp-region="visualizer"]',
        queue: '[data-tezamp-region="queue-panel"]',
        queueButton: '[data-tezamp-region="queue-button"]',
        audio: '[data-tezamp-region="audio-player"]',
      }),
      "Tezamp"
    );
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await gotoGammaRoute(page, "/ipfs-pinning");
    let ipfsSurface = page.locator('[data-gamma-application-content] [data-ipfs-pinning-surface="manager"]');
    await expect(ipfsSurface).toHaveAttribute("data-ipfs-pinning-presentation-host", "gamma");
    await expect(ipfsSurface).toHaveAttribute("data-ipfs-pinning-mode", "manager");
    await expect(ipfsSurface.locator('[data-ipfs-pinning-region="status-tile"]').first()).toContainText("Role");
    await expect(ipfsSurface.locator('[data-ipfs-pinning-region="job-table"]')).toContainText("bafybeiharnesspinningfixture");
    expectGammaMetrics(
      await readMetrics(ipfsSurface, {
        shell: '[data-ipfs-pinning-region="shell"]',
        header: '[data-ipfs-pinning-region="header"]',
        statusGrid: '[data-ipfs-pinning-region="status-grid"]',
        statusTile: '[data-ipfs-pinning-region="status-tile"]',
        section: '[data-ipfs-pinning-region="section"]',
        modeButton: '[data-ipfs-pinning-region="mode-button"]',
        field: '[data-ipfs-pinning-region="field"]',
        disclosure: '[data-ipfs-pinning-region="disclosure"]',
        table: '[data-ipfs-pinning-region="job-table"]',
        footer: '[data-ipfs-pinning-region="footer"]',
        textButton: '[data-ipfs-pinning-region="text-button"]',
      }),
      "IPFS Pinning"
    );
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await ipfsSurface.getByRole("button", { name: "Own-node setup" }).click();
    await expect(page).toHaveURL(/\/gamma\/apps\/porcupin-setup$/);
    await expectGammaRouteReady(page, "/apps/porcupin-setup");
    ipfsSurface = page.locator('[data-gamma-application-content] [data-ipfs-pinning-surface="manager"]');
    await expect(ipfsSurface).toHaveAttribute("data-ipfs-pinning-mode", "setup");
    await expect(ipfsSurface).toHaveAttribute("data-ipfs-pinning-presentation-host", "gamma");

    await gotoGammaRoute(page, "/apps/porcupin-dashboard");
    ipfsSurface = page.locator('[data-gamma-application-content] [data-ipfs-pinning-surface="manager"]');
    await expect(ipfsSurface).toHaveAttribute("data-ipfs-pinning-mode", "dashboard");
    await expect(ipfsSurface).toHaveAttribute("data-ipfs-pinning-presentation-host", "gamma");
    await expect(ipfsSurface.locator('[data-ipfs-pinning-region="footer"]')).toContainText("/mnt/wtf-data/workers/porcupin");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts media discovery detail routes in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, {
      userRole: "user",
      username: "gamma-collekt",
      displayName: "Gamma colleKT",
    });
    await page.route("**/api/collekt/session", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: 77, username: "gamma-collekt", displayName: "Gamma colleKT" },
          wallets: [
            {
              id: 7001,
              walletAddress: "tz1GammaCollektWallet000000000000000001",
              tezDomain: "gamma-collekt.tez",
              isPrimary: true,
              lastSyncedAt: "2026-06-29T12:00:00.000Z",
            },
          ],
          gallery: {
            id: "wtf:me",
            path: "/api/collekt/tokens",
            moduleUrl: "https://gamma-collekt.test/module",
          },
        }),
      });
    });
    await page.route("https://gamma-collekt.test/wtf**", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>colleKT harness</title><main>Gamma colleKT module</main>",
      });
    });

    const readMetrics = async (surface, selectors) =>
      surface.evaluate((root, selectorMap) => {
        const read = (selector) => {
          const node = root.matches(selector) ? root : root.querySelector(selector);
          if (!node) return null;
          const style = window.getComputedStyle(node);
          return {
            backgroundImage: style.backgroundImage,
            borderWidth: Math.max(
              Number.parseFloat(style.borderTopWidth || "0"),
              Number.parseFloat(style.borderRightWidth || "0"),
              Number.parseFloat(style.borderBottomWidth || "0"),
              Number.parseFloat(style.borderLeftWidth || "0")
            ),
            boxShadow: style.boxShadow,
            color: style.color,
            fontFamily: style.fontFamily,
            radius: Math.max(
              Number.parseFloat(style.borderTopLeftRadius || "0"),
              Number.parseFloat(style.borderTopRightRadius || "0"),
              Number.parseFloat(style.borderBottomRightRadius || "0"),
              Number.parseFloat(style.borderBottomLeftRadius || "0")
            ),
            textShadow: style.textShadow,
          };
        };
        return Object.fromEntries(Object.entries(selectorMap).map(([key, selector]) => [key, read(selector)]));
      }, selectors);

    const expectGammaMetrics = (metrics, label) => {
      for (const [key, region] of Object.entries(metrics)) {
        expect(region, `missing ${label} Gamma metric: ${key}`).not.toBeNull();
        expect(region.backgroundImage).toBe("none");
        expect(region.boxShadow).toBe("none");
        expect(region.textShadow).toBe("none");
        expect(region.radius).toBeLessThanOrEqual(6);
        expect(region.borderWidth).toBeLessThanOrEqual(1);
      }
    };

    await gotoGammaRoute(page, "/gallery/token/KT1GammaGallery/3");
    let gallerySurface = page.locator(
      '[data-gamma-application-content] [data-gallery-surface="survival-gallery"]'
    );
    await expect(gallerySurface).toHaveAttribute("data-gallery-presentation-host", "gamma");
    await expect(gallerySurface).toContainText("Survival Tokens");
    await expect(gallerySurface.locator('[data-gallery-region="token-card"]').first()).toContainText(
      "Season 1 - Round 1 Survivor"
    );
    expectGammaMetrics(
      await readMetrics(gallerySurface, {
        layout: '[data-gallery-region="layout"]',
        intro: '[data-gallery-region="intro"]',
        actionRow: '[data-gallery-region="action-row"]',
        title: '[data-gallery-region="section-title"]',
        grid: '[data-gallery-region="grid"]',
        card: '[data-gallery-region="token-card"]',
        preview: '[data-gallery-region="token-preview"]',
        artist: '[data-gallery-region="artist"]',
        notice: '[data-gallery-region="notice"]',
      }),
      "Gallery detail alias"
    );
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await gotoGammaRoute(page, "/token/KT1GammaGallery/3");
    gallerySurface = page.locator('[data-gamma-application-content] [data-gallery-surface="survival-gallery"]');
    await expect(gallerySurface).toHaveAttribute("data-gallery-presentation-host", "gamma");
    await gallerySurface.getByRole("button", { name: "Slideshow" }).click();
    await expect(gallerySurface.locator('[data-gallery-region="slideshow"]')).toContainText(
      "Season 1 - Round 1 Survivor"
    );
    await expect(gallerySurface.getByRole("button", { name: "Back to grid view" })).toBeVisible();
    expectGammaMetrics(
      await readMetrics(gallerySurface, {
        layout: '[data-gallery-region="layout"]',
        slideshow: '[data-gallery-region="slideshow"]',
        actionRow: '[data-gallery-region="action-row"]',
        notice: '[data-gallery-region="notice"]',
      }),
      "Gallery token alias slideshow"
    );
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await gotoGammaRoute(page, "/collekt");
    const collektSurface = page.locator('[data-gamma-application-content] [data-collekt-surface="bridge"]');
    await expect(collektSurface).toHaveAttribute("data-collekt-presentation-host", "gamma");
    await expect(collektSurface.locator('[data-collekt-region="source-panel"]')).toContainText("Gamma colleKT");
    await expect(collektSurface.locator('[data-collekt-region="wallet-row"]')).toContainText("gamma-collekt.tez");
    await expect(collektSurface.locator('[data-collekt-region="frame"]')).toHaveAttribute(
      "src",
      /https:\/\/gamma-collekt\.test\/wtf\?wtfApi=/
    );
    expectGammaMetrics(
      await readMetrics(collektSurface, {
        surface: '[data-collekt-region="surface"]',
        layout: '[data-collekt-region="layout"]',
        sourcePanel: '[data-collekt-region="source-panel"]',
        launchRow: '[data-collekt-region="launch-row"]',
        launchButton: '[data-collekt-region="launch-button"]',
        walletPanel: '[data-collekt-region="wallet-panel"]',
        walletRow: '[data-collekt-region="wallet-row"]',
        frameWrap: '[data-collekt-region="frame-wrap"]',
        frame: '[data-collekt-region="frame"]',
      }),
      "colleKT bridge"
    );
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts WTF LIVE creation dialogs in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });
    await page.goto("/gamma/live?tab=stages", { waitUntil: "domcontentloaded" });

    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/live");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    await page.getByRole("button", { name: "Create Stage" }).click();

    const overlay = page.locator('[data-gamma-application-content] [data-wtf-live-dialog="true"]');
    await expect(overlay).toHaveAttribute("data-wtf-live-presentation-host", "gamma");
    const dialog = page.getByRole("dialog", { name: "Create Stage" });
    await expect(dialog).toBeVisible();

    const dialogMetrics = await dialog.evaluate((frame) => {
      const frameStyle = window.getComputedStyle(frame);
      return {
        backgroundImage: frameStyle.backgroundImage,
        boxShadow: frameStyle.boxShadow,
        radius: Number.parseFloat(frameStyle.borderTopLeftRadius || "0"),
      };
    });
    expect(dialogMetrics.backgroundImage).toBe("none");
    expect(dialogMetrics.boxShadow).toBe("none");
    expect(dialogMetrics.radius).toBeLessThanOrEqual(6);
  });

  test("keeps WTF LIVE room handoffs and popouts in the Gamma shell", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });
    await gotoGammaRoute(page, "/live");

    const popupPromise = page.waitForEvent("popup");
    await page.locator('[data-wtf-live-room-join="wtf-live"]').first().click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup).toHaveURL(/\/gamma\/live\/r\/wtf-live$/);
    await expectGammaRouteReady(popup, "/live/r/wtf-live");
    await popup.close();

    await gotoGammaRoute(page, "/live/r/wtf-live");

    await page.locator("[data-wtf-live-popout-chat]").click();
    const popoutLayer = page.locator('[data-gamma-application-content] [data-wtf-live-popout-layer]');
    await expect(popoutLayer).toHaveAttribute("data-wtf-live-presentation-host", "gamma");
    const popoutFrame = popoutLayer.locator("[data-wtf-live-popout-frame]").first();
    await expect(popoutFrame).toBeVisible();

    const popoutMetrics = await popoutFrame.evaluate((frame) => {
      const frameStyle = window.getComputedStyle(frame);
      const titleStyle = window.getComputedStyle(frame.firstElementChild ?? frame);
      return {
        backgroundImage: frameStyle.backgroundImage,
        boxShadow: frameStyle.boxShadow,
        radius: Number.parseFloat(frameStyle.borderTopLeftRadius || "0"),
        titleBackgroundImage: titleStyle.backgroundImage,
      };
    });
    expect(popoutMetrics.backgroundImage).toBe("none");
    expect(popoutMetrics.boxShadow).toBe("none");
    expect(popoutMetrics.radius).toBeLessThanOrEqual(6);
    expect(popoutMetrics.titleBackgroundImage).toBe("none");
  });

  test("hosts Message Board custom chrome and dialogs in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });

    const channel = {
      id: 1,
      title: "Announcements",
      body: "Gamma board channel",
      categoryId: 1,
      channelType: "announcements",
      topic: "Harness board topic",
      position: 1,
      slowModeSeconds: 0,
      viewRoles: ["witness", "contestant", "admin"],
      replyRoles: ["witness", "contestant", "admin"],
      active: true,
      pinned: false,
      locked: false,
      messageCount: 1,
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:00.000Z",
    };

    await page.route("**/api/board/categories", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          { id: 1, name: "General", position: 1, collapsed: false },
        ]),
      });
    });
    await page.route("**/api/board/channels", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([channel]),
      });
    });
    await page.route("**/api/board/channels/1/messages", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          channel: { ...channel, canPost: true, canManage: true },
          messages: [
            {
              id: 11,
              threadId: 1,
              userId: 1,
              username: "the-count",
              displayName: "The Count",
              avatarUrl: null,
              role: "admin",
              content: "Gamma board containment proof.",
              attachments: [],
              pinned: false,
              parentReplyId: null,
              webhookId: null,
              createdAt: "2026-06-27T00:00:00.000Z",
              editedAt: null,
              reactions: [{ emoji: "⚡", users: [{ id: 1, username: "the-count" }] }],
            },
          ],
        }),
      });
    });

    await page.goto("/gamma/messageboard", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/messageboard");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const boardSurface = page.locator('[data-gamma-application-content] [data-board-surface="messageboard"]');
    await expect(boardSurface).toHaveAttribute("data-board-presentation-host", "gamma");
    await expect(boardSurface).toContainText("Gamma board containment proof.");

    const boardChromeMetrics = await boardSurface.evaluate((surface) => {
      const shell = surface.querySelector('[data-board-region="shell"]');
      const sideHeader = surface.querySelector('[data-board-region="side-header"]');
      const channelHeader = surface.querySelector('[data-board-region="channel-header"]');
      const composer = surface.querySelector('[data-board-region="composer"]');
      const read = (node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        };
      };
      return {
        shell: shell ? read(shell) : null,
        sideHeader: sideHeader ? read(sideHeader) : null,
        channelHeader: channelHeader ? read(channelHeader) : null,
        composer: composer ? read(composer) : null,
      };
    });
    expect(boardChromeMetrics.shell?.borderWidth).toBeLessThanOrEqual(1);
    expect(boardChromeMetrics.shell?.radius).toBeLessThanOrEqual(6);
    expect(boardChromeMetrics.sideHeader?.backgroundImage).toBe("none");
    expect(boardChromeMetrics.channelHeader?.backgroundImage).toBe("none");
    expect(boardChromeMetrics.composer?.borderWidth).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Open channel settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Channel Settings - Announcements" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-board-dialog", "channel-settings");

    const dialogMetrics = await dialog.evaluate((frame) => {
      const titlebar = frame.querySelector(":scope > div");
      const frameStyle = window.getComputedStyle(frame);
      const titlebarStyle = titlebar ? window.getComputedStyle(titlebar) : null;
      return {
        frameBackgroundImage: frameStyle.backgroundImage,
        frameBoxShadow: frameStyle.boxShadow,
        frameRadius: Number.parseFloat(frameStyle.borderTopLeftRadius || "0"),
        titlebarBackgroundImage: titlebarStyle?.backgroundImage || "",
      };
    });
    expect(dialogMetrics.frameBackgroundImage).toBe("none");
    expect(dialogMetrics.frameBoxShadow).toBe("none");
    expect(dialogMetrics.frameRadius).toBeLessThanOrEqual(6);
    expect(dialogMetrics.titlebarBackgroundImage).toBe("none");
  });

  test("hosts Inbox and Notification Center chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });

    await page.route("**/api/messages/users?limit=200", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 2,
            username: "gamma-peer",
            displayName: "Gamma Peer",
            avatarUrl: null,
            role: "contestant",
            experiencePoints: 44,
          },
        ]),
      });
    });
    await page.route("**/api/messages/dms", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 77,
            title: null,
            unreadCount: 1,
            conversationType: "direct",
            peers: [
              {
                id: 2,
                username: "gamma-peer",
                displayName: "Gamma Peer",
                role: "contestant",
              },
            ],
            latestMessage: {
              id: 501,
              senderId: 2,
              content: "Queued Gamma DM.",
              createdAt: "2026-06-27T00:00:00.000Z",
            },
          },
        ]),
      });
    });
    await page.route(/\/api\/messages\/dms\/77\/messages\?limit=100$/, async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 501,
            senderId: 2,
            username: "gamma-peer",
            displayName: "Gamma Peer",
            content: "Queued Gamma DM.",
            createdAt: "2026-06-27T00:00:00.000Z",
          },
        ]),
      });
    });
    await page.route("**/api/notifications/preferences", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          definitions: [
            {
              key: "studio.file_uploaded",
              label: "Studio file notifications",
              description: "Files uploaded to projects you can review.",
              defaultEnabled: true,
            },
            {
              key: "system.notice",
              label: "System notices",
              description: "Important WTFOS platform notices.",
              defaultEnabled: true,
            },
          ],
          preferences: {
            "studio.file_uploaded": true,
            "system.notice": true,
          },
        }),
      });
    });
    await page.route(/\/api\/notifications\?limit=200(?:&unreadOnly=true)?$/, async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          unreadCount: 1,
          pagination: { limit: 200, offset: 0, count: 2 },
          items: [
            {
              id: 701,
              sourceUserId: 2,
              sourceUsername: "gamma-peer",
              sourceDisplayName: "Gamma Peer",
              eventKey: "studio.file_uploaded",
              title: "Gamma Studio upload",
              body: "A collaborator added a file to the project.",
              metadata: { studioProjectId: 909 },
              read: false,
              createdAt: "2026-06-27T00:00:00.000Z",
            },
            {
              id: 702,
              sourceUserId: null,
              sourceUsername: null,
              sourceDisplayName: null,
              eventKey: "system.notice",
              title: "Gamma system notice",
              body: "This notice proves notification rows are contained.",
              metadata: {},
              read: true,
              createdAt: "2026-06-27T00:00:00.000Z",
            },
          ],
        }),
      });
    });
    await page.route("**/api/notifications/701/opened", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await page.route("**/api/notifications/701/read", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/gamma/messages", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/messages");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const inboxSurface = page.locator('[data-gamma-application-content] [data-messages-surface="messages"]');
    await expect(inboxSurface).toHaveAttribute("data-messages-presentation-host", "gamma");
    await expect(inboxSurface).toContainText("Gamma Peer");
    await expect(inboxSurface).toContainText("Queued Gamma DM.");

    const inboxMetrics = await inboxSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          color: style.color,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        };
      };
      return {
        fontFamily: window.getComputedStyle(surface).fontFamily,
        list: read('[data-messages-region="list-panel"]'),
        thread: read('[data-messages-region="message-list"]'),
        conversation: read('[data-messages-region="conversation-button"]'),
        message: read('[data-messages-region="message-row"]'),
        input: read('[data-messages-region="input-row"]'),
      };
    });
    expect(inboxMetrics.fontFamily).toMatch(/Inter|IBM Plex Sans|Arial/);
    for (const key of ["list", "thread", "conversation", "message", "input"]) {
      expect(inboxMetrics[key]?.backgroundImage).toBe("none");
      expect(inboxMetrics[key]?.boxShadow).toBe("none");
      expect(inboxMetrics[key]?.radius).toBeLessThanOrEqual(6);
    }
    expect(inboxMetrics.list?.borderWidth).toBeLessThanOrEqual(1);
    expect(inboxMetrics.thread?.borderWidth).toBeLessThanOrEqual(1);
    expect(inboxMetrics.conversation?.color).not.toBe("rgb(0, 0, 0)");

    await page.goto("/gamma/notifications", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/notifications");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const notificationSurface = page.locator('[data-gamma-application-content] [data-messages-surface="notifications"]');
    await expect(notificationSurface).toHaveAttribute("data-messages-presentation-host", "gamma");
    await expect(notificationSurface).toContainText("Studio file notifications");
    await expect(notificationSurface).toContainText("Gamma Studio upload");

    const notificationMetrics = await notificationSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        };
      };
      return {
        list: read('[data-messages-region="list-panel"]'),
        row: read('[data-messages-region="notification-row"]'),
        preference: read('[data-messages-region="preference-row"]'),
        actions: read('[data-messages-region="notification-actions"]'),
      };
    });
    for (const key of ["list", "row", "preference", "actions"]) {
      expect(notificationMetrics[key]?.backgroundImage).toBe("none");
      expect(notificationMetrics[key]?.boxShadow).toBe("none");
      expect(notificationMetrics[key]?.radius).toBeLessThanOrEqual(6);
    }
    expect(notificationMetrics.row?.borderWidth).toBeLessThanOrEqual(1);
    expect(notificationMetrics.preference?.borderWidth).toBeLessThanOrEqual(1);

    await page.goto("/gamma/notification-center", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute(
      "data-gamma-route",
      "/notification-center"
    );
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const notificationAliasSurface = page.locator(
      '[data-gamma-application-content] [data-messages-surface="notifications"]'
    );
    await expect(notificationAliasSurface).toHaveAttribute("data-messages-presentation-host", "gamma");
    await expect(notificationAliasSurface).toContainText("Gamma Studio upload");

    await notificationAliasSurface
      .locator('[data-messages-region="notification-row"]')
      .filter({ hasText: "Gamma Studio upload" })
      .click();
    await expect(page).toHaveURL(/\/gamma\/studio\/909/);
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts Inbox mailbox chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });

    let sendPayload = null;
    let dmSendPayload = null;
    await page.route("**/api/mail/status", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          eligible: true,
          mailbox: {
            id: 44,
            address: "the-count@mail.wtfgameshow.app",
            status: "active",
          },
          config: {
            provider: "resend",
            domain: "mail.wtfgameshow.app",
            inboundEnabled: true,
            outboundEnabled: true,
            rolloutMode: "admin",
            resendConfigured: true,
            webhookSecretConfigured: true,
          },
        }),
      });
    });
    await page.route("**/api/mail/messages", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          messages: [
            {
              id: 9001,
              direction: "inbound",
              status: "received",
              fromAddress: "gamma-peer@example.com",
              toAddresses: ["the-count@mail.wtfgameshow.app"],
              subject: "Gamma mail containment",
              textBody: "This external mail message stays inside the Gamma shell.",
              createdAt: "2026-06-29T12:00:00.000Z",
              receivedAt: "2026-06-29T12:00:00.000Z",
              sentAt: null,
            },
            {
              id: 9002,
              direction: "outbound",
              status: "sent",
              fromAddress: "the-count@mail.wtfgameshow.app",
              toAddresses: ["creator@example.com"],
              subject: "Gamma reply",
              textBody: "Outbound mail uses the same shared send endpoint.",
              createdAt: "2026-06-29T12:02:00.000Z",
              receivedAt: null,
              sentAt: "2026-06-29T12:02:00.000Z",
            },
          ],
        }),
      });
    });
    await page.route("**/api/mail/send", async (route) => {
      sendPayload = route.request().postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, messageId: 9010 }),
      });
    });
    await page.route("**/api/comms/items**", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [] }) });
    });
    await page.route("**/api/notifications?limit=200", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: [], unreadCount: 0 }),
      });
    });
    await page.route("**/api/messages/users?limit=200", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          { id: 2, username: "gamma-peer", displayName: "Gamma Peer", role: "contestant" },
        ]),
      });
    });
    await page.route("**/api/messages/dms", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ id: 77 }) });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 77,
            title: null,
            lastMessageAt: "2026-06-29T12:05:00.000Z",
            unreadCount: 1,
            conversationType: "direct",
            peers: [{ id: 2, userId: 2, username: "gamma-peer", displayName: "Gamma Peer" }],
            latestMessage: {
              id: 9101,
              senderId: 2,
              content: "Queued Gamma WIM.",
              createdAt: "2026-06-29T12:05:00.000Z",
            },
          },
        ]),
      });
    });
    await page.route("**/api/messages/dms/77/read", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await page.route("**/api/messages/dms/77/messages**", async (route) => {
      if (route.request().method() === "POST") {
        dmSendPayload = route.request().postDataJSON();
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ id: 9102 }) });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: 9101,
            senderId: 2,
            username: "gamma-peer",
            displayName: "Gamma Peer",
            content: "Queued Gamma WIM.",
            createdAt: "2026-06-29T12:05:00.000Z",
          },
        ]),
      });
    });

    await gotoGammaRoute(page, "/mail");

    const mailSurface = page.locator('[data-gamma-application-content] [data-mail-surface="inbox"]');
    await expect(mailSurface).toHaveAttribute("data-mail-presentation-host", "gamma");
    await expect(mailSurface.locator('[data-mail-region="mailbox-panel"]')).toContainText("the-count@mail.wtfgameshow.app");
    await expect(mailSurface.locator('[data-mail-region="messages-panel"]')).toContainText("Gamma mail containment");
    await expect(mailSurface.getByRole("button", { name: /New message/ })).toBeVisible();
    await expect(mailSurface.getByRole("button", { name: /New mail/ })).toBeVisible();
    const gammaMailRow = mailSurface
      .locator('[data-mail-region="message-row"]')
      .filter({ hasText: "Gamma mail containment" });
    await mailSurface
      .getByRole("button", { name: /Open User mail message: Gamma mail containment/ })
      .click();
    await expect(mailSurface.locator('[data-mail-region="selected-panel"]')).toContainText("This external mail message stays inside the Gamma shell.");
    await expect(mailSurface.locator('[data-mail-region="selected-panel"]').getByRole("button", { name: /Reply/ })).toBeVisible();
    await expect(mailSurface.locator('[data-mail-region="selected-panel"]').getByRole("button", { name: /Forward/ })).toBeVisible();
    await expect(gammaMailRow).toHaveAttribute("data-mail-active", "false");

    const mailMetrics = await mailSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.matches(selector) ? surface : surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Math.max(
            Number.parseFloat(style.borderTopWidth || "0"),
            Number.parseFloat(style.borderRightWidth || "0"),
            Number.parseFloat(style.borderBottomWidth || "0"),
            Number.parseFloat(style.borderLeftWidth || "0")
          ),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Math.max(
            Number.parseFloat(style.borderTopLeftRadius || "0"),
            Number.parseFloat(style.borderTopRightRadius || "0"),
            Number.parseFloat(style.borderBottomRightRadius || "0"),
            Number.parseFloat(style.borderBottomLeftRadius || "0")
          ),
          textShadow: style.textShadow,
        };
      };
      return {
        surface: read('[data-mail-region="surface"]'),
        navPanel: read('[data-mail-region="nav-panel"]'),
        mailboxPanel: read('[data-mail-region="mailbox-panel"]'),
        workspace: read('[data-mail-region="workspace"]'),
        messagesPanel: read('[data-mail-region="messages-panel"]'),
        messageRow: read('[data-mail-region="message-row"]'),
        selectedPanel: read('[data-mail-region="selected-panel"]'),
        reader: read('[data-mail-region="reader"]'),
      };
    });

    expect(mailMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const [key, region] of Object.entries(mailMetrics)) {
      expect(region, `missing Mail metric: ${key}`).not.toBeNull();
      expect(region.backgroundImage).toBe("none");
      expect(region.boxShadow).toBe("none");
      expect(region.textShadow).toBe("none");
      expect(region.radius).toBeLessThanOrEqual(6);
      expect(region.borderWidth).toBeLessThanOrEqual(1);
    }
    expect(mailMetrics.messageRow?.color).not.toBe("rgb(0, 0, 0)");

    await mailSurface.getByRole("button", { name: /Drafts/ }).click();
    await page.getByLabel("Draft destination type").selectOption("mail");
    const composeMetrics = await mailSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Math.max(
            Number.parseFloat(style.borderTopWidth || "0"),
            Number.parseFloat(style.borderRightWidth || "0"),
            Number.parseFloat(style.borderBottomWidth || "0"),
            Number.parseFloat(style.borderLeftWidth || "0")
          ),
          boxShadow: style.boxShadow,
          radius: Math.max(
            Number.parseFloat(style.borderTopLeftRadius || "0"),
            Number.parseFloat(style.borderTopRightRadius || "0"),
            Number.parseFloat(style.borderBottomRightRadius || "0"),
            Number.parseFloat(style.borderBottomLeftRadius || "0")
          ),
          textShadow: style.textShadow,
        };
      };
      return {
        composePanel: read('[data-mail-region="compose-panel"]'),
        composeBody: read('[data-mail-region="compose-body"]'),
        sendButton: read('[data-mail-region="send-button"]'),
      };
    });
    for (const [key, region] of Object.entries(composeMetrics)) {
      expect(region, `missing Inbox compose metric: ${key}`).not.toBeNull();
      expect(region.backgroundImage).toBe("none");
      expect(region.boxShadow).toBe("none");
      expect(region.textShadow).toBe("none");
      expect(region.radius).toBeLessThanOrEqual(6);
      expect(region.borderWidth).toBeLessThanOrEqual(1);
    }

    await page.getByLabel("Mail recipients").fill("gamma-peer@example.com");
    await page.getByLabel("Message subject").fill("Gamma follow-up");
    await page.getByLabel("Message body").fill("Inbox Mail still sends through the shared endpoint.");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect.poll(() => sendPayload).toMatchObject({
      to: ["gamma-peer@example.com"],
      subject: "Gamma follow-up",
      textBody: "Inbox Mail still sends through the shared endpoint.",
    });

    await mailSurface.getByRole("button", { name: /Conversations/ }).click();
    await expect(mailSurface.locator('[data-mail-region="conversation-compose"]')).toBeVisible();
    await expect(mailSurface).toContainText("Queued Gamma WIM.");
    await mailSurface.getByLabel("WIM conversation reply").fill("Inbox WIM reply sends inline.");
    await mailSurface.getByRole("button", { name: /Send WIM/ }).click();
    await expect.poll(() => dmSendPayload).toMatchObject({
      content: "Inbox WIM reply sends inline.",
    });
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts Swap DEX quote chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-swapper", displayName: "Gamma Swapper" });
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "wtf:wallet-session",
        JSON.stringify({ address: "tz1GammaSwapWallet0000000000000000000", providerName: "octez.connect" })
      );
    });

    const xtz = {
      name: "XTZ",
      symbol: "XTZ",
      decimals: 6,
      img: "https://example.com/xtz.png",
      tag: "KT1PnUZCp3u2KzWr93pn4DD7HAJnm3rWVrgn:0",
      derivedXtz: 1,
      derivedUsd: 0.92,
      totalLiquidityXtz: 1200,
      totalLiquidityUsd: 1104,
    };
    const wtf = {
      name: "WTF is a token?",
      symbol: "WTF",
      decimals: 8,
      img: "https://example.com/wtf.png",
      tag: "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD:0",
      derivedXtz: 0.02,
      derivedUsd: 0.018,
      totalLiquidityXtz: 640,
      totalLiquidityUsd: 588,
    };
    const pool = {
      pairId: "gamma-xtz-wtf",
      fromToken: xtz,
      toToken: wtf,
      reserveFrom: 1000,
      reserveTo: 50000,
      volumeUsd: 3200,
      volumeXtz: 3500,
    };

    await page.route("**/api/dex/tokens", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([xtz, wtf]) });
    });
    await page.route("**/api/dex/pools", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([pool]) });
    });
    await page.route("**/api/dex/counterparts/**", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([wtf]) });
    });
    await page.route("**/api/dex/health", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ spicyswap: true, totalPools: 8, activePools: 1, activeTokens: 2 }),
      });
    });

    await gotoGammaRoute(page, "/swap");

    const swapSurface = page.locator('[data-gamma-application-content] [data-swap-surface="swap"]');
    await expect(swapSurface).toHaveAttribute("data-swap-presentation-host", "gamma");
    await expect(swapSurface.locator('[data-swap-region="health"]')).toContainText("SpicySwap online");
    await expect(swapSurface.locator('[data-swap-region="from-panel"]')).toContainText("XTZ");
    await expect(swapSurface.locator('[data-swap-region="to-panel"]')).toContainText("WTF");

    await page.getByLabel("Swap from amount").fill("2");
    await expect(swapSurface.locator('[data-swap-region="info-panel"]')).toContainText("Min. Received");
    await expect(page.getByLabel("Swap quoted output")).toHaveValue(/99\./);

    await swapSurface.getByRole("button", { name: "2%" }).click();
    await expect(swapSurface.locator('[data-swap-region="slippage-button"][data-swap-active="true"]')).toHaveText("2%");
    await expect(swapSurface.locator('[data-swap-region="submit-button"]')).toContainText("Swap via SpicySwap");
    await expect(swapSurface.locator('[data-swap-region="route-link"]').last()).toHaveAttribute(
      "href",
      /https:\/\/3route\.io\/swap\?from=XTZ&to=WTF&amount=2/
    );

    const swapMetrics = await swapSurface.evaluate((surface) => {
      const read = (selector) => {
        const node = surface.matches(selector) ? surface : surface.querySelector(selector);
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Math.max(
            Number.parseFloat(style.borderTopWidth || "0"),
            Number.parseFloat(style.borderRightWidth || "0"),
            Number.parseFloat(style.borderBottomWidth || "0"),
            Number.parseFloat(style.borderLeftWidth || "0")
          ),
          boxShadow: style.boxShadow,
          color: style.color,
          fontFamily: style.fontFamily,
          radius: Math.max(
            Number.parseFloat(style.borderTopLeftRadius || "0"),
            Number.parseFloat(style.borderTopRightRadius || "0"),
            Number.parseFloat(style.borderBottomRightRadius || "0"),
            Number.parseFloat(style.borderBottomLeftRadius || "0")
          ),
          textShadow: style.textShadow,
        };
      };
      return {
        surface: read('[data-swap-region="surface"]'),
        health: read('[data-swap-region="health"]'),
        fromPanel: read('[data-swap-region="from-panel"]'),
        toPanel: read('[data-swap-region="to-panel"]'),
        directionButton: read('[data-swap-region="direction-button"]'),
        slippagePanel: read('[data-swap-region="slippage-panel"]'),
        infoPanel: read('[data-swap-region="info-panel"]'),
        quoteOutput: read('[data-swap-region="quote-output"]'),
        submitButton: read('[data-swap-region="submit-button"]'),
        routeLink: read('[data-swap-region="route-link"]'),
      };
    });

    expect(swapMetrics.surface?.fontFamily).toMatch(/Inter|sans-serif/i);
    for (const [key, region] of Object.entries(swapMetrics)) {
      expect(region, `missing Swap metric: ${key}`).not.toBeNull();
      expect(region.backgroundImage).toBe("none");
      expect(region.boxShadow).toBe("none");
      expect(region.textShadow).toBe("none");
      expect(region.radius).toBeLessThanOrEqual(6);
      expect(region.borderWidth).toBeLessThanOrEqual(1);
    }
    expect(swapMetrics.submitButton?.color).not.toBe("rgb(0, 0, 0)");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts remaining social native routes in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });

    const crpBundle = {
      id: "gamma-builder",
      tezosAddress: "tz1GammaBuilder000000000000000000000000",
      tezosDomain: "gamma-builder.tez",
      displayName: "Gamma Builder",
      xHandle: "gamma_builder",
      bskyHandle: "gamma-builder.bsky.social",
      sources: ["tzkt", "objkt", "tz2at"],
    };
    const telegramSource = {
      id: 1,
      key: "fart_noises",
      title: "FART NOISES",
      description: "Gamma Telegram source",
      telegramUsername: "fart_noises",
      sourceKind: "bot",
      enabled: true,
      publicVisible: true,
      digestEnabled: true,
    };

    await page.route("**/api/crp-nominations/viewed", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await page.route("**/api/crp-nominations/categories", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          categories: [{ id: "builder-signal", label: "Builder Signal", description: "Gamma CRP proof" }],
        }),
      });
    });
    await page.route("**/api/crp-nominations/resolve", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          query: "gamma-builder",
          kind: "wallet",
          wallets: [
            {
              address: crpBundle.tezosAddress,
              displayName: crpBundle.displayName,
              tezosDomain: crpBundle.tezosDomain,
              sources: ["tzkt"],
            },
          ],
          xHandles: [{ platform: "x", handle: crpBundle.xHandle, sources: ["tz2at"] }],
          bskyHandles: [{ platform: "bsky", handle: crpBundle.bskyHandle, sources: ["tzbsky"] }],
          bundles: [crpBundle],
        }),
      });
    });
    await page.route("**/api/crp-nominations/mine", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          anonymousNominationCredits: 1,
          nominations: [
            {
              uri: "at://did:wtfos:gamma/app.wtfos.liveops.crpNomination/gamma-builder",
              cid: null,
              indexedAt: "2026-06-27T00:00:00.000Z",
              bskyPostUri: "at://did:wtfos:gamma/app.bsky.feed.post/crp",
              bskyPostUrl: "https://bsky.app/profile/gamma/post/crp",
              value: {
                nominationId: "gamma-builder",
                categoryLabel: "Builder Signal",
                campaignMonth: "2026-06",
                nominee: {
                  tezosAddress: crpBundle.tezosAddress,
                  tezosDomain: crpBundle.tezosDomain,
                  displayName: crpBundle.displayName,
                  xHandle: crpBundle.xHandle,
                  bskyHandle: crpBundle.bskyHandle,
                },
                justification: { summary: "Gamma CRP surface proof.", links: [] },
              },
            },
          ],
        }),
      });
    });
    await page.route("**/api/crp-nominations/share**", async (route) => {
      const url = new URL(route.request().url());
      const platform = url.searchParams.get("platform") === "bsky" ? "bsky" : "x";
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          platform,
          text: `Share Gamma Builder on ${platform}`,
          url: platform === "bsky" ? "https://bsky.app/intent/compose?text=Gamma" : "https://x.com/intent/tweet?text=Gamma",
          bskyPostUrl: "https://bsky.app/profile/gamma/post/crp",
          bskyPostUri: "at://did:wtfos:gamma/app.bsky.feed.post/crp",
        }),
      });
    });

    await page.route("**/api/telegram-digest/config", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          botConfigured: true,
          webhookSecretConfigured: true,
          bridgeHmacConfigured: true,
          userClientModeConfigured: true,
          fartNoisesBot: "fart_noises_bot",
        }),
      });
    });
    await page.route("**/api/telegram-digest/sources", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ sources: [telegramSource] }) });
    });
    await page.route("**/api/telegram-digest/messages**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          messages: [
            {
              id: 991,
              sourceId: telegramSource.id,
              messageKind: "fart_noise",
              authorName: "Gamma Relay",
              authorUsername: "gamma_relay",
              text: "Gamma Telegram signal body.",
              summary: "Gamma Telegram signal summary.",
              publicLink: "https://t.me/fart_noises/991",
              messageDate: "2026-06-27T00:00:00.000Z",
              source: telegramSource,
            },
          ],
        }),
      });
    });
    await page.route("**/api/telegram-digest/me/farts", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          tracks: [
            {
              id: 1,
              walletAddress: "tz1GammaFartTrack000000000000000000000",
              label: "Gamma FART wallet",
              status: "tracked",
              fartTokenBalance: "12",
              lastCheckedAt: "2026-06-27T00:00:00.000Z",
            },
          ],
        }),
      });
    });
    await page.route("**/api/telegram-digest/admin/announcements", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          announcements: [
            {
              id: 44,
              title: "Gamma announcement",
              body: "Gamma announcement proof.",
              status: "queued",
              failure: null,
              createdAt: "2026-06-27T00:00:00.000Z",
            },
          ],
        }),
      });
    });

    const readMetrics = async (surface, selectors) =>
      surface.evaluate((root, selectorMap) => {
        const read = (selector) => {
          const node = root.matches(selector) ? root : root.querySelector(selector);
          if (!node) return null;
          const style = window.getComputedStyle(node);
          return {
            backgroundImage: style.backgroundImage,
            borderWidth: Math.max(
              Number.parseFloat(style.borderTopWidth || "0"),
              Number.parseFloat(style.borderRightWidth || "0"),
              Number.parseFloat(style.borderBottomWidth || "0"),
              Number.parseFloat(style.borderLeftWidth || "0")
            ),
            boxShadow: style.boxShadow,
            fontFamily: style.fontFamily,
            letterSpacing: style.letterSpacing,
            radius: Math.max(
              Number.parseFloat(style.borderTopLeftRadius || "0"),
              Number.parseFloat(style.borderTopRightRadius || "0"),
              Number.parseFloat(style.borderBottomRightRadius || "0"),
              Number.parseFloat(style.borderBottomLeftRadius || "0")
            ),
            textShadow: style.textShadow,
          };
        };
        return Object.fromEntries(Object.entries(selectorMap).map(([key, selector]) => [key, read(selector)]));
      }, selectors);

    const expectGammaMetrics = (metrics, label) => {
      for (const [key, region] of Object.entries(metrics)) {
        expect(region, `missing ${label} Gamma metric: ${key}`).not.toBeNull();
        expect(region.backgroundImage).toBe("none");
        expect(region.boxShadow).toBe("none");
        expect(region.textShadow).toBe("none");
        expect(region.radius).toBeLessThanOrEqual(6);
        expect(region.borderWidth).toBeLessThanOrEqual(1);
      }
    };

    await gotoGammaRoute(page, "/dear-diary");
    const diarySurface = page.locator('[data-gamma-application-content] [data-dear-diary-surface="private-diary"]');
    await expect(diarySurface).toHaveAttribute("data-dear-diary-presentation-host", "gamma");
    await expect(diarySurface).toContainText("Harness note to future me");
    await expect(diarySurface.locator('[data-dear-diary-region="body-input"]')).toHaveValue(
      "Remember that the desktop opened cleanly."
    );
    expectGammaMetrics(
      await readMetrics(diarySurface, {
        shell: '[data-dear-diary-region="shell"]',
        sidebar: '[data-dear-diary-region="sidebar"]',
        searchPanel: '[data-dear-diary-region="search-panel"]',
        stats: '[data-dear-diary-region="stats"]',
        entryList: '[data-dear-diary-region="entry-list"]',
        entryButton: '[data-dear-diary-region="entry-button"]',
        editor: '[data-dear-diary-region="editor"]',
        entryPanel: '[data-dear-diary-region="entry-panel"]',
        bodyInput: '[data-dear-diary-region="body-input"]',
        crossRefPanel: '[data-dear-diary-region="cross-ref-panel"]',
        footer: '[data-dear-diary-region="footer"]',
        saveButton: '[data-dear-diary-region="save-button"]',
      }),
      "Dear Diary"
    );
    const diaryType = await diarySurface.evaluate((surface) => {
      const style = window.getComputedStyle(surface);
      return { fontFamily: style.fontFamily, letterSpacing: style.letterSpacing };
    });
    expect(diaryType.fontFamily).toMatch(/Inter|sans-serif/i);
    expect(diaryType.letterSpacing).toBe("normal");

    await gotoGammaRoute(page, "/crp-nominate");
    const crpSurface = page.locator('[data-gamma-application-content] [data-crp-surface="nomination-appview"]');
    await expect(crpSurface).toHaveAttribute("data-crp-presentation-host", "gamma");
    await expect(crpSurface).toContainText("Nominate for Tezos CRP");
    await crpSurface.locator('[data-crp-region="query-input"]').fill("gamma-builder");
    await crpSurface.locator('[data-crp-region="resolve-button"]').click();
    await expect(crpSurface.locator('[data-crp-region="card"]')).toContainText("Gamma Builder");
    await expect(crpSurface.locator('[data-crp-region="mine-panel"]')).toContainText("Builder Signal");
    expectGammaMetrics(
      await readMetrics(crpSurface, {
        surface: '[data-crp-region="surface"]',
        resolvePanel: '[data-crp-region="resolve-panel"]',
        queryInput: '[data-crp-region="query-input"]',
        resolveButton: '[data-crp-region="resolve-button"]',
        resultPanel: '[data-crp-region="result-panel"]',
        card: '[data-crp-region="card"]',
        categoryPanel: '[data-crp-region="category-panel"]',
        summaryInput: '[data-crp-region="summary-input"]',
        submitButton: '[data-crp-region="submit-button"]',
        minePanel: '[data-crp-region="mine-panel"]',
        nominationCard: '[data-crp-region="nomination-card"]',
        shareButton: '[data-crp-region="share-button"]',
      }),
      "CRP"
    );

    await gotoGammaRoute(page, "/i-hate-telegram");
    const telegramSurface = page.locator('[data-gamma-application-content] [data-telegram-surface="digest-shell"]');
    await expect(telegramSurface).toHaveAttribute("data-telegram-presentation-host", "gamma");
    await expect(telegramSurface).toContainText("Gamma Telegram signal summary.");
    await expect(telegramSurface).toContainText("Gamma FART wallet");
    await expect(telegramSurface).toContainText("Gamma announcement");
    expectGammaMetrics(
      await readMetrics(telegramSurface, {
        shell: '[data-telegram-region="shell"]',
        header: '[data-telegram-region="header"]',
        statusStrip: '[data-telegram-region="status-strip"]',
        layout: '[data-telegram-region="layout"]',
        section: '[data-telegram-region="section"]',
        sourceRail: '[data-telegram-region="source-rail"]',
        kindToolbar: '[data-telegram-region="kind-toolbar"]',
        messageList: '[data-telegram-region="message-list"]',
        messageRow: '[data-telegram-region="message-row"]',
        trackForm: '[data-telegram-region="track-form"]',
        sourceForm: '[data-telegram-region="source-form"]',
        announcementForm: '[data-telegram-region="announcement-form"]',
      }),
      "I Hate Telegram"
    );
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
  });

  test("hosts Dicksword custom Discord chrome in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin", username: "the-count", displayName: "The Count" });

    await page.route("**/api/dicksword/config", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          guildId: "gamma-discord",
          inviteUrl: "https://discord.gg/wtfos",
          oauthConfigured: true,
          claimTtlMs: 600000,
          avatarAssetBasePath: "/dicksword/avatar-assets",
          commands: ["/wtf prove", "/wtf profile", "/wtf roles"],
        }),
      });
    });
    await page.route("**/api/dicksword/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: 1,
            username: "the-count",
            displayName: "The Count",
            role: "admin",
            discordId: "1234567890",
            discordHandle: "the-count#0001",
            discordVerified: true,
            experiencePoints: 660,
            xpTier: { label: "Admin", key: "admin", nextTierMinXp: null },
          },
          activeClaim: null,
          activity: [
            {
              id: 1,
              kind: "voice",
              action: "joined",
              xpAmount: 25,
              xpAwardedAt: "2026-06-27T00:00:00.000Z",
              discordHandle: "the-count#0001",
              observedAt: "2026-06-27T00:00:00.000Z",
              externalRef: "gamma-dicksword-1",
            },
          ],
          avatar: {
            layers: [
              {
                id: 1,
                key: "base",
                label: "Gamma base",
                layerType: "base",
                stackOrder: 0,
                assetUrl: "/__test/media/harness-alpha-token.png",
                enabled: true,
              },
              {
                id: 2,
                key: "cyan-cape",
                label: "Cyan cape",
                layerType: "accessory",
                stackOrder: 10,
                assetUrl: "/__test/media/harness-alpha-token.png",
                enabled: true,
              },
            ],
            conflicts: [],
            selections: [{ layerId: 1 }, { layerId: 2 }],
          },
          roleMappings: [
            {
              id: 1,
              key: "admin",
              label: "Admin",
              roleId: "role-admin",
              roleKind: "staff",
              protected: true,
              managed: false,
            },
          ],
        }),
      });
    });

    await page.goto("/gamma/dicksword", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/dicksword");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const dickswordSurface = page.locator('[data-gamma-application-content] [data-dicksword-surface="true"]');
    await expect(dickswordSurface).toHaveAttribute("data-dicksword-presentation-host", "gamma");
    await expect(dickswordSurface).toContainText("the-count#0001");
    await expect(dickswordSurface).toContainText("/wtf prove");

    const dickswordMetrics = await dickswordSurface.evaluate((surface) => {
      const header = surface.querySelector('[data-dicksword-region="header"]');
      const status = surface.querySelector('[data-dicksword-region="status"]');
      const avatarStage = surface.querySelector('[data-dicksword-region="avatar-stage"]');
      const title = surface.querySelector("h1");
      const read = (node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          fontFamily: style.fontFamily,
          letterSpacing: style.letterSpacing,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        };
      };
      return {
        header: header ? read(header) : null,
        status: status ? read(status) : null,
        avatarStage: avatarStage ? read(avatarStage) : null,
        title: title ? read(title) : null,
      };
    });
    expect(dickswordMetrics.header?.backgroundImage).toBe("none");
    expect(dickswordMetrics.header?.boxShadow).toBe("none");
    expect(dickswordMetrics.header?.radius).toBeLessThanOrEqual(6);
    expect(dickswordMetrics.status?.borderWidth).toBeLessThanOrEqual(1);
    expect(dickswordMetrics.status?.radius).toBeLessThanOrEqual(6);
    expect(dickswordMetrics.avatarStage?.backgroundImage).toBe("none");
    expect(dickswordMetrics.avatarStage?.borderWidth).toBeLessThanOrEqual(1);
    expect(dickswordMetrics.avatarStage?.radius).toBeLessThanOrEqual(6);
    expect(dickswordMetrics.title?.fontFamily).toMatch(/Inter|sans-serif/i);
    expect(dickswordMetrics.title?.letterSpacing).toBe("normal");
  });

  test("hosts Digest and W alias routes in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-reader", displayName: "Gamma Reader" });

    await page.route("**/api/comms/sources", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          sources: [{ key: "w", label: "W digest" }],
        }),
      });
    });
    await page.route("**/api/comms/items**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: 770,
              sourceKey: "w",
              sourceLabel: "W digest",
              sourceKind: "social",
              itemKind: "post",
              title: "Gamma digest alias proof",
              summary: "A normalized digest card that routes to W without leaving Gamma.",
              body: null,
              authorLabel: "@wtfos",
              routePath: "/w/post/e2e-post",
              originUrl: "https://x.com/wtfos/status/1800000000000000000",
              occurredAt: "2026-06-27T00:00:00.000Z",
              read: false,
            },
          ],
        }),
      });
    });
    await page.route("**/api/w/timeline", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          source: "w-digest-scraper",
          refreshedAt: "2026-06-27T00:00:00.000Z",
          canReplyInline: false,
          accounts: [
            {
              userId: 1,
              username: "gamma-reader",
              displayName: "Gamma Reader",
              twitterHandle: "wtfos",
              profileUrl: "https://x.com/wtfos",
            },
          ],
          timeline: [
            {
              id: "1800000000000000000",
              text: "Gamma digest containment proof.",
              displayText: "Gamma digest containment proof.",
              createdAt: "2026-06-27T00:00:00.000Z",
              url: "https://x.com/wtfos/status/1800000000000000000",
              media: [],
              links: [],
              author: {
                userId: 1,
                username: "gamma-reader",
                displayName: "Gamma Reader",
                twitterHandle: "wtfos",
                name: "wtfOS",
                avatarUrl: null,
              },
              metrics: { likes: 7, replies: 1, reposts: 2, quotes: 0 },
            },
          ],
          diagnostics: { cachedAt: "2026-06-27T00:00:00.000Z" },
        }),
      });
    });
    await page.route("**/api/w/capabilities", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          mode: "digest",
          connected: false,
          canUseAdminControls: false,
          oauth2Configured: false,
          platformAccountConfigured: false,
          groupchatConfigured: false,
          scopes: [],
          defaultAccountHandle: "",
          tiers: [],
          capabilities: [],
        }),
      });
    });

    const readMetrics = async (surface, selectors) =>
      surface.evaluate((root, selectorMap) => {
        const read = (selector) => {
          const node = root.matches(selector) ? root : root.querySelector(selector);
          if (!node) return null;
          const style = window.getComputedStyle(node);
          return {
            backgroundImage: style.backgroundImage,
            borderWidth: Math.max(
              Number.parseFloat(style.borderTopWidth || "0"),
              Number.parseFloat(style.borderRightWidth || "0"),
              Number.parseFloat(style.borderBottomWidth || "0"),
              Number.parseFloat(style.borderLeftWidth || "0")
            ),
            boxShadow: style.boxShadow,
            fontFamily: style.fontFamily,
            letterSpacing: style.letterSpacing,
            radius: Math.max(
              Number.parseFloat(style.borderTopLeftRadius || "0"),
              Number.parseFloat(style.borderTopRightRadius || "0"),
              Number.parseFloat(style.borderBottomRightRadius || "0"),
              Number.parseFloat(style.borderBottomLeftRadius || "0")
            ),
            textShadow: style.textShadow,
          };
        };
        return Object.fromEntries(Object.entries(selectorMap).map(([key, selector]) => [key, read(selector)]));
      }, selectors);

    const expectGammaMetrics = (metrics, label) => {
      for (const [key, region] of Object.entries(metrics)) {
        expect(region, `missing ${label} Gamma metric: ${key}`).not.toBeNull();
        expect(region.backgroundImage).toBe("none");
        expect(region.boxShadow).toBe("none");
        expect(region.textShadow).toBe("none");
        expect(region.radius).toBeLessThanOrEqual(6);
        expect(region.borderWidth).toBeLessThanOrEqual(1);
      }
    };

    await gotoGammaRoute(page, "/digest");
    const digestSurface = page.locator('[data-gamma-application-content] [data-digest-surface="comms-digest"]');
    await expect(digestSurface).toHaveAttribute("data-digest-presentation-host", "gamma");
    await expect(digestSurface).toContainText("W digest");
    await expect(digestSurface).toContainText("Gamma digest alias proof");
    await expect(digestSurface).toContainText("@wtfos");
    expectGammaMetrics(
      await readMetrics(digestSurface, {
        shell: '[data-digest-region="shell"]',
        sourcePanel: '[data-digest-region="source-panel"]',
        toolbar: '[data-digest-region="toolbar"]',
        sourceSelect: '[data-digest-region="source-select"]',
        feed: '[data-digest-region="feed"]',
        card: '[data-digest-region="card"]',
        title: '[data-digest-region="title"]',
        preview: '[data-digest-region="preview"]',
        cardActions: '[data-digest-region="card-actions"]',
        openButton: '[data-digest-region="open-button"]',
        sourceButton: '[data-digest-region="source-button"]',
      }),
      "Digest"
    );
    const digestType = await digestSurface.locator('[data-digest-region="title"]').evaluate((node) => {
      const style = window.getComputedStyle(node);
      return { fontFamily: style.fontFamily, letterSpacing: style.letterSpacing };
    });
    expect(digestType.fontFamily).toMatch(/Inter|sans-serif/i);
    expect(digestType.letterSpacing).toBe("normal");

    await digestSurface.locator('[data-digest-region="source-button"]').click();
    await expect(page).toHaveURL(/\/gamma\/browser\?url=/);
    await expectGammaRouteReady(page, "/browser");

    await gotoGammaRoute(page, "/digest");
    await page.locator('[data-gamma-application-content] [data-digest-region="open-button"]').click();
    await expect(page).toHaveURL(/\/gamma\/w\/post\/e2e-post$/);
    await expectGammaRouteReady(page, "/w/post/e2e-post");

    const wSurface = page.locator('[data-gamma-application-content] [data-w-surface="w-shell"]');
    await expect(wSurface).toHaveAttribute("data-w-presentation-host", "gamma");
    await expect(wSurface).toContainText("W Tezos digest");
    await expect(wSurface).toContainText("@wtfos");
    expectGammaMetrics(
      await readMetrics(wSurface, {
        shell: '[data-w-surface="w-shell"]',
        header: '[data-w-region="header"]',
        nav: '[data-w-region="view-nav"]',
        main: '[data-w-region="main-surface"]',
        postCard: '[data-w-region="post-card"]',
        embedFrame: '[data-w-region="embed-frame"]',
        title: '[data-w-region="title"]',
      }),
      "W alias"
    );

    for (const aliasRoute of ["/w/chat", "/w/groupchat/1", "/chat", "/chat/1"]) {
      await gotoGammaRoute(page, aliasRoute);
      const aliasSurface = page.locator('[data-gamma-application-content] [data-w-surface="w-shell"]');
      await expect(aliasSurface).toHaveAttribute("data-w-presentation-host", "gamma");
      await expect(aliasSurface).toContainText("W Tezos digest");
      await expect(aliasSurface).toContainText("@wtfos");
      await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
    }
  });

  test("hosts W digest shell and timeline cards in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-reader", displayName: "Gamma Reader" });

    await page.route("**/api/w/timeline", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          source: "w-digest-scraper",
          refreshedAt: "2026-06-27T00:00:00.000Z",
          canReplyInline: false,
          accounts: [
            {
              userId: 1,
              username: "gamma-reader",
              displayName: "Gamma Reader",
              twitterHandle: "wtfos",
              profileUrl: "https://x.com/wtfos",
            },
          ],
          timeline: [
            {
              id: "1800000000000000000",
              text: "Gamma digest containment proof.",
              displayText: "Gamma digest containment proof.",
              createdAt: "2026-06-27T00:00:00.000Z",
              url: "https://x.com/wtfos/status/1800000000000000000",
              media: [],
              links: [],
              author: {
                userId: 1,
                username: "gamma-reader",
                displayName: "Gamma Reader",
                twitterHandle: "wtfos",
                name: "wtfOS",
                avatarUrl: null,
              },
              metrics: { likes: 7, replies: 1, reposts: 2, quotes: 0 },
            },
          ],
          diagnostics: { cachedAt: "2026-06-27T00:00:00.000Z" },
        }),
      });
    });
    await page.route("**/api/w/capabilities", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          mode: "digest",
          connected: false,
          canUseAdminControls: false,
          oauth2Configured: false,
          platformAccountConfigured: false,
          groupchatConfigured: false,
          scopes: [],
          defaultAccountHandle: "",
          tiers: [],
          capabilities: [],
        }),
      });
    });

    await page.goto("/gamma/w", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-gamma-wtfos]")).toBeVisible();
    await expect(page.locator("[data-gamma-workspace]")).toHaveAttribute("data-gamma-route", "/w");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);

    const wSurface = page.locator('[data-gamma-application-content] [data-w-surface="w-shell"]');
    await expect(wSurface).toHaveAttribute("data-w-presentation-host", "gamma");
    await expect(wSurface).toContainText("W Tezos digest");
    await expect(wSurface).toContainText("@wtfos");

    const wMetrics = await wSurface.evaluate((surface) => {
      const shell = surface;
      const header = surface.querySelector('[data-w-region="header"]');
      const nav = surface.querySelector('[data-w-region="view-nav"]');
      const main = surface.querySelector('[data-w-region="main-surface"]');
      const postCard = surface.querySelector('[data-w-region="post-card"]');
      const embedFrame = surface.querySelector('[data-w-region="embed-frame"]');
      const title = surface.querySelector('[data-w-region="title"]');
      const read = (node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          fontFamily: style.fontFamily,
          letterSpacing: style.letterSpacing,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        };
      };
      return {
        shell: read(shell),
        header: header ? read(header) : null,
        nav: nav ? read(nav) : null,
        main: main ? read(main) : null,
        postCard: postCard ? read(postCard) : null,
        embedFrame: embedFrame ? read(embedFrame) : null,
        title: title ? read(title) : null,
      };
    });
    expect(wMetrics.shell.backgroundImage).toBe("none");
    expect(wMetrics.shell.borderWidth).toBeLessThanOrEqual(1);
    expect(wMetrics.shell.radius).toBeLessThanOrEqual(6);
    expect(wMetrics.nav?.backgroundImage).toBe("none");
    expect(wMetrics.nav?.radius).toBeLessThanOrEqual(6);
    expect(wMetrics.main?.backgroundImage).toBe("none");
    expect(wMetrics.main?.boxShadow).toBe("none");
    expect(wMetrics.main?.radius).toBeLessThanOrEqual(6);
    expect(wMetrics.postCard?.backgroundImage).toBe("none");
    expect(wMetrics.postCard?.boxShadow).toBe("none");
    expect(wMetrics.postCard?.radius).toBeLessThanOrEqual(6);
    expect(wMetrics.embedFrame?.borderWidth).toBeLessThanOrEqual(1);
    expect(wMetrics.embedFrame?.radius).toBeLessThanOrEqual(6);
    expect(wMetrics.title?.fontFamily).toMatch(/Inter|sans-serif/i);
    expect(wMetrics.title?.letterSpacing).toBe("normal");
  });

  test("hosts WTF TV playback cabinet and menus in the Gamma presentation style", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "user", username: "gamma-viewer", displayName: "Gamma Viewer" });

    const channel = {
      id: 3,
      ownerUserId: 1,
      slug: "wtf-tv",
      title: "WTF TV",
      description: "Gamma TV containment channel",
      isPublic: true,
      ownerUsername: "gamma-viewer",
      ownerDisplayName: "Gamma Viewer",
      dialNumber: 3,
      videosPerBumper: 0,
    };
    const currentItem = {
      queueIndex: 0,
      playlistIndex: 0,
      itemId: 30,
      videoId: 300,
      title: "Gamma Broadcast",
      mimeType: "text/html",
      thumbnailUri: null,
      sourceUri: "/__test/tv/embed",
      cacheUrl: "/__test/tv/embed",
      durationSeconds: 30,
      assetDurationSeconds: 30,
      offsetSeconds: 0,
      kind: "embed",
      creatorName: "Gamma Studio",
      creatorAddress: "tz1gamma0000000000000000000000000000000",
      collectionName: "Gamma Signals",
      mintedAtIso: "2026-06-27T00:00:00.000Z",
      objktUrl: "https://objkt.com/tokens/KT1Gamma/300",
      addedByUsername: "gamma-viewer",
    };

    await page.route("**/api/tv/channels?mine=1", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([channel]) });
    });
    await page.route("**/api/tv/channels", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([channel]) });
    });
    await page.route("**/api/tv/channels/3/stream", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          channel,
          playlist: { id: 30, name: "Gamma loop", transitionSeconds: 0 },
          scheduleLabel: "LIVE",
          generatedAt: "2026-06-27T00:00:00.000Z",
          loopDurationSeconds: 30,
          queue: [currentItem],
          current: currentItem,
          offline: false,
          message: null,
        }),
      });
    });
    await page.route("**/api/tv/bumpers/pool**", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route("**/api/tv/playback/events", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await page.route("**/api/tv/telemetry/item-end", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await page.route("**/__test/tv/embed", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body style='margin:0;background:#070706;color:#f2ead9;font:16px sans-serif'>Gamma Broadcast</body></html>",
      });
    });

    await gotoGammaRoute(page, "/tv");

    const tvSurface = page.locator('[data-gamma-application-content] [data-tv-surface="tv-shell"]');
    await expect(tvSurface).toHaveAttribute("data-tv-presentation-host", "gamma");

    await page.getByRole("button", { name: "Turn TV power on" }).click();
    await expect(tvSurface.locator('[data-tv-region="osd"]')).toContainText("CH 03");
    const mtvOverlay = tvSurface.locator('[data-tv-region="mtv-overlay"]');
    await expect(mtvOverlay).toBeVisible();
    await expect(mtvOverlay).toContainText("Gamma Broadcast");
    await expect(mtvOverlay).toHaveAttribute("href", "https://objkt.com/tokens/KT1Gamma/300");

    const tvMetrics = await tvSurface.evaluate((surface) => {
      const cabinet = surface.querySelector('[data-tv-region="cabinet"]');
      const bezel = surface.querySelector('[data-tv-region="screen-bezel"]');
      const screen = surface.querySelector('[data-tv-region="crt-screen"]');
      const controls = surface.querySelector('[data-tv-region="control-panel"]');
      const osd = surface.querySelector('[data-tv-region="osd"]');
      const overlay = surface.querySelector('[data-tv-region="mtv-overlay"]');
      const brand = surface.querySelector('[data-tv-region="brand-strip"]');
      const read = (node) => {
        const style = window.getComputedStyle(node);
        return {
          animationName: style.animationName,
          backgroundImage: style.backgroundImage,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
          boxShadow: style.boxShadow,
          fontFamily: style.fontFamily,
          radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
          textShadow: style.textShadow,
        };
      };
      return {
        cabinet: cabinet ? read(cabinet) : null,
        bezel: bezel ? read(bezel) : null,
        screen: screen ? read(screen) : null,
        controls: controls ? read(controls) : null,
        osd: osd ? read(osd) : null,
        overlay: overlay ? read(overlay) : null,
        brand: brand ? read(brand) : null,
      };
    });
    for (const region of [tvMetrics.cabinet, tvMetrics.bezel, tvMetrics.screen, tvMetrics.controls, tvMetrics.osd, tvMetrics.overlay]) {
      expect(region?.backgroundImage).toBe("none");
      expect(region?.boxShadow).toBe("none");
      expect(region?.radius).toBeLessThanOrEqual(6);
    }
    expect(tvMetrics.cabinet?.borderWidth).toBeLessThanOrEqual(1);
    expect(tvMetrics.bezel?.borderWidth).toBeLessThanOrEqual(1);
    expect(tvMetrics.screen?.borderWidth).toBeLessThanOrEqual(1);
    expect(tvMetrics.controls?.borderWidth).toBeLessThanOrEqual(1);
    expect(tvMetrics.osd?.textShadow).toBe("none");
    expect(tvMetrics.overlay?.textShadow).toBe("none");
    expect(tvMetrics.brand?.fontFamily).toMatch(/Inter|sans-serif|monospace/i);

    await page.getByRole("button", { name: "Open TV menu" }).click();
    const menuOverlay = tvSurface.locator('[data-tv-region="menu-overlay"]');
    await expect(menuOverlay).toBeVisible();
    await expect(menuOverlay).toContainText("WTF TV");
    const menuMetrics = await menuOverlay.evaluate((menu) => {
      const button = menu.querySelector("button");
      const menuStyle = window.getComputedStyle(menu);
      const buttonStyle = button ? window.getComputedStyle(button) : null;
      return {
        backgroundImage: menuStyle.backgroundImage,
        boxShadow: menuStyle.boxShadow,
        radius: Number.parseFloat(menuStyle.borderTopLeftRadius || "0"),
        animationName: menuStyle.animationName,
        buttonBackgroundImage: buttonStyle?.backgroundImage || "",
        buttonBoxShadow: buttonStyle?.boxShadow || "",
        buttonRadius: Number.parseFloat(buttonStyle?.borderTopLeftRadius || "0"),
      };
    });
    expect(menuMetrics.backgroundImage).toBe("none");
    expect(menuMetrics.boxShadow).toBe("none");
    expect(menuMetrics.radius).toBeLessThanOrEqual(6);
    expect(menuMetrics.animationName).toBe("none");
    expect(menuMetrics.buttonBackgroundImage).toBe("none");
    expect(menuMetrics.buttonBoxShadow).toBe("none");
    expect(menuMetrics.buttonRadius).toBeLessThanOrEqual(6);
  });

  test("keeps the first mobile viewport usable and app-forward", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "anonymous" });
    await page.setViewportSize({ width: 390, height: 760 });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });

    await expect(page.locator("[data-gamma-boot-desk]")).toBeInViewport();
    await expect(page.locator("[data-gamma-session-panel]")).toBeInViewport();
    await expect(page.locator("[data-gamma-boot-account]")).toBeInViewport();
    await expect(page.locator("[data-gamma-boot-search]")).toBeInViewport();
    await expect(page.locator("[data-gamma-session-checklist]")).toBeInViewport();
    await expect(page.locator("[data-gamma-start-menu]")).toBeInViewport();
    await expect(page.locator('[data-gamma-start-action="continue"]')).toBeInViewport();
    await expect(page.locator('[data-gamma-start-action="gallery"]')).toBeInViewport();
    await expect(page.locator('[data-gamma-launch="/wtfiam?category=apps"]').first()).toBeInViewport();
    await expect(page.locator("[data-gamma-session-console]")).toBeVisible();
    await expect(page.locator("[data-gamma-session-mount]")).toBeVisible();
    await expect(page.locator("[data-gamma-session-mount-row]")).toHaveCount(4);
    await expect(page.locator("[data-gamma-wake-queue]")).toBeVisible();
    await expect(page.locator("[data-gamma-wake-action]")).toHaveCount(5);
    await expect(page.locator("[data-gamma-power-menu]")).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2
    );
    expect(hasHorizontalOverflow).toBe(false);

    const primaryTargetHeights = await page.locator("[data-gamma-start-menu] button").evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height)
    );
    expect(primaryTargetHeights.every((height) => height >= 44)).toBe(true);
    const checklistTargetHeights = await page.locator("[data-gamma-session-checklist] button").evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height)
    );
    expect(checklistTargetHeights.every((height) => height >= 44)).toBe(true);
    const bootAccountHeight = await page.locator("[data-gamma-boot-account]").evaluate((button) =>
      button.getBoundingClientRect().height
    );
    expect(bootAccountHeight).toBeGreaterThanOrEqual(44);
    const sessionConsoleHeights = await page.locator("[data-gamma-session-console] button").evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height)
    );
    expect(sessionConsoleHeights.every((height) => height >= 44)).toBe(true);
    const sessionMountHeights = await page.locator("[data-gamma-session-mount] button").evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height)
    );
    expect(sessionMountHeights.every((height) => height >= 44)).toBe(true);
    const wakeQueueHeights = await page.locator("[data-gamma-wake-queue] button").evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height)
    );
    expect(wakeQueueHeights.every((height) => height >= 44)).toBe(true);
    const powerTargetHeights = await page.locator("[data-gamma-power-menu] button").evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height)
    );
    expect(powerTargetHeights.every((height) => height >= 44)).toBe(true);
    const dailyTargetHeights = await page.locator("[data-gamma-daily-return] button").evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height)
    );
    expect(dailyTargetHeights.every((height) => height >= 44)).toBe(true);
  });

  test("explains EXP, app unlocks, and Count admin review through route-backed passport actions", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin" });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });

    const passport = page.locator("[data-gamma-access-passport]");
    await expect(passport).toBeVisible();
    await expect(page.locator("[data-gamma-passport-role]")).toContainText("Admin");
    await expect(page.locator("[data-gamma-passport-exp]")).toContainText("EXP");
    await expect(page.locator("[data-gamma-passport-app-count]")).toContainText("app-store tools open");
    await expect(page.locator("[data-gamma-boot-account]")).not.toHaveAttribute("data-gamma-launch", /\/login/);
    await expect(page.locator('[data-gamma-session-check="daily"]')).toHaveAttribute("data-gamma-launch", "/side-quests");
    await expect(page.locator('[data-gamma-passport-action="sidequests"]')).toHaveAttribute("data-gamma-launch", "/side-quests");
    await expect(page.locator('[data-gamma-passport-action="challenges"]')).toHaveAttribute("data-gamma-launch", "/challenges");
    await expect(page.locator('[data-gamma-passport-action="apps"]')).toHaveAttribute("data-gamma-launch", "/wtfiam?category=apps");
    await expect(page.locator('[data-gamma-passport-action="levels"]')).toHaveAttribute("data-gamma-launch", "/leaderboard");
    await expect(page.locator("[data-gamma-passport-app]")).toHaveCount(3);
    await expect(page.locator("[data-gamma-passport-role-gate]")).toHaveCount(3);

    const countLane = page.locator("[data-gamma-count-admin-lane]");
    await expect(countLane).toBeVisible();
    await expect(countLane).toContainText("The Count");
    await expect(page.locator('[data-gamma-count-action="users"]')).toHaveAttribute("data-gamma-launch", "/admin");
    await expect(page.locator('[data-gamma-count-action="loops"]')).toHaveAttribute("data-gamma-launch", "/challenges");
    await expect(page.locator('[data-gamma-count-action="market"]')).toHaveAttribute("data-gamma-launch", "/wtfiam");
  });
});
