import { chromium, expect, test } from "@playwright/test";

const PORT = Number(process.env.HARNESS_PORT || 4173);
const HOST = "wtf-admin.wtfos.me";
const BASE_URL = `http://${HOST}:${PORT}`;
const CHAIN_ID = "NetXsqzbfFenSTS";

const PASTA_WTFME_PAGES = [
  {
    slug: "home",
    title: "Pasta Protocol Shadownet Proofs",
    html: `<main data-pasta-hosted-page="landing" data-pasta-network="shadownet" data-pasta-chain-id="${CHAIN_ID}" data-pasta-wallet-action="connect">
      <h1>Pasta Protocol Shadownet Proofs</h1>
      <p>Branding: Pasta Protocol served by WTF.ME.</p>
      <article data-pasta-proof-card="spaghetti">
        <h2>Spaghetti Proof Token</h2>
        <p><code>KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH</code></p>
        <p><code>spaghetti-shadownet-e2e-mr19mwvk</code></p>
        <a href="/collection">Open collection page</a>
      </article>
      <article data-pasta-proof-card="gnocchi">
        <h2>Gnocchi Proof Open Edition</h2>
        <p><code>KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax</code></p>
        <p><code>gnocchi-shadownet-e2e-mr1aacew</code></p>
        <a href="/mint">Open mint page</a>
      </article>
      <button type="button" data-pasta-wallet-action="connect">Connect wallet</button>
    </main>`,
  },
  {
    slug: "mint",
    title: "Gnocchi Proof Open Edition",
    html: `<main data-pasta-hosted-page="mint" data-pasta-network="shadownet" data-pasta-chain-id="${CHAIN_ID}" data-pasta-app="gnocchi" data-pasta-contract="KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax" data-pasta-token-id="0" data-pasta-relationship-group="gnocchi-shadownet-e2e-mr1aacew" data-pasta-wallet-action="connect" data-pasta-mint-entrypoint="open_mint" data-pasta-price-mutez="1">
      <h1>Gnocchi Proof Open Edition</h1>
      <p>Shadownet proof mint page for Pasta Protocol on WTF.ME.</p>
      <p>Mint route: <code>open_mint</code></p>
      <p>Price: <code>1 mutez</code></p>
      <a href="https://shadownet.tzkt.io/KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax">View on Shadownet TzKT</a>
      <button type="button" data-pasta-wallet-action="connect">Connect wallet</button>
      <button type="button" data-pasta-purchase-action="mint">Mint on Shadownet</button>
    </main>`,
  },
  {
    slug: "collection",
    title: "Spaghetti Proof Token",
    html: `<main data-pasta-hosted-page="collection" data-pasta-network="shadownet" data-pasta-chain-id="${CHAIN_ID}" data-pasta-app="spaghetti" data-pasta-contract="KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH" data-pasta-token-id="0" data-pasta-relationship-group="spaghetti-shadownet-e2e-mr19mwvk" data-pasta-wallet-action="connect">
      <h1>Spaghetti Proof Token</h1>
      <p>Collection page for Pasta Protocol on WTF.ME.</p>
      <p>Relationship group: <code>spaghetti-shadownet-e2e-mr19mwvk</code></p>
      <a href="https://shadownet.tzkt.io/KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH">View on Shadownet TzKT</a>
      <a href="/mint">Open mint page</a>
      <button type="button" data-pasta-wallet-action="connect">Connect wallet</button>
    </main>`,
  },
];

async function seedPublishedPastaSite(request) {
  const response = await request.post("/__test/state", {
    data: {
      userRole: "admin",
      username: "wtf-admin",
      wtfUserSiteClaimed: true,
      wtfUserSiteStatus: "published",
      wtfUserSitePublishedAt: "2026-07-01T00:00:00.000Z",
      wtfUserSitePages: PASTA_WTFME_PAGES,
    },
  });
  expect(response.ok()).toBeTruthy();
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
    await seedPublishedPastaSite(request);

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
      await expect(page.locator("body")).toContainText("KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH");
      await expect(page.locator("body")).toContainText("KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax");

      const mintResponse = await page.goto("/mint", { waitUntil: "domcontentloaded" });
      expect(mintResponse?.status()).toBe(200);
      const mint = page.locator('[data-pasta-hosted-page="mint"]');
      await expect(mint).toBeVisible();
      await expect(mint).toHaveAttribute("data-pasta-network", "shadownet");
      await expect(mint).toHaveAttribute("data-pasta-contract", "KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax");
      await expect(mint).toHaveAttribute("data-pasta-token-id", "0");
      await expect(mint).toHaveAttribute("data-pasta-mint-entrypoint", "open_mint");
      await expect(mint).toHaveAttribute("data-pasta-price-mutez", "1");
      await expect(page.locator('[data-pasta-purchase-action="mint"]')).toBeVisible();
      await expect(page.locator('a[href="https://shadownet.tzkt.io/KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax"]')).toBeVisible();

      const collectionResponse = await page.goto("/collection", { waitUntil: "domcontentloaded" });
      expect(collectionResponse?.status()).toBe(200);
      const collection = page.locator('[data-pasta-hosted-page="collection"]');
      await expect(collection).toBeVisible();
      await expect(collection).toHaveAttribute("data-pasta-contract", "KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH");
      await expect(collection).toHaveAttribute("data-pasta-token-id", "0");
      await expect(collection).toHaveAttribute("data-pasta-relationship-group", "spaghetti-shadownet-e2e-mr19mwvk");
      await expect(page.locator('a[href="https://shadownet.tzkt.io/KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH"]')).toBeVisible();

      await expect
        .poll(async () => {
          const state = await (await request.get("/__test/state")).json();
          return state.interactionLog
            .filter((event) => event.eventType === "wtf_site.public.viewed")
            .map((event) => event.metadata?.pastaHostedPage)
            .sort();
        })
        .toEqual(["collection", "landing", "mint"]);

      expect(fatalErrors(errors)).toEqual([]);
    } finally {
      await context.close();
      await browser.close();
    }
  });
});
