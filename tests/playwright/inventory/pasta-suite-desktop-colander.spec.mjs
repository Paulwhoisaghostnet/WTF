import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

const ACCOUNT = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const CONTRACT = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";

test.describe("Pasta Suite Desktop native Colander", () => {
  test.beforeAll(() => {
    execFileSync(process.execPath, ["apps/pasta-suite-desktop/scripts/prepare-assets.mjs"], { cwd: process.cwd() });
  });

  test("persists a project, detects a local contract, configures its sale, and attaches it", async ({ page }) => {
    const runtimeErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
    });
    const nativeHtml = readFileSync("apps/pasta-suite-desktop/pasta/index.html", "utf8");
    await page.route("**/pasta-suite-native/index.html", (route) => route.fulfill({ contentType: "text/html", body: nativeHtml }));
    let siteInstalled = true;
    await page.route("**/api/pasta/sites", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, sites: siteInstalled ? [{ title: "Native direct sale page", app: "spaghetti", slug: "spaghetti-proof", url: "/sites/spaghetti-proof/", fileCount: 8 }] : [] }),
    }));
    await page.route("**/api/pasta/sites/spaghetti-proof", async (route) => {
      expect(route.request().method()).toBe("DELETE");
      siteInstalled = false;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, site: { title: "Native direct sale page", slug: "spaghetti-proof", url: "/sites/spaghetti-proof/" } }) });
    });
    await page.route("**/creation-tools/spaghetti/js/common.js", async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      const harness = `
        (() => {
          const operations = [];
          const methodsObject = {
            set_sale(payload) { return { async send() { operations.push({ entrypoint: "set_sale", payload }); return { async confirmation() { operations.push({ entrypoint: "set_sale", confirmed: true }); } }; } }; },
            set_sale_active(payload) { return { async send() { operations.push({ entrypoint: "set_sale_active", payload }); return { async confirmation() {} }; } }; }
          };
          const contract = {
            entrypoints: { entrypoints: { transfer:{}, create_token:{}, mint:{}, set_sale:{}, set_sale_active:{}, transfer_administration:{}, accept_administration:{} } },
            methodsObject,
            async storage() { return { administrator: "${ACCOUNT}", next_token_id: 1 }; }
          };
          const toolkit = { contract: { async at() { return contract; } }, wallet: { async at() { return contract; } } };
          window.__nativeColanderProof = { operations };
          MD.setupToolkit = () => toolkit;
          MD.getToolkit = () => toolkit;
          MD.connectWallet = async () => "${ACCOUNT}";
          MD.assertOperationSafety = async () => "${ACCOUNT}";
        })();
      `;
      await route.fulfill({ response, body: `${source}\n${harness}` });
    });

    await page.goto("/pasta-suite-native/index.html", { waitUntil: "domcontentloaded" });
    await expect.poll(() => runtimeErrors).toEqual([]);
    await expect(page.locator("#project-network")).toHaveValue("shadownet");
    await expect(page.locator("#contract-network")).toHaveValue("shadownet");
    await expect(page.locator("#local-sites")).toContainText("Native direct sale page");
    await expect(page.getByRole("button", { name: "Open local page" })).toBeVisible();
    await page.locator("#local-sites").getByRole("button", { name: "Uninstall local page" }).click();
    await page.locator("#local-sites").getByRole("button", { name: "Confirm uninstall page" }).click();
    await expect(page.locator("#local-sites")).toContainText("No locally installed pages yet");
    await page.locator("#project-title").fill("Native direct sale");
    await page.locator("#project-tool").selectOption("spaghetti");
    await page.locator("#create-project").click();
    await expect(page.locator("#project-list")).toContainText("Native direct sale");

    await page.locator("#contract-network").selectOption("shadownet");
    await page.locator("#contract-kt").fill(CONTRACT);
    await page.locator("#open-contract").click();
    await expect(page.locator("#contract-facts")).toContainText("Spaghetti / Rotini collection");
    await expect(page.locator('[data-action="set_sale"]')).toBeVisible();
    await expect(page.locator("#project-list")).toContainText("deployed · 1 contracts");

    const sale = page.locator('[data-action="set_sale"]');
    await sale.locator('[name="token_id"]').fill("0");
    await sale.locator('[name="price"]').fill("2500000");
    await sale.locator('[name="remaining"]').fill("4");
    await sale.getByRole("button", { name: "Submit Configure direct sale" }).click();
    await expect(page.locator("#contract-facts")).toContainText("Configure direct sale confirmed on Tezos");

    const proof = await page.evaluate(() => window.__nativeColanderProof.operations);
    expect(proof).toEqual([
      {
        entrypoint: "set_sale",
        payload: {
          token_id: 0,
          sale: { active: true, seller: ACCOUNT, treasury: ACCOUNT, price: 2500000, remaining: 4, start: null, end: null },
        },
      },
      { entrypoint: "set_sale", confirmed: true },
    ]);
  });

  test("owns the complete project lifecycle in installed Colander", async ({ page }) => {
    await page.addInitScript(() => {
      window.__nativeProjectEvents = [];
      window.addEventListener("pasta-protocol", (event) => window.__nativeProjectEvents.push(event.detail));
    });
    const nativeHtml = readFileSync("apps/pasta-suite-desktop/pasta/index.html", "utf8");
    await page.route("**/pasta-suite-native-projects/index.html", (route) => route.fulfill({ contentType: "text/html", body: nativeHtml }));
    await page.route("**/api/pasta/sites", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, sites: [] }) }));
    await page.goto("/pasta-suite-native-projects/index.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#project-network")).toHaveValue("shadownet");

    await page.locator("#project-title").fill("Installed project");
    await page.locator("#project-tool").selectOption("gnocchi");
    await page.locator("#create-project").click();
    await page.locator("#active-project-title").fill("Installed forever editions");
    await page.locator("#rename-project").click();
    await expect(page.locator("#project-list")).toContainText("Installed forever editions");

    await page.locator("#duplicate-project").click();
    await expect(page.locator("#active-project-title")).toHaveValue("Installed forever editions copy");
    await page.locator("#archive-project").click();
    await expect(page.locator("#archived-projects")).toContainText("Installed forever editions copy");
    await page.locator("#archived-projects").getByRole("button", { name: "Restore project" }).click();
    await expect(page.locator("#active-project-title")).toHaveValue("Installed forever editions copy");

    await page.locator("#archive-project").click();
    await page.locator("#archived-projects").getByRole("button", { name: "Delete permanently" }).click();
    await page.locator("#archived-projects").getByRole("button", { name: "Confirm permanent delete" }).click();
    await expect(page.locator("#archived-projects")).toBeHidden();

    const proof = await page.evaluate(() => ({
      projects: JSON.parse(localStorage.getItem("wtfos.pasta.colander.workspace.v1") || "[]"),
      events: window.__nativeProjectEvents,
    }));
    expect(proof.projects[0].network).toBe("shadownet");
    expect(proof.projects).toEqual([expect.objectContaining({ title: "Installed forever editions", stage: "planning" })]);
    expect(proof.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "colander.project_created",
      "colander.project_renamed",
      "colander.project_duplicated",
      "colander.project_archived",
      "colander.project_restored",
      "colander.project_deleted",
    ]));
  });

  test("normalizes current projects and resumes drafts, contracts, and installed pages from native Colander", async ({ page }) => {
    const projectId = "native-lifecycle-proof";
    const now = new Date().toISOString();
    await page.addInitScript(({ project, key }) => {
      localStorage.setItem(key, JSON.stringify([project]));
      window.__nativeColanderOpens = [];
      window.open = (url) => {
        window.__nativeColanderOpens.push(String(url));
        return null;
      };
    }, {
      key: "wtfos.pasta.colander.workspace.v1",
      project: {
        schema: "pasta-project@1",
        id: projectId,
        title: "Native lifecycle project",
        toolId: "gnocchi",
        stage: "published",
        network: "shadownet",
        contracts: [CONTRACT],
        drafts: [{
          schema: "pasta-studio-draft-ref@1",
          toolId: "gnocchi",
          storageKey: `wtfos.pasta.studio.draft.v1:gnocchi:${projectId}`,
          savedAt: now,
          summary: "Forever OE recovery draft",
        }],
        contractRecords: [
          {
            schema: "pasta-contract-ref@1",
            address: CONTRACT,
            toolId: "gnocchi",
            network: "shadownet",
            label: "Forever OE contract",
            source: "deployed",
            recordedAt: now,
            lastVerifiedAt: now,
          },
          { schema: "pasta-contract-ref@1", address: "not-a-kt1", toolId: "evil", label: "Do not render" },
        ],
        artifacts: [{
          id: "native-site-proof",
          kind: "self_hosted_site",
          toolId: "gnocchi",
          contract: CONTRACT,
          tokenId: 0,
          fileName: "gnocchi-site.zip",
          localUrl: "/sites/gnocchi-proof/",
          createdAt: now,
        }],
        createdAt: now,
        updatedAt: now,
      },
    });
    const nativeHtml = readFileSync("apps/pasta-suite-desktop/pasta/index.html", "utf8");
    await page.route("**/pasta-suite-native-lifecycle/index.html", (route) => route.fulfill({ contentType: "text/html", body: nativeHtml }));
    await page.route("**/api/pasta/sites", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, sites: [] }) }));
    let projectSiteDeleted = false;
    await page.route("**/api/pasta/sites/gnocchi-proof", async (route) => {
      expect(route.request().method()).toBe("DELETE");
      projectSiteDeleted = true;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, site: { title: "Gnocchi page", slug: "gnocchi-proof", url: "/sites/gnocchi-proof/" } }) });
    });

    await page.goto("/pasta-suite-native-lifecycle/index.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#project-drafts")).toContainText("Forever OE recovery draft");
    await expect(page.locator("#project-contracts")).toContainText(CONTRACT);
    await expect(page.locator("#project-contracts")).not.toContainText("Do not render");
    await expect(page.locator("#project-sites")).toContainText("gnocchi-site.zip");

    await page.getByRole("button", { name: "Resume draft" }).click();
    await page.getByRole("button", { name: "Resume in owner app" }).click();
    await page.getByRole("button", { name: "Open installed page" }).click();
    const opened = await page.evaluate(() => window.__nativeColanderOpens);
    expect(opened[0]).toContain("/creation-tools/gnocchi/index.html?");
    expect(opened[0]).toContain(`projectId=${projectId}`);
    expect(opened[0]).toContain("kind=gnocchi");
    expect(opened[1]).toContain(`contract=${CONTRACT}`);
    expect(opened[2]).toBe("/sites/gnocchi-proof/");

    await page.getByRole("button", { name: "Open in contract manager" }).click();
    await expect(page.locator("#contract-network")).toHaveValue("shadownet");
    await expect(page.locator("#contract-kt")).toHaveValue(CONTRACT);

    await page.locator("#project-sites").getByRole("button", { name: "Uninstall local page" }).click();
    await page.locator("#project-sites").getByRole("button", { name: "Confirm uninstall page" }).click();
    await expect(page.locator("#project-sites")).toContainText("No self-hosted page exports");
    expect(projectSiteDeleted).toBe(true);
    const storedAfterUninstall = await page.evaluate(() => JSON.parse(localStorage.getItem("wtfos.pasta.colander.workspace.v1") || "[]"));
    expect(storedAfterUninstall[0].artifacts).toEqual([]);
  });

  test("preserves CH-EASE as the installed preparation owner and resumes its local draft", async ({ page }) => {
    const projectId = "native-chease-proof";
    const now = new Date().toISOString();
    await page.addInitScript(({ key, project }) => {
      localStorage.setItem(key, JSON.stringify([project]));
      window.__nativeCheaseOpens = [];
      window.open = (url) => { window.__nativeCheaseOpens.push(String(url)); return null; };
    }, {
      key: "wtfos.pasta.colander.workspace.v1",
      project: {
        schema: "pasta-project@1", id: projectId, title: "Native preparation", toolId: "ch-ease", stage: "preparing", network: "shadownet",
        contracts: [], contractRecords: [], artifacts: [], drafts: [{ schema: "pasta-studio-draft-ref@1", toolId: "ch-ease", storageKey: `wtfos.pasta.chease.draft.v1:${projectId}`, savedAt: now, summary: "Three prepared works" }], createdAt: now, updatedAt: now,
      },
    });
    const nativeHtml = readFileSync("apps/pasta-suite-desktop/pasta/index.html", "utf8");
    await page.route("**/pasta-suite-native-chease/index.html", (route) => route.fulfill({ contentType: "text/html", body: nativeHtml }));
    await page.route("**/api/pasta/sites", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, sites: [] }) }));
    await page.goto("/pasta-suite-native-chease/index.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#project-list")).toContainText("preparing");
    await expect(page.locator("#project-drafts")).toContainText("Three prepared works");
    await expect(page.locator('[data-tool="ch-ease"]')).toContainText("CH-EASE");
    await page.getByRole("button", { name: "Resume draft" }).click();
    const opened = await page.evaluate(() => window.__nativeCheaseOpens);
    expect(opened[0]).toContain("/creation-tools/ch-ease/index.html?handoff=colander-workspace");
    expect(opened[0]).toContain(`projectId=${projectId}`);
  });
});
