import { expect, test } from "@playwright/test";

async function setHarnessState(request, state = {}) {
  const res = await request.post("/__test/state", { data: state });
  expect(res.ok()).toBeTruthy();
}

function fatalErrors(errors) {
  return errors.filter(
    (error) =>
      !/(favicon|ResizeObserver|WebGL|wallet|beacon|taquito|401 \(Unauthorized\))/i.test(error)
  );
}

async function watchFatalBrowserErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test.describe("The Law, Delivered — test plan smoke coverage", () => {
  test("LAW.TP1/07 public landing preserves account entry points", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "anonymous" });
    const errors = await watchFatalBrowserErrors(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "WTF GAMESHOW" })).toBeVisible();
    await expect(page.getByText("What The Fork is a Gameshow?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log In" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Register" })).toBeVisible();

    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Welcome back to WTF OS")).toBeVisible();

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByText("Create WTF OS Account")).toBeVisible();

    expect(fatalErrors(errors)).toEqual([]);
  });

  test("LAW.TP2/07 auth/session gates anonymous users and opens authenticated OS windows", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, { userRole: "anonymous" });
    const anonymous = await request.get("/api/auth/user");
    expect(anonymous.status()).toBe(401);

    await setHarnessState(request, { userRole: "admin" });
    const session = await request.get("/api/auth/user");
    expect(session.ok()).toBeTruthy();
    await expect.poll(async () => (await session.json()).role).toBe("admin");

    const errors = await watchFatalBrowserErrors(page);
    await page.goto("/mission-control", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("mission-control")).toBeVisible();
    await expect(page.getByTestId("mission-control-location")).toContainText("WTF Admin");

    expect(fatalErrors(errors)).toEqual([]);
  });

  test("LAW.TP3/07 Mission Control answers the core OS questions", async ({ page, request }) => {
    await setHarnessState(request, { userRole: "admin" });
    const errors = await watchFatalBrowserErrors(page);

    await page.goto("/mission-control", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("mission-control-location")).toContainText("Where am I?");
    await expect(page.getByTestId("mission-control-wallet")).toContainText("Active wallet");
    await expect(page.getByTestId("mission-control-system")).toContainText("System");
    await expect(page.getByTestId("mission-control-next")).toContainText("Next");
    await expect(page.getByText("What counts")).toBeVisible();
    await expect(page.getByText("What failed")).toBeVisible();
    await expect(page.getByText("What changed")).toBeVisible();
    await expect(page.getByText("What happens next")).toBeVisible();
    await expect(page.getByText("Wallet preflight")).toBeVisible();
    await expect(page.getByText(/Network mainnet \/ RPC https:\/\/api\.tzkt\.io\/v1/)).toBeVisible();

    expect(fatalErrors(errors)).toEqual([]);
  });

  test("LAW.TP4/07 TV exposes the playback surface and no-signal recovery path", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, { userRole: "admin", mode: "tv-offline" });
    const errors = await watchFatalBrowserErrors(page);

    await page.goto("/tv", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("MODEL CRT-95")).toBeVisible();
    await expect(page.getByText("NO SIGNAL").first()).toBeVisible();
    await page.getByTestId("tv-power-control").click();
    await expect(page.getByText("CH 03 · Harness stream unavailable")).toBeVisible();
    await expect(page.getByText("POWER")).toBeVisible();
    await expect(page.getByText("MENU")).toBeVisible();

    expect(fatalErrors(errors)).toEqual([]);
  });

  test("LAW.TP5/07 marketplace create flow stays wallet-gated before value writes", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, { userRole: "admin", mode: "no-wallet" });
    const errors = await watchFatalBrowserErrors(page);

    await page.goto("/marketplace", { waitUntil: "domcontentloaded" });
    await expect(page.locator("span").filter({ hasText: "WTF On Chain Market + Trade Boards" })).toBeVisible();
    await page.getByRole("button", { name: "+ New Listing/Auction" }).click();
    await expect(page.getByText("Create Listing / Auction")).toBeVisible();
    await expect(page.getByText("Link a wallet in Profile before creating market entries.")).toBeVisible();

    expect(fatalErrors(errors)).toEqual([]);
  });

  test("LAW.TP6/07 owned media and public gallery surfaces remain separated", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, { userRole: "admin" });
    const errors = await watchFatalBrowserErrors(page);

    await page.goto("/my-gallery", { waitUntil: "domcontentloaded" });
    await expect(page.locator("span").filter({ hasText: "My Gallery" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "FILTERS" })).toBeVisible();
    await expect(page.getByText("Showing 0 of 0")).toBeVisible();
    await expect(page.getByText(/sync a new wallet to see your collection/i)).toBeVisible();

    await setHarnessState(request, { userRole: "anonymous" });
    await page.goto("/gallery", { waitUntil: "domcontentloaded" });
    await expect(page.locator("span").filter({ hasText: "Gallery - Survival Tokens & Art" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Survival Tokens" })).toBeVisible();
    await expect(page.getByText("Season 1 - Round 1 Survivor")).toBeVisible();

    expect(fatalErrors(errors)).toEqual([]);
  });

  test("LAW.TP7/07 admin observability remains strict-admin visible", async ({
    context,
    page,
    request,
  }) => {
    await setHarnessState(request, { userRole: "admin" });
    const errors = await watchFatalBrowserErrors(page);

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.locator("span").filter({ hasText: "Admin Panel" })).toBeVisible();
    await expect(page.getByText("Overview")).toBeVisible();
    await expect(page.getByTitle("OS Admin")).toBeVisible();
    await expect(page.getByTitle("Automation")).toBeVisible();

    await setHarnessState(request, { userRole: "host" });
    const hostPage = await context.newPage();
    try {
      await hostPage.goto("/admin", { waitUntil: "domcontentloaded" });
      await expect(hostPage.locator("span").filter({ hasText: "Admin Panel" })).toHaveCount(0);
      await expect(hostPage.getByTitle("OS Admin")).toHaveCount(0);
    } finally {
      await hostPage.close();
    }

    expect(fatalErrors(errors)).toEqual([]);
  });
});
