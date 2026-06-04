import { test, expect } from "@playwright/test";

async function setAdmin(request) {
  const res = await request.post("/__test/state", { data: { userRole: "admin" } });
  expect(res.ok()).toBeTruthy();
}

function fatalErrors(errors) {
  return errors.filter((error) => !/(favicon|ResizeObserver|WebGL|wallet|beacon|taquito)/i.test(error));
}

test.describe("interaction inventory — Skywire feed usability", () => {
  test("feed cards self-expand, keep readable spacing, and contain media/token previews", async ({
    page,
    request,
  }) => {
    await setAdmin(request);
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/skywire", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-skywire-feed-card='true']")).toHaveCount(3);
    await expect(page.locator("[data-skywire-token-preview='true']")).toHaveCount(3);
    const firstCard = page.locator("[data-skywire-feed-card='true']").first();
    await expect(firstCard.getByPlaceholder("reply")).toHaveCount(0);
    await firstCard.getByRole("button", { name: "Reply", exact: true }).click();
    await expect(firstCard.getByPlaceholder("reply")).toBeVisible();

    const cards = await page.locator("[data-skywire-feed-card='true']").evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
        };
      }),
    );

    for (const [index, card] of cards.entries()) {
      expect(card.height, `Skywire card ${index + 1} should be tall enough to read`).toBeGreaterThan(180);
      expect(card.scrollHeight, `Skywire card ${index + 1} should not clip content`).toBeLessThanOrEqual(
        card.clientHeight + 2,
      );
      if (index > 0) {
        expect(card.top - cards[index - 1].bottom, `Skywire card ${index + 1} should have visible negative space`).toBeGreaterThanOrEqual(18);
      }
    }

    const mediaFrames = await page.locator("[data-skywire-feed-media='true']").evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        const image = node.querySelector("img");
        const imageRect = image?.getBoundingClientRect();
        return {
          frameHeight: rect.height,
          frameWidth: rect.width,
          imageHeight: imageRect?.height ?? 0,
          imageWidth: imageRect?.width ?? 0,
          imageContained:
            Boolean(imageRect) &&
            imageRect.top >= rect.top - 1 &&
            imageRect.left >= rect.left - 1 &&
            imageRect.right <= rect.right + 1 &&
            imageRect.bottom <= rect.bottom + 1,
        };
      }),
    );

    expect(mediaFrames).toHaveLength(2);
    for (const [index, frame] of mediaFrames.entries()) {
      expect(frame.frameHeight, `Skywire media frame ${index + 1} should not collapse into a strip`).toBeGreaterThan(300);
      expect(frame.imageHeight, `Skywire media image ${index + 1} should be visible`).toBeGreaterThan(280);
      expect(frame.imageWidth, `Skywire media image ${index + 1} should be visible`).toBeGreaterThan(280);
      expect(frame.imageContained, `Skywire media image ${index + 1} should stay inside its frame`).toBe(true);
    }

    await expect(page.getByText("Harness Open Edition")).toBeVisible();
    await expect(page.getByText("Harness Teia Token")).toBeVisible();
    expect(fatalErrors(errors)).toEqual([]);
  });
});
