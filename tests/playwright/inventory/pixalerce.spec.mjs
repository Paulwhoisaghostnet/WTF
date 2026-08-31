import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";
import pngjs from "pngjs";
import { strFromU8, unzipSync } from "fflate";

const { PNG } = pngjs;

// These ceilings come from the existing Playwright and CI contracts:
// playwright.config.mjs gives tests 60 seconds, while quality-gates.yml gives
// the complete inventory browser step 30 minutes. PixAlerce needs the longer
// journey allowance for its real encoders, but no single browser action may
// consume that allowance or wait forever.
const PIXALERCE_ACTION_TIMEOUT_MS = 60_000;
const PIXALERCE_JOURNEY_TIMEOUT_MS = 30 * 60_000;

async function setHarnessRole(request, role) {
  const response = await request.post("/__test/state", { data: { userRole: role } });
  expect(response.ok()).toBeTruthy();
}

async function getPixAlerceFrame(page) {
  const iframe = await page.locator('iframe[title="PixAlerce"]').elementHandle();
  const frame = await iframe.contentFrame();
  expect(frame).toBeTruthy();
  return frame;
}

function pngColorSummary(buffer) {
  const image = PNG.sync.read(buffer);
  let nonWhite = 0;
  let red = 0;
  let green = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const [r, g, b, a] = image.data.subarray(index, index + 4);
    if (a > 0 && (r < 245 || g < 245 || b < 245)) nonWhite += 1;
    if (a > 0 && r > g * 1.5 && r > b * 1.5) red += 1;
    if (a > 0 && g > r * 1.25 && g > b * 1.25) green += 1;
  }
  return { width: image.width, height: image.height, nonWhite, red, green };
}

