import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { zipSync } from "fflate";
import { chromium } from "playwright";

import { startPastaUiLiveLoopbackServer } from "./pasta-ui-live-bridge-kit";
import { root } from "./shadownet-proof-kit";
import {
  assertPortableSiteSupplementExecutionAllowed,
  extractPortableSiteArchive,
  PORTABLE_SITE_APP_DEFINITIONS,
  PORTABLE_SITE_APPS,
  selectPortableSiteSubject,
  upsertPortableSiteManifestEvidence,
  validatePortableSiteArchive,
  type PortableSiteApp,
  type PortableSiteSubject,
} from "./supplement-portable-site-proofs";

const CONTRACT = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";
const RUN_ID = "portable-site-proof-test";

function subject(app: PortableSiteApp): PortableSiteSubject {
  const definition = PORTABLE_SITE_APP_DEFINITIONS[app];
  return {
    app,
    runId: RUN_ID,
    title: `${definition.label} portable Shadownet proof · ${RUN_ID}`,
    description: `Exported from the actual ${definition.label} Studio and served from the extracted standalone ZIP without Objkt, Teia, or wtfOS.`,
    contract: {
      address: CONTRACT,
      kind: definition.contractKinds[0],
      explorerUrl: `https://shadownet.tzkt.io/${CONTRACT}`,
    },
    token: app === "lasagna" ? null : {
      id: `${app}-token-0`,
      tokenId: "0",
      contractAddress: CONTRACT,
      explorerUrl: `https://shadownet.tzkt.io/${CONTRACT}/tokens/0`,
    },
  };
}

const FAKE_TEZOS_RUNTIME = String.raw`
(() => {
  class FakeMap {
    constructor(values = {}) { this.values = values; }
    async get(key) { return this.values[String(key)]; }
  }
  const map = (values) => new FakeMap(values);
  function storage() {
    const app = window.PASTA_SITE_CONFIG.app;
    if (app === "spaghetti") return {
      sales: map({ 0: { active: false, remaining: 0, price: 1000, start: null, end: null } }),
      token_metadata: map({}), total_supply: map({ 0: 1 }),
    };
    if (app === "gnocchi") return {
      sales: map({ 0: { active: true, base_price: 0, increment: 0, step_size: 1, start: null, end: null, max_supply: null } }),
      token_metadata: map({}), total_supply: map({ 0: 1 }), total_minted: map({ 0: 1 }),
    };
    if (app === "ravioli") return {
      packs: map({ 0: { item_count: 1, max_supply: 1, finalized: true, cancelled: false } }),
      sales: map({ 0: { active: false, remaining: 0, price: 0, start: null, end: null } }),
      opened: map({ 0: 0 }), total_supply: map({ 0: 1 }), token_metadata: map({}),
    };
    if (app === "rotini") return {
      projects: map({ 0: { active: true, minted: 1, reserved: 0, max_supply: null, price: 0, name: "", output_mode: "" } }),
      token_metadata: map({}),
    };
    if (app === "penne") return { claim_active: true, token_metadata: map({}) };
    if (app === "lasagna") return {
      current_revision: 0,
      revision_count: 1,
      revisions: map({ 0: { items: [], metadata_uri: "" } }),
    };
    throw new Error("unknown portable app " + app);
  }
  class TezosToolkit {
    constructor(rpc) {
      this.rpcUrl = rpc;
      this.contract = { at: async () => ({ storage: async () => storage() }) };
      this.wallet = { at: async () => ({}) };
      this.rpc = { getChainId: async () => "NetXsqzbfFenSTS" };
    }
    setWalletProvider() {}
  }
  const bytesToString = (hex) => {
    if (!hex) return "";
    try { return new TextDecoder().decode(Uint8Array.from(String(hex).match(/.{1,2}/g) || [], (part) => parseInt(part, 16))); }
    catch (_) { return String(hex); }
  };
  const stringToBytes = (text) => Array.from(new TextEncoder().encode(String(text)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  window.TZ = { TezosToolkit, bytesToString, stringToBytes, MichelCodecPacker: class {} };
})();
`;

