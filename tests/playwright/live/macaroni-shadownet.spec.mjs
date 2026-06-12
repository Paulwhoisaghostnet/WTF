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
        let activeAccount = null;
        class PuppetBeaconWallet {
          constructor(options = {}) {
            this.options = options;
            this.client = {
              network: options.network || { type: "custom", name: "shadownet", rpcUrl },
              getActiveAccount: async () => activeAccount,
              clearActiveAccount: async () => {
                activeAccount = null;
              },
              setActiveAccount: async (account) => {
                activeAccount = account || null;
              },
            };
          }
          async requestPermissions() {
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
          }
          async getPKH() {
            if (!activeAccount) await this.requestPermissions();
            return activeAccount.address;
          }
          async clearActiveAccount() {
            activeAccount = null;
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
    expect(actor.role).toBe("trusted_creator");

    await mkdir(authCacheDir, { recursive: true });
    actorSessions.set(actor.id, await bootstrapActorSession(playwright, baseURL, actor));
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
});
