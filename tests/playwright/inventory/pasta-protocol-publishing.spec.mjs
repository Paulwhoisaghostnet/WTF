import { test, expect } from "@playwright/test";
import { createCipheriv, createHash } from "node:crypto";

const HANDOFF_KEY = "wtfos.pasta.handoff.v1:spaghetti";
const PUPPET_ACCOUNT = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const ALTERNATE_PUPPET_ACCOUNT = "tz1burnburnburnburnburnburnburjAYjjX";
const PUPPET_COLLECTION = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const MANUAL_COLLECTION = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const ROTINI_COLLECTION = "KT1BHRGCyGLjxr7LA6eCyHFBoo9QDFTV3Bat";
const RAVIOLI_BLIND_CONTROLLER = "KT1PWx2mnDueood7fEmfbBDKx1D9BAnnXitn";
const SHADOWNET_CHAIN_ID = "NetXsqzbfFenSTS";

function canonicalJson(value) {
  const visit = (child) => {
    if (child === null || typeof child === "string" || typeof child === "boolean" || typeof child === "number") {
      return child;
    }
    if (Array.isArray(child)) return child.map(visit);
    return Object.fromEntries(Object.keys(child).sort().map((key) => [key, visit(child[key])]));
  };
  return JSON.stringify(visit(value));
}

function sealRavioliReveal(publicReveal, saltHex, aad) {
  const key = createHash("sha256")
    .update(Buffer.from("pasta-ravioli-sealed-reveal@1\0"))
    .update(Buffer.from(saltHex, "hex"))
    .digest();
  const iv = Buffer.from("55".repeat(12), "hex");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(canonicalJson(aad)));
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(publicReveal))),
    cipher.final(),
  ]);
  return {
    schema: "pasta-ravioli-sealed-reveal@1",
    cipher: "AES-256-GCM",
    keyDerivation: "SHA-256(pasta-ravioli-sealed-reveal@1 || 0x00 || reveal-salt)",
    iv: iv.toString("base64"),
    aad,
    ciphertext: Buffer.concat([encrypted, cipher.getAuthTag()]).toString("base64"),
  };
}

async function setHarnessRole(request, role) {
  const res = await request.post("/__test/state", { data: { userRole: role } });
  expect(res.ok()).toBeTruthy();
}

async function waitForCreationToolFrame(page, app) {
  const path = `/creation-tools/${app}/index.html`;
  await expect.poll(
    () => page.frames().some((candidate) => candidate.url().includes(path)),
    { message: `${app} creation-tool frame should finish navigating` },
  ).toBe(true);
  const frame = page.frames().find((candidate) => candidate.url().includes(path));
  expect(frame).toBeTruthy();
  return frame;
}

