import { test, expect } from "@playwright/test";

const PROVEN_CONTRACTS = [
  {
    app: "Spaghetti",
    address: "KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc",
    label: "Standard collection",
    group: "spaghetti-shadownet-e2e-mr1oc17f",
    facts: ["Token types", "1"],
    actions: ["Transfer token", "Mint more", "Transfer admin"],
  },
  {
    app: "Gnocchi",
    address: "KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK",
    label: "Open edition",
    group: "gnocchi-shadownet-e2e-mr1oadsz",
    facts: ["Token types", "1"],
    actions: ["Pause / resume sale", "Transfer token", "Mint more"],
  },
  {
    app: "Ravioli",
    address: "KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB",
    label: "Bundle",
    group: "ravioli-shadownet-e2e-mr1pdpt4",
    facts: ["Token types", "1"],
    actions: ["Transfer token", "Mint more", "Transfer admin"],
  },
  {
    app: "Rotini",
    address: "KT1HqzEFqbwcR8BpXZrrfPALY6bJaPGQgDHQ",
    label: "Standard collection",
    group: "rotini-shadownet-e2e-mr1q9kcr",
    facts: ["Token types", "2"],
    actions: ["Transfer token", "Mint more", "Transfer admin"],
  },
  {
    app: "Penne",
    address: "KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz",
    label: "Distribution",
    group: "penne-shadownet-e2e-mr1reng0",
    facts: ["Token types", "1"],
    actions: ["Open / close claim", "Load recipients", "Airdrop"],
  },
  {
    app: "Lasagna",
    address: "KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r",
    label: "Exhibition",
    group: "lasagna-shadownet-e2e-mr1srf15",
    facts: ["Revisions", "2"],
    actions: ["Add curator", "Publish revision", "Set current revision"],
  },
];
const LASAGNA_PROOF_CONTRACT = "KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r";
const LASAGNA_ADMIN = "tz1MgZrahSLDqGXgmQDqSDkvzNu32xrDBjej";
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

