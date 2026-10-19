import { readFile } from "node:fs/promises";
import { devices, expect, test } from "@playwright/test";

// Mutable transport fixtures prove these production screens' behavior. The live
// puppet and PostgreSQL tests own real permissions, concurrency and persistence.
function productionFixture() {
  const season = { id: 1, name: "Producer browser proof", number: 1, status: "upcoming", description: null, anteWtfRequired: "0" };
  const contestants = [
    { id: 1, userId: 2, username: "alpha", displayName: "Alpha Player", status: "active" },
    { id: 2, userId: 3, username: "beta", displayName: "Beta Player", status: "reserve" },
    { id: 3, userId: 4, username: "retired", displayName: "Retired Player", status: "eliminated" },
  ];
  const rounds = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, number: index + 1, name: `Round ${index + 1} preparation`,
    description: null, rules: null, status: "upcoming", startDate: null, endDate: null, challenges: [], submissionCount: 0, pendingCount: 0 }));
  const show = { season, rounds, currentRoundId: null, canManage: true, contestants,
    me: { contestant: null, submissions: [], canSubmit: false, blockers: ["You are operating the show."] }, submissions: [] };
  let plan = { roundId: 1, seasonId: 1, revision: 0, status: "upcoming", name: rounds[0].name, description: null, rules: null,
    tasks: [{ id: 101, title: "Existing step", description: "Existing instructions", criteria: "Existing criterion", rules: null, deadline: null, tools: [], tokenMonitor: null }] };
  const calls = { saves: [], creations: [], provisions: [] };
  let nextTaskId = 1001;
  let failProgress = false;
  const timestamp = "2026-10-18T18:00:00.000Z";
  const walletAddress = "tz1" + "A".repeat(33);
  const contract = "KT1" + "B".repeat(33);
  const progressRounds = rounds.map(round => ({ id: round.id, number: round.number, name: round.name, status: round.id === 1 ? "grading" : "upcoming", taskCount: 2, tokenMonitoring: round.id === 1 }));
  const counts = (submitted = 0, pending = 0, pass = 0, bonus = 0) => ({ taskCount: 2, submissionCount: submitted, pendingCount: pending, passCount: pass, failCount: 0, bonusCount: bonus });
  const progress = { seasonId: 1, generatedAt: timestamp, rounds: progressRounds, rows: contestants.slice(0, 2).map((person, index) => ({ ...person,
    wallets: index === 0 ? [{ address: walletAddress, isPrimary: true, linkedAt: timestamp, syncStatus: "ok", lastSyncedAt: timestamp, backfilled: true, error: null, identityNetwork: "mainnet", eventNetwork: "per-event" }] : [],
    totals: { ...counts(index + 1, index === 0 ? 1 : 0, index, index), taskCount: 20 },
    rounds: progressRounds.map(round => ({ roundId: round.id, ...counts(round.id === 1 ? index + 1 : 0, round.id === 1 && index === 0 ? 1 : 0, round.id === 1 ? index : 0, round.id === 1 ? index : 0), tasks: [],
      tokenActivity: round.id !== 1 ? { status: "not_configured", observedCount: null, verifiedCount: null }
        : index === 0 ? { status: "incomplete", observedCount: 2, verifiedCount: 1 } : { status: "unavailable", observedCount: null, verifiedCount: null } })),
  })), tokenEvidence: [
    { id: 41, roundId: 1, challengeIds: [101], userId: 2, walletAddress, tokenContract: contract, tokenId: "7", type: "token_mint", amount: "9007199254740993123", timestamp, opHash: "operation-proof", name: "Verified preview token", thumbnailUri: "https://gameshow.example/preview.png", explorerUrl: "https://tzkt.io/operation-proof", tokenUrl: `https://objkt.com/tokens/${contract}/7`, network: "mainnet", source: "https://api.tzkt.io/v1" },
    { id: 42, roundId: 1, challengeIds: [101], userId: 2, walletAddress, tokenContract: contract, tokenId: "8", type: "token_transfer_in", amount: "1", timestamp, opHash: null, name: "Historical observation", thumbnailUri: null, explorerUrl: null, tokenUrl: null, network: "unverified", source: null },
  ], source: { kind: "persisted-wallet-index", automaticGrading: false, refreshPath: "/api/cockpit/sync/:wallet" } };
  function updateStage() {
    Object.assign(rounds[0], { name: plan.name, description: plan.description, rules: plan.rules,
      challenges: plan.tasks.map(task => ({ ...task, status: "draft", rewardXp: 0, rewardAmountWtf: 0, submissionCount: 0, pendingCount: 0 })) });
  }
  updateStage();
  return { show, calls, progress, getPlan: () => structuredClone(plan), failProgress: () => { failProgress = true; },
    externalEdit: () => { plan = { ...plan, revision: plan.revision + 1, name: "Co-producer saved revision" }; updateStage(); },
    async install(page) {
      await page.route("**/api/seasons", route => route.fulfill({ json: [season] }));
      await page.route("**/api/rounds?**", route => route.fulfill({ json: rounds }));
      await page.route("**/api/seasons/1/contestants", route => route.fulfill({ json: contestants }));
      await page.route("**/api/control-board/feed?**", route => route.fulfill({ json: { feed: [], drafts: [] } }));
      await page.route("**/api/gameshow/seasons/1/stage", route => route.fulfill({ json: show }));
      await page.route("**/api/gameshow/rounds/1/plan", async route => {
        if (route.request().method() === "PUT") {
          const input = route.request().postDataJSON();
          calls.saves.push(input);
          if (input.expectedRevision !== plan.revision) return route.fulfill({ status: 409, json: { error: "This plan changed in another session. Reload it before saving." } });
          const { expectedRevision, ...editable } = input;
          plan = { roundId: 1, seasonId: 1, status: "upcoming", ...editable, revision: expectedRevision + 1,
            tasks: editable.tasks.map(task => ({ ...task, id: task.id ?? nextTaskId++ })) };
          updateStage();
        }
        return route.fulfill({ json: plan });
      });
      await page.route("**/api/gameshow/seasons", async route => {
        calls.creations.push(route.request().postDataJSON());
        return route.fulfill({ status: 201, json: { id: 1, roundIds: rounds.map(round => round.id) } });
      });
      await page.route("**/api/gameshow/seasons/1/progress", route => failProgress
        ? route.fulfill({ status: 503, json: { error: "Progress index temporarily unavailable" } }) : route.fulfill({ json: progress }));
      await page.route(/\/api\/gameshow\/seasons\/1\/contestants\/\d+\/provision$/, route => {
        const userId = Number(new URL(route.request().url()).pathname.split("/").at(-2));
        const body = route.request().postDataJSON();
        calls.provisions.push({ userId, body });
        return route.fulfill({ json: { seasonId: 1, userId, roles: ["witness", "contestant"], grantedRole: true, grantedAppKeys: body.appKeys,
          tools: body.appKeys.map(appKey => ({ appKey, sku: `app:${appKey}`, owned: true, globallyAvailable: appKey !== "pasta-protocol" })) } });
      });
      await page.route("https://gameshow.example/preview.png", route => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") }));
    },
  };
}