test("portable-site supplement is explicit, Shadownet-only, and covers exactly the six shared-site publishers", () => {
  assert.deepEqual(PORTABLE_SITE_APPS, ["spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"]);
  assert.throws(() => assertPortableSiteSupplementExecutionAllowed({ PASTA_PROOF_RUN_DIR: "/tmp/run" }), /PASTA_PORTABLE_SITE_PROOF_EXECUTE=1/);
  assert.throws(() => assertPortableSiteSupplementExecutionAllowed({
    PASTA_PORTABLE_SITE_PROOF_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    TEZOS_NETWORK: "mainnet",
  }), /only permits Shadownet/);
  assert.equal(assertPortableSiteSupplementExecutionAllowed({
    PASTA_PORTABLE_SITE_PROOF_EXECUTE: "1",
    PASTA_PROOF_RUN_DIR: "/tmp/run",
    TEZOS_NETWORK: "shadownet",
  }), "/tmp/run");
});

test("subject selection binds each export to the app-owned same-run contract and token", () => {
  for (const app of PORTABLE_SITE_APPS) {
    const selected = selectPortableSiteSubject({
      schema: "pastaprotocol-app-proof@1",
      app,
      runId: RUN_ID,
      network: { name: "shadownet", chainId: "NetXsqzbfFenSTS" },
      contracts: [{ address: CONTRACT, kind: PORTABLE_SITE_APP_DEFINITIONS[app].contractKinds[0], explorerUrl: `https://shadownet.tzkt.io/${CONTRACT}` }],
      tokens: app === "lasagna" ? [] : [{ id: `${app}-token-0`, tokenId: "0", contractAddress: CONTRACT, explorerUrl: `https://shadownet.tzkt.io/${CONTRACT}/tokens/0` }],
    }, app);
    assert.equal(selected.contract.address, CONTRACT);
    assert.equal(selected.token?.contractAddress || null, app === "lasagna" ? null : CONTRACT);
  }
});

test("manifest evidence upsert preserves prior proof and is idempotent by stable ids", () => {
  const app = "spaghetti" as const;
  const capture = (stage: string, ordinal: number) => ({
    manifestScreenshot: { stage, path: `screenshots/${stage}.png`, sha256: "a".repeat(64), caption: stage },
    manifestSidecarArtifact: { id: `screenshot-sidecar-${stage}`, kind: "screenshot-sidecar", path: `artifacts/screenshot-${stage}.json`, sha256: "b".repeat(64) },
    sidecar: { stageOrdinal: ordinal },
  } as any);
  const captures = [
    capture("901-portable-self-hosted-site-actual-studio-export-complete", 901),
    capture("902-portable-self-hosted-site-extracted-page-live-independently", 902),
  ];
  const base = {
    screenshots: [{ stage: "001-existing", path: "screenshots/existing.png", sha256: "c".repeat(64), caption: "existing" }],
    artifacts: [{ id: "existing", kind: "proof", path: "artifacts/existing.json", sha256: "d".repeat(64) }],
    capabilities: [{ id: "existing-capability", evidence: { screenshots: ["001-existing"] } }],
  };
  const args = {
    subject: subject(app),
    zipArtifact: { id: `${app}-portable-self-hosted-site`, kind: "self-hosted-site-package", path: `artifacts/${app}-portable-self-hosted-site.zip`, sha256: "e".repeat(64) },
    reportArtifact: { id: `${app}-portable-self-hosted-site-proof`, kind: "self-hosted-site-proof", path: `artifacts/${app}-portable-self-hosted-site-proof.json`, sha256: "f".repeat(64) },
    captures,
  };
  const once = upsertPortableSiteManifestEvidence({ manifest: base, ...args });
  const twice = upsertPortableSiteManifestEvidence({ manifest: once, ...args });
  assert.equal(twice.screenshots.filter((entry: any) => entry.stage.startsWith("90")).length, 2);
  assert.equal(twice.capabilities.filter((entry: any) => entry.id === "portable-self-hosted-site").length, 1);
  assert.ok(twice.screenshots.some((entry: any) => entry.stage === "001-existing"));
  assert.ok(twice.artifacts.some((entry: any) => entry.id === "existing"));
});

