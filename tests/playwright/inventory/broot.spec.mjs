import { test, expect } from "@playwright/test";

const PNG_BYTES = Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
));
const GIF_BYTES = Array.from(Buffer.from(
  "R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64"
));
const HEN_TOKEN_CONTRACT = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";

async function setHarnessRole(request, role) {
  const res = await request.post("/__test/state", { data: { userRole: role } });
  expect(res.ok()).toBeTruthy();
}

function fatalErrors(errors) {
  return errors.filter((message) => !/(favicon|ResizeObserver|WebGL|wallet|beacon|taquito|status of 401)/i.test(message));
}

async function installBrootFilePickerStub(page) {
  await page.addInitScript(() => {
    window.__brootPickerCalls = [];
    window.__brootFileQueue = [];
    window.__brootSavePickerCalls = [];
    window.__brootSavedProjectText = "";
    window.__brootSavedProjectType = "";
    const captureWrite = async (value) => {
      if (value && typeof value.text === "function") {
        window.__brootSavedProjectText = await value.text();
        window.__brootSavedProjectType = value.type || "";
        return;
      }
      window.__brootSavedProjectText = String(value || "");
      window.__brootSavedProjectType = "";
    };
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      writable: true,
      value: async (options) => {
        window.__brootPickerCalls.push(options);
        const next = window.__brootFileQueue.shift();
        if (!next) throw new Error("No queued Broot test file.");
        return [{
          getFile: async () => new File([new Uint8Array(next.bytes)], next.name, { type: next.type }),
          createWritable: async () => ({ write: captureWrite, close: async () => {} }),
        }];
      },
    });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      writable: true,
      value: async (options) => {
        window.__brootSavePickerCalls.push(options);
        return {
          createWritable: async () => ({ write: captureWrite, close: async () => {} }),
        };
      },
    });
  });
}

async function getBrootFrame(page) {
  const iframe = await page.locator('iframe[title="Broot"]').elementHandle();
  const frame = await iframe.contentFrame();
  expect(frame).toBeTruthy();
  return frame;
}

async function queueBrootFile(frame, file) {
  await frame.evaluate((queuedFile) => {
    window.__brootFileQueue.push(queuedFile);
  }, file);
}

