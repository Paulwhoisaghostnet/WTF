import { test, expect } from "@playwright/test";

const voter = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const nominees = [
  "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
  "tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79",
  "tz1LNDLoU3Juoc6sWeKbHRsoCNtP1GTJXvRQ",
  "tz1cgZ6PWKoER3gvW3jGKPHgBkRnpj8XzLm2",
];
const categoryIds = [
  "trailblazer-trader", "horse-artist", "gift-horse", "return-ride", "stable-steward",
  "marshal-eye", "posse-wrangler", "first-saddle", "neighvember-storyteller", "haha-heart",
];
const categories = categoryIds.map((id) => ({
  id, label: id === "trailblazer-trader" ? "Trailblazer Trader" : id.replace(/-/g, " "),
  description: `Honor a rider for ${id.replace(/-/g, " ")}.`,
}));
const season = {
  key: "current-2026", label: "Neighvember 2026", startsAt: "2026-11-01T00:00:00.000Z",
  endsAt: null, status: "open",
};

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockHaha(page, { verified = false } = {}) {
  let rows = [];
  let nextId = 1;
  const submitted = [];
  const removed = [];
  if (verified) {
    await page.addInitScript(({ address }) => {
      window.localStorage.setItem("wtf:wallet-session", JSON.stringify({ address, providerName: "octez.connect" }));
    }, { address: voter });
  }
  await page.route("**/api/horf/wallet/session", (route) => json(route, {
    walletAddress: verified ? voter : null, verified,
  }));
  await page.route("**/api/haha-crp/season", (route) => json(route, {
    season, categories, prizes: { first: { horse: 300, xtz: 9 }, runnerUp: { horse: 150, xtz: 3 } },
    fundingStatus: "unfunded",
  }));
  await page.route(/\/api\/haha-crp\/standings(?:\?.*)?$/, (route) => json(route, {
    season,
    categories: categories.map((category) => ({
      id: category.id, label: category.label,
      nominees: category.id === "trailblazer-trader" ? [
        { address: nominees[0], name: "Sir Canter", count: 7, rank: 1 },
        { address: nominees[1], name: "Mare Force", count: 5, rank: 2 },
        { address: nominees[2], name: "Foal Patrol", count: 5, rank: 3 },
      ] : [],
    })),
  }));
  await page.route(/\/api\/haha-crp\/mine(?:\?.*)?$/, (route) => {
    expect(new URL(route.request().url()).searchParams.get("address")).toBe(voter);
    return json(route, { address: voter, nominations: rows });
  });
  await page.route(/\/api\/haha-crp\/nominations(?:\/\d+)?$/, (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      submitted.push(body);
      if (body.nominatorAddress !== voter || rows.filter((row) => row.categoryId === body.categoryId).length >= 3 ||
          rows.some((row) => row.categoryId === body.categoryId && row.nomineeAddress === body.nomineeAddress)) {
        return json(route, { error: "invalid_nomination" }, 409);
      }
      const now = "2026-11-03T12:00:00.000Z";
      const nomination = { id: nextId++, categoryId: body.categoryId, nomineeAddress: body.nomineeAddress,
        nomineeDisplayName: null, note: body.note || null, createdAt: now, updatedAt: now };
      rows = [...rows, nomination];
      return json(route, { nomination }, 201);
    }
    if (route.request().method() === "DELETE") {
      const id = Number(new URL(route.request().url()).pathname.split("/").at(-1));
      expect(route.request().postDataJSON()).toEqual({ nominatorAddress: voter });
      removed.push(id);
      rows = rows.filter((row) => row.id !== id);
      return json(route, { ok: true });
    }
    return json(route, { error: "method_not_allowed" }, 405);
  });
  await page.route(/\/api\/horf\/season(?:\?.*)?$/, (route) => json(route, {
    season, seasons: [season], asOf: "2026-11-03T12:00:00.000Z", status: "ready", error: null,
    nextRefreshAt: null, currentUser: null,
    leaderboard: [{ address: nominees[0], name: "Sir Canter", trades: 7, received: 3, sent: 4 }],
  }));
  await page.route(/\/api\/horf\/open-range\/offers(?:\?.*)?$/, (route) => json(route, { offers: [] }));
  return { submitted, removed, nominations: () => rows };
}

