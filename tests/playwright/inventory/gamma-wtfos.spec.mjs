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
    expect([...colors].sort()).toEqual(["#00d2ff", "#050712", "#10162f", "#2c7df7", "#f4f8ff"]);
    expect(source.match(/linear-gradient\(/g) || []).toHaveLength(1);
    expect(source).not.toMatch(/\bWhat do you do first\b/i);
    expect(source).not.toMatch(/\bwhat to do next\b/i);
    expect(source).not.toMatch(/\bcomplete something now\b/i);
    expect(source).not.toMatch(/\bborder(?:\s*:|-)/i);
  });

  test("renders an inhabited app arcade with communication in the floor plan", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "anonymous" });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });

    const shell = page.locator("[data-gamma-wtfos]");
    await expect(shell).toBeVisible();
    await expect(shell).toHaveAttribute("data-color-budget", "5");
    await expect(shell).toHaveAttribute("data-gradient-budget", "1");
    await expect(shell).toHaveAttribute("data-gradient-stops", "2");
    await expect(shell).toHaveAttribute("data-hard-lines", "0");
    await expect(shell).toContainText("Make art. Publish it.");
    await expect(shell).toContainText("Tezos arcade operating floor");
    await expect(shell).not.toContainText("First-Minute Wayfinder");
    await expect(shell).not.toContainText("DISCOVERY_REPORT");

    await expect(page.locator("[data-gamma-peer]")).toHaveCount(5);
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

    const hardLineCount = await page.locator("[data-gamma-wtfos] *").evaluateAll((nodes) =>
      nodes.filter((node) => {
        const style = window.getComputedStyle(node);
        return [
          style.borderTopWidth,
          style.borderRightWidth,
          style.borderBottomWidth,
          style.borderLeftWidth,
        ].some((value) => Number.parseFloat(value || "0") > 0);
      }).length
    );
    expect(hardLineCount).toBe(0);
  });

  test("keeps the first mobile viewport usable and app-forward", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "anonymous" });
    await page.setViewportSize({ width: 390, height: 760 });
    await page.goto("/gamma", { waitUntil: "domcontentloaded" });

    await expect(page.locator("[data-gamma-primary-actions]")).toBeInViewport();
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
