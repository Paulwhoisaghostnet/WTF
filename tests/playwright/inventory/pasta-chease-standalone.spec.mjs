import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";

const execFileAsync = promisify(execFile);

test("portable CH-EASE prepares, recovers, exports, and hands a Colander project to its publisher", async ({ page }) => {
  const projectId = "portable-chease-proof";
  let pinataAuthorization = "";
  const assets = {
    "/creation-tools/ch-ease/index.html": ["text/html", "public/creation-tools/ch-ease/index.html"],
    "/creation-tools/ch-ease/css/theme.css": ["text/css", "public/creation-tools/ch-ease/css/theme.css"],
    "/creation-tools/ch-ease/vendor/jszip.min.js": ["text/javascript", "public/creation-tools/ch-ease/vendor/jszip.min.js"],
    "/creation-tools/ch-ease/js/studio.js": ["text/javascript", "public/creation-tools/ch-ease/js/studio.js"],
  };
  await page.route("**/creation-tools/ch-ease/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const asset = assets[pathname];
    if (!asset) return route.fallback();
    await route.fulfill({ contentType: asset[0], body: await readFile(asset[1]) });
  });
  await page.route("https://api.pinata.cloud/pinning/pinFileToIPFS", async (route) => {
    pinataAuthorization = route.request().headers().authorization || "";
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ IpfsHash: "bafyPortablePinnedArtifact" }) });
  });
  await page.addInitScript(({ key, project }) => {
    localStorage.setItem(key, JSON.stringify([project]));
    window.__cheaseOpens = [];
    window.open = (url) => { window.__cheaseOpens.push(String(url)); return null; };
  }, {
    key: "wtfos.pasta.colander.workspace.v1",
    project: {
      schema: "pasta-project@1", id: projectId, title: "Portable preparation", toolId: "ch-ease", stage: "preparing", network: "shadownet",
      contracts: [], contractRecords: [], artifacts: [], drafts: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
  });
  await page.goto(`/creation-tools/ch-ease/index.html?handoff=colander-workspace&projectId=${projectId}&projectTitle=Portable%20preparation&network=shadownet`);
  await expect(page.getByRole("heading", { name: "CH-EASE" })).toBeVisible();
  await page.locator("#media-files").setInputFiles({ name: "work-one.png", mimeType: "image/png", buffer: Buffer.from("portable-media-proof") });
  await page.locator("#title").fill("Indefinite Editions");
  await page.locator("#title").blur();
  await page.locator("#target-app").selectOption("gnocchi");
  await page.locator(".token-name").fill("Interest Sets Supply");
  await page.locator(".token-name").blur();
  await page.locator("#pinata-jwt").fill("secret-session-jwt");
  await page.getByRole("button", { name: "Pin unpinned media" }).click();
  await expect(page.locator(".artifact-uri")).toHaveValue("ipfs://bafyPortablePinnedArtifact");
  expect(pinataAuthorization).toBe("Bearer secret-session-jwt");

  const workspace = await page.evaluate(() => JSON.parse(localStorage.getItem("wtfos.pasta.colander.workspace.v1")));
  expect(workspace[0].toolId).toBe("ch-ease");
  expect(workspace[0].drafts[0]).toMatchObject({ schema: "pasta-studio-draft-ref@1", toolId: "ch-ease" });

  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download package JSON" }).click();
  const jsonPath = await (await jsonDownload).path();
  const pkg = JSON.parse(await readFile(jsonPath, "utf8"));
  expect(pkg).toMatchObject({ schemaVersion: "wtfos.pasta.chease-package.v1", kind: "collection", targetApp: "gnocchi", title: "Indefinite Editions" });
  expect(pkg.items[0]).toMatchObject({ name: "Interest Sets Supply", artifactUri: "ipfs://bafyPortablePinnedArtifact" });

  const zipDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download media archive ZIP" }).click();
  const zip = await zipDownload;
  expect(zip.suggestedFilename()).toBe("indefinite-editions.chease.zip");
  expect((await readFile(await zip.path())).byteLength).toBeGreaterThan(100);

  await page.getByRole("button", { name: "Open selected publisher" }).click();
  const handoff = await page.evaluate(() => ({
    opens: window.__cheaseOpens,
    payload: JSON.parse(sessionStorage.getItem("wtfos.pasta.handoff.v1:gnocchi")),
  }));
  expect(handoff.opens[0]).toContain("/creation-tools/gnocchi/index.html?handoff=chease-package");
  expect(handoff.opens[0]).toContain(`projectId=${projectId}`);
  expect(handoff.payload.items[0].artifactUri).toBe("ipfs://bafyPortablePinnedArtifact");

  const savedDraft = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), `wtfos.pasta.chease.draft.v1:${projectId}`);
  expect(savedDraft).toMatchObject({ title: "Indefinite Editions", targetApp: "gnocchi" });
  expect(JSON.stringify(savedDraft)).not.toContain("secret-session-jwt");

  await page.reload();
  const reloadedStorage = await page.evaluate((key) => ({ url: location.href, draft: JSON.parse(localStorage.getItem(key)) }), `wtfos.pasta.chease.draft.v1:${projectId}`);
  expect(reloadedStorage.draft).toMatchObject({ title: "Indefinite Editions", targetApp: "gnocchi" });
  await expect(page.locator("#title")).toHaveValue("Indefinite Editions");
  await expect(page.locator(".token-name")).toHaveValue("Interest Sets Supply");
  await expect(page.locator(".artifact-uri")).toHaveValue("ipfs://bafyPortablePinnedArtifact");
  await expect(page.locator("#pinata-jwt")).toHaveValue("");
  await expect(page.locator(".item-note")).toContainText("File bytes not loaded");
});

