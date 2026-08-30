import { test, expect } from "@playwright/test";

test("recipient reports a DM and operator records a reviewed disposition", async ({ page, request }) => {
  await request.post("/__test/state", {
    data: {
      mode: "normal",
      userRole: "admin",
      authUser: { id: 1, username: "wtf-admin", displayName: "WTF Admin" },
    },
  });

  await page.goto("/messages");
  const messages = page.locator('[data-messages-surface="messages"]');
  await expect(messages).toBeVisible();
  const received = messages.locator('[data-messages-region="message-row"]').filter({
    hasText: "Queued WIM ping from the harness.",
  });
  await expect(received).toBeVisible();
  await received.getByRole("button", { name: "Report", exact: true }).click();

  const reportForm = received.locator('[data-messages-region="message-report-form"]');
  await expect(reportForm).toContainText("Report this message to WTF moderators");
  await reportForm.getByRole("textbox", { name: "Why are you reporting this message?" }).fill(
    "This message needs a moderator safety review."
  );
  await reportForm.getByRole("button", { name: "Send private report" }).click();
  await expect(messages.locator('[data-messages-region="message-report-feedback"]')).toHaveText(
    "Report sent for moderator review."
  );

  await messages.getByRole("tab", { name: /Safety reports/ }).click();
  const card = messages.locator('[data-messages-region="safety-report-card"]');
  await expect(card).toContainText("WIM Away");
  await expect(card).toContainText("Queued WIM ping from the harness.");
  await expect(card).toContainText("This message needs a moderator safety review.");
  await card.getByRole("textbox", { name: "Review note for report 1" }).fill(
    "Reviewed the conversation context and recorded the safety disposition."
  );
  await card.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(messages.locator('[data-messages-region="safety-report-card"]')).toHaveCount(0);
  await expect(messages).toContainText("No open safety reports");

  const state = await (await request.get("/__test/state")).json();
  expect(state.dmMessageReports).toMatchObject([
    {
      messageId: 501,
      status: "reviewed",
      reviewNote: "Reviewed the conversation context and recorded the safety disposition.",
    },
  ]);
  expect(state.interactionLog.map((event) => event.eventType)).toEqual(
    expect.arrayContaining(["dm.message.reported", "dm.message.report_reviewed"])
  );
});
