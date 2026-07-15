import { test, expect } from "@playwright/test";

async function setHarnessRole(request, role) {
  const res = await request.post("/__test/state", { data: { userRole: role } });
  expect(res.ok()).toBeTruthy();
}

async function nodePosition(locator) {
  return locator.evaluate((node) => {
    const style = window.getComputedStyle(node);
    return {
      left: Number.parseFloat(style.left),
      top: Number.parseFloat(style.top),
    };
  });
}

test.describe("Map Lab workspace", () => {
  test("resizes the canvas, zooms the viewport, scrolls/pans the map, drags nodes, and builds workflow routes", async ({
    page,
    request,
  }) => {
    await setHarnessRole(request, "admin");
    await page.addInitScript(() => {
      window.localStorage.removeItem("wtfos.map-lab.repo-draft.v1");
      window.localStorage.removeItem("wtf-os.window-session.v1");
    });

    await page.goto("/map-lab", { waitUntil: "domcontentloaded" });

    const shell = page.locator("[data-map-lab-shell='true']");
    const viewport = page.locator("[data-map-lab-viewport='true']");
    const zoomReadout = page.locator("[data-map-lab-zoom='true']");
    const lockedNode = page.locator("[data-map-lab-node-key='wtfos-pds']");
    const movableNode = page.locator("[data-map-lab-node-key='map-lab']");
    const runSummary = page.locator("[data-map-lab-run-summary='true']");

    await expect(shell).toBeVisible();
    await expect(viewport).toBeVisible();
    await expect(movableNode).toBeVisible();
    await expect(lockedNode).toBeVisible();

    const viewportBeforeMaximize = await viewport.boundingBox();
    expect(viewportBeforeMaximize).toBeTruthy();
    await page.getByRole("button", { name: "Maximize WTF Map Lab" }).click();
    await expect(page.getByRole("button", { name: "Restore WTF Map Lab" })).toBeVisible();
    const viewportAfterMaximize = await viewport.boundingBox();
    expect(viewportAfterMaximize.width).toBeGreaterThan(viewportBeforeMaximize.width + 120);

    const scrollMetrics = await viewport.evaluate((node) => ({
      clientWidth: node.clientWidth,
      clientHeight: node.clientHeight,
      scrollWidth: node.scrollWidth,
      scrollHeight: node.scrollHeight,
    }));
    expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth);
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);

    await expect(zoomReadout).toHaveText("100%");
    await page.getByRole("button", { name: "Zoom in Map Lab canvas" }).click();
    await expect(zoomReadout).toHaveText("110%");

    await viewport.evaluate((node) => {
      node.scrollLeft = 700;
      node.scrollTop = 420;
    });
    const panStart = await viewport.evaluate((node) => ({
      left: node.scrollLeft,
      top: node.scrollTop,
    }));
    const viewportBox = await viewport.boundingBox();
    expect(viewportBox).toBeTruthy();
    await page.mouse.move(viewportBox.x + 120, viewportBox.y + 120);
    await page.mouse.down();
    await page.mouse.move(viewportBox.x + 190, viewportBox.y + 170, { steps: 4 });
    await page.mouse.up();
    const panEnd = await viewport.evaluate((node) => ({
      left: node.scrollLeft,
      top: node.scrollTop,
    }));
    expect(panEnd.left).toBeLessThan(panStart.left);
    expect(panEnd.top).toBeLessThan(panStart.top);

    await page.getByRole("button", { name: "Reset view" }).click();
    await expect(zoomReadout).toHaveText("100%");

    await page.locator("[data-map-lab-template='gradio-space']").click();
    const gradioNode = page.locator("[data-map-lab-node-key^='gradio-space-']").first();
    const hfResponsePort = page.locator("[data-map-lab-port-node-key='hf-inference-node'][data-map-lab-port-id='response']");
    const gradioRequestPort = page
      .locator("[data-map-lab-port-node-key^='gradio-space-'][data-map-lab-port-id='request']")
      .first();
    const responseToRequestRoute = page.locator("[data-map-lab-route-list-item]").filter({ hasText: "Response to Request" });
    await expect(gradioNode).toBeVisible();

    await hfResponsePort.click();
    await expect(page.locator("[data-map-lab-pending-route='true']")).toContainText("HF inference node");
    await expect(gradioRequestPort).toHaveAttribute("data-map-lab-port-compatibility", "compatible");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-map-lab-pending-route='true']")).toBeHidden();

    await hfResponsePort.click();
    await gradioRequestPort.click();
    await expect(responseToRequestRoute).toBeVisible();
    await responseToRequestRoute.click();
    await page.keyboard.press("Delete");
    await expect(responseToRequestRoute).toBeHidden();

    await hfResponsePort.click();
    await gradioRequestPort.click();
    await expect(responseToRequestRoute).toBeVisible();

    await page.getByRole("button", { name: "Run workflow map" }).click();
    await expect(runSummary).toContainText("Last run activated");

    const lockedBefore = await nodePosition(lockedNode);
    const movableBefore = await nodePosition(movableNode);
    const movableBox = await movableNode.boundingBox();
    expect(movableBox).toBeTruthy();
    await page.mouse.move(movableBox.x + movableBox.width / 2, movableBox.y + movableBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(movableBox.x + movableBox.width / 2 + 96, movableBox.y + movableBox.height / 2 + 54, {
      steps: 6,
    });
    await page.mouse.up();

    await expect.poll(async () => (await nodePosition(movableNode)).left).toBeGreaterThan(movableBefore.left + 48);
    await expect.poll(async () => (await nodePosition(movableNode)).top).toBeGreaterThan(movableBefore.top + 24);
    const movableAfter = await nodePosition(movableNode);
    const lockedAfter = await nodePosition(lockedNode);
    expect(movableAfter.left).toBeGreaterThan(movableBefore.left + 48);
    expect(movableAfter.top).toBeGreaterThan(movableBefore.top + 24);
    expect(Math.round(movableAfter.left) % 28).toBe(0);
    expect(Math.round(movableAfter.top) % 28).toBe(0);
    expect(lockedAfter).toEqual(lockedBefore);
  });

  test("opens the read-only wtfOS demo map for inspection without allowing edits", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    await page.addInitScript(() => {
      window.localStorage.removeItem("wtfos.map-lab.repo-draft.v1");
      window.localStorage.removeItem("wtf-os.window-session.v1");
    });

    await page.goto("/map-lab", { waitUntil: "domcontentloaded" });

    const shell = page.locator("[data-map-lab-shell='true']");
    const viewport = page.locator("[data-map-lab-viewport='true']");
    const demoDesktopNode = page.locator("[data-map-lab-node-key='wtfos-demo-desktop-shell']");
    const demoMapLabNode = page.locator("[data-map-lab-node-key='wtfos-demo-map-lab']");
    const socialDomainNode = page.locator("[data-map-lab-node-key='wtfos-domain-social-comms']");
    const walletDomainNode = page.locator("[data-map-lab-node-key='wtfos-domain-wallet-tezos']");
    const adminManagerNode = page.locator("[data-map-lab-node-key='wtfos-manager-admin-panel']");
    const skywireRouteNode = page.locator("[data-map-lab-node-key='wtfos-route-skywire']");
    const macaroniRouteNode = page.locator("[data-map-lab-node-key='wtfos-route-tools-macaroni']");
    const mcpTokensRouteNode = page.locator("[data-map-lab-node-key='wtfos-route-api-mcp-tokens']");
    const demoOutputPort = page.locator("[data-map-lab-port-node-key='wtfos-demo-desktop-shell'][data-map-lab-port-id='output']");
    const runSummary = page.locator("[data-map-lab-run-summary='true']");

    await page.locator("[data-map-lab-open-demo='true']").click();

    await expect(shell).toHaveAttribute("data-map-lab-mode", "wtfos-demo");
    await expect(shell).toHaveAttribute("data-map-lab-readonly", "true");
    await expect(page.locator("[data-map-lab-mode-badge='true']")).toContainText("Read-only demo");
    await expect(page.locator("[data-map-lab-mode-copy='true']")).toContainText("any user can inspect");
    await expect(page.getByText(/\d+ nodes, \d+ routes/).first()).toBeVisible();
    // The demo is generated from live registries, so the node count grows as
    // routes/surfaces are added; assert a healthy floor instead of equality.
    expect(await page.locator("[data-map-lab-node='true']").count()).toBeGreaterThanOrEqual(212);
    const topologySummary = await page.getByText(/\d+ nodes, \d+ routes/).first().textContent();
    const routeCount = Number(topologySummary?.match(/(\d+) routes/)?.[1] ?? 0);
    expect(routeCount).toBeGreaterThan(390);
    await expect(page.getByText(/more routes on canvas/)).toBeVisible();
    await expect(demoDesktopNode).toBeVisible();
    await expect(demoMapLabNode).toBeVisible();
    await expect(socialDomainNode).toBeVisible();
    await expect(walletDomainNode).toBeVisible();
    await expect(adminManagerNode).toBeVisible();
    await expect(skywireRouteNode).toBeVisible();
    await expect(macaroniRouteNode).toBeVisible();
    await expect(mcpTokensRouteNode).toBeVisible();
    await expect(page.locator("[data-map-lab-template='gradio-space']")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save repo draft" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Connect route" })).toBeDisabled();
    await expect(page.getByLabel("Title")).toBeDisabled();
    await expect(page.getByLabel("Label").first()).toBeDisabled();

    await demoOutputPort.click();
    await expect(page.locator("[data-map-lab-pending-route='true']")).toBeHidden();

    const beforeDrag = await nodePosition(demoMapLabNode);
    const nodeBox = await demoMapLabNode.boundingBox();
    expect(nodeBox).toBeTruthy();
    await page.mouse.move(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(nodeBox.x + nodeBox.width / 2 + 120, nodeBox.y + nodeBox.height / 2 + 80, { steps: 5 });
    await page.mouse.up();
    expect(await nodePosition(demoMapLabNode)).toEqual(beforeDrag);

    const scrollMetrics = await viewport.evaluate((node) => ({
      clientWidth: node.clientWidth,
      clientHeight: node.clientHeight,
      scrollWidth: node.scrollWidth,
      scrollHeight: node.scrollHeight,
    }));
    expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth);
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);

    await expect(page.getByRole("button", { name: "Run workflow map" })).toBeEnabled();
    await page.getByRole("button", { name: "Run workflow map" }).click();
    await expect(runSummary).toHaveText(/Last run activated \d+ routes across \d+ connected nodes\./);
    const runText = await runSummary.textContent();
    const connectedNodes = Number(runText?.match(/across (\d+) connected/)?.[1] ?? 0);
    expect(connectedNodes).toBeGreaterThanOrEqual(205);
    await expect(page.locator("[data-map-lab-route-list-item='demo-wire-1']")).toContainText("active");
  });

  test("allows anonymous users to open and run the read-only wtfOS demo without edit access", async ({
    page,
    request,
  }) => {
    await setHarnessRole(request, "anonymous");
    await page.route("**/api/apps/desktop", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          apps: { "map-lab": true },
          list: [{ key: "map-lab", enabled: true, installable: true }],
        }),
      });
    });
    await page.addInitScript(() => {
      window.localStorage.removeItem("wtfos.map-lab.repo-draft.v1");
      window.localStorage.removeItem("wtf-os.window-session.v1");
    });

    await page.goto("/map-lab", { waitUntil: "domcontentloaded" });

    const shell = page.locator("[data-map-lab-shell='true']");
    const viewport = page.locator("[data-map-lab-viewport='true']");
    const runSummary = page.locator("[data-map-lab-run-summary='true']");

    await expect(shell).toBeVisible();
    await expect(viewport).toBeVisible();
    await expect(page.locator("[data-map-lab-template='gradio-space']")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Run workflow map" })).toBeDisabled();

    await page.locator("[data-map-lab-open-demo='true']").click();
    await expect(shell).toHaveAttribute("data-map-lab-mode", "wtfos-demo");
    await expect(shell).toHaveAttribute("data-map-lab-readonly", "true");
    await expect(page.getByText(/\d+ nodes, \d+ routes/).first()).toBeVisible();
    expect(await page.locator("[data-map-lab-node='true']").count()).toBeGreaterThanOrEqual(212);
    await expect(page.locator("[data-map-lab-node-key='wtfos-domain-social-comms']")).toBeVisible();
    await expect(page.locator("[data-map-lab-node-key='wtfos-manager-admin-panel']")).toBeVisible();
    await expect(page.locator("[data-map-lab-node-key='wtfos-route-skywire']")).toBeVisible();
    await expect(page.locator("[data-map-lab-template='gradio-space']")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save repo draft" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Connect route" })).toBeDisabled();

    await page.getByRole("button", { name: "Run workflow map" }).click();
    await expect(runSummary).toHaveText(/Last run activated \d+ routes across \d+ connected nodes\./);
    const runText = await runSummary.textContent();
    const connectedNodes = Number(runText?.match(/across (\d+) connected/)?.[1] ?? 0);
    expect(connectedNodes).toBeGreaterThanOrEqual(205);
  });
});