async function installRavioliDeploymentPreflightHarness(page, protocol) {
  await page.route("**/creation-tools/ravioli/js/studio.js", async (route) => {
    const response = await route.fetch();
    const runtime = await response.text();
    const harness = `
      (() => {
        const proof = { rpcReads:0, pins:0, originations:0, sends:0, notifications:[] };
        const toolkit = {
          rpc:{
            async getBlock(params){
              proof.rpcReads += 1;
              proof.blockParams = params;
              return { protocol:${JSON.stringify(protocol)} };
            }
          },
          wallet:{
            originate(){
              proof.originations += 1;
              return { async send(){ proof.sends += 1; throw new Error("origination must not run"); } };
            }
          }
        };
        window.__ravioliDeploymentPreflightProof = proof;
        window.MD.getAccount = () => "${PUPPET_ACCOUNT}";
        window.MD.getToolkit = () => toolkit;
        window.MD.assertOperationSafety = async () => "${PUPPET_ACCOUNT}";
        window.MD.pinProviderFromForm = () => ({ kind:"node", url:"http://127.0.0.1:5001" });
        window.MD.pinJson = async () => { proof.pins += 1; return "bafyunexpected"; };
        window.MD.pinBlob = async () => { proof.pins += 1; return "bafyunexpected"; };
        window.MD.updatePinProviderRows = () => undefined;
        window.MD.loadPlatformCapabilities = async () => ({});
        window.MD.notify = (message, kind) => { proof.notifications.push({ message, kind }); };
        window.MD.logEvent = () => undefined;
      })();
    `;
    await route.fulfill({ response, body: `${harness}\n${runtime}` });
  });
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

async function installPastaPublishHarness(frame, app) {
  await frame.waitForFunction(() => Boolean(window.MD && window.TZ?.MichelsonMap));
  await frame.evaluate(({ account, collection, appId, chainId }) => {
    const operations = [];
    const pinnedJson = [];
    const pinnedBlobs = [];
    const gnocchiStorage = {
      administrator: account,
      next_token_id: 0,
      next_project_id: 0,
      sales: new Map(),
      token_metadata: new Map(),
      total_supply: new Map(),
      total_minted: new Map(),
      policy_locked: new Map(),
    };
    const fakeContract = {
      address: collection,
      async storage() { return gnocchiStorage; },
      methodsObject: {
        create_open_edition(payload) {
          return {
            async send() {
              operations.push({ entrypoint: "create_open_edition", payload });
              return {
                async confirmation() {
                  const tokenId = gnocchiStorage.next_token_id;
                  gnocchiStorage.sales.set(String(tokenId), payload.sale);
                  gnocchiStorage.token_metadata.set(String(tokenId), { token_id: tokenId, token_info: payload.token_info });
                  gnocchiStorage.total_supply.set(String(tokenId), payload.creator_reserve || 0);
                  gnocchiStorage.total_minted.set(String(tokenId), payload.creator_reserve || 0);
                  gnocchiStorage.policy_locked.set(String(tokenId), payload.lock_policy === true);
                  gnocchiStorage.next_token_id += 1;
                  return 1;
                },
              };
            },
          };
        },
        lock_sale_policy() { return { async send() { return { async confirmation() { return 1; } }; } }; },
        open_mint() { return { async send() { return { async confirmation() { return 1; } }; } }; },
        create_project(payload) {
          return { async send() { operations.push({ entrypoint: "create_project", payload }); return { async confirmation() { return 1; } }; } };
        },
      },
    };
    const toolkit = {
      rpc: { async getChainId() { return chainId; } },
      wallet: {
        originate({ code, storage }) {
          return {
            async send() {
              operations.push({ entrypoint: "originate", codePrim: code?.[0]?.prim || null, storageKeys: Object.keys(storage || {}).sort() });
              return { async contract() { return fakeContract; } };
            },
          };
        },
        async at(address) {
          operations.push({ entrypoint: "wallet_at", address });
          return fakeContract;
        },
      },
      contract: { async at() { return fakeContract; } },
    };
    window.__pastaPublishProof = { appId, operations, pinnedJson, pinnedBlobs };
    window.MD.getAccount = () => account;
    window.MD.connectWallet = async () => account;
    window.MD.setupToolkit = () => toolkit;
    window.MD.getToolkit = () => toolkit;
    window.MD.assertOperationSafety = async () => {
      const actual = await toolkit.rpc.getChainId();
      if (actual !== chainId) throw new Error(`wrong chain ${actual}`);
      operations.push({ entrypoint: "chain_guard", chainId: actual });
      return account;
    };
    window.MD.pinProviderFromForm = () => ({ kind: "node", url: "http://127.0.0.1:5001" });
    window.MD.pinBlob = async (_provider, blob, name) => {
      pinnedBlobs.push({ name, type: blob.type, size: blob.size });
      return `bafyblob${pinnedBlobs.length}`;
    };
    window.MD.pinJson = async (_provider, payload, name) => {
      pinnedJson.push({ name, payload });
      return `bafyjson${pinnedJson.length}`;
    };
  }, { account: PUPPET_ACCOUNT, collection: PUPPET_COLLECTION, appId: app, chainId: SHADOWNET_CHAIN_ID });
}

test.describe("interaction inventory — Pasta Protocol publishing", () => {
  test("web Colander rebuilds or deliberately forgets a self-hosted site record without claiming to uninstall it", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    await page.addInitScript(() => {
      window.__colanderSiteOpens = [];
      window.open = (url) => { window.__colanderSiteOpens.push(String(url)); return null; };
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(({ contract }) => {
      const now = new Date().toISOString();
      localStorage.setItem("wtfos.pasta.colander.workspace.v1", JSON.stringify([{
        schema: "pasta-project@1", id: "web-site-record", title: "Web site record", toolId: "gnocchi", stage: "published", network: "shadownet",
        contracts: [contract], contractRecords: [], drafts: [],
        artifacts: [{ id: "web-site-artifact", kind: "self_hosted_site", toolId: "gnocchi", contract, tokenId: 0, fileName: "gnocchi-site.zip", localUrl: "/sites/native-only/", createdAt: now }],
        createdAt: now, updatedAt: now,
      }]));
    }, { contract: PUPPET_COLLECTION });
    await page.goto("/tools/colander", { waitUntil: "domcontentloaded" });

    const sites = page.getByTestId("colander-site-artifacts");
    await expect(sites).toContainText("installed URL /sites/native-only/");
    await sites.getByRole("button", { name: "Rebuild gnocchi-site.zip in owner app" }).click();
    const opens = await page.evaluate(() => window.__colanderSiteOpens);
    expect(opens[0]).toContain("/tools/gnocchi?");
    expect(opens[0]).toContain(`contract=${PUPPET_COLLECTION}`);

    await sites.getByRole("button", { name: "Forget record" }).click();
    await sites.getByRole("button", { name: "Cancel" }).click();
    await expect(sites).toContainText("gnocchi-site.zip");
    await sites.getByRole("button", { name: "Forget record" }).click();
    await sites.getByRole("button", { name: "Confirm forget record" }).click();
    await expect(sites).not.toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("wtfos.pasta.colander.workspace.v1") || "[]"));
    expect(stored[0].artifacts).toEqual([]);
    await expect.poll(async () => {
      const state = await (await request.get("/__test/state")).json();
      return state.interactionLog.map((event) => event.eventType);
    }).toContain("colander.site_record_forgotten");
  });

  test("web Colander owns rename, duplicate, archive, restore, and deliberate project deletion", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    await page.goto("/tools/colander", { waitUntil: "domcontentloaded" });
    await page.getByTestId("colander-project-title").fill("Central project");
    await page.getByTestId("colander-project-tool").selectOption("gnocchi");
    await page.getByTestId("colander-create-project").click();

    const manager = page.getByTestId("colander-project-manager");
    await manager.getByLabel("Project title").fill("Forever editions");
    await manager.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByRole("button", { name: /Forever editions planning/ })).toBeVisible();

    await manager.getByRole("button", { name: "Duplicate as new project" }).click();
    await expect(manager.getByLabel("Project title")).toHaveValue("Forever editions copy");
    let stored = await page.evaluate(() => JSON.parse(localStorage.getItem("wtfos.pasta.colander.workspace.v1") || "[]"));
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({ title: "Forever editions copy", stage: "planning", contracts: [], drafts: [], artifacts: [] });

    await manager.getByRole("button", { name: "Archive project" }).click();
    const archive = page.getByTestId("colander-archived-projects");
    await expect(archive).toContainText("Forever editions copy");
    await expect(page.getByRole("button", { name: /Forever editions planning/ })).toBeVisible();
    await archive.getByRole("button", { name: "Restore project" }).click();
    await expect(manager.getByLabel("Project title")).toHaveValue("Forever editions copy");

    await manager.getByRole("button", { name: "Archive project" }).click();
    await archive.getByRole("button", { name: "Delete permanently" }).click();
    await expect(archive.getByRole("button", { name: "Confirm permanent delete" })).toBeVisible();
    await archive.getByRole("button", { name: "Confirm permanent delete" }).click();
    await expect(archive).not.toBeVisible();
    stored = await page.evaluate(() => JSON.parse(localStorage.getItem("wtfos.pasta.colander.workspace.v1") || "[]"));
    expect(stored).toEqual([expect.objectContaining({ title: "Forever editions", stage: "planning" })]);

    await expect.poll(async () => {
      const state = await (await request.get("/__test/state")).json();
      return state.interactionLog.map((event) => event.eventType);
    }).toEqual(expect.arrayContaining([
      "colander.project_renamed",
      "colander.project_duplicated",
      "colander.project_archived",
      "colander.project_restored",
      "colander.project_deleted",
    ]));
  });

  test("Macaroni returns its contract and mint-site artifact to the originating Colander project", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    const projectId = "macaroni-colander-proof";
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(({ id }) => {
      const now = new Date().toISOString();
      localStorage.setItem("wtfos.pasta.colander.workspace.v1", JSON.stringify([{
        schema: "pasta-project@1", id, title: "Macaroni central project", toolId: "macaroni",
        stage: "planning", network: "shadownet", contracts: [], artifacts: [], createdAt: now, updatedAt: now,
      }]));
    }, { id: projectId });

    await page.goto(`/tools/macaroni?colanderHandoff=colander-workspace&projectId=${projectId}&projectTitle=Macaroni+central+project&network=shadownet`, { waitUntil: "domcontentloaded" });
    const landing = page.frameLocator('iframe[title="Macaroni"]');
    await expect(landing.locator("#openStudio")).toHaveAttribute("href", /colanderHandoff=colander-workspace/);
    await landing.locator("#openStudio").click();
    await expect(landing.locator("#btnExport")).toBeAttached();
    await expect.poll(
      () => landing.locator("body").evaluate(() => Boolean(window.MD?.recordColanderContract && window.MDSiteBundle?.recordColanderSite)),
      { message: "Macaroni Studio should finish loading its Colander bridge runtimes" },
    ).toBe(true);
    await landing.locator("body").evaluate((_, { contract }) => {
      window.MD.recordColanderContract(contract);
      window.MDSiteBundle.recordColanderSite(
        { contract },
        { fileName: "macaroni-site.zip", installed: null },
      );
    }, { contract: PUPPET_COLLECTION });

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("wtfos.pasta.colander.workspace.v1") || "[]"));
    expect(stored[0]).toEqual(expect.objectContaining({
      toolId: "macaroni",
      stage: "published",
      contracts: [PUPPET_COLLECTION],
    }));
    expect(stored[0].artifacts).toEqual([
      expect.objectContaining({ kind: "self_hosted_site", toolId: "macaroni", contract: PUPPET_COLLECTION, fileName: "macaroni-site.zip" }),
    ]);
  });

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
    await page.goto("/", { waitUntil: "domcontentloaded" });
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

  test("Ravioli restores a private fail-closed recovery panel before another write", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    await page.goto("/tools/ravioli", { waitUntil: "domcontentloaded" });
    let frame = page.frameLocator('iframe[title="Ravioli"]');
    await expect(frame.locator("#publishRecoveryInfo")).toBeAttached();
    await frame.locator("body").evaluate((_, account) => {
      const key = `pasta.ravioli.publish-recovery-draft.v1:shadownet:${account}:inventory-recovery`;
      localStorage.setItem(key, JSON.stringify({
        schema: "pasta-ravioli-publish-recovery@1",
        status: "IN_PROGRESS",
        draftId: "inventory-recovery",
        network: "shadownet",
        account,
        contract: null,
        tokenId: null,
        kit: null,
        product: { name: "Interrupted pack", mode: "deterministic_vault", editions: 1, target: "new_collection" },
        history: [{
          stage: "CREATE_PACK:SUBMITTED",
          status: "IN_PROGRESS",
          at: "2026-07-22T00:00:00.000Z",
          operationHash: `o${"1".repeat(50)}`,
        }],
        createdAt: "2026-07-22T00:00:00.000Z",
        updatedAt: "2026-07-22T00:00:01.000Z",
      }));
      localStorage.setItem("pasta.ravioli.publish-recovery-index.v1", JSON.stringify([key]));
    }, PUPPET_ACCOUNT);
    await page.reload({ waitUntil: "domcontentloaded" });
    frame = page.frameLocator('iframe[title="Ravioli"]');
    await expect(frame.locator("#publishRecoveryPanel")).toBeVisible();
    await expect(frame.locator("#publishRecoverySummary")).toContainText("Unfinished Ravioli recovery");
    await expect(frame.locator("#publishRecoveryDetails")).toContainText("CREATE_PACK:SUBMITTED");
    await expect(frame.locator("#publishRecoveryDetails")).toContainText("Legacy journal");
    await expect(frame.locator("#publishRecoveryExplorer")).toBeVisible();
    await expect(frame.locator("#btnCheckRecovery")).toHaveText("Check chain state (read only)");
    await expect(frame.locator("#btnDiscardRecovery")).toBeHidden();

    const downloadPromise = page.waitForEvent("download");
    await frame.locator("#btnDownloadRecovery").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("ravioli-private-recovery-inventory-recovery.json");
  });

  test("Ravioli rejects a stale protocol-bound deployment certificate before pinning or signing", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    const staleProtocol = "PsUshuai9QapM5TGj1JpuVGkdxz5GykdnEvS6Rh8SUVrARvZLCZ";
    await page.route("**/creation-tools/ravioli/js/studio.js", async (route) => {
      const response = await route.fetch();
      const runtime = await response.text();
      const harness = `
        (() => {
          const proof = { rpcReads:0, pins:0, originations:0, sends:0, notifications:[] };
          const toolkit = {
            rpc:{
              async getBlock(params){
                proof.rpcReads += 1;
                proof.blockParams = params;
                return { protocol:${JSON.stringify(staleProtocol)} };
              }
            },
            wallet:{
              originate(){
                proof.originations += 1;
                return { async send(){ proof.sends += 1; throw new Error("origination must not run"); } };
              }
            }
          };
          window.__ravioliProtocolPreflightProof = proof;
          window.MD.getAccount = () => "${PUPPET_ACCOUNT}";
          window.MD.getToolkit = () => toolkit;
          window.MD.assertOperationSafety = async () => "${PUPPET_ACCOUNT}";
          window.MD.pinProviderFromForm = () => ({ kind:"node", url:"http://127.0.0.1:5001" });
          window.MD.pinJson = async () => { proof.pins += 1; return "bafyunexpected"; };
          window.MD.pinBlob = async () => { proof.pins += 1; return "bafyunexpected"; };
          window.MD.updatePinProviderRows = () => undefined;
          window.MD.loadPlatformCapabilities = async () => ({});
          window.MD.notify = (message, kind) => { proof.notifications.push({ message, kind }); };
          window.MD.logEvent = () => undefined;
        })();
      `;
      await route.fulfill({ response, body: `${harness}\n${runtime}` });
    });

    await page.goto("/tools/ravioli", { waitUntil: "domcontentloaded" });
    const frame = page.frameLocator('iframe[title="Ravioli"]');
    await expect(frame.locator("#btnPublish")).toBeVisible();
    await frame.locator("#bnName").fill("Protocol preflight proof");
    await frame.locator(".m-name").fill("Escrow member");
    await frame.locator(".m-kt").fill(PUPPET_COLLECTION);
    await frame.locator(".m-tid").fill("0");
    await frame.locator(".m-qty").fill("1");
    await frame.locator("#btnPublish").click();

    await expect(frame.locator("#log")).toContainText("deployment certificate targets");
    await expect(frame.locator("#log")).toContainText("no pin or origination was attempted");
    const proof = await frame.locator("body").evaluate(() => window.__ravioliProtocolPreflightProof);
    expect(proof).toMatchObject({
      rpcReads: 1,
      pins: 0,
      originations: 0,
      sends: 0,
      blockParams: { block: "head" },
    });
  });

  for (const adapter of [
    {
      role: "Gnocchi",
      artifact: "pasta-gnocchi-pack-adapter.contract.json",
    },
    {
      role: "Rotini",
      artifact: "pasta-rotini-pack-adapter.contract.json",
    },
  ]) {
    test(`Ravioli rejects ${adapter.role} adapter artifact drift before every external write`, async ({ page, request }) => {
      await setHarnessRole(request, "admin");
      await page.route(`**/creation-tools/ravioli/contract/${adapter.artifact}`, async (route) => {
        const response = await route.fetch();
        const artifact = await response.json();
        artifact[0] = {
          ...artifact[0],
          annots: [...(artifact[0]?.annots || []), "%certificate_drift"],
        };
        await route.fulfill({
          response,
          body: JSON.stringify(artifact),
          contentType: "application/json",
        });
      });
      await installRavioliDeploymentPreflightHarness(
        page,
        "PsUshuai9QapM5TGj1JpuVGkdxz5GykdnEvS6Rh8SUVrARvZLCY",
      );

      await page.goto("/tools/ravioli", { waitUntil: "domcontentloaded" });
      const frame = page.frameLocator('iframe[title="Ravioli"]');
      await expect(frame.locator("#btnPublish")).toBeVisible();
      await frame.locator("#bnName").fill(`${adapter.role} certificate drift proof`);
      await frame.locator(".m-name").fill("Escrow member");
      await frame.locator(".m-kt").fill(PUPPET_COLLECTION);
      await frame.locator(".m-tid").fill("0");
      await frame.locator(".m-qty").fill("1");
      await frame.locator("#btnPublish").click();

      await expect(frame.locator("#log")).toContainText(
        `${adapter.role.toLowerCase()}Adapter artifact does not match its tested deployment certificate`,
      );
      await expect(frame.locator("#log")).toContainText(
        "no origination was attempted",
      );
      const proof = await frame.locator("body").evaluate(
        () => window.__ravioliDeploymentPreflightProof,
      );
      expect(proof).toMatchObject({
        rpcReads: 1,
        pins: 0,
        originations: 0,
        sends: 0,
        blockParams: { block: "head" },
      });
    });
  }

  test("all newer Pasta studios recover drafts and report resumable work to Colander", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    const apps = [
      { id: "spaghetti", label: "Spaghetti", title: "#collName", detail: ".t-name", value: "Saved token metadata" },
      { id: "gnocchi", label: "Gnocchi", title: "#oeName", detail: "#basePrice", value: "2.5" },
      { id: "ravioli", label: "Ravioli", title: "#bnName", detail: ".m-name", value: "Saved bundle member" },
      { id: "rotini", label: "Rotini", title: "#collName", detail: ".v-label", value: "Saved trait variant" },
      { id: "penne", label: "Penne", title: "#tokName", detail: "#recipients", value: `${PUPPET_ACCOUNT}, 3` },
      { id: "lasagna", label: "Lasagna", title: "#exName", detail: "#refs", value: `${PUPPET_COLLECTION}, 0` },
    ];
    await page.goto("/", { waitUntil: "domcontentloaded" });
    for (const app of apps) {
      const projectId = `draft-proof-${app.id}`;
      const projectTitle = `${app.label} recovery proof`;
      await page.evaluate(({ id, title, toolId }) => {
        const now = new Date().toISOString();
        localStorage.setItem("wtfos.pasta.colander.workspace.v1", JSON.stringify([{
          schema: "pasta-project@1", id, title, toolId, stage: "planning", network: "shadownet",
          contracts: [], artifacts: [], drafts: [], createdAt: now, updatedAt: now,
        }]));
      }, { id: projectId, title: projectTitle, toolId: app.id });

      const route = `/tools/${app.id}?handoff=colander-workspace&projectId=${projectId}&projectTitle=${encodeURIComponent(projectTitle)}&network=shadownet&kind=${app.id}`;
      await page.goto(route, { waitUntil: "domcontentloaded" });
      let frame = page.frameLocator(`iframe[title="${app.label}"]`);
      await expect(frame.locator("[data-pasta-draft]")).toBeVisible();
      await frame.locator(app.title).fill(`${app.label} saved draft`);
      await frame.locator(app.detail).first().fill(app.value);
      await frame.locator("[data-draft-save]").click();
      await expect(frame.locator("[data-draft-status]")).toContainText("Saved");

      await page.reload({ waitUntil: "domcontentloaded" });
      frame = page.frameLocator(`iframe[title="${app.label}"]`);
      await expect(frame.locator(app.title)).toHaveValue(`${app.label} saved draft`);
      await expect(frame.locator(app.detail).first()).toHaveValue(app.value);

      if (app.id === "spaghetti") {
        const downloadPromise = page.waitForEvent("download");
        await frame.locator("[data-draft-export]").click();
        const backup = await downloadPromise;
        expect(backup.suggestedFilename()).toBe("spaghetti-draft.pasta.json");
        const backupPath = await backup.path();
        expect(backupPath).toBeTruthy();
        await frame.locator("[data-draft-clear]").click();
        await frame.locator(app.title).fill("Changed after backup");
        await frame.locator("[data-draft-file]").setInputFiles(backupPath);
        await expect(frame.locator(app.title)).toHaveValue("Spaghetti saved draft");
      }

      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("wtfos.pasta.colander.workspace.v1") || "[]"));
      expect(stored[0].drafts).toEqual([
        expect.objectContaining({ schema: "pasta-studio-draft-ref@1", toolId: app.id }),
      ]);
    }

    await page.goto("/tools/colander", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("colander-saved-drafts")).toContainText("Lasagna saved draft");
    await expect(page.getByRole("button", { name: "Resume draft ↗" })).toBeVisible();
    const standalone = await page.evaluate(() => JSON.parse(localStorage.getItem("wtfos.pasta.studio.draft.v1:spaghetti:standalone") || "null"));
    expect(standalone).toEqual(expect.objectContaining({ app: "spaghetti", summary: "Spaghetti collection draft" }));
    expect(standalone.projectId).toBeUndefined();
    expect(standalone.projectTitle).toBeUndefined();
    expect(standalone.payload.form.fields.collName).toBe("");
    await expect.poll(async () => {
      const state = await (await request.get("/__test/state")).json();
      return state.interactionLog.map((event) => event.eventType);
    }).toEqual(expect.arrayContaining([
      "pasta_protocol.draft_saved",
      "pasta_protocol.draft_exported",
      "pasta_protocol.draft_imported",
      "pasta_protocol.draft_cleared",
    ]));
  });

  test("all newer Pasta studios remember confirmed contracts and resume them through Colander", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    const apps = [
      { id: "spaghetti", label: "Spaghetti", contract: "#existingKt" },
      { id: "gnocchi", label: "Gnocchi", contract: "#mintKt" },
      { id: "ravioli", label: "Ravioli", contract: "#opKt" },
      { id: "rotini", label: "Rotini", contract: "#existingKt" },
      { id: "penne", label: "Penne", contract: "#contractKt" },
      { id: "lasagna", label: "Lasagna", contract: "#contractKt" },
    ];

    await page.goto("/", { waitUntil: "domcontentloaded" });
    for (const app of apps) {
      const projectId = `contract-resume-${app.id}`;
      await page.evaluate(({ id, toolId }) => {
        const now = new Date().toISOString();
        localStorage.setItem("wtfos.pasta.colander.workspace.v1", JSON.stringify([{
          schema: "pasta-project@1", id, title: `${toolId} contract resume`, toolId,
          stage: "planning", network: "shadownet", contracts: [], contractRecords: [], artifacts: [], drafts: [],
          createdAt: now, updatedAt: now,
        }]));
      }, { id: projectId, toolId: app.id });

      await page.goto(`/tools/${app.id}?handoff=colander-workspace&projectId=${projectId}&projectTitle=${app.id}+contract+resume&network=shadownet&kind=${app.id}`, { waitUntil: "domcontentloaded" });
      let frame = page.frameLocator(`iframe[title="${app.label}"]`);
      await expect(frame.locator("[data-pasta-contracts]")).toBeVisible();
      await frame.locator("body").evaluate(
        (_, details) => window.PastaStudioContracts.recordConfirmed(details.address, details),
        { address: PUPPET_COLLECTION, title: `${app.label} confirmed deployment`, network: "shadownet", source: "deployed" },
      );
      await expect(frame.locator("[data-contract-address]").filter({ hasText: PUPPET_COLLECTION })).toBeVisible();

      await page.reload({ waitUntil: "domcontentloaded" });
      frame = page.frameLocator(`iframe[title="${app.label}"]`);
      await frame.locator("[data-contract-resume]").filter({ hasText: "Resume contract" }).first().click();
      await expect(frame.locator(app.contract)).toHaveValue(PUPPET_COLLECTION);

      if (app.id === "spaghetti") {
        await frame.locator("body").evaluate((_, account) => {
          window.MD.fetchContractStatus = async () => ({ storage: { administrator: account }, metadata: { alias: "Manual proof" } });
        }, PUPPET_ACCOUNT);
        await frame.locator("[data-contract-remember-input]").fill(MANUAL_COLLECTION);
        await frame.locator("[data-contract-remember]").click();
        await expect(frame.locator("[data-contract-address]").filter({ hasText: MANUAL_COLLECTION })).toBeVisible();
        await expect(frame.locator("[data-contract-status]")).toContainText("Verified and remembered");
      }

      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("wtfos.pasta.colander.workspace.v1") || "[]"));
      expect(stored[0].contracts).toContain(PUPPET_COLLECTION);
      expect(stored[0].contractRecords).toEqual(expect.arrayContaining([
        expect.objectContaining({ schema: "pasta-contract-ref@1", address: PUPPET_COLLECTION, toolId: app.id, network: "shadownet" }),
      ]));
    }

    await page.goto("/tools/colander", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("colander-remembered-contracts")).toContainText(PUPPET_COLLECTION);
    await expect(page.getByTestId("colander-remembered-contracts")).toContainText("Lasagna");
  });

  test("exported buy, mint, claim, atomic-pack, and exhibition pages execute their public contract stories", async ({ page }) => {
    const interactiveApps = [
      { id: "spaghetti", action: "Buy editions", entrypoint: "buy", chainState: "Primary sale open" },
      { id: "gnocchi", action: "Mint editions", entrypoint: "open_mint", chainState: "Minting open" },
      { id: "penne", action: "Claim allocation", entrypoint: "claim", chainState: "Claim open" },
      { id: "ravioli", mode: "buy", action: "Buy pack editions", entrypoint: "buy", chainState: "Primary sale open · fully reserved" },
      { id: "ravioli", mode: "open", action: "Open pack atomically", entrypoint: "open_pack", chainState: "2 wrappers live · fully reserved" },
    ];
    const metadataUri = `data:application/json,${encodeURIComponent(JSON.stringify({ name: "Harness Exhibition", statement: "A self-hosted exhibition proof." }))}`;
    const metadataHex = Array.from(metadataUri).map((char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    const lazyRevealUri = "ipfs://bafyraviolibuyrevealshouldstaylazy";
    let buyRevealFetchCount = 0;
    const deterministicOpenKit = {
      schema: "pasta-ravioli-open-kit@3",
      network: "shadownet",
      contract: PUPPET_COLLECTION,
      tokenId: 0,
      mode: "deterministic_vault",
      manifestUri: "ipfs://bafkreiharnessraviolipublicopenkitproof",
      blindSecurity: "public",
      warning: "Harness deterministic-vault opening recipe; verify the creator and contract before signing.",
      editionPolicy: {
        requiresLimitedWrapper: true,
        wrapperEditionClass: "fixed-supply",
        earliestChildEnd: "2099-01-02T00:00:00.000Z",
        wrapperSaleStart: null,
        wrapperSaleEnd: "2099-01-01T00:00:00.000Z",
        revealDeadline: null,
        openDeadline: null,
      },
      recipes: [
        { serial: 0, nonce: "11".repeat(32), actions: [{ kind: "escrow", fa2: PUPPET_COLLECTION, tokenId: 7, amount: 1 }] },
        { serial: 1, nonce: "22".repeat(32), actions: [{ kind: "escrow", fa2: PUPPET_COLLECTION, tokenId: 8, amount: 1 }] },
      ],
    };
    await page.route("**/bafyraviolibuyrevealshouldstaylazy", async (route) => {
      buyRevealFetchCount += 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          schema: "pasta-ravioli-public-reveal@1",
          network: "shadownet",
          contract: PUPPET_COLLECTION,
          tokenId: 0,
          mode: "deterministic_vault",
          manifestUri: deterministicOpenKit.manifestUri,
          maxSupply: 2,
          itemCount: 1,
          openKit: deterministicOpenKit,
        }),
      });
    });

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
          const proof = { operations, safetyRequests:0 };
          const operation = (entrypoint, payload, options) => ({ async confirmation(){ operations.push({ entrypoint, payload, options, confirmed: true }); return 1; } });
          const methodsObject = {
            open_mint(payload){ return { async send(options){ operations.push({ entrypoint: "open_mint", payload, options }); return operation("open_mint", payload, options); } }; },
            claim(payload){ return { async send(){ operations.push({ entrypoint: "claim", payload }); return operation("claim", payload); } }; },
            open_pack(payload){ return { async send(){ operations.push({ entrypoint: "open_pack", payload }); return operation("open_pack", payload); } }; },
            buy(payload){ return { async send(options){ operations.push({ entrypoint: "buy", payload, options }); return operation("buy", payload, options); } }; }
          };
          const fixedSale = { active:true, price:1250000, remaining:3, seller:"${PUPPET_ACCOUNT}", treasury:"${PUPPET_ACCOUNT}" };
          const ravioliSale = { ...fixedSale, remaining:1, end:{Some:"2099-01-01T00:00:00.000Z"} };
          const storageByApp = {
            spaghetti: { sales:new Map([["0", fixedSale]]), token_metadata:new Map() },
            gnocchi: { sales: new Map([["0", { active:true, base_price:1000000, increment:500000, step_size:2, start:{Some:"2020-01-01T00:00:00.000Z"}, end:{Some:"2099-01-01T00:00:00.000Z"}, max_supply:{Some:100} }]]), total_supply:new Map([["0", 2]]) },
            penne: { claim_active:true, claim_start:null, claim_end:null },
            ravioli: { packs:new Map([["0", { finalized:true, cancelled:false, item_count:1, max_supply:2, mode:0, blind:false, child_expiry:{Some:"2099-01-02T00:00:00.000Z"}, contents_uri:sessionStorage.getItem("pasta.ravioli.mode") === "buy" ? {Some:MD.utf8ToHex("${lazyRevealUri}")} : null }]]), opened:new Map([["0", 0]]), total_supply:new Map([["0", 2]]), sales: sessionStorage.getItem("pasta.ravioli.mode") === "buy" ? new Map([["0", ravioliSale]]) : new Map() },
            lasagna: { current_revision:0, revision_count:1, revisions:new Map([["0", { metadata_uri:"${metadataHex}", items:[{contract:"${PUPPET_COLLECTION}",token_id:0},{contract:"${PUPPET_COLLECTION}",token_id:1}] }]]) }
          };
          const fakeContract = { async storage(){ return storageByApp["${app}"]; }, methodsObject };
          const toolkit = { contract:{ async at(){ return fakeContract; } }, wallet:{ async at(){ return fakeContract; } } };
          window.__pastaPublicSiteProof = proof;
          MD.setupToolkit = () => toolkit;
          MD.getToolkit = () => toolkit;
          MD.connectWallet = async () => "${PUPPET_ACCOUNT}";
          MD.assertOperationSafety = async () => {
            proof.safetyRequests += 1;
            await new Promise((resolve) => setTimeout(resolve, 25));
            return "${PUPPET_ACCOUNT}";
          };
        })();
      `;
      await route.fulfill({ response, body: `${harness}\n${runtime}` });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    for (const app of interactiveApps) {
      await page.evaluate(({ mode, storageKey }) => {
        if (mode) sessionStorage.setItem("pasta.ravioli.mode", mode);
        else sessionStorage.removeItem("pasta.ravioli.mode");
        localStorage.removeItem(storageKey);
      }, {
        mode: app.mode || "",
        storageKey: `pasta.ravioli.open-kit.v3:shadownet:${PUPPET_COLLECTION}:0`,
      });
      await page.goto(`/creation-tools/${app.id}/site.html`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#chainState")).toHaveText(app.chainState);
      await expect(page.locator("#submit")).toHaveText(app.action);
      if (app.id === "gnocchi") {
        await expect(page.locator("#actionTitle")).toHaveText("Mint this Limited Edition");
        await expect(page.locator("#actionDetail")).not.toContainText("NaN");
        await expect(page.locator("#actionDetail")).not.toContainText("Invalid Date");
      }
      if (app.id === "ravioli") {
        await expect(page.locator("#ravioliOpen")).toBeVisible();
        await expect(page.locator("#actionDetail")).toContainText("LE child public mint ends");
        await expect(page.locator("#actionDetail")).toContainText(
          "reserved pack capacity remains deliverable until the open cutoff",
        );
        await page.locator("#pinProvider").selectOption("node");
        await expect(page.locator("#pinNodeRow")).toBeVisible();
        await expect(page.locator("#pinJwtRow")).toBeHidden();
      } else {
        await expect(page.locator("#ravioliOpen")).toBeHidden();
        await expect(page.getByText("Atomic pack opening", { exact: true })).toBeHidden();
        await expect(page.locator("#actionDetail")).not.toContainText("Immutable LE child expires");
        await expect(page.locator("#actionDetail")).not.toContainText("Sale ends");
      }
      if (app.id === "ravioli" && app.mode === "buy") {
        await expect(page.locator("#actionDetail")).toContainText("Sale ends");
        await expect(page.locator("#secondarySubmit")).toHaveText("Open one held pack");
        await expect(page.locator("#secondarySubmit")).toBeVisible();
      }
      if (app.id === "ravioli" && app.mode === "open") {
        await page.locator("#openKit").fill(JSON.stringify(deterministicOpenKit));
      }
      await page.locator("#connect").click();
      if (app.id === "ravioli" && app.mode === "buy") {
        expect(buyRevealFetchCount).toBe(0);
      }
      if (app.id === "spaghetti") {
        await page.locator("#amount").fill("4");
        await page.locator("#submit").click();
        await expect(page.locator("#status")).toHaveText("Only 3 editions remain.");
        expect(await page.evaluate(() => window.__pastaPublicSiteProof.operations)).toHaveLength(0);
        await page.locator("#amount").fill("1");
      }
      await page.locator("#submit").click();
      await expect(page.locator("#status")).toHaveText("Confirmed on Tezos. On-chain state refreshed.");
      if (app.id === "ravioli" && app.mode === "buy") {
        expect(buyRevealFetchCount).toBe(0);
        await page.locator("#openKit").fill(JSON.stringify(deterministicOpenKit));
        const safetyRequestsBeforeOpen = await page.evaluate(() => window.__pastaPublicSiteProof.safetyRequests);
        await page.locator("#secondarySubmit").evaluate((button) => {
          button.click();
          button.click();
        });
        await expect(page.locator("#status")).toHaveText("Confirmed on Tezos. On-chain state refreshed.");
        await expect(page.locator("#deliverySummary")).toContainText("Wrapper 0, serial 0: 1 child action confirmed atomically");
        expect(buyRevealFetchCount).toBe(0);
        const doubleClickProof = await page.evaluate(() => window.__pastaPublicSiteProof);
        expect(doubleClickProof.safetyRequests).toBe(safetyRequestsBeforeOpen + 1);
        expect(doubleClickProof.operations.filter((operation) => operation.entrypoint === "open_pack" && !operation.confirmed)).toHaveLength(1);
        expect(doubleClickProof.operations.filter((operation) => operation.entrypoint === "open_pack" && operation.confirmed)).toHaveLength(1);
      }
      if (app.id === "ravioli" && app.mode === "open") {
        await expect(page.locator("#deliveryResult")).toBeVisible();
        await expect(page.locator("#deliverySummary")).toContainText("Wrapper 0, serial 0: 1 child action confirmed atomically");
        await expect(page.locator("#deliveryItems")).toContainText(`${PUPPET_COLLECTION} token 7`);
        await expect(page.locator("#deliveryOperation")).toHaveAttribute("href", new RegExp(`^https://shadownet\\.tzkt\\.io/`));
      }
      const operations = await page.evaluate(() => window.__pastaPublicSiteProof.operations);
      expect(operations).toEqual(expect.arrayContaining([expect.objectContaining({ entrypoint: app.entrypoint })]));
    }

    await page.goto("/creation-tools/lasagna/site.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#chainState")).toHaveText("1 revisions · 2 works shown");
    await expect(page.locator("#submit")).toBeHidden();
    await expect(page.locator("#ravioliOpen")).toBeHidden();
    await expect(page.getByText("Atomic pack opening", { exact: true })).toBeHidden();
    await expect(page.locator("#actionTitle")).toHaveText("On-chain exhibition");
  });

  test("exported Rotini page materializes and finalizes PNG, GIF, and offline interactive ZIP tokens", async ({ page }) => {
    const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    await page.route("**/creation-tools/rotini/pasta.config.js", async (route) => {
      await route.fulfill({
        contentType: "text/javascript",
        body: `window.PASTA_SITE_CONFIG=${JSON.stringify({ app: "rotini", label: "Rotini", title: "Self-contained artifact proof", description: "Collector artifact proof.", contract: PUPPET_COLLECTION, tokenId: 0, network: "shadownet" })};`,
      });
    });
    await page.route("**/creation-tools/rotini/js/site.js", async (route) => {
      const response = await route.fetch();
      const runtime = await response.text();
      const harness = `
        (() => {
          const mode = sessionStorage.getItem("rotini.output.mode") || "png";
          const operations = [];
          const pinnedBlobs = [];
          const pinnedJson = [];
          const layerUri = "data:image/png;base64,${pixel}";
          const manifest = { schema:"pasta-rotini-generator@2", name:"Browser Rotini", description:"Materialized in the collector browser.", creator:"${PUPPET_ACCOUNT}", width:2, height:2, outputMode:mode, seedField:"pasta:seed", selection:"weighted-deterministic", layers:[{ name:"Background", variants:[{ value:"Proof", weight:1, artifactUri:layerUri, mimeType:"image/png" }] }] };
          const generatorUri = "data:application/json," + encodeURIComponent(JSON.stringify(manifest));
          const project = { active:true, name:MD.utf8ToHex("Browser Rotini"), symbol:MD.utf8ToHex("BROT"), generator_uri:MD.utf8ToHex(generatorUri), display_uri:MD.utf8ToHex(layerUri), output_mode:MD.utf8ToHex(mode), price:1000000, treasury:"${PUPPET_ACCOUNT}", max_supply:{Some:10}, max_per_wallet:{Some:2}, reservation_ttl:3600, minted:0, reserved:0 };
          const reservations = new Map();
          const latestReservation = new Map();
          const storage = { projects:new Map([["0", project]]), reservations, latest_reservation:latestReservation, token_metadata:new Map() };
          const contract = {
            async storage(){ return storage; },
            methodsObject: {
              reserve_iteration(projectId){ return { async send(options){ operations.push({ entrypoint:"reserve_iteration", projectId, options }); return { async confirmation(){ project.reserved=1; reservations.set("0", { owner:"${PUPPET_ACCOUNT}", project_id:0, token_id:0, iteration:0, seed:"00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff", price:1000000, expires_at:new Date(Date.now()+3600000).toISOString() }); latestReservation.set("${PUPPET_ACCOUNT}", 0); return 1; } }; } }; },
              finalize_iteration(payload){ return { async send(){ operations.push({ entrypoint:"finalize_iteration", payload }); return { async confirmation(){ project.minted=1; project.reserved=0; reservations.delete("0"); return 1; } }; } }; }
            }
          };
          const toolkit = { contract:{ async at(){ return contract; } }, wallet:{ async at(){ return contract; } } };
          window.__rotiniPublicArtifactProof = { mode, operations, pinnedBlobs, pinnedJson };
          MD.setupToolkit = () => toolkit;
          MD.getToolkit = () => toolkit;
          MD.connectWallet = async () => "${PUPPET_ACCOUNT}";
          MD.assertOperationSafety = async () => "${PUPPET_ACCOUNT}";
          MD.loadPlatformCapabilities = async () => ({});
          MD.updatePinProviderRows = () => undefined;
          MD.pinProviderFromForm = () => ({ kind:"node", url:"http://127.0.0.1:5001" });
          MD.pinBlob = async (_provider, blob, name) => {
            let decoded = null;
            if (blob.type === "image/png" || blob.type === "image/gif") {
              const bitmap = await createImageBitmap(blob);
              decoded = { width:bitmap.width, height:bitmap.height };
              bitmap.close();
            }
            pinnedBlobs.push({ name, type:blob.type, size:blob.size, decoded });
            return "bafyblob" + pinnedBlobs.length;
          };
          MD.pinJson = async (_provider, payload, name) => { pinnedJson.push({ name, payload }); return "bafyjson" + pinnedJson.length; };
          MD.logEvent = () => undefined;
        })();
      `;
      await route.fulfill({ response, body: `${harness}\n${runtime}` });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    for (const output of [
      { mode: "png", mimeType: "image/png", pinnedTypes: ["image/png"] },
      { mode: "gif", mimeType: "image/gif", pinnedTypes: ["image/gif"] },
      { mode: "zip", mimeType: "application/zip", pinnedTypes: ["application/zip", "image/png"] },
    ]) {
      await page.evaluate((mode) => sessionStorage.setItem("rotini.output.mode", mode), output.mode);
      await page.goto("/creation-tools/rotini/site.html", { waitUntil: "domcontentloaded" });
      await expect(page.locator("#actionTitle")).toHaveText(`Generate a ${output.mode.toUpperCase()} iteration`);
      await expect(page.locator("#actionDetail")).toContainText("0 finalized + 0 rendering / 10");
      await expect(page.locator("#actionDetail")).not.toContainText("NaN");
      await expect(page.locator("#submit")).toHaveText("Reserve, render & mint");
      await expect(page.locator("#rotiniStorage")).toBeVisible();
      await page.locator("#connect").click();
      await page.locator("#submit").click();
      await expect(page.locator("#status")).toHaveText(`${output.mimeType} token 0 is finalized on Tezos.`);
      const proof = await page.evaluate(() => window.__rotiniPublicArtifactProof);
      expect(proof.operations.map((operation) => operation.entrypoint)).toEqual(["reserve_iteration", "finalize_iteration"]);
      expect(proof.pinnedBlobs.map((blob) => blob.type)).toEqual(output.pinnedTypes);
      expect(proof.pinnedBlobs.filter((blob) => blob.type.startsWith("image/")).every((blob) => blob.decoded?.width === 64 && blob.decoded?.height === 64)).toBe(true);
      expect(proof.pinnedJson).toHaveLength(1);
      expect(proof.pinnedJson[0].payload).toMatchObject({
        artifactUri: "ipfs://bafyblob1",
        formats: [{ uri: "ipfs://bafyblob1", mimeType: output.mimeType }],
        mintingTool: "Pasta Protocol Rotini 2",
      });
      expect(proof.operations[1].payload).toMatchObject({
        artifact_uri: expect.any(String),
        metadata_uri: expect.any(String),
        mime_type: expect.any(String),
        artifact_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
    }
  });

  test("Ravioli automatically renders Rotini PNG, GIF, and offline ZIP children from holder claims", async ({ page }) => {
    const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const manifestUri = "ipfs://bafkreiraviolirotiniautomaticrenderproof";
    const sealedContentsUri = "ipfs://bafyraviolisealedproof";
    const revealSalt = "aa".repeat(32);
    const seedByMode = {
      png: "11".repeat(32),
      gif: "22".repeat(32),
      zip: "33".repeat(32),
    };
    const publicReveal = {
      schema: "pasta-ravioli-public-reveal@1",
      network: "shadownet",
      contract: PUPPET_COLLECTION,
      tokenId: 0,
      mode: "blind_generative_mint",
      manifestUri,
      maxSupply: 1,
      itemCount: 1,
      openKit: openKit(),
    };
    const sealedEnvelope = sealRavioliReveal(publicReveal, revealSalt, {
      schema: "pasta-ravioli-sealed-reveal@1",
      network: "shadownet",
      contract: PUPPET_COLLECTION,
      tokenId: 0,
      manifestUri,
    });
    let sealedEnvelopeMode = "valid";
    let sealedFetchCount = 0;
    await page.route("**/bafyraviolisealedproof", async (route) => {
      sealedFetchCount += 1;
      const payload = structuredClone(sealedEnvelope);
      if (sealedEnvelopeMode === "tampered") {
        const bytes = Buffer.from(payload.ciphertext, "base64");
        bytes[0] ^= 1;
        payload.ciphertext = bytes.toString("base64");
      }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) });
    });
    await page.route("**/creation-tools/ravioli/pasta.config.js", async (route) => {
      await route.fulfill({
        contentType: "text/javascript",
        body: `window.PASTA_SITE_CONFIG=${JSON.stringify({
          app: "ravioli",
          label: "Ravioli",
          title: "Generator-bound pack proof",
          description: "Rendered from the reserved Rotini project.",
          contract: PUPPET_COLLECTION,
          tokenId: 0,
          network: "shadownet",
        })};`,
      });
    });
    await page.route("**/creation-tools/ravioli/js/site.js", async (route) => {
      const response = await route.fetch();
      const runtime = await response.text();
      const harness = `
        (() => {
          const outputMode = sessionStorage.getItem("ravioli.rotini.output") || "png";
          const failure = sessionStorage.getItem("ravioli.rotini.failure") || "";
          const safeTerminal = failure === "safe-terminal-credit";
          const unsafeTerminal = failure === "unsafe-terminal-mismatch";
          const seeds = ${JSON.stringify(seedByMode)};
          const operations = [];
          const pinnedBlobs = [];
          const pinnedJson = [];
          const viewCalls = [];
          let claimReads = 0;
          let activeAccount = "${PUPPET_ACCOUNT}";
          let refundCredit = safeTerminal ? 1250000 : 0;
          const layerUri = "data:image/png;base64,${pixel}";
          const manifest = {
            schema:"pasta-rotini-generator@2",
            name:"Ravioli Rotini Browser Proof",
            description:"Generated from the exact adapter render context.",
            creator:"${PUPPET_ACCOUNT}",
            width:2,
            height:2,
            outputMode:failure === "format-mismatch" ? "gif" : outputMode,
            seedField:"pasta:seed",
            selection:"weighted-deterministic",
            layers:[{ name:"Background", variants:[{ value:"Proof", weight:1, artifactUri:layerUri, mimeType:"image/png" }] }]
          };
          const generatorUri = "data:application/json," + encodeURIComponent(JSON.stringify(manifest));
          const project = {
            active:true,
            name:MD.utf8ToHex("Ravioli Rotini Browser Proof"),
            symbol:MD.utf8ToHex("RRBP"),
            generator_uri:MD.utf8ToHex(generatorUri),
            display_uri:MD.utf8ToHex(layerUri),
            output_mode:MD.utf8ToHex(outputMode),
            price:0,
            treasury:"${PUPPET_ACCOUNT}",
            max_supply:{Some:10},
            max_per_wallet:null,
            reservation_ttl:3600,
            minted:0,
            reserved:1
          };
          const pack = {
            finalized:true,
            cancelled:safeTerminal || unsafeTerminal,
            item_count:1,
            max_supply:1,
            mode:3,
            blind:true,
            child_expiry:null,
            manifest_uri:MD.utf8ToHex("${manifestUri}"),
            reveal_deadline:{Some:"2025-02-01T00:00:00.000Z"},
            open_deadline:{Some:safeTerminal || unsafeTerminal ? "2025-03-01T00:00:00.000Z" : "2099-01-01T00:00:00.000Z"},
            reveal_commitment:null,
            contents_uri:{Some:MD.utf8ToHex("${sealedContentsUri}")}
          };
          const routerStorage = {
            packs:new Map([["0", pack]]),
            opened:new Map([["0", 0]]),
            total_supply:new Map([["0", safeTerminal || unsafeTerminal ? 0 : 1]]),
            sales:new Map(),
            token_metadata:new Map(),
            blind_controller:"${RAVIOLI_BLIND_CONTROLLER}"
          };
          const view = (name, execute) => (params) => ({
            async executeView(options) {
              viewCalls.push({ name, params, options });
              return execute(params);
            }
          });
          const router = {
            async storage(){ return routerStorage; },
            contractViews:{},
            methodsObject:{
              open_pack(payload){
                return {
                  async send(){
                    operations.push({ entrypoint:"open_pack", payload });
                    return { opHash:"opRavioliRotiniBrowserProof", async confirmation(){ return 1; } };
                  }
                };
              }
            }
          };
          const controller = {
            contractViews:{
              get_pack_status:view("get_pack_status", async () => {
                const salt = "${revealSalt}";
                const packed = await new TZ.MichelCodecPacker().packData({
                  data:{
                    prim:"Pair",
                    args:[
                      {bytes:MD.utf8ToHex("${sealedContentsUri}")},
                      {prim:"Pair",args:[{int:"0"},{bytes:salt}]}
                    ]
                  },
                  type:{
                    prim:"pair",
                    args:[
                      {prim:"bytes"},
                      {prim:"pair",args:[{prim:"nat"},{prim:"bytes"}]}
                    ]
                  }
                });
                const commitment = Array.from(TZ.blake2b(
                  Uint8Array.from(packed.packed.match(/.{2}/g).map((pair) => parseInt(pair, 16))),
                  undefined,
                  32
                ), (byte) => byte.toString(16).padStart(2, "0")).join("");
                pack.reveal_commitment = {Some:commitment};
                return {
                  max_supply:1,
                  inventory_owner:"${PUPPET_ACCOUNT}",
                  treasury:"${PUPPET_ACCOUNT}",
                  unit_price:1250000,
                  sale_end:"2025-01-01T00:00:00.000Z",
                  reveal_deadline:"2025-02-01T00:00:00.000Z",
                  open_deadline:safeTerminal || unsafeTerminal ? "2025-03-01T00:00:00.000Z" : "2099-01-01T00:00:00.000Z",
                  reveal_commitment:commitment,
                  contents_uri:{Some:MD.utf8ToHex("${sealedContentsUri}")},
                  reveal_salt:{Some:failure === "wrong-reveal-salt" ? "99".repeat(32) : salt},
                  revealed:true,
                  reveal_offset:{Some:0},
                  next_claim_id:1,
                  outstanding:safeTerminal ? 0 : 1,
                  unclaimed:0,
                  escrowed:safeTerminal ? 0 : 1250000,
                  cancelled:false
                };
              }),
              get_refund_credit:view("get_refund_credit", () => refundCredit),
              get_claim_count:view("get_claim_count", () => safeTerminal || failure === "claim-missing" ? 0 : 1),
              get_last_claim:view("get_last_claim", async () => {
                claimReads += 1;
                if (failure === "account-changed" && claimReads > 1) {
                  activeAccount = "${ALTERNATE_PUPPET_ACCOUNT}";
                  document.getElementById("connect").dispatchEvent(new MouseEvent("click"));
                  await new Promise((resolve) => setTimeout(resolve, 0));
                }
                return { claim_id:failure === "claim-changed" && claimReads > 1 ? 43 : 42, paid:1250000 };
              }),
              get_claim_serial:view("get_claim_serial", () => 0)
            },
            methodsObject:{
              withdraw_refund(payload){
                return {
                  async send(){
                    operations.push({ entrypoint:"withdraw_refund", payload });
                    if (sessionStorage.getItem("ravioli.withdraw.reject") === "1") {
                      throw new Error("refund destination rejected");
                    }
                    return {
                      opHash:"opRavioliWithdrawBrowserProof",
                      async confirmation(){ refundCredit = 0; return 1; }
                    };
                  }
                };
              }
            }
          };
          const resource = { target:"${ROTINI_COLLECTION}", project_id:0, active:true };
          const adapter = {
            async storage(){ return { resources:new Map([["0", resource]]) }; },
            contractViews:{
              get_reserved:failure === "reservation-view-missing" ? undefined : view("get_reserved", () =>
                failure === "reservation-exhausted" ? 0 : 1
              ),
              get_render_context:view("get_render_context", () => ({
                target:failure === "resource-mismatch" ? "${PUPPET_COLLECTION}" : "${ROTINI_COLLECTION}",
                project_id:0,
                seed:seeds[outputMode]
              }))
            }
          };
          const rotini = { async storage(){ return { projects:new Map([["0", project]]) }; }, methodsObject:{ mint_pack_iteration(){} } };
          const contractAt = async (address) => {
            if (address === "${PUPPET_COLLECTION}") return router;
            if (address === "${RAVIOLI_BLIND_CONTROLLER}") return controller;
            if (address === "${MANUAL_COLLECTION}") return adapter;
            if (address === "${ROTINI_COLLECTION}") return rotini;
            throw new Error("unexpected contract " + address);
          };
          const toolkit = { contract:{ at:contractAt }, wallet:{ at:contractAt } };
          window.__ravioliRotiniProof = { outputMode, failure, generatorUri, operations, pinnedBlobs, pinnedJson, viewCalls };
          MD.setupToolkit = () => toolkit;
          MD.getToolkit = () => toolkit;
          MD.connectWallet = async () => activeAccount;
          MD.assertOperationSafety = async () => "${PUPPET_ACCOUNT}";
          MD.loadPlatformCapabilities = async () => ({});
          MD.pinProviderFromForm = () => ({ kind:"node", url:"http://127.0.0.1:5001" });
          MD.pinBlob = async (_provider, blob, name) => {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            pinnedBlobs.push({
              name,
              type:blob.type,
              size:blob.size,
              prefix:Array.from(bytes.slice(0, 8)),
              text:new TextDecoder().decode(bytes)
            });
            return "bafyravioliblob" + pinnedBlobs.length;
          };
          MD.pinJson = async (_provider, payload, name) => {
            pinnedJson.push({ name, payload });
            return "bafyraviolijson" + pinnedJson.length;
          };
          MD.logEvent = () => undefined;
        })();
      `;
      await route.fulfill({ response, body: `${harness}\n${runtime}` });
    });

    function openKit() {
      return {
        schema: "pasta-ravioli-open-kit@3",
        network: "shadownet",
        contract: PUPPET_COLLECTION,
        tokenId: 0,
        mode: "blind_generative_mint",
        manifestUri,
        blindSecurity: "commit-reveal-ui-hidden-chain-public",
        warning: "Generator-bound browser proof.",
        editionPolicy: {
          requiresLimitedWrapper: false,
          wrapperEditionClass: "limited-edition",
          earliestChildEnd: null,
          wrapperSaleStart: null,
          wrapperSaleEnd: null,
          revealDeadline: "2025-02-01T00:00:00.000Z",
          openDeadline: "2099-01-01T00:00:00.000Z",
        },
        recipes: [{
          serial: 0,
          nonce: "44".repeat(32),
          actions: [{ kind: "generative", adapter: MANUAL_COLLECTION, resourceId: 0, payloadCommitment: null }],
        }],
      };
    }

    await page.goto("/", { waitUntil: "domcontentloaded" });
    for (const output of [
      { mode: "png", types: ["image/png"], prefix: [137, 80, 78, 71] },
      { mode: "gif", types: ["image/gif"], text: "GIF89a" },
      { mode: "zip", types: ["application/zip", "image/png"], prefix: [80, 75, 3, 4] },
    ]) {
      await page.evaluate(({ mode }) => {
        sessionStorage.setItem("ravioli.rotini.output", mode);
        sessionStorage.removeItem("ravioli.rotini.failure");
      }, output);
      await page.goto("/creation-tools/ravioli/site.html", { waitUntil: "domcontentloaded" });
      await expect(page.locator("#status")).toHaveText("On-chain state loaded.");
      await expect(page.locator("#ravioliOpen")).toBeVisible();
      await expect(page.locator("#ravioliRenderNotice")).toContainText("No artwork upload is accepted");
      await expect(page.locator("#openArtifact")).toHaveCount(0);
      await expect(page.locator("#openPreview")).toHaveCount(0);
      await expect(page.locator("#openKit")).toHaveValue(/pasta-ravioli-open-kit@3/);
      await page.locator("#connect").click();
      await page.locator("#submit").click();
      await expect(page.locator("#status")).toHaveText("Confirmed on Tezos. On-chain state refreshed.");
      await expect(page.locator("#deliveryItems")).toContainText(`${output.types[0]} reproducible cache generated and minted at open`);

      const proof = await page.evaluate(() => window.__ravioliRotiniProof);
      expect(proof.operations).toHaveLength(1);
      expect(proof.operations[0]).toMatchObject({
        entrypoint: "open_pack",
        payload: {
          token_id: 0,
          expected_claim_id: 42,
          nonce: "44".repeat(32),
          actions: [{ generative_mint: { adapter: MANUAL_COLLECTION, resource_id: 0, payload_commitment: null } }],
        },
      });
      expect(proof.operations[0].payload.actions[0].generative_mint.payload).toMatch(/^[0-9a-f]+$/);
      expect(proof.pinnedBlobs.map((entry) => entry.type)).toEqual(output.types);
      if (output.prefix) expect(proof.pinnedBlobs[0].prefix.slice(0, output.prefix.length)).toEqual(output.prefix);
      if (output.text) expect(proof.pinnedBlobs[0].text.startsWith(output.text)).toBe(true);
      if (output.mode === "zip") {
        expect(proof.pinnedBlobs[0].text).toContain("index.html");
        expect(proof.pinnedBlobs[0].text).toContain("rotini-manifest.json");
        expect(proof.pinnedBlobs[0].text).toContain("pasta-ravioli-rotini-render@1");
        expect(proof.pinnedBlobs[0].text).not.toMatch(/https?:\/\//);
      }
      expect(proof.pinnedJson).toHaveLength(1);
      expect(proof.pinnedJson[0].payload).toMatchObject({
        minter: PUPPET_ACCOUNT,
        creators: [PUPPET_ACCOUNT],
        artifactUri: "ipfs://bafyravioliblob1",
        formats: [{ uri: "ipfs://bafyravioliblob1", mimeType: output.types[0] }],
        mintingTool: "Pasta Protocol Ravioli + Rotini 3",
        "pasta:seed": seedByMode[output.mode],
        "pasta:projectId": 0,
        "pasta:packContract": PUPPET_COLLECTION,
        "pasta:packTokenId": 0,
        "pasta:openSerial": 0,
        "pasta:actionIndex": 0,
        "pasta:adapter": MANUAL_COLLECTION,
        "pasta:resourceId": 0,
        "pasta:target": ROTINI_COLLECTION,
        ravioli: {
          schema: "pasta-ravioli-rotini-render@1",
          generatedAtOpen: true,
          seed: seedByMode[output.mode],
          target: ROTINI_COLLECTION,
          recipient: PUPPET_ACCOUNT,
        },
      });
      expect(proof.pinnedJson[0].payload["pasta:generatorUri"]).toBe(proof.generatorUri);
      expect(proof.viewCalls.filter((entry) => entry.name === "get_claim_count")).toHaveLength(2);
      expect(proof.viewCalls.filter((entry) => entry.name === "get_last_claim")).toEqual([
        expect.objectContaining({
          params: {
            pack_contract: PUPPET_COLLECTION,
            pack_token_id: 0,
            owner: PUPPET_ACCOUNT,
          },
          options: { viewCaller: PUPPET_ACCOUNT },
        }),
        expect.objectContaining({
          params: {
            pack_contract: PUPPET_COLLECTION,
            pack_token_id: 0,
            owner: PUPPET_ACCOUNT,
          },
          options: { viewCaller: PUPPET_ACCOUNT },
        }),
      ]);
      expect(proof.viewCalls.filter((entry) => entry.name === "get_claim_serial")).toEqual([
        expect.objectContaining({
          params: {
            pack_contract: PUPPET_COLLECTION,
            pack_token_id: 0,
            holder: PUPPET_ACCOUNT,
            expected_claim_id: 42,
          },
          options: { viewCaller: PUPPET_ACCOUNT },
        }),
        expect.objectContaining({
          params: {
            pack_contract: PUPPET_COLLECTION,
            pack_token_id: 0,
            holder: PUPPET_ACCOUNT,
            expected_claim_id: 42,
          },
          options: { viewCaller: PUPPET_ACCOUNT },
        }),
      ]);
      expect(proof.viewCalls.filter((entry) => entry.name === "get_reserved")).toEqual([
        expect.objectContaining({
          params: {
            pack_contract: PUPPET_COLLECTION,
            pack_token_id: 0,
            resource_id: 0,
          },
          options: { viewCaller: PUPPET_ACCOUNT },
        }),
      ]);
      expect(proof.viewCalls.filter((entry) => entry.name === "get_render_context")).toEqual([
        expect.objectContaining({
          params: {
            pack_contract: PUPPET_COLLECTION,
            pack_token_id: 0,
            open_serial: 0,
            action_index: 0,
            resource_id: 0,
          },
          options: { viewCaller: PUPPET_ACCOUNT },
        }),
      ]);
    }

    sealedEnvelopeMode = "tampered";
    await page.evaluate(() => {
      sessionStorage.setItem("ravioli.rotini.output", "png");
      sessionStorage.removeItem("ravioli.rotini.failure");
    });
    await page.goto("/creation-tools/ravioli/site.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toContainText("sealed reveal authentication failed");
    sealedEnvelopeMode = "valid";

    await page.evaluate(() => {
      sessionStorage.setItem("ravioli.rotini.output", "png");
      sessionStorage.setItem("ravioli.rotini.failure", "wrong-reveal-salt");
    });
    await page.goto("/creation-tools/ravioli/site.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toContainText("does not match the immutable router commitment");

    sealedEnvelopeMode = "tampered";
    const refundFetchBaseline = sealedFetchCount;
    await page.evaluate(() => {
      sessionStorage.setItem("ravioli.rotini.output", "png");
      sessionStorage.setItem("ravioli.rotini.failure", "safe-terminal-credit");
      sessionStorage.setItem("ravioli.withdraw.reject", "1");
    });
    await page.goto("/creation-tools/ravioli/site.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toHaveText("On-chain state loaded.");
    await expect(page.locator("#actionTitle")).toHaveText("Ravioli refund settlement complete");
    expect(sealedFetchCount).toBe(refundFetchBaseline);
    await page.locator("#connect").click();
    await expect(page.locator("#actionTitle")).toHaveText("Withdraw your credited Ravioli refund");
    await expect(page.locator("#submit")).toHaveText("Withdraw refund credit");
    await expect(page.locator("#submit")).toBeEnabled();
    await page.locator("#submit").click();
    await expect(page.locator("#status")).toContainText("refund destination rejected");
    await expect(page.locator("#submit")).toBeEnabled();
    expect(sealedFetchCount).toBe(refundFetchBaseline);
    await page.evaluate(() => sessionStorage.removeItem("ravioli.withdraw.reject"));
    await page.locator("#submit").click();
    await expect(page.locator("#status")).toHaveText("Confirmed on Tezos. On-chain state refreshed.");
    await expect(page.locator("#actionTitle")).toHaveText("Ravioli refund settlement complete");
    expect(sealedFetchCount).toBe(refundFetchBaseline);
    const refundProof = await page.evaluate(() => window.__ravioliRotiniProof);
    expect(refundProof.operations).toEqual([
      {
        entrypoint: "withdraw_refund",
        payload: { destination: PUPPET_ACCOUNT, amount: 1250000 },
      },
      {
        entrypoint: "withdraw_refund",
        payload: { destination: PUPPET_ACCOUNT, amount: 1250000 },
      },
    ]);
    sealedEnvelopeMode = "valid";

    await page.evaluate(() => {
      sessionStorage.setItem("ravioli.rotini.failure", "unsafe-terminal-mismatch");
      sessionStorage.removeItem("ravioli.withdraw.reject");
    });
    await page.goto("/creation-tools/ravioli/site.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toContainText("disagree about cancellation state");

    for (const failure of [
      { kind: "resource-mismatch", message: "does not match the adapter's selected resource", expectsPins: false },
      { kind: "format-mismatch", message: "output mode does not match the generator manifest", expectsPins: false },
      { kind: "reservation-view-missing", message: "required get_reserved", expectsPins: false },
      { kind: "reservation-exhausted", message: "no reserved pack capacity remaining", expectsPins: false },
      { kind: "claim-missing", message: "no unconsumed claim", expectsPins: false },
      { kind: "claim-changed", message: "entitlement changed while its Rotini child was rendering", expectsPins: true },
      { kind: "account-changed", message: "Connected Ravioli opener changed", expectsPins: true },
    ]) {
      await page.evaluate((kind) => {
        sessionStorage.setItem("ravioli.rotini.output", "png");
        sessionStorage.setItem("ravioli.rotini.failure", kind);
      }, failure.kind);
      await page.goto("/creation-tools/ravioli/site.html", { waitUntil: "domcontentloaded" });
      await expect(page.locator("#status")).toHaveText("On-chain state loaded.");
      await expect(page.locator("#openKit")).toHaveValue(/pasta-ravioli-open-kit@3/);
      await page.locator("#connect").click();
      await page.locator("#submit").click();
      await expect(page.locator("#status")).toContainText(failure.message);
      const proof = await page.evaluate(() => window.__ravioliRotiniProof);
      expect(proof.operations).toHaveLength(0);
      expect(proof.pinnedBlobs.length > 0).toBe(failure.expectsPins);
      if (failure.kind === "account-changed") {
        expect(proof.viewCalls.filter((entry) => entry.name === "get_last_claim").map((entry) => entry.params.owner))
          .toEqual([PUPPET_ACCOUNT, PUPPET_ACCOUNT]);
        expect(proof.viewCalls.find((entry) => entry.name === "get_render_context")?.params)
          .not.toHaveProperty("recipient");
        expect(proof.pinnedJson[0]?.payload.ravioli?.recipient).toBe(PUPPET_ACCOUNT);
      }
    }
  });

  test("Gnocchi creator lifecycle vaults and unvaults a forever OE without changing its identity", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    await page.goto("/tools/gnocchi?network=shadownet", { waitUntil: "domcontentloaded" });
    await expect(page.locator('iframe[title="Gnocchi"]')).toBeVisible();
    const loadedFrame = await waitForCreationToolFrame(page, "gnocchi");
    await loadedFrame.waitForFunction(() => Boolean(window.MD));
    await loadedFrame.evaluate(({ account }) => {
      const operations = [];
      const sale = { active: true, start: null, end: null, base_price: 1_000_000, increment: 0, step_size: 1, min_price: null, max_price: null, max_supply: null };
      const storage = {
        sales: new Map([["0", sale]]),
        total_supply: new Map([["0", 3]]),
        total_minted: new Map([["0", 3]]),
        policy_locked: new Map([["0", true]]),
      };
      const contract = {
        async storage() { return storage; },
        methodsObject: {
          set_sale_active(payload) {
            return {
              async send() {
                operations.push({ entrypoint: "set_sale_active", payload });
                sale.active = payload.active;
                return { async confirmation() { return 1; } };
              },
            };
          },
        },
      };
      const toolkit = { contract: { async at() { return contract; } }, wallet: { async at() { return contract; } } };
      window.__gnocchiLifecycleProof = { operations, sale };
      window.MD.getAccount = () => account;
      window.MD.getToolkit = () => toolkit;
      window.MD.assertOperationSafety = async () => account;
    }, { account: PUPPET_ACCOUNT });

    const frame = page.frameLocator('iframe[title="Gnocchi"]');
    await frame.locator("#mintKt").fill(PUPPET_COLLECTION);
    await frame.locator("#mintTokenId").fill("0");
    await frame.locator("#btnLoadPrice").click();
    await expect(frame.locator("#mintInfo")).toContainText("Forever OE");
    await expect(frame.locator("#mintInfo")).toContainText("ISSUANCE OPEN");

    await frame.locator("#btnVaultEdition").click();
    await expect(frame.locator("#mintInfo")).toContainText("VAULTED — EXISTING TOKENS UNAFFECTED");
    await frame.locator("#btnUnvaultEdition").click();
    await expect(frame.locator("#mintInfo")).toContainText("ISSUANCE OPEN");
    expect(await loadedFrame.evaluate(() => window.__gnocchiLifecycleProof.operations)).toEqual([
      { entrypoint: "set_sale_active", payload: { token_id: 0, active: false } },
      { entrypoint: "set_sale_active", payload: { token_id: 0, active: true } },
    ]);

    await expect.poll(async () => {
      const state = await (await request.get("/__test/state")).json();
      return state.interactionLog.map((event) => event.eventType);
    }).toEqual(expect.arrayContaining(["gnocchi.edition_vaulted", "gnocchi.edition_unvaulted"]));
  });

  test("Gnocchi publishes timed, forever, and limited editions into one collection while Rotini avoids creator pre-minting", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

    await page.goto("/tools/gnocchi?network=shadownet", { waitUntil: "domcontentloaded" });
    await expect(page.locator('iframe[title="Gnocchi"]')).toBeVisible();
    let loadedFrame = await waitForCreationToolFrame(page, "gnocchi");
    await installPastaPublishHarness(loadedFrame, "gnocchi");
    let frame = page.frameLocator('iframe[title="Gnocchi"]');
    await frame.locator("#oeName").fill("Browser Timed OE Proof");
    await frame.locator("#oeSymbol").fill("BTOE");
    await frame.locator("#saleStart").fill("2030-01-01T00:00");
    await frame.locator("#saleEnd").fill("2030-01-31T00:00");
    await frame.locator("#oeArtifact").setInputFiles({ name: "gnocchi-proof.png", mimeType: "image/png", buffer: pixel });
    await frame.locator("#btnConnect").click();
    await frame.locator("#btnPublish").click();
    await expect(frame.locator("#log")).toContainText("Timed OE live ✓ — token id 0");

    await frame.locator("#publishTarget").selectOption("existing");
    await frame.locator("#btnVerifyCollection").click();
    await expect(frame.locator("#publishTargetStatus")).toContainText("next edition will be token #1");
    await frame.locator("#saleMode").selectOption("forever");
    await frame.locator("#oeName").fill("Browser Forever OE Proof");
    await frame.locator("#btnPublish").click();
    await expect(frame.locator("#log")).toContainText("Forever OE live ✓ — token id 1");

    await frame.locator("#saleMode").selectOption("limited");
    await frame.locator("#oeName").fill("Browser Limited Edition Proof");
    await frame.locator("#saleStart").fill("2030-02-01T00:00");
    await frame.locator("#saleEnd").fill("2030-02-28T00:00");
    await frame.locator("#saleMaxSupply").fill("10");
    await frame.locator("#creatorReserve").fill("2");
    await frame.locator("#btnPublish").click();
    await expect(frame.locator("#log")).toContainText("Limited Edition live ✓ — token id 2");
    await expect(frame.locator("#editionList .pp-token")).toHaveCount(3);
    await expect(frame.locator("#editionList")).toContainText("Token #0 · Timed OE");
    await expect(frame.locator("#editionList")).toContainText("Token #1 · Forever OE");
    await expect(frame.locator("#editionList")).toContainText("Token #2 · Limited Edition");

    const gnocchiProof = await loadedFrame.evaluate(() => window.__pastaPublishProof);
    expect(gnocchiProof.operations.map((op) => op.entrypoint)).toEqual([
      "chain_guard", "originate", "wallet_at", "create_open_edition",
      "chain_guard", "wallet_at", "create_open_edition",
      "chain_guard", "wallet_at", "create_open_edition",
    ]);
    const createOperations = gnocchiProof.operations.filter((op) => op.entrypoint === "create_open_edition");
    expect(createOperations[0].payload).toMatchObject({
      creator_reserve: 0,
      lock_policy: true,
      sale: { active: true, start: expect.any(String), end: expect.any(String), max_supply: null },
    });
    expect(createOperations[1].payload).toMatchObject({
      creator_reserve: 0,
      lock_policy: true,
      sale: { active: true, start: null, end: null, max_supply: null },
    });
    expect(createOperations[2].payload).toMatchObject({
      creator_reserve: 2,
      lock_policy: true,
      sale: { active: true, start: expect.any(String), end: expect.any(String), max_supply: 10 },
    });
    expect(gnocchiProof.pinnedBlobs).toEqual([
      expect.objectContaining({ name: "gnocchi-proof.png", type: "image/png" }),
      expect.objectContaining({ name: "gnocchi-proof.png", type: "image/png" }),
      expect.objectContaining({ name: "gnocchi-proof.png", type: "image/png" }),
    ]);
    expect(gnocchiProof.pinnedJson.map((entry) => entry.name)).toEqual(["collection.json", "token.json", "token.json", "token.json"]);
    await expect.poll(async () => {
      const state = await (await request.get("/__test/state")).json();
      return state.interactionLog.map((event) => event.eventType);
    }).toEqual(expect.arrayContaining([
      "gnocchi.collection_verified",
      "gnocchi.collection_editions_viewed",
      "gnocchi.edition_published",
    ]));

    await page.goto("/tools/rotini?network=shadownet", { waitUntil: "domcontentloaded" });
    await expect(page.locator('iframe[title="Rotini"]')).toBeVisible();
    loadedFrame = await waitForCreationToolFrame(page, "rotini");
    await installPastaPublishHarness(loadedFrame, "rotini");
    frame = page.frameLocator('iframe[title="Rotini"]');
    await frame.locator("#collName").fill("Browser Generative Proof");
    await frame.locator("#collSymbol").fill("BGEN");
    await frame.locator(".l-name").nth(0).fill("Background");
    await frame.locator(".l-name").nth(1).fill("Foreground");
    await frame.locator(".v-label").nth(0).fill("Red");
    await frame.locator(".v-label").nth(1).fill("Mark");
    await frame.locator(".v-file").nth(0).setInputFiles({ name: "background.png", mimeType: "image/png", buffer: pixel });
    await frame.locator(".v-file").nth(1).setInputFiles({ name: "foreground.png", mimeType: "image/png", buffer: pixel });
    await expect(frame.locator(".pp-variant-thumb")).toHaveCount(2);
    await frame.locator("#genCount").fill("4");
    await frame.locator("#btnGenerate").click();
    await expect(frame.locator("#genStatus")).toContainText("generated 1 edition");
    await frame.locator("#btnConnect").click();
    await frame.locator("#btnPublish").click();
    await expect(frame.locator("#log")).toContainText("generative project published ✓ — no iteration tokens exist until collectors finalize artifacts");
    const rotiniProof = await loadedFrame.evaluate(() => window.__pastaPublishProof);
    expect(rotiniProof.operations.map((op) => op.entrypoint)).toEqual(["chain_guard", "originate", "wallet_at", "create_project"]);
    expect(rotiniProof.operations.at(-1).payload).toMatchObject({ active: true, price: 1_000_000, max_supply: 4, reservation_ttl: 3600 });
    expect(rotiniProof.operations.some((op) => ["create_token", "mint", "buy", "reserve_iteration", "finalize_iteration"].includes(op.entrypoint))).toBe(false);
    expect(rotiniProof.pinnedBlobs.map((entry) => entry.name)).toEqual(["rotini-collection-preview.png", "background.png", "foreground.png"]);
    expect(rotiniProof.pinnedJson.map((entry) => entry.name)).toEqual(["rotini-generator.json", "collection.json"]);
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

    const loadedFrame = await waitForCreationToolFrame(page, "spaghetti");
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
