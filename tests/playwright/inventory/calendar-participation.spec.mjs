import { test, expect } from "@playwright/test";

test("Calendar saves Going, chosen reminders, My plans, and clear", async ({ page, request }) => {
  await request.post("/__test/state", {
    data: {
      mode: "normal",
      userRole: "admin",
      authUser: { id: 1, username: "wtf-admin", displayName: "WTF Admin" },
    },
  });

  const startsAt = new Date();
  startsAt.setHours(12, 0, 0, 0);
  const event = {
    id: 627,
    kind: "x_space",
    title: "Community Calendar Participation Lab",
    description: "Choose a plan, a reminder, and the room link.",
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString(),
    allDay: false,
    sourceKind: "manual",
    sourceId: null,
    sourceProvider: "wtf",
    sourceRank: 10,
    visibility: "public",
    status: "published",
    linksJson: [{ label: "Join event room", url: "https://example.com/calendar-room" }],
    creatorName: "WTF Admin",
    creatorUrl: "/user/wtf-admin",
  };

  await page.route("**/api/calendar/events**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify([event]) });
  });

  await page.goto("/calendar");
  const calendar = page.locator('[data-calendar-surface="calendar"]');
  await expect(calendar).toBeVisible();
  await calendar.getByRole("button", { name: /Community Calendar Participation Lab/ }).first().click();
  const details = calendar.locator('[data-calendar-region="event-detail"]');
  await expect(details.getByRole("link", { name: "Join event room" })).toHaveAttribute(
    "href",
    "https://example.com/calendar-room"
  );

  await details.getByRole("button", { name: "Going", exact: true }).click();
  await expect(details.locator('[data-calendar-region="participation-controls"]')).toContainText(
    "You are going. Task-tray reminders are on."
  );

  let harnessState = await (await request.get("/__test/state")).json();
  expect(harnessState.calendarParticipations).toMatchObject([
    {
      eventKey: `wtf:${event.id}:${event.startsAt}`,
      status: "going",
      reminderEnabled: true,
    },
  ]);

  await page.reload();
  await calendar.getByRole("button", { name: /Community Calendar Participation Lab/ }).first().click();
  await expect(calendar.locator('[data-calendar-region="participation-controls"]')).toContainText(
    "You are going. Task-tray reminders are on."
  );

  await calendar.getByRole("tab", { name: "My plans" }).click();
  const plans = calendar.locator('[data-calendar-region="plans-panel"]');
  await expect(plans.locator('[data-calendar-region="plan-card"]')).toContainText(
    "Community Calendar Participation Lab"
  );
  await expect(plans.locator('[data-calendar-region="plan-card"]')).toContainText(
    "Task-tray reminder on"
  );

  await calendar.getByRole("tab", { name: "Browse" }).click();
  await calendar.getByRole("button", { name: /Community Calendar Participation Lab/ }).first().click();
  await calendar.getByRole("button", { name: "Turn reminder off" }).click();
  await expect(calendar.locator('[data-calendar-region="participation-controls"]')).toContainText(
    "Task-tray reminders are off."
  );
  expect(await (await request.get("/api/calendar/participations/mine?reminders=1")).json()).toEqual([]);

  await calendar.getByRole("button", { name: "Clear my plan" }).click();
  await expect(calendar.locator('[data-calendar-region="participation-controls"]')).toContainText(
    "Nothing is shared until you choose."
  );
  harnessState = await (await request.get("/__test/state")).json();
  expect(harnessState.calendarParticipations).toEqual([]);
});