test("all six actual Studios export exact dependency-complete archives whose extracted pages run independently", async (t) => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), "pasta-portable-site-test-"));
  const browser = await chromium.launch({ headless: true });
  const studioServer = await startPastaUiLiveLoopbackServer({
    staticRoot: path.join(root, "public"),
    handleAction: async () => { throw new Error("test must not call the signer bridge"); },
  });
  t.after(async () => {
    await studioServer.close();
    await browser.close();
    await rm(outputRoot, { recursive: true, force: true });
  });

  for (const app of PORTABLE_SITE_APPS) {
    const expected = subject(app);
    const definition = PORTABLE_SITE_APP_DEFINITIONS[app];
    const studioContext = await browser.newContext({ acceptDownloads: true });
    const studio = await studioContext.newPage();
    await studio.goto(`${studioServer.origin}${definition.studioPath}`, { waitUntil: "networkidle" });
    await studio.selectOption("#network", "shadownet");
    await studio.locator(definition.titleSelector).fill(expected.title, { force: true });
    await studio.locator(definition.descriptionSelector).fill(expected.description, { force: true });
    if (definition.existingTargetControl) await studio.check(definition.existingTargetControl);
    await studio.locator(definition.contractSelector).fill(CONTRACT);
    for (const selector of definition.relatedContractSelectors || []) await studio.locator(selector).fill(CONTRACT);
    if (definition.tokenSelector) await studio.locator(definition.tokenSelector).fill("0", { force: true });
    const downloadPromise = studio.waitForEvent("download", { timeout: 30_000 });
    await studio.click("#btnExportSite");
    let download;
    try {
      download = await downloadPromise;
    } catch (error) {
      assert.fail(`${app} did not export: status=${await studio.textContent("#exportSiteStatus")} cause=${error instanceof Error ? error.message : String(error)}`);
    }
    assert.equal(download.suggestedFilename(), `${app}-site.zip`);
    const zipPath = path.join(outputRoot, `${app}.zip`);
    await download.saveAs(zipPath);
    const validated = validatePortableSiteArchive(await readFile(zipPath), expected);
    if (app === "spaghetti") {
      const missingDependency = { ...validated.files };
      delete missingDependency["js/site.js"];
      assert.throws(
        () => validatePortableSiteArchive(zipSync(missingDependency), expected),
        /file set drifted/,
      );
      const staleConfig = {
        ...validated.files,
        "pasta.config.js": new TextEncoder().encode(
          `window.PASTA_SITE_CONFIG = ${JSON.stringify({ ...validated.config, contract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton" }, null, 2)};\n`,
        ),
      };
      assert.throws(
        () => validatePortableSiteArchive(zipSync(staleConfig), expected),
        /Expected values to be strictly deep-equal/,
      );
    }
    await studioContext.close();

    const extracted = path.join(outputRoot, app);
    await mkdir(extracted, { recursive: true });
    await extractPortableSiteArchive(validated, extracted);
    const siteServer = await startPastaUiLiveLoopbackServer({
      staticRoot: extracted,
      handleAction: async () => { throw new Error("extracted page must not call the signer bridge"); },
    });
    try {
      const siteContext = await browser.newContext();
      await siteContext.route("**/vendor/tezos.js", (route) => route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: FAKE_TEZOS_RUNTIME,
      }));
      const site = await siteContext.newPage();
      const requests: string[] = [];
      site.on("request", (request) => requests.push(request.url()));
      await site.goto(`${siteServer.origin}/index.html`, { waitUntil: "domcontentloaded" });
      await site.waitForFunction(() => document.getElementById("status")?.textContent === "On-chain state loaded.");
      assert.equal(await site.textContent("#contract"), CONTRACT);
      assert.match(String(await site.textContent("#appLabel")), new RegExp(definition.label));
      assert.equal(await site.textContent("#itemId"), "0");
      assert.equal(requests.some((url) => /objkt|teia|wtfos\.(?:app|me)/i.test(url)), false);
      for (const entry of validated.entries) {
        assert.ok(await statExists(path.join(extracted, ...entry.path.split("/"))), `${app} missing extracted ${entry.path}`);
      }
      await siteContext.close();
    } finally {
      await siteServer.close();
    }
  }
});

async function statExists(filePath: string): Promise<boolean> {
  try {
    const file = await import("node:fs/promises").then(({ stat }) => stat(filePath));
    return file.isFile();
  } catch {
    return false;
  }
}
