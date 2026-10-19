import { devices, expect, test } from "@playwright/test";

// These fixture-backed checks prove UI behavior. The live puppet and PostgreSQL
// lifecycle tests own permission enforcement, atomic writes, and durable results.
function makeStage(canManage, status = "upcoming") {
  const rounds = Array.from({ length: 10 }, (_, index) => ({
    id: index + 1, number: index + 1, seasonId: 1, name: `Configured round ${index + 1}`,
    description: "Browser rehearsal fixture; the producer supplies the actual lineup.",
    status: index === 0 ? status : "upcoming", rules: "Submit the requested evidence once. The host reviews against the published criteria.",
    startDate: null, endDate: null, submissionCount: 0, pendingCount: 0,
    challenges: [{ id: index + 101, roundId: index + 1, title: `Configured challenge ${index + 1}`,
      description: "Enter the answer requested by the host.", criteria: "The response must satisfy the announced game rule.",
      rules: "One response per contestant.", status: index === 0 && status === "active" ? "active" : "draft",
      tools: ["paint", "studio"], tokenMonitor: null,
      deadline: null, rewardXp: 0, rewardAmountWtf: 0, submissionCount: 0, pendingCount: 0 }],
  }));
  return {
    season: { id: 1, name: "Browser rehearsal", number: 1, status: status === "upcoming" ? "upcoming" : "active", description: null, anteWtfRequired: "0" },
    rounds, currentRoundId: status === "upcoming" ? null : 1, canManage,
    me: { contestant: { id: 1, status: "active", antePaidWtf: "0", anteSatisfied: true }, submissions: [], canSubmit: status === "active", blockers: status === "active" ? [] : ["Wait for the host to open the next round."] },
    contestants: [{ id: 1, userId: 2, username: "wtf-user", displayName: "WTF User", status: "active" }],
    submissions: [],
  };
}

async function installStage(page, show) {
  await page.route("**/api/seasons", route => route.fulfill({ json: [show.season] }));
  await page.route("**/api/rounds?**", route => route.fulfill({ json: show.rounds }));
  await page.route(/\/api\/rounds\/\d+$/, route => {
    const id = Number(new URL(route.request().url()).pathname.split("/").pop());
    return route.fulfill({ json: show.rounds.find(round => round.id === id) });
  });
  await page.route(/\/api\/challenges(?:\?.*)?$/, route => {
    const roundId = Number(new URL(route.request().url()).searchParams.get("roundId"));
    return route.fulfill({ json: show.rounds.filter(round => !roundId || round.id === roundId).flatMap(round => round.challenges) });
  });
  await page.route("**/api/seasons/1/contestants", route => route.fulfill({ json: show.contestants }));
  await page.route("**/api/control-board/feed?**", route => route.fulfill({ json: { feed: [], drafts: [] } }));
  await page.route("**/api/gameshow/seasons/1/stage", route => route.fulfill({ json: show }));
}

async function prepare(request, userRole) {
  const response = await request.post("/__test/state", { data: { userRole, ownedAppPasses: "all", welcomePending: false } });
  expect(response.ok()).toBeTruthy();
}

async function expectNoHorizontalOverflow(surface) {
  const metrics = await surface.evaluate(node => ({ client: node.clientWidth, scroll: node.scrollWidth,
    left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, viewport: window.innerWidth }));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
  expect(metrics.left).toBeGreaterThanOrEqual(0);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewport);
}

