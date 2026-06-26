import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

async function setHarnessState(request, state = {}) {
  const res = await request.post("/__test/state", { data: state });
  expect(res.ok()).toBeTruthy();
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

  test("keeps the first mobile viewport usable and app-forward", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "anonymous" });
    await page.setViewportSize({ width: 390, height: 760 });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });

    await expect(page.locator("[data-gamma-primary-actions]")).toBeInViewport();
    await expect(page.locator("[data-gamma-live-summary]")).toBeInViewport();
    await expect(page.locator('[data-gamma-launch="/gallery"]').first()).toBeInViewport();
    await expect(page.locator('[data-gamma-launch="/tools/broot"]').first()).toBeInViewport();
    await expect(page.locator('[data-gamma-comms-action]').first()).toBeInViewport();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2
    );
    expect(hasHorizontalOverflow).toBe(false);

    const primaryTargetHeights = await page.locator("[data-gamma-primary-actions] button").evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height)
    );
    expect(primaryTargetHeights.every((height) => height >= 44)).toBe(true);
  });
});
