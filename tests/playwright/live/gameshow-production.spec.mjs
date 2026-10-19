import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { actorById, readPuppetCredentials } from "../../e2e/puppets/runtime.mjs";
import { gameshowActor, gameshowJson } from "../../e2e/puppets/gameshow-stage.mjs";

// Explicit release proof only. No DB connection, role grants, wallet writes,
// submissions, judgments, public publication, or external messages are used.
const productionOrigin = "https://wtfos.app";
test.skip(process.env.WTF_GAMESHOW_PRODUCTION_SMOKE !== "1", "Set WTF_GAMESHOW_PRODUCTION_SMOKE=1 intentionally after the production deploy.");
test.use({ trace: "off", video: "off" });

async function productionCredentials(baseURL) {
  expect(new URL(baseURL).href, "This smoke targets only the canonical production app").toBe(`${productionOrigin}/`);
  expect(process.env.WTF_E2E_START_SERVER, "Never start a local server for production smoke").not.toBe("1");
  expect(process.env.WTF_E2E_PUPPET_CREDENTIALS_PATH, "Provide an explicit production credential file").toBeTruthy();
  const credentials = await readPuppetCredentials();
  expect(new URL(credentials.targetBaseUrl || credentials.target?.baseUrl).origin, "Credential target must explicitly match production").toBe(productionOrigin);
  expect(credentials.environment, "Local puppet credentials are never production credentials").toBe("production");
  return credentials;
}

async function typeField(locator, value) {
  await locator.click();
  await locator.press("ControlOrMeta+A");
  await locator.press("Backspace");
  await locator.pressSequentially(value);
  // Wrapped textarea labels include their changing text in accessible names.
  await locator.page().keyboard.press("Tab");
}

async function cleanupShow(operator, marker) {
  const matches = (await gameshowJson(await operator.request.get("/api/seasons"))).filter(season => season.name === marker);
  for (const season of matches) {
    const stage = await gameshowJson(await operator.request.get(`/api/gameshow/seasons/${season.id}/stage`));
    expect(stage.season.name, "Only this uniquely marked fixture may be removed").toBe(marker);
    expect(stage.season.status, "Do not delete a fixture another operator has started").toBe("upcoming");
    expect(stage.rounds.every(round => round.status === "upcoming" && round.submissionCount === 0)).toBe(true);
    for (const round of stage.rounds) {
      await gameshowJson(await operator.write("delete", `/api/rounds/${round.id}`));
      expect((await operator.request.get(`/api/rounds/${round.id}`)).status()).toBe(404);
    }
    await gameshowJson(await operator.write("delete", `/api/seasons/${season.id}`));
    expect((await operator.request.get(`/api/seasons/${season.id}`)).status()).toBe(404);
  }
}

