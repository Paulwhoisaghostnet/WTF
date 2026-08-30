import { test, expect } from "@playwright/test";

const receipt = {
  id: 73,
  mediaItemId: 9073,
  status: "applied",
  network: "shadownet",
  opHash: "oo3gkZPjB6u4n5KBQ7W1PEmJfC3qxh4KcXdpEV1R2LAfVEq6uqX",
  minterWallet: "tz1burnburnburnburnburnburnburjAYjjX",
  contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
  tokenId: "73",
  amount: "1",
  artifactUri: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3udvcz7dhvjlqv5f7s4h5k73u",
  explorerUrl: "https://shadownet.tzkt.io/oo3gkZPjB6u4n5KBQ7W1PEmJfC3qxh4KcXdpEV1R2LAfVEq6uqX",
  verifiedAt: "2026-08-29T20:00:00.000Z",
};

test("owned media recovers its verified Shadownet mint receipt without browser-local state", async ({ page, request }) => {
  await request.post("/__test/state", { data: { userRole: "admin" } });
  let receiptReads = 0;
  await page.route("**/api/media/mine?category=image", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        id: receipt.mediaItemId,
        title: "Cross-session Tezos artwork",
        description: "Owned media with a durable receipt",
        sourceType: "upload",
        sourceUrl: `/api/media/${receipt.mediaItemId}/file`,
        mimeType: "image/png",
        mediaCategory: "image",
        status: "ready",
        fileSize: 2048,
        createdAt: "2026-08-29T19:00:00.000Z",
      }]),
    });
  });
  await page.route(`**/api/mint-manager/receipts/${receipt.mediaItemId}`, async (route) => {
    receiptReads += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([receipt]) });
  });

  const openReceipt = async () => {
    await page.goto("/my-photos", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Cross-session Tezos artwork", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Mint this media", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Mint Manager" });
    await expect(dialog).toContainText("Token verified, indexed, and saved");
    await expect(dialog).toContainText("stored with your owned media");
    await expect(dialog).toContainText("Tezos Shadownet");
    await expect(dialog).toContainText(receipt.minterWallet);
    await expect(dialog).toContainText(receipt.contract);
    await expect(dialog).toContainText(`Token ID${receipt.tokenId}`);
    await expect(dialog.getByRole("link", { name: "View operation on TzKT" })).toHaveAttribute("href", receipt.explorerUrl);
    await expect(dialog.getByRole("link", { name: "View token on Objkt" })).toHaveCount(0);
    return dialog;
  };

  let dialog = await openReceipt();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("wtfos.mint-manager.workflow")) window.localStorage.removeItem(key);
    }
  });
  dialog = await openReceipt();
  await expect(dialog).toContainText(receipt.opHash);
  expect(receiptReads).toBeGreaterThanOrEqual(2);
});