async function openHost(page, request, fixture) {
  expect((await request.post("/__test/state", { data: { userRole: "admin", ownedAppPasses: "all", welcomePending: false } })).ok()).toBeTruthy();
  await fixture.install(page);
  await page.goto("/gamma/control-board", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "Host show console" })).toBeVisible();
}

async function typeAndBlur(locator, text) {
  await locator.click();
  await locator.press("ControlOrMeta+A");
  await locator.press("Backspace");
  await locator.pressSequentially(text);
  // Keep the native focus transition on the typed element; textarea text nodes
  // can change a wrapping label's locator text while typing is in progress.
  await locator.page().keyboard.press("Tab");
}

async function expectNoOverflow(surface) {
  const size = await surface.evaluate(node => ({ client: node.clientWidth, scroll: node.scrollWidth, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, viewport: innerWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.client);
  expect(size.left).toBeGreaterThanOrEqual(0);
  expect(size.right).toBeLessThanOrEqual(size.viewport);
}

test.describe("interaction inventory - gameshow production tools", () => {
  test("host types and reloads an ordered plan, reviews an agent draft, and recovers a stale revision", async ({ page, request }, testInfo) => {
    const fixture = productionFixture();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await openHost(page, request, fixture);
    await page.getByText("Build Rounds", { exact: true }).click();
    const builder = page.getByRole("region", { name: "Round builder" });
    await expect(builder.getByLabel("Round name", { exact: true })).toHaveValue("Round 1 preparation");
    await typeAndBlur(builder.getByLabel("Round name", { exact: true }), "Producer authored round");
    await typeAndBlur(builder.getByLabel("Round objective", { exact: true }), "Make and submit a project artifact.");
    await typeAndBlur(builder.getByLabel("Round rules, scoring, ties, and elimination"), "Host will publish the final judging policy before starting.");
    await builder.getByRole("button", { name: "Add contestant step" }).click();
    await typeAndBlur(builder.getByLabel("Step 2 name", { exact: true }), "Capture project proof");
    await typeAndBlur(builder.getByLabel("Step 2 instructions", { exact: true }), "Open your project and record its evidence link.");
    await typeAndBlur(builder.getByLabel("Step 2 judging criteria", { exact: true }), "The link must open the requested artifact.");
    const tools = builder.getByRole("group", { name: "Tools for step 2", exact: true });
    await tools.getByRole("checkbox", { name: /Wallet connections/ }).check();
    await tools.getByRole("checkbox", { name: /Studio projects/ }).check();
    await builder.getByRole("button", { name: "Move step 2 up", exact: true }).click();
    await expect(builder.getByLabel("Step 1 name", { exact: true })).toHaveValue("Capture project proof");
    await builder.getByRole("button", { name: "Save round preparation", exact: true }).click();
    await expect(builder.getByText("Saved revision 1", { exact: true })).toBeVisible();
    expect(fixture.calls.saves[0].tasks.map(task => task.title)).toEqual(["Capture project proof", "Existing step"]);
    expect(fixture.calls.saves[0].tasks[0].tools).toEqual(["wallets", "studio"]);
    const ids = fixture.getPlan().tasks.map(task => task.id);
    expect(ids).toEqual([1001, 101]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Build Rounds", { exact: true }).click();
    await expect(builder.getByLabel("Round name", { exact: true })).toHaveValue("Producer authored round");
    await expect(builder.getByLabel("Step 1 name", { exact: true })).toHaveValue("Capture project proof");
    await expect(builder.getByRole("group", { name: "Tools for step 1", exact: true }).getByRole("checkbox", { name: /Studio projects/ })).toBeChecked();
    await builder.getByText("Work with an agent", { exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await builder.getByRole("button", { name: "Export round JSON", exact: true }).click();
    const exported = JSON.parse(await readFile(await (await downloadPromise).path(), "utf8"));
    expect(exported.expectedRevision).toBe(1);
    expect(exported.tasks.map(task => task.id)).toEqual(ids);
    await builder.getByLabel("Agent round draft").fill(JSON.stringify({ ...exported, tasks: [{ ...exported.tasks[0], tools: ["unknown-tool"] }] }));
    await builder.getByRole("button", { name: "Load agent draft for review" }).click();
    await expect(builder.getByRole("status")).toContainText("tasks.0.tools.0");
    expect(fixture.calls.saves).toHaveLength(1);
    const imported = { ...exported, name: "Agent proposal reviewed by host" };
    await builder.getByLabel("Agent round draft").fill(JSON.stringify(imported));
    await builder.getByRole("button", { name: "Load agent draft for review" }).click();
    await expect(builder.getByLabel("Round name", { exact: true })).toHaveValue(imported.name);
    await expect(builder.getByText(/Agent draft loaded for your review/)).toBeVisible();
    expect(fixture.calls.saves).toHaveLength(1);
    await builder.getByRole("button", { name: "Save round preparation", exact: true }).click();
    await expect(builder.getByText("Saved revision 2", { exact: true })).toBeVisible();
    expect(fixture.getPlan().tasks.map(task => task.id)).toEqual(ids);
    await typeAndBlur(builder.getByLabel("Round name", { exact: true }), "Unsaved local change");
    fixture.externalEdit();
    await builder.getByRole("button", { name: "Save round preparation", exact: true }).click();
    await expect(builder.getByRole("alert")).toContainText("another session");
    await expect(builder.getByLabel("Round name", { exact: true })).toHaveValue("Unsaved local change");
    await builder.getByRole("button", { name: "Discard draft & reload saved round", exact: true }).click();
    await expect(builder.getByLabel("Round name", { exact: true })).toHaveValue("Co-producer saved revision");
    await expect(builder.getByText("Saved revision 3", { exact: true })).toBeVisible();
    await expect(builder.getByRole("button", { name: "Save round preparation", exact: true })).toBeDisabled();
    await page.setViewportSize(devices["iPhone 13"].viewport);
    await expectNoOverflow(builder);
    await builder.getByRole("heading", { name: "Build the rounds" }).evaluate(node => node.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: testInfo.outputPath("round-builder-narrow.png") });
    expect(pageErrors).toEqual([]);
  });

  test("progress sheet shows actual counts, filters and exports rows, and distinguishes stale or unavailable token evidence", async ({ page, request }, testInfo) => {
    const fixture = productionFixture();
    await openHost(page, request, fixture);
    await page.getByText("Progress Sheet", { exact: true }).click();
    const sheet = page.getByRole("region", { name: "Contestant progress sheet" });
    await expect(sheet.locator("tbody tr")).toHaveCount(2);
    await sheet.getByLabel("Sort rows").selectOption("entries");
    await expect(sheet.locator("tbody tr").first()).toContainText("Beta Player");
    const chart = sheet.getByRole("group", { name: "Round 1 · recorded entries" });
    await expect(chart).toContainText("beta · 2 recorded · 0 pending review");
    await expect(chart.locator(".bar").first()).toHaveAttribute("style", "width: 100%;");
    await expect(chart.locator(".bar").nth(1)).toHaveAttribute("style", "width: 50%;");
    await expect(sheet.getByText("Token evidence: unavailable", { exact: true })).toBeVisible();
    await expect(sheet.getByText("Token evidence: incomplete", { exact: true })).toBeVisible();
    const evidence = sheet.getByRole("region", { name: "Round token evidence" });
    await evidence.getByRole("img", { name: "Verified preview token" }).scrollIntoViewIfNeeded();
    await expect(evidence.getByRole("img", { name: "Verified preview token" })).toBeVisible();
    await expect.poll(() => evidence.getByRole("img", { name: "Verified preview token" }).evaluate(image => image.naturalWidth)).toBe(1);
    await expect(evidence.getByRole("link", { name: "View token", exact: true })).toHaveAttribute("href", fixture.progress.tokenEvidence[0].tokenUrl);
    await expect(evidence.getByRole("link", { name: "View operation", exact: true })).toHaveAttribute("href", "https://tzkt.io/operation-proof");
    await expect(evidence.getByText(/9007199254740993123 raw units/)).toBeVisible();
    await expect(evidence.getByText(/Network provenance unverified/)).toBeVisible();
    await expect(evidence.getByRole("link", { name: "View token", exact: true })).toHaveCount(1);
    await typeAndBlur(sheet.getByLabel("Find contestant"), "alpha");
    await expect(sheet.locator("tbody tr")).toHaveCount(1);
    const downloadPromise = page.waitForEvent("download");
    await sheet.getByRole("button", { name: "Export progress CSV" }).click();
    const csv = await readFile(await (await downloadPromise).path(), "utf8");
    expect(csv).toContain('"alpha","active","1"');
    expect(csv).toContain('"incomplete","2","1"');
    expect(csv).not.toContain('"beta"');
    await sheet.getByRole("button", { name: "Inspect alpha round 2", exact: true }).click();
    await expect(evidence).toContainText("No token observation is configured for this round");
    await sheet.getByRole("button", { name: "Inspect alpha round 1", exact: true }).click();
    fixture.failProgress();
    await sheet.getByRole("button", { name: "Refresh progress", exact: true }).click();
    await expect(sheet.getByRole("alert")).toContainText("The displayed sheet may be old");
    await expect(sheet.locator("tbody tr")).toHaveCount(1);
    await page.setViewportSize(devices["iPhone 13"].viewport);
    await expectNoOverflow(sheet);
    const table = sheet.getByRole("region", { name: "Scrollable round progress table" });
    expect(await table.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
    await sheet.getByRole("heading", { name: "Progress sheet", exact: true }).evaluate(node => node.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: testInfo.outputPath("progress-sheet-narrow.png") });
  });

  test("host provisions only selected tool keys and receives explicit access state", async ({ page, request }, testInfo) => {
    const fixture = productionFixture();
    await openHost(page, request, fixture);
    const workspace = page.getByRole("group", { name: "Prepare contestant workspace", exact: true });
    await expect(workspace.getByRole("checkbox")).toHaveCount(3);
    await expect(workspace.getByRole("button", { name: "Prepare tools for retired" })).toHaveCount(0);
    await workspace.getByRole("checkbox", { name: "Studio", exact: true }).check();
    await workspace.getByRole("checkbox", { name: "Pasta Protocol", exact: true }).check();
    await workspace.getByRole("button", { name: "Prepare tools for alpha", exact: true }).click();
    await expect(workspace.getByRole("status")).toContainText("Studio: access granted");
    await expect(workspace.getByRole("status")).toContainText("Pasta Protocol: granted, but disabled by the administrator");
    expect(fixture.calls.provisions).toEqual([{ userId: 2, body: { appKeys: ["studio", "pasta-protocol"] } }]);
    await workspace.getByRole("checkbox", { name: "Studio", exact: true }).uncheck();
    await workspace.getByRole("checkbox", { name: "Pasta Protocol", exact: true }).uncheck();
    await workspace.getByRole("button", { name: "Prepare tools for beta", exact: true }).click();
    await expect(workspace.getByRole("status")).toHaveCount(2);
    expect(fixture.calls.provisions[1]).toEqual({ userId: 3, body: { appKeys: [] } });
    await expect(workspace.getByText(/does not grant administrative control/)).toBeVisible();
    await page.setViewportSize(devices["iPhone 13"].viewport);
    await expectNoOverflow(workspace);
    await workspace.evaluate(node => node.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: testInfo.outputPath("contestant-provisioning-narrow.png") });
  });
});