test.describe("HAHA horse community awards", () => {
  test("shows all ten categories, provisional standings, and announced unfunded prizes to a guest", async ({ page, request }, testInfo) => {
    const state = await request.post("/__test/state", { data: { userRole: "anonymous" } });
    expect(state.ok()).toBeTruthy();
    await mockHaha(page);
    await page.goto("/horf/haha-crp");

    const awards = page.locator("[data-haha-crp]");
    await expect(awards).toBeVisible();
    await expect(page.locator("[data-horf-app]")).toHaveAttribute("data-horf-page", "haha");
    await expect(page.locator('[data-horf-nav="haha"]')).toHaveAttribute("aria-current", "page");
    await expect(awards.locator("[data-haha-season]")).toContainText("Neighvember 2026");
    await expect(awards.locator("[data-haha-category-select] option")).toHaveCount(11);
    await expect(awards.locator("[data-haha-prizes]")).toContainText("300 $HORSE + 9 tez");
    await expect(awards.locator("[data-haha-prizes]")).toContainText("150 $HORSE + 3 tez");
    await expect(awards.locator("[data-haha-funding-status]")).toContainText("Prize reserve pending");
    await expect(awards.locator("[data-haha-submit]")).toBeDisabled();
    await expect(awards.locator("[data-haha-wallet-connect]")).toBeVisible();
    await awards.locator("[data-haha-category-select]").selectOption("trailblazer-trader");
    await expect(awards.locator("[data-haha-standing]")).toHaveCount(3);
    await expect(awards.locator("[data-haha-standing]").nth(0)).toContainText("Sir Canter");
    await expect(awards.locator("[data-haha-standing]").nth(1)).toContainText("Mare Force");
    await expect(awards.locator("[data-haha-standing]").nth(2)).toContainText("Foal Patrol");
    await expect(awards.locator("[data-haha-standings]")).toContainText("ranked by distinct wallet nominations");
    await page.screenshot({ path: testInfo.outputPath("haha-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(awards).toBeVisible();
    await expect(awards.locator("[data-haha-category-select]")).toBeVisible();
    await expect(page.locator("[data-horf-right-rail]")).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath("haha-narrow.png"), fullPage: true });
  });

  test("lets a verified guest nominate three different wallets, then remove a pick", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "anonymous" } });
    expect(state.ok()).toBeTruthy();
    const ledger = await mockHaha(page, { verified: true });
    await page.goto("/horf/haha-crp");

    const awards = page.locator("[data-haha-crp]");
    await expect(awards.locator("[data-haha-wallet-verified]")).toContainText("Rider verified");
    await awards.locator("[data-haha-category-select]").selectOption("trailblazer-trader");
    await awards.locator("[data-haha-known-trader-select]").selectOption(nominees[0]);
    await expect(awards.locator("[data-haha-nominee-address]")).toHaveValue(nominees[0]);
    await awards.locator("[data-haha-submit]").click();
    await expect(awards.locator("[data-haha-my-nomination]")).toHaveCount(1);
    await expect(awards.locator("[data-haha-category-quota]")).toContainText("1 of 3");
    expect(ledger.submitted[0]).toMatchObject({ nominatorAddress: voter, categoryId: "trailblazer-trader", nomineeAddress: nominees[0] });
    await awards.locator("[data-haha-nominee-address]").fill(nominees[0]);
    await expect(awards).toContainText("already nominated this wallet");
    await expect(awards.locator("[data-haha-submit]")).toBeDisabled();
    expect(ledger.submitted).toHaveLength(1);

    for (const [index, nominee] of nominees.slice(1, 3).entries()) {
      await awards.locator("[data-haha-nominee-address]").fill(nominee);
      await awards.locator("[data-haha-submit]").click();
      await expect(awards.locator("[data-haha-category-quota]")).toContainText(`${index + 2} of 3`);
    }
    await expect(awards.locator("[data-haha-my-nomination]")).toHaveCount(3);
    await expect(awards.locator("[data-haha-submit]")).toBeDisabled();
    await expect(awards.locator("[data-haha-nominee-address]")).toBeDisabled();
    expect(ledger.submitted).toHaveLength(3);
    expect(new Set(ledger.submitted.map((item) => item.nomineeAddress)).size).toBe(3);

    await awards.locator("[data-haha-remove-nomination]").first().click();
    await expect(awards.locator("[data-haha-my-nomination]")).toHaveCount(2);
    await awards.locator("[data-haha-nominee-address]").fill(nominees[3]);
    await awards.locator("[data-haha-submit]").click();
    await expect(awards.locator("[data-haha-my-nomination]")).toHaveCount(3);
    expect(ledger.submitted).toHaveLength(4);
    expect(ledger.removed).toHaveLength(1);
    expect(ledger.nominations().map((item) => item.nomineeAddress)).toEqual([nominees[1], nominees[2], nominees[3]]);
  });
});
