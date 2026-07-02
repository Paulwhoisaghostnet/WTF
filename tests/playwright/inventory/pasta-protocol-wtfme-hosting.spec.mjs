import { chromium, expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.HARNESS_PORT || 4173);
const HOST = "wtf-admin.wtfos.me";
const BASE_URL = `http://${HOST}:${PORT}`;
const proofData = JSON.parse(readFileSync("shared/pasta-shadownet-proof-contracts.json", "utf8"));
const CHAIN_ID = proofData.network.chainId;

function proofContract(app) {
  const contract = proofData.contracts.find((item) => item.app === app);
  if (!contract) throw new Error(`Missing proof contract fixture for ${app}`);
  return contract;
}

function explorerHref(contract) {
  return `${proofData.network.tzkt}/${contract.contract}`;
}

function landingCards() {
  return proofData.contracts.map((contract) => `<article data-pasta-proof-card="${contract.app}">
        <h2>${contract.title}</h2>
        <p><code>${contract.contract}</code></p>
        <p><code>${contract.relationshipGroup}</code></p>
        <a href="${contract.route === "/" ? explorerHref(contract) : contract.route}">${contract.app}</a>
      </article>`).join("\n");
}

const spaghetti = proofContract("spaghetti");
const gnocchi = proofContract("gnocchi");

const PASTA_WTFME_PAGES = [
  {
    slug: "home",
    title: "Pasta Protocol Shadownet Proofs",
    html: `<main data-pasta-hosted-page="landing" data-pasta-network="shadownet" data-pasta-chain-id="${CHAIN_ID}" data-pasta-wallet-action="connect">
      <h1>Pasta Protocol Shadownet Proofs</h1>
      <p>Branding: Pasta Protocol served by WTF.ME.</p>
      ${landingCards()}
      <button type="button" data-pasta-wallet-action="connect">Connect wallet</button>
    </main>`,
  },
  {
    slug: "mint",
    title: gnocchi.title,
    html: `<main data-pasta-hosted-page="mint" data-pasta-network="shadownet" data-pasta-chain-id="${CHAIN_ID}" data-pasta-app="${gnocchi.app}" data-pasta-contract="${gnocchi.contract}" data-pasta-token-id="${gnocchi.tokenId}" data-pasta-relationship-group="${gnocchi.relationshipGroup}" data-pasta-wallet-action="connect" data-pasta-mint-entrypoint="${gnocchi.mintEntrypoint}" data-pasta-price-mutez="${gnocchi.priceMutez}">
      <h1>${gnocchi.title}</h1>
      <p>Shadownet proof mint page for Pasta Protocol on WTF.ME.</p>
      <p>Mint route: <code>${gnocchi.mintEntrypoint}</code></p>
      <p>Price: <code>${gnocchi.priceMutez} mutez</code></p>
      <a href="${explorerHref(gnocchi)}">View on Shadownet TzKT</a>
      <button type="button" data-pasta-wallet-action="connect">Connect wallet</button>
      <button type="button" data-pasta-purchase-action="mint">Mint on Shadownet</button>
    </main>`,
  },
  {
    slug: "collection",
    title: spaghetti.title,
    html: `<main data-pasta-hosted-page="collection" data-pasta-network="shadownet" data-pasta-chain-id="${CHAIN_ID}" data-pasta-app="${spaghetti.app}" data-pasta-contract="${spaghetti.contract}" data-pasta-token-id="${spaghetti.tokenId}" data-pasta-relationship-group="${spaghetti.relationshipGroup}" data-pasta-wallet-action="connect">
      <h1>${spaghetti.title}</h1>
      <p>Collection page for Pasta Protocol on WTF.ME.</p>
      <p>Relationship group: <code>${spaghetti.relationshipGroup}</code></p>
      <a href="${explorerHref(spaghetti)}">View on Shadownet TzKT</a>
      <a href="/mint">Open mint page</a>
      <button type="button" data-pasta-wallet-action="connect">Connect wallet</button>
    </main>`,
  },
];

async function publishPastaSiteThroughApi(request) {
  const reset = await request.post("/__test/state", {
    data: {
      userRole: "admin",
      username: "wtf-admin",
    },
  });
  expect(reset.ok()).toBeTruthy();

  const initial = await (await request.get("/api/wtf-sites/my")).json();
  expect(initial.site).toBeNull();

  const claim = await request.post("/api/wtf-sites/claim", { data: {} });
  expect(claim.status()).toBe(201);
  const claimed = await claim.json();
  expect(claimed.site?.status).toBe("draft");
  expect(claimed.site?.host).toBe(HOST);

  for (const pastaPage of PASTA_WTFME_PAGES) {
    const saved = await request.put(`/api/wtf-sites/pages/${encodeURIComponent(pastaPage.slug)}`, {
      data: {
        title: pastaPage.title,
        html: pastaPage.html,
      },
    });
    expect(saved.ok()).toBeTruthy();
  }

  const publish = await request.post("/api/wtf-sites/publish", { data: {} });
  expect(publish.ok()).toBeTruthy();
  const published = await publish.json();
  expect(published.site?.status).toBe("published");
  expect(published.site?.publishedAt).toBeTruthy();
  expect(published.site?.pages?.map((page) => page.slug).sort()).toEqual(["collection", "home", "mint"]);
  expect(published.site?.versions?.[0]?.pageSlugs?.sort()).toEqual(["collection", "home", "mint"]);
}

