import { test, expect } from "@playwright/test";

const HANDOFF_KEY = "wtfos.pasta.handoff.v1:spaghetti";
const PUPPET_ACCOUNT = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const PUPPET_COLLECTION = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const SHADOWNET_CHAIN_ID = "NetXsqzbfFenSTS";

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

async function installSpaghettiPublishHarness(frame) {
  await frame.evaluate(
    ({ account, collection, chainId }) => {
      const operations = [];
      const pinnedJson = [];

      const fakeContract = {
        address: collection,
        methodsObject: {
          create_token(info) {
            return { __entrypoint: "create_token", info };
          },
          mint(payload) {
            return { __entrypoint: "mint", payload };
          },
          set_sale(payload) {
            return { __entrypoint: "set_sale", payload };
          },
        },
      };

      function makeBatch(kind) {
        const calls = [];
        return {
          withContractCall(call) {
            calls.push(call);
            return this;
          },
          async send() {
            operations.push({
              kind,
              entrypoints: calls.map((call) => call.__entrypoint),
              payloads: calls.map((call) => call.payload || null),
            });
            return {
              async confirmation() {
                return 1;
              },
            };
          },
        };
      }

      const fakeToolkit = {
        rpc: {
          async getChainId() {
            return chainId;
          },
        },
        tz: {
          async getBalance() {
            return { toNumber: () => 42_000_000 };
          },
        },
        contract: {
          async at() {
            return {
              async storage() {
                return { next_token_id: 0 };
              },
            };
          },
        },
        wallet: {
          originate({ code, storage }) {
            operations.push({
              kind: "originate",
              codePrim: Array.isArray(code) ? code[0]?.prim : null,
              administrator: storage?.administrator || null,
              hasMetadata: Boolean(storage?.metadata),
            });
            return {
              async send() {
                return {
                  async contract() {
                    return fakeContract;
                  },
                };
              },
            };
          },
          async at(address) {
            operations.push({ kind: "wallet_at", address });
            return fakeContract;
          },
          batch() {
            const batchCount = operations.filter((op) => op.kind.endsWith("_batch")).length;
            const kind = ["create_batch", "mint_batch", "sale_batch"][batchCount] || "extra_batch";
            return makeBatch(kind);
          },
        },
      };

      window.__spaghettiPublishProof = { operations, pinnedJson };

      window.MD.getAccount = () => account;
      window.MD.connectWallet = async () => account;
      window.MD.assertOperationSafety = async () => {
        const actual = await fakeToolkit.rpc.getChainId();
        if (actual !== chainId) throw new Error(`wrong chain ${actual}`);
        operations.push({ kind: "chain_guard", chainId: actual });
        return account;
      };
      window.MD.getToolkit = () => fakeToolkit;
      window.MD.setupToolkit = () => fakeToolkit;
      window.MD.pinProviderFromForm = () => ({ kind: "node", url: "http://127.0.0.1:5001" });
      window.MD.pinBlob = async (_provider, _blob, name) => `bafy${String(name || "artifact").replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
      window.MD.pinJson = async (_provider, payload, name) => {
        pinnedJson.push({ name, payload });
        return `bafy${String(name || "json").replace(/[^a-z0-9]/gi, "").toLowerCase()}${pinnedJson.length}`;
      };
    },
    { account: PUPPET_ACCOUNT, collection: PUPPET_COLLECTION, chainId: SHADOWNET_CHAIN_ID },
  );
}

test.describe("interaction inventory — Pasta Protocol publishing", () => {
  test("all newer Pasta publishers export a self-hosted site and return it to Colander", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    const apps = [
      { id: "spaghetti", label: "Spaghetti", contract: "#existingKt", token: "#exportTokenId" },
      { id: "gnocchi", label: "Gnocchi", contract: "#mintKt", token: "#mintTokenId" },
      { id: "ravioli", label: "Ravioli", contract: "#opKt", token: "#opTokenId" },
      { id: "rotini", label: "Rotini", contract: "#existingKt", token: "#exportTokenId" },
      { id: "penne", label: "Penne", contract: "#contractKt", token: "#claimTokenId" },
      { id: "lasagna", label: "Lasagna", contract: "#contractKt" },
    ];

    await page.goto("/tools/colander", { waitUntil: "domcontentloaded" });
    for (const app of apps) {
      const projectId = `site-proof-${app.id}`;
      await page.evaluate(
        ({ id, title, toolId }) => {
          const now = new Date().toISOString();
          localStorage.setItem("wtfos.pasta.colander.workspace.v1", JSON.stringify([{ schema: "pasta-project@1", id, title, toolId, stage: "deployed", network: "shadownet", contracts: [], artifacts: [], createdAt: now, updatedAt: now }]));
          localStorage.setItem("wtf:network", "shadownet");
        },
        { id: projectId, title: `${app.label} site proof`, toolId: app.id },
      );

      await page.goto(`/tools/${app.id}?handoff=colander-workspace&projectId=${projectId}&projectTitle=${encodeURIComponent(`${app.label} site proof`)}&network=shadownet&kind=${app.id}&contract=${PUPPET_COLLECTION}`, { waitUntil: "domcontentloaded" });
      const frame = page.frameLocator(`iframe[title="${app.label}"]`);
      await expect(frame.locator(app.contract)).toHaveValue(PUPPET_COLLECTION);
      if (app.token) await frame.locator(app.token).fill("0");

      const downloadPromise = page.waitForEvent("download");
      await frame.locator("#btnExportSite").click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(`${app.id}-site.zip`);
      const stream = await download.createReadStream();
      const firstChunk = await new Promise((resolve, reject) => {
        stream.once("data", resolve);
        stream.once("error", reject);
      });
      expect(Buffer.from(firstChunk).subarray(0, 2).toString()).toBe("PK");
      await expect(frame.locator("#exportSiteStatus")).toContainText("Downloaded site zip");

      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("wtfos.pasta.colander.workspace.v1") || "[]"));
      expect(stored[0].stage).toBe("published");
      expect(stored[0].artifacts).toEqual([
        expect.objectContaining({ kind: "self_hosted_site", toolId: app.id, contract: PUPPET_COLLECTION, fileName: `${app.id}-site.zip` }),
      ]);
    }
  });

  test("exported buy, mint, claim, redeem, and exhibition pages execute their public contract stories", async ({ page }) => {
    const interactiveApps = [
      { id: "spaghetti", action: "Buy editions", entrypoint: "buy", chainState: "Primary sale open" },
      { id: "rotini", action: "Buy editions", entrypoint: "buy", chainState: "Primary sale open" },
      { id: "gnocchi", action: "Mint editions", entrypoint: "open_mint", chainState: "Minting open" },
      { id: "penne", action: "Claim allocation", entrypoint: "claim", chainState: "Claim open" },
      { id: "ravioli", mode: "buy", action: "Buy bundle editions", entrypoint: "buy", chainState: "Primary sale open" },
      { id: "ravioli", mode: "redeem", action: "Redeem editions", entrypoint: "redeem", chainState: "Redeemable" },
    ];
    const metadataUri = `data:application/json,${encodeURIComponent(JSON.stringify({ name: "Harness Exhibition", statement: "A self-hosted exhibition proof." }))}`;
    const metadataHex = Array.from(metadataUri).map((char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join("");

    await page.route("**/creation-tools/*/pasta.config.js", async (route) => {
      const app = new URL(route.request().url()).pathname.split("/")[2];
      await route.fulfill({
        contentType: "text/javascript",
        body: `window.PASTA_SITE_CONFIG=${JSON.stringify({ app, label: app[0].toUpperCase() + app.slice(1), title: `${app} public proof`, description: "Independent collector page.", contract: PUPPET_COLLECTION, tokenId: 0, network: "shadownet" })};`,
      });
    });
    await page.route("**/creation-tools/*/js/site.js", async (route) => {
      const app = new URL(route.request().url()).pathname.split("/")[2];
      const response = await route.fetch();
      const runtime = await response.text();
      const harness = `
        (() => {
          const operations = [];
          const operation = (entrypoint, payload, options) => ({ async confirmation(){ operations.push({ entrypoint, payload, options, confirmed: true }); return 1; } });
          const methodsObject = {
            open_mint(payload){ return { async send(options){ operations.push({ entrypoint: "open_mint", payload, options }); return operation("open_mint", payload, options); } }; },
            claim(payload){ return { async send(){ operations.push({ entrypoint: "claim", payload }); return operation("claim", payload); } }; },
            redeem(payload){ return { async send(){ operations.push({ entrypoint: "redeem", payload }); return operation("redeem", payload); } }; },
            buy(payload){ return { async send(options){ operations.push({ entrypoint: "buy", payload, options }); return operation("buy", payload, options); } }; }
          };
          const fixedSale = { active:true, price:1250000, remaining:3, seller:"${PUPPET_ACCOUNT}", treasury:"${PUPPET_ACCOUNT}" };
          const storageByApp = {
            spaghetti: { sales:new Map([["0", fixedSale]]), token_metadata:new Map() },
            rotini: { sales:new Map([["0", fixedSale]]), token_metadata:new Map() },
            gnocchi: { sales: new Map([["0", { active:true, base_price:1000000, increment:500000, step_size:2, max_supply:100 }]]), total_supply:new Map([["0", 2]]) },
            penne: { claim_active:true, claim_start:null, claim_end:null },
            ravioli: { bundles:new Map([["0", { redeemable:true, mystery:false, item_count:3, contents_uri:"697066733a2f2f62616679" }]]), sales: sessionStorage.getItem("pasta.ravioli.mode") === "buy" ? new Map([["0", fixedSale]]) : new Map() },
            lasagna: { current_revision:0, revision_count:1, revisions:new Map([["0", { metadata_uri:"${metadataHex}", items:[{contract:"${PUPPET_COLLECTION}",token_id:0},{contract:"${PUPPET_COLLECTION}",token_id:1}] }]]) }
          };
          const fakeContract = { async storage(){ return storageByApp["${app}"]; }, methodsObject };
          const toolkit = { contract:{ async at(){ return fakeContract; } }, wallet:{ async at(){ return fakeContract; } } };
          window.__pastaPublicSiteProof = { operations };
          MD.setupToolkit = () => toolkit;
          MD.getToolkit = () => toolkit;
          MD.connectWallet = async () => "${PUPPET_ACCOUNT}";
          MD.assertOperationSafety = async () => "${PUPPET_ACCOUNT}";
        })();
      `;
      await route.fulfill({ response, body: `${harness}\n${runtime}` });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    for (const app of interactiveApps) {
      await page.evaluate((mode) => mode ? sessionStorage.setItem("pasta.ravioli.mode", mode) : sessionStorage.removeItem("pasta.ravioli.mode"), app.mode || "");
      await page.goto(`/creation-tools/${app.id}/site.html`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#chainState")).toHaveText(app.chainState);
      await expect(page.locator("#submit")).toHaveText(app.action);
      if (app.id === "ravioli" && app.mode === "buy") {
        await expect(page.locator("#secondarySubmit")).toHaveText("Redeem held editions");
        await expect(page.locator("#secondarySubmit")).toBeVisible();
      }
      await page.locator("#connect").click();
      if (app.id === "spaghetti") {
        await page.locator("#amount").fill("4");
        await page.locator("#submit").click();
        await expect(page.locator("#status")).toHaveText("Only 3 editions remain.");
        expect(await page.evaluate(() => window.__pastaPublicSiteProof.operations)).toHaveLength(0);
        await page.locator("#amount").fill("1");
      }
      await page.locator("#submit").click();
      await expect(page.locator("#status")).toHaveText("Confirmed on Tezos. On-chain state refreshed.");
      const operations = await page.evaluate(() => window.__pastaPublicSiteProof.operations);
      expect(operations).toEqual(expect.arrayContaining([expect.objectContaining({ entrypoint: app.entrypoint })]));
    }

    await page.goto("/creation-tools/lasagna/site.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#chainState")).toHaveText("1 revisions · 2 works shown");
    await expect(page.locator("#submit")).toBeHidden();
    await expect(page.locator("#actionTitle")).toHaveText("On-chain exhibition");
  });

  test("imports CH-EASE handoff into Spaghetti and proves Shadownet publish choreography", async ({
    page,
    request,
  }) => {
    await setHarnessRole(request, "admin");
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });

    await page.addInitScript(
      ({ handoffKey }) => {
        window.sessionStorage.setItem(
          handoffKey,
          JSON.stringify({
            schemaVersion: "wtfos.pasta.chease-package.v1",
            kind: "collection",
            targetApp: "spaghetti",
            title: "Harness Spaghetti Collection",
            description: "Executable CH-EASE to Spaghetti handoff proof.",
            symbol: "HSPG",
            relationship: {
              parent_contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
              collection_group: "harness-suite",
            },
            items: [
              {
                name: "Moon Salad Deluxe",
                description: "A token imported from CH-EASE.",
                artifactUri: "ipfs://bafybeimoon",
                mimeType: "image/png",
                tags: ["spaghetti", "handoff"],
              },
              {
                name: "Orbit Ziti",
                description: "A second token for batch choreography.",
                artifactUri: "ipfs://bafybeiorbit",
                mimeType: "image/png",
                tags: ["batch"],
              },
            ],
          }),
        );
      },
      { handoffKey: HANDOFF_KEY },
    );

    await page.goto(`/tools/spaghetti?handoff=chease-package&handoffKey=${encodeURIComponent(HANDOFF_KEY)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("Spaghetti").first()).toBeVisible();

    const iframe = page.locator('iframe[title="Spaghetti"]');
    await expect(iframe).toHaveAttribute("src", /handoff=chease-package/);
    const frame = page.frameLocator('iframe[title="Spaghetti"]');
    await expect(frame.locator("#collName")).toHaveValue("Harness Spaghetti Collection");
    await expect(frame.locator("#collSymbol")).toHaveValue("HSPG");
    await expect(frame.locator("#relParent")).toHaveValue("KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton");
    await expect(frame.locator("#relGroup")).toHaveValue("harness-suite");
    await expect(frame.locator("#tokens .pp-token")).toHaveCount(2);
    await expect(frame.locator(".t-name").nth(0)).toHaveValue("Moon Salad Deluxe");
    await expect(frame.locator(".t-name").nth(1)).toHaveValue("Orbit Ziti");
    await expect(frame.locator("#log")).toContainText("imported 2 token(s) from CH-EASE handoff");

    const loadedFrame = page.frames().find((candidate) => candidate.url().includes("/creation-tools/spaghetti/index.html"));
    expect(loadedFrame, "Spaghetti iframe should be loaded").toBeTruthy();
    await installSpaghettiPublishHarness(loadedFrame);

    await frame.locator("#btnConnect").click();
    await expect(frame.locator("#account")).toContainText("tz1VSU");

    await frame.locator("#btnPublish").click();
    await expect(frame.locator("#log")).toContainText(`collection deployed: ${PUPPET_COLLECTION}`);
    await expect(frame.locator("#log")).toContainText("token types created");
    await expect(frame.locator("#log")).toContainText("editions minted");
    await expect(frame.locator("#log")).toContainText(`done — collection ${PUPPET_COLLECTION}`);

    const proof = await loadedFrame.evaluate(() => window.__spaghettiPublishProof);
    expect(proof.operations).toEqual([
      { kind: "chain_guard", chainId: SHADOWNET_CHAIN_ID },
      {
        kind: "originate",
        codePrim: "storage",
        administrator: PUPPET_ACCOUNT,
        hasMetadata: true,
      },
      { kind: "wallet_at", address: PUPPET_COLLECTION },
      {
        kind: "create_batch",
        entrypoints: ["create_token", "create_token"],
        payloads: [null, null],
      },
      {
        kind: "mint_batch",
        entrypoints: ["mint", "mint"],
        payloads: [
          { to_: PUPPET_ACCOUNT, token_id: 0, amount: 1 },
          { to_: PUPPET_ACCOUNT, token_id: 1, amount: 1 },
        ],
      },
      {
        kind: "sale_batch",
        entrypoints: ["set_sale", "set_sale"],
        payloads: [
          { token_id: 0, sale: { active: true, seller: PUPPET_ACCOUNT, treasury: PUPPET_ACCOUNT, price: 1_000_000, remaining: 1, start: null, end: null } },
          { token_id: 1, sale: { active: true, seller: PUPPET_ACCOUNT, treasury: PUPPET_ACCOUNT, price: 1_000_000, remaining: 1, start: null, end: null } },
        ],
      },
    ]);
    expect(proof.pinnedJson.map((entry) => entry.name)).toEqual([
      "collection.json",
      "token.json",
      "token.json",
    ]);
    expect(proof.pinnedJson[0].payload.relationships).toEqual({
      parent_contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
      collection_group: "harness-suite",
    });
    expect(proof.pinnedJson[1].payload.name).toBe("Moon Salad Deluxe");
    expect(proof.pinnedJson[2].payload.name).toBe("Orbit Ziti");

    await expect
      .poll(async () => {
        const state = await (await request.get("/__test/state")).json();
        return state.interactionLog.map((event) => event.eventType);
      })
      .toEqual(expect.arrayContaining(["spaghetti.collection_deployed", "spaghetti.token_published"]));

    expect(fatalErrors(errors)).toEqual([]);
  });
});