test.describe("interaction inventory - Pasta Protocol Colander Shadownet discovery", () => {
  test.setTimeout(180_000);

  test("opens proven Shadownet Pasta contracts with adapters, actions, explorer links, and metadata graph", async ({
    page,
    request,
  }) => {
    await setHarnessRole(request, "admin");
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });

    await page.addInitScript(() => {
      window.localStorage.setItem("wtf:network", "shadownet");
    });

    await page.goto("/tools/colander", { waitUntil: "domcontentloaded" });
    const surface = page.locator('[data-testid="colander-app"]');
    await expect(surface).toBeVisible({ timeout: 30_000 });
    await expect(surface).toContainText("network: shadownet");

    for (const contract of PROVEN_CONTRACTS) {
      await surface.getByTestId("colander-address").fill(contract.address);
      await surface.getByRole("button", { name: "Open contract" }).click();

      await expect(surface.locator('[data-colander-region="fact-row"]').filter({ hasText: contract.address })).toBeVisible({
        timeout: 45_000,
      });
      await expect(surface).toContainText(contract.label);
      await expect(surface.locator(`a[href="https://shadownet.tzkt.io/${contract.address}"]`)).toBeVisible();
      await expect(surface).toContainText(`group: ${contract.group}`);
      await expect(surface).not.toContainText("No relationship metadata found");

      for (const fact of contract.facts) {
        await expect(surface).toContainText(fact);
      }
      for (const action of contract.actions) {
        await expect(surface).toContainText(action);
      }
    }

    await expect
      .poll(async () => {
        const state = await (await request.get("/__test/state")).json();
        return state.interactionLog.map((event) => event.eventType);
      })
      .toEqual(expect.arrayContaining(["colander.contract_opened", "colander.graph_viewed"]));

    expect(fatalErrors(errors)).toEqual([]);
  });

  test("submits a Colander management action through the browser wallet path", async ({
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
      ({ account, contractAddress, chainId }) => {
        const operations = [];
        const metadataUri = `data:application/json;base64,${btoa(JSON.stringify({
          name: "Lasagna Colander Browser Proof",
          relationships: {
            parent_contract: "KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc",
            collection_group: "colander-browser-action-proof",
          },
        }))}`;
        const hex = Array.from(metadataUri)
          .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
          .join("");
        const entrypoints = {
          add_curator: {},
          remove_curator: {},
          publish_revision: {},
          set_current_revision: {},
          transfer_administration: {},
          accept_administration: {},
        };
        const fakeContract = {
          address: contractAddress,
          entrypoints: { entrypoints },
          async storage() {
            return {
              administrator: account,
              pending_administrator: null,
              revision_count: { toNumber: () => 2 },
              metadata: { get: async () => hex },
            };
          },
          methodsObject: {
            set_current_revision(rid) {
              return {
                async send() {
                  operations.push({ kind: "send", entrypoint: "set_current_revision", rid });
                  return {
                    async confirmation() {
                      operations.push({ kind: "confirmation", entrypoint: "set_current_revision" });
                      return 1;
                    },
                  };
                },
              };
            },
          },
        };
        const fakeTezos = {
          rpc: {
            async getChainId() {
              operations.push({ kind: "chain_id", chainId });
              return chainId;
            },
          },
          contract: {
            async at(address) {
              operations.push({ kind: "contract_at", address });
              return fakeContract;
            },
          },
          wallet: {
            async at(address) {
              operations.push({ kind: "wallet_at", address });
              return fakeContract;
            },
          },
        };

        window.localStorage.setItem("wtf:network", "shadownet");
        window.__wtfColanderActionProof = { operations };
        window.__wtfColanderTezosHarness = {
          async connectWallet() {
            operations.push({ kind: "connect", account });
            return { address: account, providerName: "octez.connect" };
          },
          async getActiveAccount() {
            operations.push({ kind: "active_account", account });
            return { address: account, providerName: "octez.connect" };
          },
          async getTezos() {
            operations.push({ kind: "get_tezos" });
            return fakeTezos;
          },
          async assertNetworkReadyForSend(address) {
            operations.push({ kind: "preflight", address });
            const actual = await fakeTezos.rpc.getChainId();
            if (actual !== chainId) throw new Error(`wrong chain ${actual}`);
          },
        };
      },
      {
        account: LASAGNA_ADMIN,
        contractAddress: LASAGNA_PROOF_CONTRACT,
        chainId: SHADOWNET_CHAIN_ID,
      },
    );

    await page.goto("/tools/colander", { waitUntil: "domcontentloaded" });
    const surface = page.locator('[data-testid="colander-app"]');
    await expect(surface).toBeVisible({ timeout: 30_000 });
    await expect(surface).toContainText("network: shadownet");

    await surface.getByTestId("colander-address").fill(LASAGNA_PROOF_CONTRACT);
    await surface.getByRole("button", { name: "Open contract" }).click();
    await expect(surface).toContainText("Exhibition");
    await expect(surface).toContainText("colander-browser-action-proof");

    const action = surface.locator('[data-colander-action="set_current_revision"]');
    await expect(action).toContainText("Set current revision");
    await action.getByRole("button", { name: "Use" }).click();
    await action.getByLabel("Revision #").fill("0");
    await action.getByRole("button", { name: "Submit Set current revision" }).click();

    await expect
      .poll(async () => page.evaluate(() => window.__wtfColanderActionProof?.operations || []))
      .toEqual(
        expect.arrayContaining([
          { kind: "preflight", address: LASAGNA_ADMIN },
          { kind: "chain_id", chainId: SHADOWNET_CHAIN_ID },
          { kind: "wallet_at", address: LASAGNA_PROOF_CONTRACT },
          { kind: "send", entrypoint: "set_current_revision", rid: 0 },
          { kind: "confirmation", entrypoint: "set_current_revision" },
        ]),
      );
    await expect(surface.locator('[data-colander-region="status"]')).not.toContainText("failed");
    expect(fatalErrors(errors)).toEqual([]);
  });
});
