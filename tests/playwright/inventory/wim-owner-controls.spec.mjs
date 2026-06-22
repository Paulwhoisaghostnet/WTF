import { test, expect } from "@playwright/test";

async function setRole(request, data) {
  const payload = typeof data === "string" ? { userRole: data } : data;
  const res = await request.post("/__test/state", { data: payload });
  expect(res.ok()).toBeTruthy();
}

function capturePageErrors(page, errors, label) {
  page.on("pageerror", (error) => errors.push(`${label} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label} console: ${message.text()}`);
  });
}

function fatalErrors(errors) {
  return errors.filter((error) => !/(favicon|ResizeObserver|WebGL|wallet|beacon|taquito|status of 401 \(Unauthorized\))/i.test(error));
}

async function expectInsideViewport(locator, page, label) {
  const box = await locator.boundingBox();
  expect(box, `${label} has layout box`).toBeTruthy();
  const viewport = page.viewportSize();
  expect(viewport, `${label} has viewport`).toBeTruthy();
  expect(box.x, `${label} left edge`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${label} top edge`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${label} right edge`).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height, `${label} bottom edge`).toBeLessThanOrEqual(viewport.height + 1);
}

async function wimMobileMetrics(page) {
  return page.evaluate(() => {
    const selectors = [
      '[data-wim-desktop-surface="true"] button:not([disabled])',
      '[data-wim-desktop-surface="true"] [role="button"]',
      '[data-wim-desktop-surface="true"] [role="tab"]',
      '[data-wim-desktop-surface="true"] [role="separator"]',
      '[data-wim-desktop-surface="true"] select:not([disabled])',
      '[data-wim-desktop-surface="true"] input:not([disabled])',
      '[data-wim-desktop-surface="true"] textarea:not([disabled])',
      '[data-wim-desktop-surface="true"] a[href]',
    ].join(",");
    const seen = new Set();
    const targets = Array.from(document.querySelectorAll(selectors))
      .filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (seen.has(node)) return false;
        seen.add(node);
        const rect = node.getBoundingClientRect();
        const styles = window.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && styles.visibility !== "hidden" && styles.display !== "none";
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          label:
            node.getAttribute("aria-label") ||
            node.getAttribute("title") ||
            node.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ||
            node.tagName.toLowerCase(),
          role: node.getAttribute("role") || node.tagName.toLowerCase(),
          width: rect.width,
          height: rect.height,
          left: rect.left,
          right: rect.right,
        };
      });
    return {
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      surfaceScrollWidth:
        document.querySelector('[data-wim-desktop-surface="true"]')?.scrollWidth ?? 0,
      targets,
    };
  });
}

