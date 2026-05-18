import { test, expect } from "@playwright/test";

// Each test starts with a fresh harness state.
async function setMode(request, mode) {
  const res = await request.post("/__test/state", { data: { mode } });
  expect(res.ok()).toBeTruthy();
}
async function getState(request) {
  const res = await request.get("/__test/state");
  return await res.json();
}

test.describe("W microapp — rate-limit handling", () => {
  test("normal mode: groupchat renders the latest message and the page is healthy", async ({
    page,
    request,
  }) => {
    await setMode(request, "normal");
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

    await page.goto("/w");

    // W opens on the Timeline tab by default; the groupchat lives under Gameshow Chat.
    // Wait for the W window itself to mount, then switch to the chat mirror.
    await expect(page.getByRole("button", { name: /^Timeline/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^Gameshow Chat/ }).click();

    // Once on Messages, the harness-provided message must render.
    await expect(page.getByText("Hello world from the W harness")).toBeVisible({ timeout: 15_000 });
    // Health: only ignore noise from unrelated wallet/SDK code in the dev shell.
    expect(consoleErrors.filter((e) => !/(WebGL|wallet|beacon|taquito|favicon)/i.test(e))).toEqual([]);
  });

  test("rate-limited mode: cached message + diagnostic banner show, polling is throttled", async ({
    page,
    request,
  }) => {
    await setMode(request, "rate-limited");
    await page.goto("/w");

    await expect(page.getByRole("button", { name: /^Timeline/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^Gameshow Chat/ }).click();

    // Cached message is still visible while rate-limited.
    await expect(
      page.getByText("Cached message from before the rate limit hit")
    ).toBeVisible({ timeout: 15_000 });

    // Diagnostic banner with "rate-limited" is rendered (substring match — the
    // exact wording lives in W.tsx but our harness sends a controlled message).
    await expect(page.getByText(/rate.?limited/i).first()).toBeVisible();

    // Capture how many groupchat hits happened during initial render.
    const initial = await getState(request);
    const baseline = initial.groupchatRequestCount;

    // Wait 25s — the harness window is 30s, so the throttle should keep us at
    // (or near) baseline. The pre-fix code polled every 20s, which would push
    // count to baseline + 1+ here. With the fix it must stay at baseline.
    await page.waitForTimeout(25_000);

    const after = await getState(request);
    expect(
      after.groupchatRequestCount,
      `expected polling to be throttled while rate-limited (baseline=${baseline}, after=${after.groupchatRequestCount})`
    ).toBeLessThanOrEqual(baseline + 1);
  });

  test("cold-rate-limited: page does not loop on errors", async ({ page, request }) => {
    await setMode(request, "cold-rate-limited");

    const consoleErrors = [];
    const failedRequests = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("requestfailed", (req) => failedRequests.push(req.url()));

    await page.goto("/w");
    // Even with no cached payload, the page must mount without crashing.
    await expect(page.getByRole("button", { name: /^Timeline/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^Gameshow Chat/ }).click();

    // Observe for 10s — the fix returns 200 + rateLimitedUntil so React Query
    // should NOT see a hard error and should NOT enter a retry loop.
    const startCount = (await getState(request)).groupchatRequestCount;
    await page.waitForTimeout(10_000);
    const endCount = (await getState(request)).groupchatRequestCount;

    expect(
      endCount - startCount,
      `cold rate-limit should not produce an error loop (start=${startCount}, end=${endCount})`
    ).toBeLessThanOrEqual(1);

    // No /api/w/groupchat or /api/w/user-dms requests should have failed —
    // the soft-429 path returns 200 OK.
    const groupchatFails = failedRequests.filter((u) => /\/api\/w\/(groupchat|user-dms)/.test(u));
    expect(groupchatFails, `unexpected failed requests: ${groupchatFails.join(", ")}`).toHaveLength(0);
  });
});