async function installBrootWalletAndHenStubs(page) {
  await page.route("**/creation-tools/macaroni/vendor/tezos.js", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        (() => {
          const ACTIVE_KEY = "__brootTestActiveAccount";
          const PERMISSION_KEY = "__brootRequestPermissions";
          const MINT_KEY = "__brootHenMint";
          const chainIdForRpc = (rpc) => String(rpc || "").includes("mainnet")
            ? "NetXdQprcVkpaWU"
            : "NetXsqzbfFenSTS";
          const bytes = (value) => Array.from(new TextEncoder().encode(String(value || "")))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
          class MichelsonMap extends Map {}
          const mapObject = (value) => {
            const out = {};
            if (value && typeof value.forEach === "function") value.forEach((v, k) => { out[k] = v; });
            return out;
          };
          class WalletMethod {
            constructor(params) { this.params = params; }
            async toTransferParams() {
              return { destination: "${HEN_TOKEN_CONTRACT}", parameter: this.params };
            }
            async send(options) {
              localStorage.setItem(MINT_KEY, JSON.stringify({
                params: { ...this.params, token_info: mapObject(this.params.token_info) },
                options,
              }));
              return {
                opHash: "opBrootHenMint1111111111111111111111111111",
                confirmation: async () => ({ completed: true }),
              };
            }
          }
          class WalletContract {
            constructor(address) { this.address = address; }
            methodsObject = { mint: (params) => new WalletMethod(params) };
          }
          class TezosToolkit {
            constructor(rpc) {
              this.rpc = { getChainId: async () => chainIdForRpc(rpc) };
              this.estimate = {
                transfer: async () => ({
                  gasLimit: 12000,
                  storageLimit: 8,
                  suggestedFeeMutez: 1200,
                  operationSize: 300,
                }),
              };
              this.wallet = {
                at: async (address) => {
                  localStorage.setItem("__brootHenContract", address);
                  return new WalletContract(address);
                },
              };
            }
            setWalletProvider(wallet) { this.walletProvider = wallet; }
          }
          class BeaconWallet {
            constructor(options) {
              this.client = {
                network: options.network,
                preferredNetwork: options.preferredNetwork,
                featuredWallets: options.featuredWallets || [],
                getActiveAccount: async () => {
                  const raw = localStorage.getItem(ACTIVE_KEY);
                  return raw ? JSON.parse(raw) : null;
                },
                setActiveAccount: async (account) => {
                  localStorage.setItem(ACTIVE_KEY, JSON.stringify(account));
                },
              };
            }
            async requestPermissions() {
              const count = Number(localStorage.getItem(PERMISSION_KEY) || "0") + 1;
              localStorage.setItem(PERMISSION_KEY, String(count));
              const account = {
                address: "tz1BrootWallet1111111111111111111111",
                network: this.client.network,
              };
              localStorage.setItem(ACTIVE_KEY, JSON.stringify(account));
              return account;
            }
            async getPKH() {
              const raw = localStorage.getItem(ACTIVE_KEY);
              return raw ? JSON.parse(raw).address : "";
            }
            async clearActiveAccount() {
              localStorage.removeItem(ACTIVE_KEY);
            }
          }
          window.TZ = {
            TezosToolkit,
            BeaconWallet,
            MichelsonMap,
            stringToBytes: bytes,
            installOctezPrimaryWallet: () => {},
          };
        })();
      `,
    });
  });
  await page.route("**/creation-tools/macaroni/vendor/octez-connect.js", async (route) => {
    await route.fulfill({ contentType: "application/javascript", body: "" });
  });
  await page.route("**/creation-tools/macaroni/js/octez-wallet.js", async (route) => {
    await route.fulfill({ contentType: "application/javascript", body: "" });
  });
  await page.route("https://api.tzkt.io/v1/contracts/**/storage", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ all_tokens: "900001" }) });
  });
  await page.route("**/api/auth/csrf-token", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ csrfToken: "broot-csrf" }) });
  });
  let pinCount = 0;
  await page.route("**/api/macaroni/ipfs/pin", async (route) => {
    pinCount += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ cid: pinCount === 1 ? "bafy-broot-artifact" : "bafy-broot-metadata" }),
    });
  });
}

test.describe("interaction inventory - Broot", () => {
  test("loads the Tezos-native Fabric editor and exports a PNG", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });

    await page.addInitScript(() => {
      indexedDB.deleteDatabase("broot");
      window.localStorage.removeItem("wtf-os.window-session.v1");
    });

    await page.goto("/tools/broot", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/tools\/broot$/);
    await expect(page.locator('iframe[title="Broot"]')).toBeVisible();

    const frame = page.frameLocator('iframe[title="Broot"]');
    await expect(frame.getByLabel("Broot editor")).toBeVisible();
    await expect(frame.getByRole("status")).toContainText("Broot ready");
    await expect(frame.getByLabel("Broot Fabric canvas")).toBeVisible();
    await expect(frame.getByLabel("Broot layers and Tezos")).toContainText("Layers");
    await expect(frame.getByLabel("Broot tools")).toBeVisible();
    await expect(frame.getByLabel("Broot layers and Tezos")).toBeVisible();

    const brootFrame = await getBrootFrame(page);
    const layout = await brootFrame.evaluate(() => {
      const box = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          display: getComputedStyle(element).display,
          height: rect.height,
          width: rect.width,
        };
      };
      return {
        left: box(".side-panel.left"),
        right: box(".side-panel.right"),
        canvasStage: box(".canvas-stage"),
        mobileTabs: box(".mobile-tabs"),
        scriptSources: [...document.scripts].map((script) => script.getAttribute("src") || script.getAttribute("type") || ""),
      };
    });
    expect(layout.left.display).not.toBe("none");
    expect(layout.right.display).not.toBe("none");
    expect(layout.canvasStage.height).toBeGreaterThan(240);
    expect(layout.mobileTabs.display).toBe("none");
    expect(layout.scriptSources).toContain("./js/app.js");
    expect(layout.scriptSources.some((source) => source.includes("babel") || source === "text/babel")).toBe(false);

    await frame.getByRole("button", { name: "Rect", exact: true }).click();
    await frame.getByRole("button", { name: "Text", exact: true }).click();
    await expect(frame.getByLabel("Broot layers and Tezos")).toContainText("Rectangle");
    await expect(frame.getByLabel("Broot layers and Tezos")).toContainText("Text");

    await frame.getByLabel("Project name").fill("Broot Harness Artifact");
    await frame.getByRole("button", { name: "Draft", exact: true }).click();
    await expect(frame.getByRole("status")).toContainText("Saved IndexedDB draft");

    const download = page.waitForEvent("download");
    await frame.getByRole("button", { name: "PNG", exact: true }).click();
    const png = await download;
    expect(png.suggestedFilename()).toBe("broot-harness-artifact.png");
    await expect(frame.getByRole("status")).toContainText("PNG exported");

    expect(fatalErrors(errors)).toEqual([]);
  });

  test("opens common image, GIF, and video media from the top-level picker", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    await installBrootFilePickerStub(page);
    await page.addInitScript(() => {
      indexedDB.deleteDatabase("broot");
      window.localStorage.removeItem("wtf-os.window-session.v1");
    });

    await page.goto("/tools/broot", { waitUntil: "domcontentloaded" });
    await expect(page.locator('iframe[title="Broot"]')).toBeVisible();
    const frameLocator = page.frameLocator('iframe[title="Broot"]');
    const brootFrame = await getBrootFrame(page);

    await queueBrootFile(brootFrame, { name: "sample-open.png", type: "image/png", bytes: PNG_BYTES });
    await frameLocator.getByRole("button", { name: "Open", exact: true }).click();
    await expect(frameLocator.getByRole("status")).toContainText("Imported sample-open.png");
    await expect(frameLocator.getByLabel("Broot layers and Tezos")).toContainText("sample-open.png");

    const pickerAccept = await brootFrame.evaluate(() => window.__brootPickerCalls.at(-1)?.types?.[0]?.accept || {});
    expect(pickerAccept["application/json"]).toEqual(expect.arrayContaining([".json", ".broot"]));
    expect(pickerAccept["image/png"]).toContain(".png");
    expect(pickerAccept["image/jpeg"]).toEqual(expect.arrayContaining([".jpg", ".jpeg"]));
    expect(pickerAccept["image/gif"]).toContain(".gif");
    expect(pickerAccept["video/mp4"]).toContain(".mp4");

    await queueBrootFile(brootFrame, { name: "sample-animation.gif", type: "image/gif", bytes: GIF_BYTES });
    await frameLocator.getByRole("button", { name: "Open", exact: true }).click();
    await expect(frameLocator.getByRole("status")).toContainText("Imported sample-animation.gif");
    await expect(frameLocator.getByLabel("Broot layers and Tezos")).toContainText("sample-animation.gif");

    await queueBrootFile(brootFrame, {
      name: "sample-video.mp4",
      type: "video/mp4",
      bytes: [0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 2, 0],
    });
    await frameLocator.getByRole("button", { name: "Open", exact: true }).click();
    await expect(frameLocator.getByRole("status")).toContainText("video layer placeholder");
    await expect(frameLocator.getByLabel("Broot layers and Tezos")).toContainText("sample-video.mp4");
  });

  test("saves and reopens JSON-backed .broot project files", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    await installBrootFilePickerStub(page);
    await page.addInitScript(() => {
      indexedDB.deleteDatabase("broot");
      window.localStorage.removeItem("wtf-os.window-session.v1");
    });

    await page.goto("/tools/broot", { waitUntil: "domcontentloaded" });
    await expect(page.locator('iframe[title="Broot"]')).toBeVisible();
    const frameLocator = page.frameLocator('iframe[title="Broot"]');
    const brootFrame = await getBrootFrame(page);

    await frameLocator.getByLabel("Project name").fill("Vanity Project");
    await frameLocator.getByRole("button", { name: "Rect", exact: true }).click();
    await frameLocator.getByRole("button", { name: "Save", exact: true }).click();
    await expect(frameLocator.getByRole("status")).toContainText("Project saved");

    const saveCall = await brootFrame.evaluate(() => window.__brootSavePickerCalls.at(-1));
    expect(saveCall.suggestedName).toBe("vanity-project.broot");
    expect(saveCall.types[0].accept["application/json"]).toEqual([".broot"]);

    const savedProject = await brootFrame.evaluate(() => ({
      text: window.__brootSavedProjectText,
      type: window.__brootSavedProjectType,
    }));
    expect(savedProject.type).toBe("application/json");
    expect(JSON.parse(savedProject.text)).toMatchObject({
      app: "broot",
      projectName: "Vanity Project",
    });

    await frameLocator.getByLabel("Project name").fill("Unsaved Rename");
    await queueBrootFile(brootFrame, {
      name: "vanity-project.broot",
      type: "",
      bytes: Array.from(Buffer.from(savedProject.text, "utf8")),
    });
    await frameLocator.getByRole("button", { name: "Open", exact: true }).click();
    await expect(frameLocator.getByRole("status")).toContainText("Loaded Vanity Project");
    await expect(frameLocator.getByLabel("Project name")).toHaveValue("Vanity Project");

    const openAccept = await brootFrame.evaluate(() => window.__brootPickerCalls.at(-1)?.types?.[0]?.accept || {});
    expect(openAccept["application/json"]).toEqual([".broot", ".json"]);
  });

  test("loads local FFmpeg and glfx libraries for distortion plus safe layer operations", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      indexedDB.deleteDatabase("broot");
      window.localStorage.removeItem("wtf-os.window-session.v1");
    });

    await page.goto("/tools/broot", { waitUntil: "domcontentloaded" });
    await expect(page.locator('iframe[title="Broot"]')).toBeVisible();
    const frameLocator = page.frameLocator('iframe[title="Broot"]');
    const brootFrame = await getBrootFrame(page);

    await expect(frameLocator.getByLabel("Broot library engines")).toContainText("glfx");
    await expect(frameLocator.getByLabel("Broot library engines")).toContainText("FFmpeg");
    await expect(frameLocator.getByLabel("MP4 mode")).toHaveValue("hold");
    await expect.poll(async () => brootFrame.evaluate(() => ({
      ffmpeg: Boolean(window.FFmpegWASM && window.FFmpegWASM.FFmpeg),
      glfx: Boolean(window.fx && window.fx.canvas),
    }))).toEqual({ ffmpeg: true, glfx: true });

    await frameLocator.getByRole("button", { name: "Rect", exact: true }).click();
    await frameLocator.getByLabel("Warp").selectOption("swirl");
    await frameLocator.getByRole("button", { name: "Warp Selection", exact: true }).click();
    await expect(frameLocator.getByRole("status")).toContainText("glfx swirl warp applied to selection");
    await expect(frameLocator.getByLabel("Broot layers and Tezos")).toContainText("Warp swirl");

    await expect(frameLocator.getByRole("button", { name: "Merge", exact: true })).toBeDisabled();
    const layerButtons = frameLocator.locator(".layer-button");
    await layerButtons.nth(0).click();
    await layerButtons.nth(1).click({ modifiers: ["Shift"] });
    await expect(frameLocator.getByRole("button", { name: "Merge", exact: true })).toBeEnabled();
    await frameLocator.getByRole("button", { name: "Merge", exact: true }).click();
    await expect(frameLocator.getByRole("status")).toContainText("Selected layers merged");

    await frameLocator.getByRole("button", { name: "Flatten", exact: true }).click();
    await expect(frameLocator.getByRole("dialog")).toContainText("Flatten canvas");
    await frameLocator.getByRole("button", { name: "Flatten Canvas", exact: true }).click();
    await expect(frameLocator.getByRole("status")).toContainText("Canvas flattened to one layer");
    await expect(frameLocator.locator(".layer-row")).toHaveCount(1);

    await frameLocator.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(frameLocator.getByRole("status")).toContainText("Undid flatten canvas");
    await expect.poll(async () => frameLocator.locator(".layer-row").count()).toBeGreaterThan(1);
  });

  test("restores wallet state after refresh and mints directly to the HEN contract", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    await installBrootWalletAndHenStubs(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      if (!window.localStorage.getItem("__brootWalletCleanupDone")) {
        indexedDB.deleteDatabase("broot");
        window.localStorage.removeItem("wtf-os.window-session.v1");
        window.localStorage.removeItem("__brootTestActiveAccount");
        window.localStorage.removeItem("__brootRequestPermissions");
        window.localStorage.removeItem("__brootHenMint");
        window.localStorage.removeItem("__brootHenContract");
        for (const key of Object.keys(window.localStorage)) {
          if (key.startsWith("broot.wallet.session.v1") || key === "broot.network.v1") {
            window.localStorage.removeItem(key);
          }
        }
        window.localStorage.setItem("__brootWalletCleanupDone", "1");
      }
    });

    await page.goto("/tools/broot", { waitUntil: "domcontentloaded" });
    await expect(page.locator('iframe[title="Broot"]')).toBeVisible();
    let frameLocator = page.frameLocator('iframe[title="Broot"]');
    let brootFrame = await getBrootFrame(page);

    await frameLocator.getByLabel("Network").selectOption("mainnet");
    await frameLocator.getByRole("button", { name: "Connect Wallet", exact: true }).click();
    await expect(frameLocator.getByRole("status")).toContainText("Wallet connected");
    await expect(frameLocator.getByRole("button", { name: "Connected", exact: true })).toBeDisabled();
    expect(await brootFrame.evaluate(() => localStorage.getItem("__brootRequestPermissions"))).toBe("1");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('iframe[title="Broot"]')).toBeVisible();
    frameLocator = page.frameLocator('iframe[title="Broot"]');
    brootFrame = await getBrootFrame(page);
    await expect(frameLocator.getByLabel("Network")).toHaveValue("mainnet");
    await expect(frameLocator.getByRole("status")).toContainText("Wallet restored");
    await expect(frameLocator.getByRole("button", { name: "Connected", exact: true })).toBeDisabled();
    await expect(frameLocator.getByRole("button", { name: "Connect Wallet", exact: true })).toHaveCount(0);
    expect(await brootFrame.evaluate(() => localStorage.getItem("__brootRequestPermissions"))).toBe("1");

    await frameLocator.getByLabel("Project name").fill("HEN Mint Harness");
    await frameLocator.getByRole("button", { name: "Prepare HEN Mint", exact: true }).click();
    await expect(frameLocator.getByLabel("HEN mint review")).toContainText("Review HEN Mint");
    await expect(frameLocator.getByLabel("HEN mint review")).toContainText("ipfs://bafy-broot-artifact");
    expect(await brootFrame.evaluate(() => localStorage.getItem("__brootHenMint"))).toBeNull();
    await frameLocator.getByRole("button", { name: "Sign HEN Mint", exact: true }).click();
    await expect(frameLocator.getByRole("status")).toContainText("HEN mint confirmed: token #900001");
    await expect(frameLocator.getByLabel("Broot layers and Tezos")).toContainText("HEN");

    const mint = await brootFrame.evaluate(() => JSON.parse(localStorage.getItem("__brootHenMint") || "{}"));
    expect(await brootFrame.evaluate(() => localStorage.getItem("__brootHenContract"))).toBe(HEN_TOKEN_CONTRACT);
    expect(mint.params.address).toBe("tz1BrootWallet1111111111111111111111");
    expect(mint.params.amount).toBe(1);
    expect(mint.params.token_id).toBe(900001);
    expect(mint.params.token_info[""]).toBeTruthy();
    expect(mint.options.gasLimit).toBeGreaterThan(12000);
    expect(mint.options.storageLimit).toBeGreaterThan(8);
    expect(mint.options.fee).toBeGreaterThan(0);
  });
});
