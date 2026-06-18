import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

async function setHarnessRole(request, role) {
  const res = await request.post("/__test/state", { data: { userRole: role } });
  expect(res.ok()).toBeTruthy();
}

function fatalErrors(errors) {
  return errors.filter((message) => {
    if (/Failed to load resource: the server responded with a status of 401/.test(message)) return false;
    return true;
  });
}

test.describe("interaction inventory — CH-EASE", () => {
  test("restores a minimized direct route into visible mobile AppWindow geometry", async ({
    page,
    request,
  }) => {
    await setHarnessRole(request, "admin");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "wtf-os.window-session.v1",
        JSON.stringify({
          version: 1,
          pages: ["/tools/ch-ease"],
          states: {
            "/tools/ch-ease": {
              minimized: true,
              maximized: false,
              position: { x: 20, y: 20 },
              size: { w: 960, h: 620 },
              zIndex: 20,
            },
          },
          titles: { "/tools/ch-ease": "CH-EASE" },
          focusedPath: "/tools/ch-ease",
          topZ: 20,
        }),
      );
    });

    await page.goto("/tools/ch-ease", { waitUntil: "domcontentloaded" });
    const title = page.getByRole("heading", { name: "CH-EASE" });
    await expect(title).toBeVisible();
    const box = await title.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(1);
    expect(box?.height ?? 0).toBeGreaterThan(1);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test("uploads media, preserves original title metadata, saves edits, finalizes, and downloads CSV", async ({
    page,
    request,
  }) => {
    await setHarnessRole(request, "admin");
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });

    await page.goto("/tools/ch-ease", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("CH-EASE").first()).toBeVisible();
    await expect(page.getByText("Creator Handoff: Edit, Arrange, Stage, Export")).toBeVisible();
    await expect(page.getByText("Pre-mint packaging studio for wtfOS-stored media")).toBeVisible();
    await expect(page.getByLabel("CH-EASE export targets")).toContainText("Package for OBJKT");
    await expect(page.getByLabel("CH-EASE export targets")).toContainText("Package for drop.art");
    await expect(page.getByLabel("CH-EASE media grid")).toContainText("Create a package first");
    await expect(page.getByLabel("CH-EASE readiness path")).toContainText("Create a package first");
    await expect(page.getByLabel("CH-EASE media grid")).toContainText("Create a package before storing media");

    await page.getByLabel("Package title").fill("Packaged Oddities");
    await page.getByLabel("Package note").fill("Harness package");
    await page.getByRole("button", { name: "Create CH-EASE package" }).click();
    await expect(page.getByRole("status")).toContainText("CH-EASE package created");
    await expect(page.getByLabel("CH-EASE package queue")).toContainText("Packaged Oddities");
    await expect(page.getByLabel("CH-EASE media grid")).toContainText("Drop files here or choose media");
    await page.getByRole("button", { name: /Package for drop\.art/ }).click();
    await page.getByLabel("Drop page headline").fill("Oddities Blind Drop");
    await page.getByLabel("Drop page intro").fill("A compact drop page config stored before publishing.");
    await page.getByLabel("Call to action").fill("Mint from the vault");
    await page.getByRole("button", { name: /Multi page/ }).click();
    await page.getByLabel("Recent mints").check();
    await page.getByLabel("Leaderboard").check();
    await page.getByLabel("Completion page").check();
    await expect(page.getByLabel("CH-EASE drop page preview")).toContainText("Oddities Blind Drop");
    await expect(page.getByLabel("CH-EASE drop page preview")).toContainText("Completion page");
    await page.getByRole("button", { name: "Save drop page config" }).click();
    await expect(page.getByRole("status")).toContainText("Drop page config stored with package");

    await page.getByLabel("Store media").setInputFiles({
      name: "Moon Salad FINAL 04.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(page.getByRole("status")).toContainText("1 media file(s) stored");
    await expect(page.getByLabel("CH-EASE media grid")).toContainText("Moon Salad FINAL 04");
    await expect(page.getByLabel("CH-EASE media grid")).toContainText("1.png");
    await expect(page.getByLabel("CH-EASE media grid")).toContainText("ready");
    await expect(page.getByLabel("CH-EASE metadata editor")).toContainText("Moon Salad FINAL 04.png");
    await expect(page.getByLabel("CH-EASE metadata editor")).toContainText("1.png");

    await page.getByLabel("Attributes JSON").fill("{");
    await expect(page.getByText("Attributes JSON is not valid JSON.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save token metadata" })).toBeDisabled();

    await page.getByLabel("Token name").fill("Moon Salad Deluxe");
    await page.getByLabel("Description").fill("Metadata edits should survive the package save.");
    await page.getByLabel("Tags").fill("macaroni; wtfOS");
    await page
      .getByLabel("Attributes JSON")
      .fill(JSON.stringify([{ name: "palette", value: "green" }], null, 2));
    await page.getByRole("button", { name: "Save token metadata" }).click();

    await expect(page.getByRole("status")).toContainText("Token metadata stored");
    await expect(page.getByLabel("CH-EASE media grid")).toContainText("Moon Salad Deluxe");
    await expect(page.getByLabel("CH-EASE media grid")).toContainText("1.png");
    await expect(page.getByLabel("CH-EASE metadata editor")).toContainText("metadata CID");

    await page.getByRole("button", { name: "Finalize package" }).click();
    await expect(page.getByRole("status")).toContainText("Collection finalized for drop.art");
    await expect(page.getByLabel("CH-EASE media grid")).toContainText("finalized");
    await expect(page.getByRole("button", { name: "Download drop.art CSV" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Load package in Macaroni" })).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download drop.art CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("macaroni-package-1.csv");
    const csvPath = await download.path();
    expect(csvPath).toBeTruthy();
    const csvText = await readFile(csvPath, "utf8");
    expect(csvText).toContain("Moon Salad Deluxe");
    expect(csvText).toContain("Moon Salad FINAL 04.png");
    expect(csvText).toContain("palette");
    expect(csvText).toContain("green");

    const macaroniPopupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Load package in Macaroni" }).click();
    const macaroniPopup = await macaroniPopupPromise;
    await macaroniPopup.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("status")).toContainText("Macaroni package source loaded");
    expect(macaroniPopup.url()).toContain("/tools/macaroni?source=wtfos-package&packageId=1");
    await expect(macaroniPopup.frameLocator('iframe[title="Macaroni"]').locator("#packageSourceStatus")).toContainText(
      "Loaded 1 token row(s) from Packaged Oddities."
    );
    await macaroniPopup.close();

    for (const [buttonName, path] of [
      ["Open Studio", "/studio"],
      ["WTF Domains", "/wtf-subdomains/setup"],
      ["IPFS storage", "/ipfs-pinning"],
    ]) {
      const popupPromise = page.waitForEvent("popup");
      await page.getByRole("button", { name: buttonName }).click();
      const popup = await popupPromise;
      expect(popup.url()).toContain(path);
      await popup.close();
    }

    await expect
      .poll(async () => {
        const state = await (await request.get("/__test/state")).json();
        return state.interactionLog.map((event) => event.eventType);
      })
      .toEqual(expect.arrayContaining([
        "macaroni.package_created",
        "macaroni.package_item_uploaded",
        "macaroni.package_metadata_updated",
        "macaroni.package_drop_config_updated",
        "macaroni.package_finalized",
        "macaroni.package_csv_downloaded",
        "macaroni.package_export_downloaded",
        "macaroni.package_source_loaded",
        "macaroni.package_handoff_opened",
      ]));

    expect(fatalErrors(errors)).toEqual([]);
  });
});