test.describe("interaction inventory - gameshow host and contestant stage", () => {
  test("host cues, reviews, and archives a round inside Control Board", async ({ page, request }, testInfo) => {
    await prepare(request, "admin");
    const show = makeStage(true);
    await installStage(page, show);
    const cues = [];
    await page.route(/\/api\/rounds\/1\/(start|close|advance)$/, async route => {
      const action = new URL(route.request().url()).pathname.split("/").pop();
      cues.push(action);
      const round = show.rounds[0];
      round.status = { start: "active", close: "grading", advance: "completed" }[action];
      round.challenges[0].status = round.status;
      show.season.status = "active";
      show.currentRoundId = action === "advance" ? null : 1;
      if (action === "close") {
        show.submissions = [{ id: 501, challengeId: 101, userId: 2, username: "wtf-user", contentText: "My recorded response", contentUrl: null, submittedAt: new Date().toISOString(), grade: "pending", feedback: null }];
        round.submissionCount = round.pendingCount = round.challenges[0].submissionCount = round.challenges[0].pendingCount = 1;
      }
      await route.fulfill({ json: round });
    });
    await page.route("**/api/submissions/501/grade", async route => {
      const decision = route.request().postDataJSON();
      expect(decision).toEqual({ grade: "pass", feedback: "Matches the published criteria." });
      Object.assign(show.submissions[0], decision);
      show.rounds[0].pendingCount = show.rounds[0].challenges[0].pendingCount = 0;
      await route.fulfill({ json: show.submissions[0] });
    });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/gamma/control-board", { waitUntil: "domcontentloaded" });
    const host = page.getByRole("region", { name: "Host show console" });
    await expect(host).toBeVisible();
    await expect(host.getByText("Ten round slots are present.", { exact: false })).toBeVisible();
    await expect(host.locator('section[aria-label="Host run sheet"] summary')).toHaveCount(10);
    await host.getByText("How to host this show", { exact: true }).click();
    await expect(host.getByText(/Prepare the rules and challenges, enroll contestants/)).toBeVisible();
    await host.getByRole("button", { name: "Start round 1", exact: true }).click();
    await expect(host.getByRole("button", { name: "Close round 1 entries" })).toBeVisible();
    await host.getByRole("button", { name: "Close round 1 entries" }).click();
    await expect(host.getByRole("button", { name: "Archive round 1", exact: true })).toBeDisabled();
    await host.getByLabel("Decision notes for wtf-user").fill("Matches the published criteria.");
    await host.getByRole("button", { name: "Save result for wtf-user" }).click();
    await expect(host.getByRole("button", { name: "Archive round 1", exact: true })).toBeEnabled();
    await host.getByRole("button", { name: "Archive round 1", exact: true }).click();
    await expect(host.getByRole("button", { name: "Start round 2", exact: true })).toBeVisible();
    await host.locator('section[aria-label="Host run sheet"] summary').first().click();
    await expect(host.getByText("wtf-user: pass — Matches the published criteria.")).toBeVisible();
    expect(cues).toEqual(["start", "close", "advance"]);
    await page.setViewportSize(devices["iPhone 13"].viewport);
    await expectNoHorizontalOverflow(host);
    await host.getByRole("heading", { name: "Run the show", exact: true }).evaluate(node => node.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: testInfo.outputPath("host-narrow.png") });
    expect(errors).toEqual([]);
  });

  test("contestant reads help, submits once, and recovers the visible receipt after refresh", async ({ page, request }, testInfo) => {
    await prepare(request, "contestant");
    const show = makeStage(false, "active");
    await installStage(page, show);
    const submissions = [];
    await page.route("**/api/challenges/101/submit", async route => {
      const body = route.request().postDataJSON();
      submissions.push(body);
      const submission = { id: 501, challengeId: 101, userId: 2, username: "wtf-user", ...body, submittedAt: new Date().toISOString(), grade: "pending", feedback: null };
      show.me.submissions = [submission];
      show.me.canSubmit = false;
      show.me.blockers = ["You have submitted every open challenge, or its deadline has passed."];
      await route.fulfill({ json: submission });
    });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize(devices["iPhone 13"].viewport);
    await page.goto("/gamma/rounds?seasonId=1", { waitUntil: "domcontentloaded" });
    const desk = page.getByTestId("contestant-desk");
    await expect(desk).toBeVisible();
    await expect(desk.getByText("Active contestant", { exact: true })).toBeVisible();
    await expect(desk.getByText("Open for play", { exact: true }).first()).toBeVisible();
    await expect(desk.getByRole("button", { name: "Open host control board" })).toHaveCount(0);
    const taskTools = desk.getByLabel("Tools for this task", { exact: true });
    await expect(taskTools.getByRole("button", { name: "Open Broot canvas & paint", exact: true })).toBeEnabled();
    await expect(taskTools.getByRole("button", { name: "Open Studio projects", exact: true })).toBeEnabled();
    await expect(desk.getByTestId("contestant-workspace")).toBeVisible();
    const help = desk.getByRole("button", { name: "How the contestant desk works" });
    await help.focus();
    await expect(desk.getByRole("tooltip")).toContainText("Read the rules");
    await help.press("Escape");
    await expect(desk.getByRole("tooltip")).toHaveCount(0);
    await help.click();
    await expect(desk.getByRole("tooltip")).toBeVisible();
    await help.press("Escape");
    await expectNoHorizontalOverflow(desk);
    await desk.getByLabel("Your response", { exact: true }).fill("My browser rehearsal answer");
    await desk.getByRole("button", { name: "Submit response for Configured challenge 1" }).click();
    await expect(desk.getByTestId("contestant-submission-receipt")).toContainText("Response recorded");
    await expect(desk.getByRole("button", { name: "Submit response for Configured challenge 1" })).toHaveCount(0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(desk.getByTestId("contestant-submission-receipt")).toContainText("My browser rehearsal answer");
    expect(submissions).toEqual([{ contentText: "My browser rehearsal answer", contentUrl: null }]);
    await desk.getByTestId("contestant-submission-receipt").evaluate(node => node.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: testInfo.outputPath("contestant-narrow.png") });
    await desk.getByRole("button", { name: "Read round 1", exact: true }).click();
    await expect(page).toHaveURL(/\/gamma\/rounds\/1$/);
    await expect(desk.getByTestId("contestant-submission-receipt")).toContainText("My browser rehearsal answer");
    await desk.getByRole("button", { name: "Return to contestant desk" }).click();
    await expect(page).toHaveURL(/\/gamma\/rounds\?seasonId=1$/);
    expect(errors).toEqual([]);
  });

  test("contestant tool handoffs use canonical routes and explain unavailable apps", async ({ page, request }) => {
    await prepare(request, "contestant");
    await installStage(page, makeStage(false, "active"));
    await page.route("**/api/apps/desktop", async route => {
      const response = await route.fetch();
      const availability = await response.json();
      availability.apps.studio = false;
      await route.fulfill({ json: availability });
    });
    await page.goto("/gamma/rounds?seasonId=1", { waitUntil: "domcontentloaded" });
    const desk = page.getByTestId("contestant-desk");
    const taskTools = desk.getByLabel("Tools for this task", { exact: true });
    const studio = taskTools.locator('[data-gameshow-tool="studio"]');
    await expect(studio.getByRole("button", { name: "Open Studio projects", exact: true })).toBeDisabled();
    await expect(studio).toContainText("Ask the host to provision your show tools.");
    const workspace = desk.getByTestId("contestant-workspace");
    await workspace.getByText("More creative & Pasta tools", { exact: true }).click();
    await expect(workspace.locator('[data-gameshow-tool="rotini"]')).toBeVisible();
    await expect(workspace.locator('[data-gameshow-tool="files"]')).toContainText("Save the project file as well as its finished export.");
    await taskTools.getByRole("button", { name: "Open Broot canvas & paint", exact: true }).click();
    await expect(page).toHaveURL(/\/gamma\/tools\/broot$/);
    await expect(page.frameLocator('iframe[title="Broot"]').getByLabel("Broot editor")).toBeVisible();
  });
});
