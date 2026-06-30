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
            const kind = operations.some((op) => op.kind === "create_batch") ? "mint_batch" : "create_batch";
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