test("portable CH-EASE pins through a creator-owned Kubo node without saving its endpoint", async ({ page }) => {
  const assets = {
    "/creation-tools/ch-ease/index.html": ["text/html", "public/creation-tools/ch-ease/index.html"],
    "/creation-tools/ch-ease/css/theme.css": ["text/css", "public/creation-tools/ch-ease/css/theme.css"],
    "/creation-tools/ch-ease/vendor/jszip.min.js": ["text/javascript", "public/creation-tools/ch-ease/vendor/jszip.min.js"],
    "/creation-tools/ch-ease/js/studio.js": ["text/javascript", "public/creation-tools/ch-ease/js/studio.js"],
  };
  await page.route("**/creation-tools/ch-ease/**", async (route) => {
    const asset = assets[new URL(route.request().url()).pathname];
    if (!asset) return route.fallback();
    await route.fulfill({ contentType: asset[0], body: await readFile(asset[1]) });
  });
  let nodeRequest = "";
  await page.route("http://127.0.0.1:5001/api/v0/add?pin=true&cid-version=1", async (route) => {
    nodeRequest = route.request().url();
    await route.fulfill({ contentType: "application/x-ndjson", body: '{"Name":"node-work.png","Hash":"bafyCreatorNodeArtifact"}\n' });
  });

  await page.goto("/creation-tools/ch-ease/index.html?projectId=kubo-proof");
  await page.locator("#media-files").setInputFiles({ name: "node-work.png", mimeType: "image/png", buffer: Buffer.from("creator-node-proof") });
  await page.locator("#pin-provider").selectOption("node");
  await page.locator("#node-url").fill("http://127.0.0.1:5001/");
  await page.getByRole("button", { name: "Pin unpinned media" }).click();

  expect(nodeRequest).toContain("/api/v0/add?pin=true&cid-version=1");
  await expect(page.locator(".artifact-uri")).toHaveValue("ipfs://bafyCreatorNodeArtifact");
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storage).not.toContain("127.0.0.1:5001");
});

test("individual CH-EASE desktop package keeps publisher handoff assets on the same local origin", async ({ page, context }) => {
  await execFileAsync(process.execPath, ["apps/ch-ease-desktop/scripts/prepare-assets.mjs"], {
    cwd: process.cwd(),
  });
  const generatedRoot = path.resolve("apps/ch-ease-desktop/pasta");
  await context.route("**/creation-tools/**", async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, "");
    const assetPath = path.resolve(generatedRoot, pathname);
    if (!assetPath.startsWith(`${generatedRoot}${path.sep}`)) return route.abort();
    try {
      const body = await readFile(assetPath);
      const ext = path.extname(assetPath);
      const contentType = ext === ".html" ? "text/html" : ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : ext === ".json" ? "application/json" : "application/octet-stream";
      await route.fulfill({ contentType, body });
    } catch (_) {
      await route.abort();
    }
  });
  await page.goto("/creation-tools/ch-ease/index.html");
  await page.getByRole("button", { name: "Add metadata-only item" }).click();
  await page.locator(".token-name").fill("Packaged handoff proof");
  await page.locator(".artifact-uri").fill("ipfs://QmPackagedHandoffProof");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open selected publisher" }).click();
  const publisher = await popupPromise;
  await publisher.waitForLoadState("domcontentloaded");
  const handoffFacts = await publisher.evaluate(() => ({
    href: location.href,
    notice: document.getElementById("ppNotice")?.textContent || "",
    log: document.getElementById("log")?.textContent || "",
    localKeys: Object.keys(localStorage),
    sessionKeys: Object.keys(sessionStorage),
  }));
  expect(handoffFacts.log, JSON.stringify(handoffFacts)).toContain("imported 1 token(s) from CH-EASE handoff");
  await expect(publisher.locator(".t-name").first()).toHaveValue("Packaged handoff proof");
});