test.describe("interaction inventory — WIM desktop widgets", () => {
  test("buddy widget and first conversation render unclipped with accessible controls", async ({
    page,
    request,
  }) => {
    await setRole(request, { userRole: "admin" });
    await page.setViewportSize({ width: 960, height: 640 });
    const errors = [];
    capturePageErrors(page, errors, "wim-desktop");

    await page.goto("/wim", { waitUntil: "domcontentloaded" });

    const surface = page.locator('[data-wim-desktop-surface="true"]');
    const buddyWindow = page.locator('[data-wim-window-kind="buddy"]');
    await expect(surface).toBeVisible();
    await expect(buddyWindow).toBeVisible();
    await expect(page.locator('[data-wim-window-kind="chat"]')).toHaveCount(0);
    await expectInsideViewport(buddyWindow, page, "buddy window");

    await expect(page.getByRole("button", { name: "Open WIM settings" })).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Open WIM settings" }).click();
    await expect(page.getByRole("dialog", { name: "WIM settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open WIM settings" })).toHaveAttribute("aria-expanded", "true");
    const settingsDialog = page.getByRole("dialog", { name: "WIM settings" });
    await page.getByLabel("New WIM list name").fill("Inventory Probe");
    await page.getByRole("button", { name: "Create WIM list" }).click();
    await expect(settingsDialog.getByText("Inventory Probe", { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(settingsDialog).toHaveCount(0);

    await buddyWindow.locator('[data-wim-chat-open="2"]').first().click();
    const chatWindow = page.locator('[data-wim-window-kind="chat"]');
    await expect(chatWindow).toBeVisible();
    await expect(chatWindow.getByRole("tab", { name: /Open WIM tab WIM Online/ })).toBeVisible();
    await expect(chatWindow.getByRole("button", { name: /Close WIM tab WIM Online/ })).toBeVisible();
    await expect(chatWindow.locator('[data-wim-toolbar-row="format"]')).toBeVisible();
    await expect(chatWindow.locator('[data-wim-toolbar-row="insert"]')).toBeVisible();
    await expect(chatWindow.getByRole("textbox", { name: "WIM message text" })).toBeVisible();
    await expectInsideViewport(chatWindow, page, "first chat window");

    await chatWindow.getByRole("button", { name: /Close WIM tab WIM Online/ }).click();
    await expect(page.locator('[data-wim-window-kind="chat"]')).toHaveCount(0);
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("minimum mobile-ish viewport keeps first chat geometry inside the desktop surface", async ({
    page,
    request,
  }) => {
    await setRole(request, { userRole: "admin" });
    await page.setViewportSize({ width: 390, height: 700 });
    const errors = [];
    capturePageErrors(page, errors, "wim-narrow");

    await page.goto("/wim", { waitUntil: "domcontentloaded" });
    const buddyWindow = page.locator('[data-wim-window-kind="buddy"]');
    await expect(buddyWindow).toBeVisible();
    await expectInsideViewport(buddyWindow, page, "narrow buddy window");

    await buddyWindow.locator('[data-wim-chat-open="2"]').first().click();
    const chatWindow = page.locator('[data-wim-window-kind="chat"]');
    await expect(chatWindow).toBeVisible();
    await expect(chatWindow.locator('[data-wim-toolbar-row="format"]')).toBeVisible();
    await expect(chatWindow.locator('[data-wim-toolbar-row="insert"]')).toBeVisible();
    await expectInsideViewport(chatWindow, page, "narrow first chat window");
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("320px mobile viewport keeps WIM usable with accessible touch targets", async ({
    page,
    request,
  }) => {
    await setRole(request, { userRole: "admin" });
    await page.setViewportSize({ width: 320, height: 568 });
    const errors = [];
    capturePageErrors(page, errors, "wim-mobile");

    await page.goto("/wim", { waitUntil: "domcontentloaded" });
    const buddyWindow = page.locator('[data-wim-window-kind="buddy"]');
    await expect(buddyWindow).toBeVisible();
    await expectInsideViewport(buddyWindow, page, "mobile buddy window");

    const wimOnlineRow = buddyWindow.locator('[role="button"][aria-label="Open WIM chat with WIM Online"]').first();
    await wimOnlineRow.focus();
    await expect(wimOnlineRow).toBeFocused();
    await page.keyboard.press("Enter");

    const chatWindow = page.locator('[data-wim-window-kind="chat"]');
    await expect(chatWindow).toBeVisible();
    await expectInsideViewport(chatWindow, page, "mobile chat window");
    await expect(chatWindow.getByRole("log", { name: /WIM messages with WIM Online/ })).toBeVisible();
    await expect(chatWindow.getByRole("toolbar", { name: "WIM message formatting toolbar" })).toBeVisible();
    await expect(chatWindow.getByRole("button", { name: "Bold WIM text" })).toHaveAttribute("aria-pressed", "false");

    await chatWindow.getByRole("button", { name: "Insert GIF" }).click();
    await expect(chatWindow.locator('[aria-label="WIM GIF picker"]')).toBeVisible();
    await expectInsideViewport(chatWindow.locator('[aria-label="WIM GIF picker"]'), page, "mobile GIF picker");

    const messageBox = chatWindow.getByRole("textbox", { name: "WIM message text" });
    await messageBox.fill("mobile accessible ping");
    await expect(chatWindow.getByRole("button", { name: /Send WIM/ })).toBeEnabled();

    const metrics = await wimMobileMetrics(page);
    expect(metrics.documentScrollWidth, "document horizontal overflow").toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.bodyScrollWidth, "body horizontal overflow").toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.surfaceScrollWidth, "WIM surface horizontal overflow").toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.targets.length, "mobile WIM interactive targets").toBeGreaterThan(12);
    for (const target of metrics.targets) {
      expect.soft(target.width, `${target.role} ${target.label} target width`).toBeGreaterThanOrEqual(24);
      expect.soft(target.height, `${target.role} ${target.label} target height`).toBeGreaterThanOrEqual(24);
      expect.soft(target.left, `${target.role} ${target.label} left`).toBeGreaterThanOrEqual(-1);
      expect.soft(target.right, `${target.role} ${target.label} right`).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    }
    expect(fatalErrors(errors)).toEqual([]);
  });
});
