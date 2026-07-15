import { test, expect } from "@playwright/test";

async function setAdmin(request) {
  const response = await request.post("/__test/state", { data: { userRole: "admin" } });
  expect(response.ok()).toBeTruthy();
}

async function setRole(request, userRole) {
  const response = await request.post("/__test/state", { data: { userRole } });
  expect(response.ok()).toBeTruthy();
}

test.describe("interaction inventory — in-app market pricing", () => {
  test("admin anchors, rebalance, sales, and storefront pricing stay connected", async ({
    page,
    request,
  }) => {
    await setAdmin(request);

    const adminResponse = await request.get("/api/admin/in-app-market/items");
    expect(adminResponse.ok()).toBeTruthy();
    const adminPayload = await adminResponse.json();
    const bySku = new Map(adminPayload.items.map((item) => [item.sku, item]));

    expect(bySku.get("arcade-play-card")).toMatchObject({
      priceWtfFormatted: "1.00",
      rarityTier: 1,
      priceScore: 1,
      priceWtfLocked: true,
    });
    expect(bySku.get("arcade-play-ticket")).toMatchObject({
      priceWtfFormatted: "10.00",
      rarityTier: 1,
      priceScore: 2,
      priceWtfLocked: true,
    });
    expect(bySku.get("desktop-mop")).toMatchObject({
      priceWtfFormatted: "100.00",
      rarityTier: 2,
      priceScore: 1,
      priceWtfLocked: true,
    });
    expect(bySku.get("desktop-vacuum")).toMatchObject({
      priceWtfFormatted: "700.00",
      rarityTier: 3,
      priceScore: 2,
      priceWtfLocked: false,
    });

    const repriceResponse = await request.post("/api/admin/in-app-market/reprice", { data: {} });
    expect(repriceResponse.ok()).toBeTruthy();
    const repricePayload = await repriceResponse.json();
    expect(repricePayload.ok).toBe(true);
    expect(repricePayload.pricing.tiers.find((tier) => tier.tier === 2)).toMatchObject({
      minWtf: 100,
      anchorCount: 1,
    });

    const saleResponse = await request.post("/api/admin/in-app-market/sales", {
      data: {
        name: "Inventory Arcade Credit Sale",
        active: true,
        discountPercent: 10,
        sku: "arcade-play-ticket",
      },
    });
    expect(saleResponse.ok()).toBeTruthy();

    const marketResponse = await request.get("/api/in-app-market?category=arcade");
    expect(marketResponse.ok()).toBeTruthy();
    const marketPayload = await marketResponse.json();
    const arcadeCredit = marketPayload.items.find((item) => item.sku === "arcade-play-ticket");
    expect(arcadeCredit?.sale).toMatchObject({
      discountPercent: 10,
      salePriceWtfFormatted: "9.00",
    });

    await page.goto("/wtfiam?category=arcade", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("WTF Arcade Credit")).toBeVisible();
    await expect(page.getByText("-10%", { exact: true })).toBeVisible();
    await expect(page.getByText("9.00 WTF", { exact: true })).toBeVisible();
  });

  test("Apps category shows role-gated app unlocks as disabled with prerequisite copy", async ({
    page,
    request,
  }) => {
    await setRole(request, "witness");

    const marketResponse = await request.get("/api/in-app-market?category=apps");
    expect(marketResponse.ok()).toBeTruthy();
    const marketPayload = await marketResponse.json();
    const skywire = marketPayload.items.find((item) => item.sku === "wtfos-app-skywire");
    expect(skywire).toMatchObject({
      kind: "app-unlock",
      stockQuantity: 0,
      purchaseBlockedReason: "Requires Skywire staff-alpha access or an all-users rollout.",
      appStore: {
        appKey: "skywire",
        canPurchase: false,
      },
    });

    await page.goto("/wtfiam?category=apps", { waitUntil: "domcontentloaded" });
    const skywireCard = page.locator('[data-wtfiam-sku="wtfos-app-skywire"]');
    await expect(skywireCard).toBeVisible();
    await expect(skywireCard).toHaveAttribute(
      "data-wtfiam-disabled-reason",
      /Skywire staff-alpha/
    );
    await expect(
      skywireCard.locator('[data-wtfiam-region="item-disabled-reason"]')
    ).toContainText("Requires Skywire staff-alpha access");
    await expect(skywireCard.locator('[data-wtfiam-action="add-ticket"]')).toBeDisabled();
  });
});
