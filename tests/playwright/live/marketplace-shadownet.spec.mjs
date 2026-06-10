import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  actorById,
  readPuppetCredentials,
} from "../../e2e/puppets/runtime.mjs";

const EXPECTED_MARKETPLACE =
  process.env.WTF_E2E_MARKETPLACE_V2_ADDRESS ||
  process.env.MARKETPLACE_CONTRACT_ADDRESS ||
  "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const EXPECTED_IN_APP_MARKET =
  process.env.IN_APP_MARKET_CONTRACT_ADDRESS ||
  process.env.VITE_IN_APP_MARKET_CONTRACT_ADDRESS ||
  "KT1MdvE9hYFpQP7boybqSJ9XNfXjLUG6QZrC";
const EXPECTED_SAMPLE_FA2 =
  process.env.WTF_E2E_MARKETPLACE_SAMPLE_FA2 ||
  "KT1RoZavK1g2suSAMinjZ2Dnto1efkRApR2V";
const RAW_WTF = 100_000_000n;

let puppetCredentials;
const actorSessions = new Map();
const authCacheDir = path.resolve(".e2e", "marketplace-shadownet-auth");

function rawWtf(wholeWtf) {
  return (BigInt(wholeWtf) * RAW_WTF).toString();
}

function fatalErrors(errors) {
  return errors.filter(
    (error) =>
      !/(favicon|ResizeObserver|WebGL|wallet|beacon|taquito|non-boolean attribute|does not recognize the `.*` prop|unknown prop|Failed to load resource: the server responded with a status of 40[13])/i.test(
        error
      )
  );
}

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
  expect(session, `missing Shadownet marketplace session for ${actor.id}`).toBeTruthy();
  return session;
}

async function actorRequestContext(playwright, baseURL, actor) {
  return playwright.request.newContext({
    baseURL,
    storageState: sessionFor(actor).storageState,
  });
}

async function actorPage(browser, baseURL, actor) {
  const context = await browser.newContext({
    baseURL,
    storageState: sessionFor(actor).storageState,
  });
  await context.addInitScript(
    ({ walletAddress }) => {
      window.localStorage.setItem("wtf:network", "shadownet");
      window.localStorage.setItem(
        "wtf:wallet-session",
        JSON.stringify({ address: walletAddress, providerName: "octez.connect" })
      );
    },
    { walletAddress: actor.walletAddress }
  );
  const page = await context.newPage();
  return { context, page };
}

async function expectOkJson(response, label) {
  const payload = await response.json().catch(async () => ({
    raw: await response.text().catch(() => ""),
  }));
  expect(
    response.ok(),
    `${label}: HTTP ${response.status()} ${JSON.stringify(payload).slice(0, 1000)}`
  ).toBeTruthy();
  return payload;
}

function buildOfferFixture(targetOwner, offerer) {
  return {
    contractAddress: EXPECTED_MARKETPLACE,
    legacyContractAddress: null,
    contractVersion: "v2",
    acceptancePolicy: {
      legacyAcceptsRequireTokenAmountOne: true,
      acceptsBlockedWhenQuantityMissing: true,
      expectedTermsRequired: true,
    },
    admin: targetOwner,
    paused: false,
    listings: [],
    auctions: [],
    offers: [
      {
        offerId: 77,
        tokenContract: EXPECTED_SAMPLE_FA2,
        tokenId: "0",
        tokenName: "Shadownet Risk Preview",
        tokenThumbnail: null,
        metadata: null,
        provenance: null,
        offerer,
        offererUserId: null,
        offererUsername: "e2e_ernie",
        offererDisplayName: "Ernie",
        targetOwner,
        targetOwnerUserId: null,
        targetOwnerUsername: "e2e_bert",
        targetOwnerDisplayName: "Bert",
        tokenAmount: "2",
        amountWtf: rawWtf(300),
        unitPriceWtf: rawWtf(150),
        totalWtf: rawWtf(300),
        contractVersion: "v2",
      },
    ],
    counts: {
      listings: 0,
      auctions: 0,
      offers: 1,
    },
  };
}