test.describe("interaction inventory - PixAlerce", () => {
  test("completes one creation, editing, persistence, and five-format export journey", async ({ page, request }, testInfo) => {
    test.setTimeout(PIXALERCE_JOURNEY_TIMEOUT_MS);
    page.setDefaultTimeout(PIXALERCE_ACTION_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(PIXALERCE_ACTION_TIMEOUT_MS);
    await setHarnessRole(request, "admin");
    const failures = [];
    const results = [];
    const browserErrors = [];
    const failedRequests = [];

    const feature = async (name, action) => {
      await test.step(name, async () => {
        try {
          await action();
          results.push({ name, status: "passed" });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`${name}: ${message}`);
          results.push({ name, status: "failed", message });
        }
      });
    };

    page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
    });
    page.on("requestfailed", (request_) => failedRequests.push(`${request_.method()} ${request_.url()}`));

    await page.addInitScript(() => window.localStorage.removeItem("wtf-os.window-session.v1"));
    await page.goto("/tools/pixalerce", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/tools\/pixalerce$/);
    await expect(page.locator('[data-creation-tool-id="pixalerce"]')).toBeVisible();
    await expect(page.getByRole("link", { name: "Source" })).toHaveAttribute(
      "href",
      "https://github.com/NikoAlerce/3dpixelstudio",
    );

    let frame = await getPixAlerceFrame(page);
    await expect(frame.getByRole("button", { name: /Blank canvas/i })).toBeVisible({ timeout: 20_000 });

    await feature("splash exposes project, camera, and upload entry points", async () => {
      await expect(frame.getByRole("button", { name: /Blank canvas/i })).toBeVisible();
      await expect(frame.getByRole("button", { name: "Projects", exact: true })).toBeVisible();
      await expect(frame.getByRole("button", { name: "Camera", exact: true })).toBeVisible();
      await expect(frame.getByRole("button", { name: "Upload", exact: true })).toBeVisible();
    });

    await feature("creates a compact custom canvas", async () => {
      await frame.getByRole("button", { name: /Blank canvas/i }).click();
      await expect(frame.getByRole("dialog", { name: "New Canvas" })).toBeVisible();
      await frame.getByRole("button", { name: "32 × 32", exact: true }).click();
      await frame.getByRole("button", { name: "Create", exact: true }).click();
      await expect(frame.getByRole("banner")).toContainText("PixAlerce", { timeout: 20_000 });
      await expect(frame.getByText("256", { exact: true }).first()).toBeVisible();
    });

    for (const name of ["Brush", "Airbrush", "Eraser", "Fill", "Wand", "Shapes", "Selection", "Eyedropper", "Text", "Crop"]) {
      await feature(`${name} activates from the tool strip`, async () => {
        const button = frame.getByRole("button", { name, exact: true }).first();
        await button.click();
        await expect(button).toHaveAttribute("aria-pressed", "true");
      });
    }

    await feature("brush stroke, undo, and redo change the canvas", async () => {
      await frame.getByRole("button", { name: "#e53935 — slot 2", exact: true }).click();
      await frame.getByRole("button", { name: "Brush", exact: true }).first().click();
      const box = await frame.locator("canvas").first().boundingBox();
      expect(box).toBeTruthy();
      await page.mouse.move(box.x + box.width * 0.38, box.y + box.height * 0.42);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.48, { steps: 8 });
      await page.mouse.up();
      await frame.getByRole("button", { name: "Undo", exact: true }).click();
      await frame.getByRole("button", { name: "Redo", exact: true }).click();
    });

    await feature("FX Library selects a stamp and motion preset", async () => {
      await frame.getByRole("button", { name: "Open FX Library" }).click();
      await frame.getByRole("button", { name: "Pixel Art", exact: false }).click();
      await frame.getByRole("button", { name: "Plants", exact: false }).click();
      await frame.getByRole("img", { name: "tree1", exact: true }).locator("..").click();
      await frame.getByRole("button", { name: "Pulsate", exact: true }).click();
      await frame.getByRole("button", { name: "#43a047 — slot 3", exact: true }).click();
    });

    await feature("FX Library close action is clickable", async () => {
      await frame.getByRole("button", { name: "Close FX Library" }).click({ timeout: 5_000 });
    });
    if (await frame.getByRole("button", { name: "Hide FX Library" }).isVisible().catch(() => false)) {
      await frame.getByRole("button", { name: "Hide FX Library" }).click();
    }

    await feature("selected stamp paints animated green pixels", async () => {
      const box = await frame.locator("canvas").first().boundingBox();
      expect(box).toBeTruthy();
      await page.mouse.move(box.x + box.width * 0.57, box.y + box.height * 0.62);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.64, box.y + box.height * 0.57, { steps: 6 });
      await page.mouse.up();
    });

    await feature("Inspector opens while the palette is visible", async () => {
      await frame.getByRole("button", { name: "Open inspector" }).click({ timeout: 5_000 });
      await expect(frame.getByText("Inspector", { exact: true }).last()).toBeVisible();
    });
    if (await frame.getByRole("button", { name: "Open inspector" }).isVisible().catch(() => false)) {
      await frame.getByRole("button", { name: "Hide palette" }).first().click();
      await frame.getByRole("button", { name: "Open inspector" }).click();
    }
    const hideInspector = frame.getByRole("button", { name: "Hide", exact: true }).last();
    if (await hideInspector.isVisible().catch(() => false)) await hideInspector.click();

    await feature("full-screen preview enters and exits", async () => {
      await frame.getByRole("button", { name: "Full screen preview" }).click();
      await expect(frame.getByTitle("Exit full screen")).toBeVisible();
      await frame.getByTitle("Exit full screen").click();
    });

    const exportArtifacts = new Map();
    const dismissSupport = async () => {
      const notNow = frame.getByRole("button", { name: "Not now", exact: true });
      if (await notNow.isVisible().catch(() => false)) await notNow.click();
    };
    const openExport = async () => {
      await dismissSupport();
      if (await frame.getByRole("heading", { name: "Export", exact: true }).isVisible().catch(() => false)) return;
      await frame.getByRole("button", { name: "App Menu" }).click();
      await frame.getByRole("menuitem", { name: /Export Animation/ }).click();
    };
    const exportFormat = async ({ type, preset, actionName, extension }) => {
      await openExport();
      await frame.getByRole("button", { name: type, exact: true }).click();
      await frame.getByRole("button", { name: "Device download", exact: true }).click();
      if (preset) await frame.getByRole("button", { name: preset, exact: true }).click();
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        frame.getByRole("button", { name: actionName, exact: true }).click(),
      ]);
      const artifactPath = testInfo.outputPath(`pixalerce.${extension}`);
      await mkdir(path.dirname(artifactPath), { recursive: true });
      await download.saveAs(artifactPath);
      exportArtifacts.set(type, artifactPath);
      expect(download.suggestedFilename().toLowerCase()).toMatch(new RegExp(`\\.${extension}$`));
    };

    await feature("exports a PNG still", async () => {
      await exportFormat({ type: "PNG", preset: "Raw", actionName: "Export PNG", extension: "png" });
    });
    await feature("exports a GIF perfect loop", async () => {
      await exportFormat({ type: "GIF", preset: "Twitter / X", actionName: "Export GIF · Perfect Loop", extension: "gif" });
    });
    await feature("exports an MP4 perfect loop", async () => {
      await exportFormat({ type: "MP4", preset: "Mobile", actionName: "Export MP4 · Perfect Loop", extension: "mp4" });
    });
    await feature("exports a WebM perfect loop", async () => {
      await exportFormat({ type: "WEBM", preset: "Mobile", actionName: "Export WEBM · Perfect Loop", extension: "webm" });
    });
    await feature("exports a self-contained OBJKT ZIP", async () => {
      await exportFormat({ type: "OBJKT·ZIP", actionName: "Export OBJKT · ZIP", extension: "zip" });
    });

    await feature("validates every exported artifact instead of trusting download events", async () => {
      const png = pngColorSummary(await readFile(exportArtifacts.get("PNG")));
      expect(png).toMatchObject({ width: 16, height: 16 });
      expect(png.red).toBeGreaterThan(0);
      expect(png.green).toBeGreaterThan(0);

      const gifBytes = await readFile(exportArtifacts.get("GIF"));
      expect(gifBytes.subarray(0, 6).toString("ascii")).toBe("GIF89a");
      const mp4Bytes = await readFile(exportArtifacts.get("MP4"));
      expect(mp4Bytes.subarray(4, 8).toString("ascii")).toBe("ftyp");
      const webmBytes = await readFile(exportArtifacts.get("WEBM"));
      expect([...webmBytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);

      const files = unzipSync(await readFile(exportArtifacts.get("OBJKT·ZIP")));
      expect(Object.keys(files).sort()).toEqual(
        expect.arrayContaining(["app.js", "index.html", "particles.js", "spritesheet.png", "three.js"]),
      );
      const html = strFromU8(files["index.html"]);
      expect(html).toContain('<link rel="icon" href="data:,">');
      expect(html).not.toMatch(/https?:\/\//i);

      const objktRequests = [];
      const objktPage = await page.context().newPage();
      objktPage.on("request", (request_) => objktRequests.push(request_.url()));
      await objktPage.route("http://pixalerce-objkt.test/**", async (route) => {
        const fileName = new URL(route.request().url()).pathname.replace(/^\//, "") || "index.html";
        const body = files[fileName];
        if (!body) {
          await route.fulfill({ status: 404, body: "Not found" });
          return;
        }
        const contentType = fileName.endsWith(".html")
          ? "text/html"
          : fileName.endsWith(".js")
            ? "text/javascript"
            : fileName.endsWith(".png")
              ? "image/png"
              : "application/octet-stream";
        await route.fulfill({ status: 200, contentType, body: Buffer.from(body) });
      });
      await objktPage.goto("http://pixalerce-objkt.test/index.html", { waitUntil: "load" });
      await expect(objktPage.locator("canvas#c")).toBeVisible();
      expect(objktRequests.every((url) => url.startsWith("http://pixalerce-objkt.test/") || url.startsWith("data:"))).toBe(true);
      expect(objktRequests.some((url) => url.endsWith("/favicon.ico"))).toBe(false);
      await objktPage.close();
    });

    const mediaUploads = [];
    await page.route("**/api/media/upload", async (route) => {
      const postData = route.request().postDataBuffer()?.toString("utf8") || "";
      mediaUploads.push(postData);
      const id = 9000 + mediaUploads.length;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id,
          title: `PixAlerce Media ${mediaUploads.length}`,
          mimeType: "image/png",
          mediaCategory: "image",
          sourceType: "upload",
          status: "ready",
          createdAt: new Date().toISOString(),
        }),
      });
    });
    await page.route("**/api/profile/dossier?limit=500", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ wallets: [], aggregate: { total: 0, byType: {}, firstEventAt: null, lastEventAt: null } }),
      });
    });

    await feature("saves a PNG to wtfOS Media without a device download", async () => {
      await openExport();
      await frame.getByRole("button", { name: "PNG", exact: true }).click();
      await frame.getByRole("button", { name: "wtfOS Media", exact: true }).click();
      await frame.getByRole("button", { name: "Raw", exact: true }).click();
      await frame.getByRole("button", { name: "Export PNG", exact: true }).click();
      await expect.poll(() => mediaUploads.length).toBe(1);
      await expect(page.getByRole("status")).toContainText("Saved “PixAlerce Media 1” to wtfOS Media");
      expect(mediaUploads[0]).toContain("image/png");
      expect(mediaUploads[0]).toContain("image");
    });

    await feature("save + Mint Manager opens destination selection without signing", async () => {
      await openExport();
      await frame.getByRole("button", { name: "PNG", exact: true }).click();
      await frame.getByRole("button", { name: "Media + Mint Manager", exact: true }).click();
      await frame.getByRole("button", { name: "Raw", exact: true }).click();
      await frame.getByRole("button", { name: "Export PNG", exact: true }).click();
      await expect.poll(() => mediaUploads.length).toBe(2);
      const dialog = page.getByRole("dialog", { name: "Mint Manager" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Where should this artwork live?");
      await expect(dialog.getByRole("button", { name: /OBJKT-ready collection/ })).toHaveAttribute("aria-pressed", "true");
      await expect(dialog.getByRole("button", { name: "Sign & mint to HEN" })).toHaveCount(0);
      await dialog.getByRole("button", { name: "Close Mint Manager" }).click();
    });

    await feature("saves and reopens the named local project after reload", async () => {
      await dismissSupport();
      await frame.getByRole("button", { name: "App Menu" }).click();
      await frame.getByRole("menu").getByText("Save project", { exact: true }).click();
      const saveDialog = frame.getByRole("heading", { name: "Save to gallery" }).locator("..");
      await frame.getByPlaceholder("Project name").fill("wtfOS complete export journey");
      await saveDialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(frame.getByText("Project saved ✓", { exact: true })).toBeVisible({ timeout: 20_000 });
      await page.reload({ waitUntil: "domcontentloaded" });
      frame = await getPixAlerceFrame(page);
      await frame.getByRole("button", { name: /My projects/i }).click();
      await expect(frame.getByText("wtfOS complete export journey", { exact: true })).toBeVisible({ timeout: 20_000 });
    });

    await feature("saved PixAlerce media remains mintable from My Photos", async () => {
      await page.route("**/api/media/mine?category=image", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([{
            id: 9002,
            title: "PixAlerce Media 2",
            description: "Created with PixAlerce in wtfOS",
            sourceType: "upload",
            sourceUrl: "/api/media/9002/file",
            mimeType: "image/png",
            mediaCategory: "image",
            status: "ready",
            fileSize: 2048,
            createdAt: new Date().toISOString(),
          }]),
        });
      });
      await page.goto("/my-photos", { waitUntil: "domcontentloaded" });
      await expect(page.getByText("PixAlerce Media 2", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Mint this media", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Mint Manager" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: /HEN \/ Teia shared contract/ }).click();
      await dialog.getByRole("button", { name: "Continue to metadata" }).click();
      await expect(dialog).toContainText("Describe the token for wallets and indexers");
      await expect(dialog.getByLabel("Editions")).toHaveValue("1");
      await expect(dialog.getByRole("button", { name: "Pin media & prepare review" })).toBeDisabled();
      await dialog.getByRole("button", { name: "Close Mint Manager" }).click();
    });

    await feature("the wtfOS Media folder keeps every saved export available for later minting", async () => {
      await page.route("**/api/media/mine", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([{
            id: 9002,
            title: "PixAlerce Media 2",
            sourceType: "upload",
            sourceUrl: "/api/media/9002/file",
            mimeType: "image/png",
            mediaCategory: "image",
            status: "ready",
            fileSize: 2048,
            updatedAt: new Date().toISOString(),
          }]),
        });
      });
      await page.goto("/file-manager", { waitUntil: "domcontentloaded" });
      await expect(page.getByText("Media folder", { exact: true })).toBeVisible();
      await expect(page.getByText("PixAlerce Media 2", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Mint this media", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Mint Manager" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Start over" }).click();
      await dialog.getByRole("button", { name: /New Pasta contract/ }).click();
      await expect(dialog.getByLabel("Contract workflow")).toContainText("Spaghetti");
      await expect(dialog.getByLabel("Network")).toContainText("Shadownet rehearsal");
    });

    await testInfo.attach("pixalerce-feature-ledger", {
      body: Buffer.from(JSON.stringify(results, null, 2)),
      contentType: "application/json",
    });
    expect(failedRequests.filter((entry) => entry.includes("/creation-tools/pixalerce/"))).toEqual([]);
    expect(browserErrors.filter((message) => !/(WebGL|favicon|ResizeObserver)/i.test(message))).toEqual([]);
    expect(failures, failures.join("\n\n")).toEqual([]);
  });
});
