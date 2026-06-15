import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  actorById,
  readPuppetCredentials,
} from "../../e2e/puppets/runtime.mjs";

const SHADOWNET_RPC = "https://rpc.shadownet.teztnets.com";
const SHADOWNET_CHAIN_ID = "NetXsqzbfFenSTS";
const authCacheDir = path.resolve(".e2e", "macaroni-shadownet-auth");

let puppetCredentials;
const actorSessions = new Map();

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function loginAs(request, actor) {
  const response = await request.post("/api/auth/login", {
    data: {
      username: actor.username,
      password: actor.password,
    },
  });
  const payload = await response.json().catch(async () => ({
    raw: await response.text().catch(() => ""),
  }));
  expect(
    response.ok(),
    `password login for ${actor.username}: HTTP ${response.status()} ${JSON.stringify(payload)}`
  ).toBeTruthy();
  expect(payload.username).toBe(actor.username);
  expect(payload.role).toBe(actor.role);
  return payload;
}

async function bootstrapActorSession(playwright, baseURL, actor) {
  const storageState = path.join(authCacheDir, `${actor.id}.json`);
  if (await fileExists(storageState)) {
    const cachedRequest = await playwright.request.newContext({
      baseURL,
      storageState,
    });
    const cachedUserResponse = await cachedRequest.get("/api/auth/user").catch(() => null);
    if (cachedUserResponse?.ok()) {
      const user = await cachedUserResponse.json();
      await cachedRequest.dispose();
      expect(user.username).toBe(actor.username);
      return { actor, user, storageState };
    }
    await cachedRequest.dispose();
  }

  const request = await playwright.request.newContext({ baseURL });
  const user = await loginAs(request, actor);
  await request.storageState({ path: storageState });
  await request.dispose();
  return { actor, user, storageState };
}

function sessionFor(actor) {
  const session = actorSessions.get(actor.id);
  expect(session, `missing Macaroni Shadownet session for ${actor.id}`).toBeTruthy();
  return session;
}

async function actorPage(browser, baseURL, actor) {
  const context = await browser.newContext({
    baseURL,
    storageState: sessionFor(actor).storageState,
  });
  await context.addInitScript(
    ({ walletAddress, rpcUrl }) => {
      window.localStorage.setItem("wtf:network", "shadownet");
      window.localStorage.setItem(
        "wtf:wallet-session",
        JSON.stringify({ address: walletAddress, providerName: "puppet-wallet" })
      );

      const installPuppetBeaconWallet = (tz) => {
        if (!tz || tz.__macaroniPuppetBeaconInstalled) return tz;
        const activeAccountKey = "macaroni-shadownet-puppet-active-account";
        const permissionCountKey = "macaroni-shadownet-puppet-permission-count";
        const readActiveAccount = () => {
          try {
            return JSON.parse(window.localStorage.getItem(activeAccountKey) || "null");
          } catch (_) {
            return null;
          }
        };
        const writeActiveAccount = (account) => {
          try {
            if (account) window.localStorage.setItem(activeAccountKey, JSON.stringify(account));
            else window.localStorage.removeItem(activeAccountKey);
          } catch (_) {
            /* restricted storage */
          }
        };
        const incrementPermissionCount = () => {
          try {
            const current = Number(window.localStorage.getItem(permissionCountKey) || "0");
            window.localStorage.setItem(permissionCountKey, String(current + 1));
          } catch (_) {
            /* restricted storage */
          }
        };
        let activeAccount = readActiveAccount();
        class PuppetBeaconWallet {
          constructor(options = {}) {
            this.options = options;
            this.client = {
              network: options.network || { type: "custom", name: "shadownet", rpcUrl },
              getActiveAccount: async () => activeAccount,
              clearActiveAccount: async () => {
                activeAccount = null;
                writeActiveAccount(null);
              },
              setActiveAccount: async (account) => {
                activeAccount = account || null;
                writeActiveAccount(activeAccount);
              },
            };
          }
          async requestPermissions() {
            incrementPermissionCount();
            activeAccount = {
              address: walletAddress,
              publicKey: "edpkMacaroniPuppetWallet111111111111111111111111111",
              network: this.client.network || {
                type: "custom",
                name: "shadownet",
                rpcUrl,
              },
              scopes: ["operation_request"],
              senderId: "macaroni-shadownet-puppet",
            };
            writeActiveAccount(activeAccount);
          }
          async getPKH() {
            if (!activeAccount) await this.requestPermissions();
            return activeAccount.address;
          }
          async clearActiveAccount() {
            activeAccount = null;
            writeActiveAccount(null);
          }
        }
        tz.BeaconWallet = PuppetBeaconWallet;
        Object.defineProperty(tz, "__macaroniPuppetBeaconInstalled", {
          value: true,
          configurable: true,
        });
        return tz;
      };

      let storedTz;
      Object.defineProperty(window, "TZ", {
        configurable: true,
        get() {
          return storedTz;
        },
        set(value) {
          storedTz = installPuppetBeaconWallet(value);
        },
      });
    },
    { walletAddress: actor.walletAddress, rpcUrl: SHADOWNET_RPC }
  );
  const page = await context.newPage();
  return { context, page };
}