test("production host composes a durable show and contestant opens its assigned workspace", async ({ playwright, browser, baseURL }, testInfo) => {
  const credentials = await productionCredentials(baseURL);
  const hostActor = actorById(credentials, "thecount");
  const contestantActor = actorById(credentials, "bert");
  const marker = `e2e-gameshow-${randomUUID()}`;
  const operator = await gameshowActor(playwright, baseURL, hostActor);
  const contestant = await gameshowActor(playwright, baseURL, contestantActor);
  let hostContext;
  let playerContext;
  try {
    const identity = await gameshowJson(await operator.request.get("/api/auth/user"));
    expect(identity.roles || [identity.role]).toContain("admin");
    const seasons = await gameshowJson(await operator.request.get("/api/seasons"));
    // A next unused season ordinal follows persisted state, not a test default.
    const number = Math.max(0, ...seasons.map(season => season.number)) + 1;
    hostContext = await browser.newContext({ baseURL, storageState: await operator.request.storageState() });
    const page = await hostContext.newPage();
    await page.goto("/gamma/control-board");
    await page.getByText("Build Rounds", { exact: true }).click();
    const builder = page.getByRole("region", { name: "Round builder", exact: true });
    await expect(builder).toBeVisible();
    await builder.getByText("Create another ten-round show", { exact: true }).click();
    await typeField(builder.getByLabel("Show name", { exact: true }), marker);
    await typeField(builder.getByLabel("Season number", { exact: true }), String(number));
    const createdResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/gameshow/seasons" && response.request().method() === "POST");
    await builder.getByRole("button", { name: "Create ten-round show", exact: true }).click();
    const season = await gameshowJson(await createdResponse);
    expect(season.roundIds).toHaveLength(10);
    const roundId = season.roundIds[0];
    const roundName = `${marker} preparation`;
    const instructions = "Rehearsal only: open Broot and Studio to inspect the assigned workspace. Do not publish publicly, submit evidence, or perform wallet actions.";
    await expect(builder.getByText("Saved revision 0", { exact: true })).toBeVisible();
    await typeField(builder.getByLabel("Round name", { exact: true }), roundName);
    await typeField(builder.getByLabel("Round objective", { exact: true }), "Verify saved producer instructions and assigned software.");
    await typeField(builder.getByLabel("Round rules, scoring, ties, and elimination", { exact: true }), "Isolated preparation proof only. No game scoring, prizes, fees, elimination, or live round opening.");
    await builder.getByRole("button", { name: "Add contestant step", exact: true }).click();
    await typeField(builder.getByLabel("Step 1 name", { exact: true }), "Prepare your creative workspace");
    await typeField(builder.getByLabel("Step 1 instructions", { exact: true }), instructions);
    await typeField(builder.getByLabel("Step 1 judging criteria", { exact: true }), "Preparation proof; no contestant judgment will be recorded.");
    const toolChoices = builder.getByRole("group", { name: "Tools for step 1", exact: true });
    await toolChoices.getByRole("checkbox", { name: /Broot canvas & paint/ }).check();
    await toolChoices.getByRole("checkbox", { name: /Studio projects/ }).check();
    const savedResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/gameshow/rounds/${roundId}/plan` && response.request().method() === "PUT");
    await builder.getByRole("button", { name: "Save round preparation", exact: true }).click();
    const saved = await gameshowJson(await savedResponse);
    expect(saved).toMatchObject({ roundId, revision: 1, status: "upcoming", name: roundName });
    expect(saved.tasks).toHaveLength(1);
    expect(saved.tasks[0]).toMatchObject({ description: instructions, tools: ["paint", "studio"] });
    expect(saved.tasks[0].id).toBeGreaterThan(0);
    await gameshowJson(await operator.write("post", `/api/seasons/${season.id}/contestants`, { username: contestantActor.username, status: "active" }));

    await page.goto(`/gamma/control-board?seasonId=${season.id}`);
    await page.getByText("Build Rounds", { exact: true }).click();
    await expect(builder.getByText("Saved revision 1", { exact: true })).toBeVisible();
    await expect(builder.getByLabel("Round name", { exact: true })).toHaveValue(roundName);
    const persisted = await gameshowJson(await operator.request.get(`/api/gameshow/rounds/${roundId}/plan`));
    expect(persisted.tasks[0].id).toBe(saved.tasks[0].id);
    expect(persisted.tasks[0].tools).toEqual(["paint", "studio"]);
    await page.getByText("Progress Sheet", { exact: true }).click();
    const sheet = page.getByRole("region", { name: "Contestant progress sheet", exact: true });
    await expect(sheet.getByText("1 contestants · 10 rounds. Scroll across to compare rounds.", { exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: `Inspect ${contestantActor.username} round 1`, exact: true })).toContainText("0/1 entries");
    const progress = await gameshowJson(await operator.request.get(`/api/gameshow/seasons/${season.id}/progress`));
    expect(progress.rows.find(row => row.username === contestantActor.username)?.totals).toMatchObject({ taskCount: 1, submissionCount: 0, pendingCount: 0, passCount: 0, failCount: 0, bonusCount: 0 });
    const csvEvent = page.waitForEvent("download");
    await sheet.getByRole("button", { name: "Export progress CSV", exact: true }).click();
    const csv = await csvEvent;
    expect(await readFile(await csv.path(), "utf8")).toContain(`"${contestantActor.username}"`);
    await sheet.getByRole("button", { name: `Inspect ${contestantActor.username} round 1`, exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("production-host-progress.png") });

    playerContext = await browser.newContext({ baseURL, storageState: await contestant.request.storageState() });
    const player = await playerContext.newPage();
    await player.goto(`/gamma/rounds/${roundId}`);
    const desk = player.getByTestId("contestant-desk");
    await expect(desk.getByText(instructions, { exact: true })).toBeVisible();
    await expect(desk.getByText("Active contestant", { exact: true })).toBeVisible();
    const task = desk.getByTestId(`contestant-challenge-${saved.tasks[0].id}`);
    expect(await task.locator("[data-gameshow-tool]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-gameshow-tool")))).toEqual(["paint", "studio"]);
    await expect(task.getByRole("button", { name: "Open Broot canvas & paint", exact: true })).toBeEnabled();
    await expect(task.getByRole("button", { name: "Open Studio projects", exact: true })).toBeEnabled();
    await expect(task.getByText("Submissions are not open for you. Check your show status and the host’s next cue above.", { exact: true })).toBeVisible();
    await expect(desk.getByTestId("contestant-workspace")).toBeVisible();
    await player.reload();
    await expect(player.getByTestId(`contestant-challenge-${saved.tasks[0].id}`).getByText(instructions, { exact: true })).toBeVisible();
    expect((await contestant.request.get(`/api/gameshow/seasons/${season.id}/progress`)).status()).toBe(403);
    const stage = await gameshowJson(await contestant.request.get(`/api/gameshow/seasons/${season.id}/stage`));
    expect(stage.me.canSubmit).toBe(false);
    expect(stage.me.submissions).toEqual([]);
    expect(stage.rounds.every(round => round.status === "upcoming")).toBe(true);
    await player.getByTestId("contestant-workspace").getByRole("button", { name: "Open Project files", exact: true }).scrollIntoViewIfNeeded();
    await player.screenshot({ path: testInfo.outputPath("production-contestant-workspace.png") });
    await testInfo.attach("production-show-proof", { body: JSON.stringify({ seasonId: season.id, roundId, taskId: saved.tasks[0].id, revision: persisted.revision, rounds: stage.rounds.length, recordedEntries: 0, automaticScoring: false }), contentType: "application/json" });
  } finally {
    await playerContext?.close();
    await hostContext?.close();
    try { await cleanupShow(operator, marker); }
    finally { await contestant.request.dispose(); await operator.request.dispose(); }
  }
});

test("production private publishing persists and enforces owner, admin, outsider, and anonymous access", async ({ playwright, browser, baseURL }, testInfo) => {
  const credentials = await productionCredentials(baseURL);
  const ownerId = process.env.WTF_GAMESHOW_PRIVATE_OWNER_ACTOR;
  expect(ownerId, "Select a real eligible puppet actor with WTF_GAMESHOW_PRIVATE_OWNER_ACTOR; do not bypass site identity requirements").toBeTruthy();
  const ownerActor = actorById(credentials, ownerId);
  expect(ownerActor.id, "Owner and administrator must be different actors").not.toBe("thecount");
  expect(ownerActor.id, "Owner and denied actor must be different actors").not.toBe("ernie");
  const owner = await gameshowActor(playwright, baseURL, ownerActor);
  const administrator = await gameshowActor(playwright, baseURL, actorById(credentials, "thecount"));
  const outsider = await gameshowActor(playwright, baseURL, actorById(credentials, "ernie"));
  const anonymous = await playwright.request.newContext({ baseURL });
  const slug = `e2e-gameshow-${randomUUID()}`;
  const title = `${slug} private proof`;
  const body = `Private rehearsal content ${slug}. This page is temporary and contains no contestant work.`;
  const contexts = [];
  let site;
  let claimed = false;
  let pageId;
  let publicBefore;
  try {
    let state = await gameshowJson(await owner.request.get("/api/wtf-sites/my"));
    if (!state.site) {
      expect(process.env.WTF_GAMESHOW_ALLOW_PUPPET_SITE_CLAIM, "No test site exists; claiming an eligible puppet's normal host requires explicit opt-in").toBe("1");
      expect(state.eligibility.canClaim, "The normal product must consider the actor eligible before claiming").toBe(true);
      state = await gameshowJson(await owner.write("post", "/api/wtf-sites/claim"));
      claimed = true;
    }
    site = state.site;
    expect(site, "A claimed puppet site is required for the positive private publication proof").toBeTruthy();
    expect(site.status, "Never modify a suspended site").not.toBe("suspended");
    expect(new URL(`https://${site.host}`).hostname.endsWith(".wtfos.me")).toBe(true);
    expect(site.pages.some(page => page.slug === slug), "Never overwrite an existing page").toBe(false);
    publicBefore = { status: site.status, publishedAt: site.publishedAt, versionIds: site.versions.map(version => version.id) };

    const ownerContext = await browser.newContext({ baseURL, storageState: await owner.request.storageState() });
    contexts.push(ownerContext);
    const page = await ownerContext.newPage();
    await page.goto("/gamma/wtf-subdomains");
    await expect(page.getByText("username.wtfos.me Sites", { exact: true })).toBeVisible();
    await expect(page.getByLabel("New page audience", { exact: true })).toHaveValue("private");
    await typeField(page.getByPlaceholder("project", { exact: true }), slug);
    await typeField(page.getByPlaceholder("Project", { exact: true }), title);
    await typeField(page.getByLabel("New page text", { exact: true }), body);
    const createResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/wtf-sites/pages" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Create page", exact: true }).click();
    const createdState = await gameshowJson(await createResponse);
    const createdPage = createdState.site.pages.find(item => item.slug === slug);
    expect(createdPage).toMatchObject({ title, visibility: "private", privatePublishedAt: null });
    pageId = createdPage.id;
    await expect(page.getByRole("button", { name: "Open private page", exact: true })).toBeDisabled();
    const publishResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/wtf-sites/pages/${slug}/publish-private` && response.request().method() === "POST");
    await page.getByRole("button", { name: "Publish private page", exact: true }).click();
    await gameshowJson(await publishResponse);
    const persisted = await gameshowJson(await owner.request.get("/api/wtf-sites/my"));
    const published = persisted.site.pages.find(item => item.id === pageId);
    expect(published).toMatchObject({ slug, title, visibility: "private" });
    expect(published.privatePublishedAt).toBeTruthy();
    expect({ status: persisted.site.status, publishedAt: persisted.site.publishedAt, versionIds: persisted.site.versions.map(version => version.id) }).toEqual(publicBefore);
    expect(persisted.site.versions.every(version => !version.pageSlugs.includes(slug))).toBe(true);

    const privateUrl = `https://${site.host}/_private/${slug}`;
    const ownerPopupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Open private page", exact: true }).click();
    const ownerPopup = await ownerPopupPromise;
    await expect(ownerPopup).toHaveURL(privateUrl);
    await expect(ownerPopup.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(ownerPopup.getByText(body, { exact: true })).toBeVisible();
    const reloaded = await ownerPopup.reload();
    expect(reloaded.status()).toBe(200);
    expect(reloaded.headers()["cache-control"]).toContain("no-store");
    expect(reloaded.headers()["content-security-policy"]).toContain("sandbox allow-scripts");
    await expect(ownerPopup.getByText(body, { exact: true })).toBeVisible();
    await ownerPopup.screenshot({ path: testInfo.outputPath("production-private-owner.png") });

    // Exercise the platform's actual cross-origin POST helper and production CSP.
    // The session-scoped ticket stays inside the browser; never attach its body.
    const adminContext = await browser.newContext({ baseURL, storageState: await administrator.request.storageState() });
    contexts.push(adminContext);
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`/gamma/wtf-subdomains?privateHost=${encodeURIComponent(site.host)}&privatePage=${slug}`);
    const adminPopupPromise = adminPage.waitForEvent("popup");
    await adminPage.getByRole("button", { name: "Open requested private page", exact: true }).click();
    const adminPopup = await adminPopupPromise;
    await expect(adminPopup).toHaveURL(privateUrl);
    await expect(adminPopup.getByText(body, { exact: true })).toBeVisible();

    expect((await outsider.write("post", "/api/wtf-sites/private-access", { host: site.host, slug })).status()).toBe(403);
    expect((await anonymous.post("/api/wtf-sites/private-access", { data: { host: site.host, slug } })).status()).toBe(401);
    const denied = await anonymous.get(privateUrl);
    expect(denied.status()).toBe(401);
    expect(await denied.text()).not.toContain(body);
    const publicProjection = await anonymous.get(`https://${site.host}/${slug}`, { maxRedirects: 0 });
    expect(publicProjection.status()).not.toBe(200);
    expect(await publicProjection.text()).not.toContain(body);
    await testInfo.attach("production-private-proof", { body: JSON.stringify({ ownerActor: ownerId, siteId: site.id, host: site.host, pageId, visibility: "private", ownerRead: true, adminRead: true, outsiderStatus: 403, anonymousStatus: 401, publicVersionUnchanged: true, claimedPuppetHostRetained: claimed }), contentType: "application/json" });
  } finally {
    for (const context of contexts) await context.close();
    try {
      if (site) {
        // Reconcile after a lost create response, but only remove the exact
        // private sentinel this test authored. Existing pages remain untouched.
        const state = await gameshowJson(await owner.request.get("/api/wtf-sites/my"));
        expect(state.site.id).toBe(site.id);
        const created = state.site.pages.find(item => item.slug === slug);
        if (created) {
          expect(created.title).toBe(title);
          expect(created.visibility).toBe("private");
          expect(created.draftHtml).toContain(body);
          if (pageId !== undefined) expect(created.id).toBe(pageId);
          await gameshowJson(await owner.write("delete", `/api/wtf-sites/pages/${slug}`));
          const cleaned = await gameshowJson(await owner.request.get("/api/wtf-sites/my"));
          expect(cleaned.site.pages.some(item => item.slug === slug)).toBe(false);
          expect({ status: cleaned.site.status, publishedAt: cleaned.site.publishedAt, versionIds: cleaned.site.versions.map(version => version.id) }).toEqual(publicBefore);
        }
      }
    } finally {
      await anonymous.dispose();
      await outsider.request.dispose();
      await administrator.request.dispose();
      await owner.request.dispose();
    }
  }
});
