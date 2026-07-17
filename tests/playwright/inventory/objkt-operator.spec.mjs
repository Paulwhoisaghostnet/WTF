import { expect, test } from "@playwright/test";

const creator = {
  address: "tz1d85U8FuaqeDzfdjxoUngrNbCiCsFiKJ53",
  alias: "Shaun Keenan",
  logo: null,
  verified: true,
  reviewStatus: "pending",
  salesCount: 18,
  volumeXtz: 24.5,
  uniqueBuyers: 10,
  lastSaleAt: "2026-07-14T00:00:00.000Z",
  affordableListingCount: 8,
  lowestAskXtz: 0.5,
  score: 84,
  scoreParts: {
    sales: { score: 100, weight: 25.6, contribution: 25.6 },
    buyers: { score: 100, weight: 19.2, contribution: 19.2 },
    volume: { score: 58, weight: 19.2, contribution: 11.1 },
    recency: { score: 96, weight: 9.6, contribution: 9.2 },
    verification: { score: 100, weight: 6.4, contribution: 6.4 },
    inventoryDepth: { score: 100, weight: 13, contribution: 13 },
    floorFit: { score: 75, weight: 7, contribution: 5.3 },
  },
};

function initialState() {
  return {
    version: 4,
    walletAddress: "tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79",
    settings: {
      spendCapXtz: 10,
      maxItemPriceXtz: 2,
      perCreatorLimit: 20,
      walletReserveXtz: 0.15,
      minCandidateScore: 55,
      minResaleConfidence: 44,
      minRecentSales180d: 2,
      requireSaleReference: true,
    },
    creators: [{ ...creator }],
    scan: null,
    queue: [],
    session: {
      kukaiStatus: "ready",
      objktAccountStatus: "ready",
      objktWalletAddress: "tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79",
      runArmed: false,
    },
    events: [],
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}

test("owner reviews creator score evidence and the decision survives reload", async ({ page, request }) => {
  await request.post("/__test/state", { data: { userRole: "admin", username: "wtf-admin" } });
  let persisted = initialState();

  await page.route("**/api/objkt-operator/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.pathname === "/api/objkt-operator/access") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ allowed: true }) });
    }
    if (route.request().method() === "GET" && url.pathname === "/api/objkt-operator/state") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: persisted }) });
    }
    if (route.request().method() === "PATCH" && url.pathname.includes("/api/objkt-operator/creators/")) {
      const body = route.request().postDataJSON();
      persisted = {
        ...persisted,
        version: persisted.version + 1,
        creators: persisted.creators.map((item) => ({ ...item, reviewStatus: body.reviewStatus })),
      };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: persisted }) });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Unhandled operator route" }) });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open Stuffs menu" }).click();
  await page.getByText("Admin", { exact: true }).click();
  await page.getByText("Objkt Operator", { exact: true }).last().click();
  await expect(page).toHaveURL(/\/objkt-operator$/);
  await expect(page.getByTestId("objkt-operator-persistence")).toContainText("Postgres v4");
  await expect(page.getByTestId("objkt-creator-row")).toContainText("Shaun Keenan");
  await page.getByText("Score breakdown", { exact: true }).click();
  const breakdown = page.getByTestId("objkt-creator-score-breakdown");
  await expect(breakdown).toContainText("Sales");
  await expect(breakdown).toContainText("Buyers");
  await expect(breakdown).toContainText("Volume");
  await expect(breakdown).toContainText("Recency");
  await expect(breakdown).toContainText("Verified");
  await expect(breakdown).toContainText("Inventory");
  await expect(breakdown).toContainText("Floor fit");
  await expect(breakdown).toContainText("25.6% weight");

  await page.getByRole("button", { name: "Approve creator" }).click();
  await expect(page.getByTestId("objkt-operator-summary")).toContainText("1");
  await expect(page.getByTestId("objkt-operator-persistence")).toContainText("Postgres v5");

  await page.reload();
  await expect(page.getByTestId("objkt-operator-persistence")).toContainText("Postgres v5");
  await expect(page.getByTestId("objkt-operator-summary")).toContainText("approved creators");
  await expect(page.getByRole("button", { name: "Approve creator" })).toBeVisible();
});