function fatalErrors(errors) {
  return errors.filter((message) => {
    if (/Failed to load resource: the server responded with a status of 404/.test(message)) return false;
    if (/Cross-Origin-Opener-Policy header has been ignored/.test(message)) return false;
    return true;
  });
}

test.describe("interaction inventory - Pasta Protocol WTF.ME hosted pages", () => {
  test.setTimeout(120_000);

  test("serves Shadownet landing, mint, and collection pages from a published WTF.ME host", async ({ request }) => {
    await publishPastaSiteThroughApi(request);

    const browser = await chromium.launch({
      headless: true,
      args: [
        `--host-resolver-rules=MAP ${HOST} 127.0.0.1`,
        `--unsafely-treat-insecure-origin-as-secure=${BASE_URL}`,
      ],
    });
    const context = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });

    try {
      const landingResponse = await page.goto("/", { waitUntil: "domcontentloaded" });
      expect(landingResponse?.status()).toBe(200);
      expect(landingResponse?.headers()["x-wtfos-surface"]).toBe("user-site");
      const csp = landingResponse?.headers()["content-security-policy"] || "";
      expect(csp).toContain("wss://relay.walletconnect.org");
      expect(csp).toContain("https://verify.walletconnect.org");
      expect(landingResponse?.headers()["cross-origin-opener-policy"]).toBe("same-origin-allow-popups");

      await expect(page.locator('[data-pasta-hosted-page="landing"]')).toBeVisible();
      await expect(page.locator('[data-pasta-hosted-page="landing"]')).toHaveAttribute("data-pasta-chain-id", CHAIN_ID);
      await expect(page.locator("body")).toContainText("Pasta Protocol");
      await expect(page.locator("body")).toContainText("WTF.ME");
      for (const contract of proofData.contracts) {
        await expect(page.locator("body")).toContainText(contract.contract);
        await expect(page.locator("body")).toContainText(contract.relationshipGroup);
      }

      const mintResponse = await page.goto("/mint", { waitUntil: "domcontentloaded" });
      expect(mintResponse?.status()).toBe(200);
      const mint = page.locator('[data-pasta-hosted-page="mint"]');
      await expect(mint).toBeVisible();
      await expect(mint).toHaveAttribute("data-pasta-network", "shadownet");
      await expect(mint).toHaveAttribute("data-pasta-contract", gnocchi.contract);
      await expect(mint).toHaveAttribute("data-pasta-token-id", gnocchi.tokenId);
      await expect(mint).toHaveAttribute("data-pasta-mint-entrypoint", gnocchi.mintEntrypoint);
      await expect(mint).toHaveAttribute("data-pasta-price-mutez", gnocchi.priceMutez);
      await expect(page.locator('[data-pasta-purchase-action="mint"]')).toBeVisible();
      await expect(page.locator(`a[href="${explorerHref(gnocchi)}"]`)).toBeVisible();

      const collectionResponse = await page.goto("/collection", { waitUntil: "domcontentloaded" });
      expect(collectionResponse?.status()).toBe(200);
      const collection = page.locator('[data-pasta-hosted-page="collection"]');
      await expect(collection).toBeVisible();
      await expect(collection).toHaveAttribute("data-pasta-contract", spaghetti.contract);
      await expect(collection).toHaveAttribute("data-pasta-token-id", spaghetti.tokenId);
      await expect(collection).toHaveAttribute("data-pasta-relationship-group", spaghetti.relationshipGroup);
      await expect(page.locator(`a[href="${explorerHref(spaghetti)}"]`)).toBeVisible();

      await expect
        .poll(async () => {
          const state = await (await request.get("/__test/state")).json();
          return state.interactionLog
            .filter((event) => event.eventType === "wtf_site.public.viewed")
            .map((event) => event.metadata?.pastaHostedPage)
            .sort();
        })
        .toEqual(["collection", "landing", "mint"]);

      const harnessState = await (await request.get("/__test/state")).json();
      const eventTypes = harnessState.interactionLog.map((event) => event.eventType);
      expect(eventTypes).toEqual(expect.arrayContaining([
        "wtf_site.claimed",
        "wtf_site.page_saved",
        "wtf_site.published",
        "wtf_site.public.viewed",
      ]));
      expect(
        harnessState.interactionLog
          .filter((event) => event.eventType === "wtf_site.page_saved")
          .map((event) => event.metadata?.slug)
          .sort()
      ).toEqual(["collection", "home", "mint"]);
      const publishedEvent = harnessState.interactionLog.find((event) => event.eventType === "wtf_site.published");
      expect(publishedEvent?.metadata?.pastaHostedPages?.sort()).toEqual(["collection", "landing", "mint"]);

      expect(fatalErrors(errors)).toEqual([]);
    } finally {
      await context.close();
      await browser.close();
    }
  });
});
