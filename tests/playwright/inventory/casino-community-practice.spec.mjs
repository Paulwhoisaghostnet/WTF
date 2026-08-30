import { expect, test } from "@playwright/test";

async function setHarnessState(request, state = {}) {
  const response = await request.post("/__test/state", { data: state });
  expect(response.ok()).toBeTruthy();
}

test("Casino explains, reviews, publishes, and plays a community practice table", async ({
  page,
  request,
}) => {
  await setHarnessState(request, {
    userRole: "admin",
    username: "casino-creator",
    displayName: "Casino Creator",
    casinoCanEnter: true,
  });

  await page.goto("/casino", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Practice floor only.")).toBeVisible();
  await expect(page.getByText(/No community table can accept a wager/)).toBeVisible();

  const creatorDesk = page.locator('[data-casino-region="practice-creator-desk"]');
  await creatorDesk.getByLabel("Table name").fill("Community Star Draw");
  await creatorDesk.getByLabel("Short description").fill("Draw a practice star with no value at risk.");
  await creatorDesk.getByLabel("How to play").fill("Press play and read the equal-chance result.");
  await creatorDesk.getByLabel("Possible results — one per line").fill("Sun\nMoon\nStar");
  await creatorDesk.getByRole("button", { name: "Submit for Review" }).click();

  await expect(creatorDesk.getByText(/hidden while an operator reviews it/i)).toBeVisible();
  await expect(creatorDesk.locator('[data-casino-region="practice-submissions"]')).toContainText(
    "Community Star Draw · submitted"
  );
  await expect(
    page.locator('[data-casino-region="community-game-card"]', { hasText: "Community Star Draw" })
  ).toHaveCount(0);

  const reviewQueue = page.locator('[data-casino-region="practice-review-queue"]');
  const reviewItem = reviewQueue.locator("div", { hasText: "Community Star Draw · By Casino Creator" }).last();
  await reviewItem.getByLabel("Required review note").fill("Approved for no-wager community practice.");
  await reviewItem.getByRole("button", { name: "Approve Practice Table" }).click();

  const publicCard = page.locator('[data-casino-region="community-game-card"]', {
    hasText: "Community Star Draw",
  });
  await expect(publicCard).toBeVisible();
  await expect(publicCard).toContainText("By Casino Creator");
  await expect(publicCard).toContainText("PRACTICE ONLY");
  await expect(publicCard).toContainText("NO WAGER");
  await publicCard.getByRole("button", { name: "Play Practice Round" }).click();
  await expect(page.locator('[data-casino-region="practice-play-status"]')).toContainText(
    "practice only; no wager or reward"
  );

  const harnessState = await (await request.get("/__test/state")).json();
  expect(harnessState.interactionLog.map((event) => event.eventType)).toEqual(
    expect.arrayContaining([
      "casino.practice_game.submitted",
      "casino.practice_game.reviewed",
      "casino.practice_game.played",
    ])
  );
});