test.describe("local Shadownet Marketplace V2 puppet confidence", () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    if (process.env.TEZOS_NETWORK === "mainnet") {
      throw new Error("Refusing to run Shadownet marketplace confidence tests on mainnet.");
    }
    expect(process.env.TEZOS_NETWORK || "shadownet").toBe("shadownet");
    expect(EXPECTED_MARKETPLACE).toMatch(/^KT1/);

    puppetCredentials = await readPuppetCredentials();
    const actors = ["bert", "ernie"].map((id) => actorById(puppetCredentials, id));

    await mkdir(authCacheDir, { recursive: true });
    for (const actor of actors) {
      actorSessions.set(actor.id, await bootstrapActorSession(playwright, baseURL, actor));
    }
  });

  test("serves Shadownet Marketplace V2 state to a puppet session", async ({
    playwright,
    baseURL,
  }) => {
    const bert = actorById(puppetCredentials, "bert");
    const request = await actorRequestContext(playwright, baseURL, bert);
    try {
      const user = await expectOkJson(await request.get("/api/auth/user"), "puppet auth user");
      expect(user.username).toBe(bert.username);

      const healthResponse = await request.get("/api/health");
      expect([200, 503]).toContain(healthResponse.status());
      const health = await healthResponse.json();
      expect(health.chain?.network).toBe("shadownet");
      expect(health.chain?.marketplace).toBe(EXPECTED_MARKETPLACE);
      expect(health.chain?.inAppMarket).toBe(EXPECTED_IN_APP_MARKET);

      const wallets = await expectOkJson(await request.get("/api/wallets"), "puppet wallets");
      expect(
        wallets.some(
          (wallet) =>
            String(wallet.walletAddress).toLowerCase() ===
            bert.walletAddress.toLowerCase()
        ),
        `${bert.username} should expose linked Shadownet puppet wallet ${bert.walletAddress}`
      ).toBe(true);

      const onchain = await expectOkJson(
        await request.get("/api/marketplace/onchain?limit=500"),
        "Shadownet marketplace V2 onchain state"
      );
      expect(onchain.contractAddress).toBe(EXPECTED_MARKETPLACE);
      expect(onchain.contractVersion).toBe("v2");
      expect(onchain.legacyContractAddress).toBeFalsy();
      expect(onchain.paused).toBe(false);
      expect(onchain.acceptancePolicy?.expectedTermsRequired).toBe(true);

      for (const listing of onchain.listings ?? []) {
        expect(listing.contractVersion).toBe("v2");
        expect(Number(listing.tokenAmount), "listing tokenAmount").toBeGreaterThan(0);
        expect(Number(listing.remainingQuantity), "listing remainingQuantity").toBeGreaterThan(0);
        expect(Number(listing.unitPriceWtf), "listing unitPriceWtf").toBeGreaterThan(0);
      }
      for (const offer of onchain.offers ?? []) {
        expect(offer.contractVersion).toBe("v2");
        expect(offer.offerId, "V2 offer id").not.toBeNull();
        expect(Number(offer.tokenAmount), "offer tokenAmount").toBeGreaterThan(0);
        expect(Number(offer.unitPriceWtf), "offer unitPriceWtf").toBeGreaterThan(0);
        expect(Number(offer.totalWtf), "offer totalWtf").toBeGreaterThan(0);
        expect(offer.targetOwner).toMatch(/^tz/);
      }
    } finally {
      await request.dispose();
    }
  });

  test("puppet browser loads marketplace locally with Shadownet wallet/network state", async ({
    browser,
    baseURL,
  }) => {
    const bert = actorById(puppetCredentials, "bert");
    const { context, page } = await actorPage(browser, baseURL, bert);
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.route("**/api/marketplace/external/mine", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rows: [], fetchedAt: new Date().toISOString() }),
      })
    );
    try {
      await page.goto("/marketplace", { waitUntil: "domcontentloaded" });
      await expect(
        page.locator("span").filter({ hasText: "WTF On Chain Market + Trade Boards" })
      ).toBeVisible();
      await expect(page.getByText(/active listing\(s\)/)).toBeVisible();
      expect(fatalErrors(errors)).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("offer acceptance preview exposes V2 quantity, price, token, owner, and contract version before signing", async ({
    browser,
    baseURL,
  }) => {
    const bert = actorById(puppetCredentials, "bert");
    const ernie = actorById(puppetCredentials, "ernie");
    const { context, page } = await actorPage(browser, baseURL, bert);
    const fixture = buildOfferFixture(bert.walletAddress, ernie.walletAddress);
    try {
      await page.route("**/api/marketplace/onchain**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fixture),
        })
      );
      await page.route("**/api/marketplace/trade-board**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            contractAddress: EXPECTED_MARKETPLACE,
            legacyContractAddress: null,
            contractVersion: "v2",
            acceptancePolicy: fixture.acceptancePolicy,
            items: [],
            pagination: {
              limit: 200,
              offset: 0,
              count: 0,
              hasMore: false,
              nextOffset: 0,
            },
          }),
        })
      );
      await page.route("**/api/marketplace/external/mine", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ rows: [], fetchedAt: new Date().toISOString() }),
        })
      );

      await page.goto("/marketplace", { waitUntil: "domcontentloaded" });
      await page.getByText("My Activity").click();
      await expect(page.getByText("Shadownet Risk Preview - 300.00 WTF from")).toBeVisible();
      await page.getByRole("button", { name: "Accept Offer" }).click();

      await expect(page.getByTestId("marketplace-offer-acceptance-dialog")).toBeVisible();
      await expect(page.getByTestId("marketplace-offer-accept-quantity")).toContainText("2");
      await expect(page.getByTestId("marketplace-offer-accept-unit-wtf")).toContainText("150.00");
      await expect(page.getByTestId("marketplace-offer-accept-total-wtf")).toContainText("300.00");
      await expect(page.getByTestId("marketplace-offer-accept-token")).toContainText(
        `${EXPECTED_SAMPLE_FA2} #0`
      );
      await expect(page.getByTestId("marketplace-offer-accept-owner")).toContainText(
        bert.walletAddress
      );
      await expect(page.getByTestId("marketplace-offer-accept-offerer")).toContainText(
        ernie.walletAddress
      );
      await expect(page.getByTestId("marketplace-offer-accept-contract")).toContainText("v2");
      await expect(page.getByTestId("marketplace-offer-acceptance-continue")).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