async function macaroniFrame(page) {
  const handle = await page.locator('iframe[title="Macaroni"]').elementHandle();
  expect(handle, "Macaroni iframe should exist").toBeTruthy();
  const frame = await handle.contentFrame();
  expect(frame, "Macaroni iframe should have a frame context").toBeTruthy();
  return frame;
}

async function waitForMacaroniStudio(frame) {
  await frame.waitForSelector("#network");
  await frame.waitForFunction(() => typeof MD !== "undefined" && typeof connect === "function");
}

function fatalErrors(errors) {
  return errors.filter(
    (error) =>
      !/(favicon|ResizeObserver|WebGL|walletbeacon|beacon-node|walletconnect|Failed to load resource: the server responded with a status of 40[13])/i.test(
        error
      )
  );
}

test.describe("Macaroni Shadownet puppet confidence", () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    if (process.env.TEZOS_NETWORK === "mainnet") {
      throw new Error("Refusing to run Macaroni Shadownet tests on mainnet.");
    }
    expect(process.env.TEZOS_NETWORK || "shadownet").toBe("shadownet");

    puppetCredentials = await readPuppetCredentials();
    const actor = actorById(puppetCredentials, "cookiemonster");
    const contestant = actorById(puppetCredentials, "bert");
    expect(actor.role).toBe("trusted_creator");
    expect(contestant.role).toBe("contestant");

    await mkdir(authCacheDir, { recursive: true });
    for (const sessionActor of [actor, contestant]) {
      actorSessions.set(
        sessionActor.id,
        await bootstrapActorSession(playwright, baseURL, sessionActor)
      );
    }
  });

  test("trusted-creator puppet opens Macaroni with Shadownet defaults and a chain-verified wallet", async ({
    browser,
    baseURL,
  }) => {
    const actor = actorById(puppetCredentials, "cookiemonster");
    const { context, page } = await actorPage(browser, baseURL, actor);
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    try {
      await page.goto("/tools/macaroni", { waitUntil: "domcontentloaded" });
      await expect(page.getByText("Blind-mint drop studio")).toBeVisible();

      let frame = await macaroniFrame(page);
      await expect(frame.getByRole("link", { name: /Open Studio/ })).toBeVisible();
      await frame.getByRole("link", { name: /Open Studio/ }).click();

      frame = await macaroniFrame(page);
      await waitForMacaroniStudio(frame);
      await expect(frame.locator("#network")).toHaveValue("shadownet");
      await expect(frame.locator("#netLabel")).toContainText(SHADOWNET_RPC);
      await expect(frame.locator('#pinKind option[value="wtfos"]')).toHaveCount(1);
      await expect(frame.locator("#pinKind")).toHaveValue("pinata");
      await expect(frame.locator("#btnPublishWtfOS")).toBeVisible();
      await expect(frame.locator("#gateway")).toHaveValue("https://ipfs.fileship.xyz/");
      await expect(frame.getByText("Collection logo / cover (≤1 MB, square JPG/PNG)")).toBeVisible();
      await expect(frame.locator("#coverFile")).toHaveAttribute("accept", "image/png,image/jpeg");
      await expect(frame.getByText("Artwork files (≤1 GB each, ≤250 MB average, named by id)")).toBeVisible();

      const chainId = await frame.evaluate(async () => {
        MD.setupToolkit("shadownet");
        return MD.getToolkit().rpc.getChainId();
      });
      expect(chainId).toBe(SHADOWNET_CHAIN_ID);

      await frame.getByRole("button", { name: "Connect wallet" }).click();
      await expect(frame.locator("#walletAddr")).toHaveValue(actor.walletAddress);

      const operationSafety = await frame.evaluate(async () => {
        await MD.assertOperationSafety();
        return "ok";
      });
      expect(operationSafety).toBe("ok");
      expect(fatalErrors(errors)).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("regular signed-in users do not see the wtfOS IPFS provider", async ({
    browser,
    baseURL,
  }) => {
    const actor = actorById(puppetCredentials, "bert");
    const context = await browser.newContext({
      baseURL,
      storageState: sessionFor(actor).storageState,
    });
    const page = await context.newPage();
    try {
      await page.goto("/creation-tools/macaroni/studio.html", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#pinKind");
      await expect(page.locator('#pinKind option[value="wtfos"]')).toHaveCount(0);
      await expect(page.locator("#pinKind")).toHaveValue("pinata");
      await expect(page.locator("#pinJwtWrap")).toBeVisible();
      await expect(page.locator("#btnPublishWtfOS")).toBeHidden();
      await expect(page.locator("#publishPathHint")).toContainText("own website");
      await expect(page.locator("#installerGrid")).toBeVisible();
      await expect(page.locator("#pageCss")).toHaveAttribute("type", "hidden");
      await expect(page.getByText("Custom CSS")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("generated mint page restores wallet state and offers clean disconnect", async ({
    browser,
    baseURL,
  }) => {
    const actor = actorById(puppetCredentials, "cookiemonster");
    const { context, page } = await actorPage(browser, baseURL, actor);
    try {
      await page.addInitScript(
        ({ rpcUrl }) => {
          window.localStorage.setItem(
            "macaroni.preview",
            JSON.stringify({
              title: "Macaroni wallet restore test",
              description: "Generated mint page wallet UX",
              network: "shadownet",
              rpc: rpcUrl,
              contract: "",
              theme: {
                name: 'dark" onclick="alert(1)',
                accent: "red;--bg:url(javascript:alert(1))",
                font: "Arial;src:url(javascript:alert(1))",
                customCss: '</style><img src=x onerror="window.__macaroniXss=1">',
              },
              blocks: [],
            })
          );
        },
        { rpcUrl: SHADOWNET_RPC }
      );
      await page.goto("/creation-tools/macaroni/drop.html?preview=1", {
        waitUntil: "domcontentloaded",
      });

      await expect(page.locator("#btnConnect")).toHaveText("Connect wallet");
      await expect(page.locator("#btnConnect")).toBeEnabled();
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.locator("#supplyProgress")).toHaveAttribute("role", "progressbar");
      await expect(page.locator("#mintStatus")).toHaveAttribute("aria-live", "polite");
      await expect(page.locator("#qtyMinus")).toHaveAttribute("aria-label", "Decrease mint quantity");
      await expect(page.locator("#btnDisconnect")).toBeHidden();
      await expect(page.locator("#walletBalance")).toContainText("Connect a wallet");
      await expect(page.locator("#walletLimitStatus")).toBeAttached();
      await expect(page.locator("#ownedMintStatus")).toBeAttached();
      await expect(page.locator("#customCss")).toHaveText("");
      await expect.poll(() => page.evaluate(() => Boolean(window.__macaroniXss))).toBe(false);
      await expect.poll(() => page.evaluate(() => MD.DEFAULT_GATEWAY)).toBe("https://ipfs.fileship.xyz/");

      await page.evaluate(() => {
        window.localStorage.removeItem("macaroni-shadownet-puppet-permission-count");
        const button = document.getElementById("btnConnect");
        button.click();
        button.click();
        button.click();
      });
      await expect
        .poll(() =>
          page.evaluate(() => Number(window.localStorage.getItem("macaroni-shadownet-puppet-permission-count") || "0"))
        )
        .toBe(1);
      await expect(page.locator("#btnConnect")).toContainText(actor.walletAddress.slice(0, 7));
      await expect(page.locator("#btnConnect")).toBeDisabled();
      await expect(page.locator("#btnConnect")).toHaveAttribute("aria-label", new RegExp(actor.walletAddress));
      await expect(page.locator("#btnDisconnect")).toBeVisible();
      await expect(page.locator("#walletBalance")).toContainText("Wallet balance");

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("#btnDisconnect")).toBeVisible();
      await expect(page.locator("#btnConnect")).toContainText(actor.walletAddress.slice(0, 7));
      await expect(page.locator("#btnConnect")).toBeDisabled();
      await expect(page.locator("#walletBalance")).toContainText("restored");

      await page.getByRole("button", { name: "Disconnect" }).click();
      await expect(page.locator("#btnConnect")).toHaveText("Connect wallet");
      await expect(page.locator("#btnConnect")).toBeEnabled();
      await expect(page.locator("#btnDisconnect")).toBeHidden();
      await expect(page.locator("#walletBalance")).toContainText("Wallet disconnected");

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("#btnConnect")).toHaveText("Connect wallet");
      await expect(page.locator("#btnDisconnect")).toBeHidden();
    } finally {
      await context.close();
    }
  });

  test("Shadownet setup blocks a mismatched RPC before wallet signing", async ({
    browser,
    baseURL,
  }) => {
    const actor = actorById(puppetCredentials, "cookiemonster");
    const { context, page } = await actorPage(browser, baseURL, actor);
    try {
      await page.goto("/tools/macaroni", { waitUntil: "domcontentloaded" });
      let frame = await macaroniFrame(page);
      await frame.getByRole("link", { name: /Open Studio/ }).click();

      frame = await macaroniFrame(page);
      await waitForMacaroniStudio(frame);
      await frame.locator("#rpc").fill("https://rpc.tzkt.io/mainnet");
      await frame.locator("#rpc").dispatchEvent("change");
      await frame.getByRole("button", { name: "Connect wallet" }).click();

      await expect(frame.locator("#log")).toContainText("RPC network mismatch");
      await expect(frame.locator("#walletAddr")).toHaveValue("");
      const logText = await frame.locator("#log").textContent();
      expect(logText).toContain("app is set to shadownet");
      expect(logText).toContain("NetXsqzbfFenSTS");
    } finally {
      await context.close();
    }
  });

  test("Beacon Kukai pairing opens the Shadownet Kukai app", async ({
    browser,
    baseURL,
  }) => {
    const actor = actorById(puppetCredentials, "cookiemonster");
    const context = await browser.newContext({
      baseURL,
      storageState: sessionFor(actor).storageState,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    try {
      await page.goto("/tools/macaroni", { waitUntil: "domcontentloaded" });
      await expect(page.getByText("Blind-mint drop studio")).toBeVisible();

      let frame = await macaroniFrame(page);
      await frame.getByRole("link", { name: /Open Studio/ }).click();

      frame = await macaroniFrame(page);
      await waitForMacaroniStudio(frame);
      await expect(frame.locator("#network")).toHaveValue("shadownet");
      await expect(frame.locator("#netLabel")).toContainText(SHADOWNET_RPC);

      const directWalletPopups = [];
      page.on("popup", (popup) => directWalletPopups.push(popup));
      await frame.getByRole("button", { name: "Connect wallet" }).click();
      const beaconAlert = frame.locator("beacon-alert");
      await expect(beaconAlert).toBeAttached();
      const kukaiOption = beaconAlert.getByText(/^Kukai$/i).first();
      const templeOption = beaconAlert.getByText(/^Temple$/i).first();
      await expect(kukaiOption).toBeVisible();
      await expect(templeOption).toBeVisible();
      await page.waitForTimeout(250);
      expect(
        directWalletPopups,
        "Macaroni Connect must show the Beacon wallet picker before opening a wallet handoff"
      ).toHaveLength(0);

      await kukaiOption.click();
      const useBrowser = beaconAlert.getByRole("button", { name: /Use Browser/i });
      await expect(useBrowser).toBeVisible();

      const popupPromise = page.waitForEvent("popup");
      await useBrowser.click();
      const popup = await popupPromise;
      await expect
        .poll(() => popup.url(), { timeout: 15_000 })
        .toContain("shadownet.kukai.app");
      await popup.waitForLoadState("domcontentloaded", { timeout: 20_000 });
      await expect(popup.locator("body")).toContainText("SHADOWNET", { timeout: 10_000 });
      await popup.close().catch(() => {});
      expect(fatalErrors(errors)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
