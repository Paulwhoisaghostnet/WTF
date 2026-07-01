import { test, expect } from "@playwright/test";

const PROVEN_CONTRACTS = [
  {
    app: "Spaghetti",
    address: "KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH",
    label: "Standard collection",
    group: "spaghetti-shadownet-e2e-mr19mwvk",
    facts: ["Token types", "1"],
    actions: ["Transfer token", "Mint more", "Transfer admin"],
  },
  {
    app: "Gnocchi",
    address: "KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax",
    label: "Open edition",
    group: "gnocchi-shadownet-e2e-mr1aacew",
    facts: ["Token types", "1"],
    actions: ["Pause / resume sale", "Transfer token", "Mint more"],
  },
  {
    app: "Ravioli",
    address: "KT1CeJYHodXy8dvmNFgXxk4zh6SjVB5KYLaG",
    label: "Bundle",
    group: "ravioli-shadownet-e2e-mr1ano0u",
    facts: ["Token types", "1"],
    actions: ["Transfer token", "Mint more", "Transfer admin"],
  },
  {
    app: "Rotini",
    address: "KT1SHHPFkthiSTf9CAmhAzWmbi7t5rTcUeYz",
    label: "Standard collection",
    group: "rotini-shadownet-e2e-mr1b70wd",
    facts: ["Token types", "2"],
    actions: ["Transfer token", "Mint more", "Transfer admin"],
  },
  {
    app: "Penne",
    address: "KT1DDY9Pyr7PYNJgXxnHnJn9T7WHaVx7ztdx",
    label: "Distribution",
    group: "penne-shadownet-e2e-mr1bvphs",
    facts: ["Token types", "1"],
    actions: ["Open / close claim", "Load recipients", "Airdrop"],
  },
  {
    app: "Lasagna",
    address: "KT1GrrYTevWKExvhFWVigUdGKR86SQKwYceN",
    label: "Exhibition",
    group: "lasagna-shadownet-e2e-mr1caxn6",
    facts: ["Revisions", "2"],
    actions: ["Add curator", "Publish revision", "Set current revision"],
  },
];

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
});
