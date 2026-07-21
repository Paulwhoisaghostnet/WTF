import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const PASTA_APPS = ["spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"] as const;
const COLANDER_TARGET_APPS = ["penne", "lasagna"] as const;

function readRepoFile(filePath: string): string {
  return readFileSync(path.join(process.cwd(), filePath), "utf8");
}

function studioPath(appId: string): string {
  return `public/creation-tools/${appId}/js/studio.js`;
}

function commonPath(appId: string): string {
  return `public/creation-tools/${appId}/js/common.js`;
}

test("Pasta static publishers use sandbox-safe inline feedback", () => {
  const nativeDialogPattern = /\b(?:alert|confirm|prompt)\s*\(/;

  for (const appId of PASTA_APPS) {
    const studio = readRepoFile(studioPath(appId));
    const common = readRepoFile(commonPath(appId));
    assert.equal(nativeDialogPattern.test(studio), false, `${appId} studio must not use native browser dialogs`);
    assert.equal(nativeDialogPattern.test(common), false, `${appId} common helpers must not use native browser dialogs`);
    assert.match(studio, /MD\.notify\(/, `${appId} studio should surface inline status feedback`);
  }
});

test("Pasta static publisher modules receive the shared MD runtime", () => {
  for (const appId of PASTA_APPS) {
    const common = readRepoFile(commonPath(appId));
    const studio = readRepoFile(studioPath(appId));
    assert.match(common, /window\.MD = MD;/, `${appId} common helpers should expose MD for module scripts`);
    assert.match(studio, /const MD = window\.MD;/, `${appId} studio should read the shared MD runtime from window`);
  }
});

test("Pasta wtfOS pinning is capability gated inside the platform", () => {
  for (const appId of PASTA_APPS) {
    const common = readRepoFile(commonPath(appId));
    assert.match(common, /loadPlatformCapabilities/, `${appId} should load platform capabilities`);
    assert.match(common, /trusted_market_creator/, `${appId} should check trusted-market-creator capability`);
    assert.match(common, /pinProviderFromForm/, `${appId} should centralize pin provider policy`);
    assert.match(common, /canUseWtfosPinner/, `${appId} should gate the hosted wtfOS pinner`);
    assert.match(common, /updatePinProviderRows/, `${appId} should hide unavailable pin provider controls`);
  }
});

test("CH-EASE opens Pasta publishers through a same-origin package handoff", () => {
  const chease = readRepoFile("client/src/pages/MacaroniPackager.tsx");
  assert.match(chease, /PASTA_HANDOFF_PREFIX/, "CH-EASE should use the shared Pasta handoff prefix");
  assert.match(chease, /sessionStorage\.setItem/, "CH-EASE should stage handoff payloads in sessionStorage");
  assert.match(chease, /localStorage\.setItem/, "CH-EASE should stage a one-use fallback for isolated noopener windows");
  assert.match(chease, /pasta-handoff-envelope@1/, "CH-EASE should expiry-wrap its cross-window fallback");
  assert.match(chease, /handoff:\s*"chease-package"/, "CH-EASE should mark Pasta handoff URLs");
  assert.match(chease, /colanderHandoff/, "CH-EASE should preserve Colander project ownership");
  assert.match(chease, /chease\.package_handoff_opened/, "CH-EASE should emit package handoff events");

  for (const appId of PASTA_APPS) {
    const studio = readRepoFile(studioPath(appId));
    const common = readRepoFile(commonPath(appId));
    assert.match(common, /consumeCheaseHandoff/, `${appId} should expose the CH-EASE handoff reader`);
    assert.match(common, /localStorage\.removeItem/, `${appId} should consume and delete the isolated-window fallback`);
    assert.match(common, /value\.expiresAt < Date\.now\(\)/, `${appId} should reject expired fallback payloads`);
    assert.match(common, /params\.get\("colanderHandoff"\)/, `${appId} should recover Colander context after CH-EASE`);
    assert.match(studio, new RegExp(`consumeCheaseHandoff\\("${appId}"\\)`), `${appId} should consume its own CH-EASE handoff`);
  }
});

test("Macaroni attaches its proven blind-drop vertical slice to Colander", () => {
  const chease = readRepoFile("client/src/pages/MacaroniPackager.tsx");
  const landing = readRepoFile("public/creation-tools/macaroni/index.html");
  const common = readRepoFile("public/creation-tools/macaroni/js/common.js");
  const studio = readRepoFile("public/creation-tools/macaroni/js/studio.js");
  const bundle = readRepoFile("public/creation-tools/macaroni/js/site-bundle.js");

  assert.match(chease, /colanderContext/, "CH-EASE should retain project context for Macaroni");
  assert.match(landing, /studio\.html\?\$\{params\.toString\(\)\}/, "Macaroni landing should preserve route context");
  assert.match(common, /function recordColanderContract/, "Macaroni should attach deployed or resumed contracts");
  assert.match(studio, /MD\.recordColanderContract\(contract\.address\)/, "Macaroni deploy should update Colander");
  assert.match(bundle, /function recordColanderSite/, "Macaroni should attach exported mint sites");
  assert.match(bundle, /\/api\/pasta\/sites\/install/, "Macaroni should install exports into native Colander");
});

test("Colander external actions pass contract context to matching Pasta tools", () => {
  const colander = readRepoFile("client/src/features/pasta-protocol/colander/ColanderApp.tsx");
  assert.match(colander, /colander\.handoff_opened/, "Colander should emit external handoff events");
  assert.match(colander, /handoff:\s*"colander"/, "Colander should mark handoff URLs");
  assert.match(colander, /contract:\s*opened\?\.address/, "Colander should include the opened contract");
  assert.match(colander, /network,/, "Colander should include the active network");
  assert.match(colander, /action:\s*action\.id/, "Colander should include the selected action");

  for (const appId of COLANDER_TARGET_APPS) {
    const studio = readRepoFile(studioPath(appId));
    assert.match(studio, /MD\.readRouteHandoff\(\)/, `${appId} should read Colander route handoff context`);
  }
});

test("Colander routes Rotini artifact work to Rotini and can refund expired reservations directly", () => {
  const colander = readRepoFile("client/src/features/pasta-protocol/colander/ColanderApp.tsx");
  const adapters = readRepoFile("shared/pasta-protocol/adapters.ts");
  assert.match(adapters, /signature: \["create_project", "reserve_iteration", "finalize_iteration", "set_project_active"\]/);
  assert.match(adapters, /id: "reserve_iteration"[\s\S]*external: "rotini"/);
  assert.match(adapters, /id: "finalize_iteration"[\s\S]*external: "rotini"/);
  assert.match(adapters, /id: "cancel_expired_reservation"[\s\S]*reservation_id/);
  assert.match(colander, /case "cancel_expired_reservation":[\s\S]*cancel_expired_reservation\(num\("reservation_id"\)\)/);
});

test("Colander workspace projects receive deployments from every Pasta publisher", () => {
  for (const appId of PASTA_APPS) {
    const common = readRepoFile(commonPath(appId));
    const studio = readRepoFile(studioPath(appId));
    assert.match(common, /projectId:\s*params\.get\("projectId"\)/, `${appId} should read Colander project context`);
    assert.match(common, /function recordColanderContract/, `${appId} should expose the project deployment bridge`);
    assert.match(common, /wtfos\.pasta\.colander\.workspace\.v1/, `${appId} should write the versioned local workspace`);
    assert.match(studio, new RegExp(`MD\\.recordColanderContract\\([^,]+, "${appId}"\\)`), `${appId} should attach a deployed KT1 to its Colander project`);
  }
});

test("every newer Pasta studio uses one portable draft and recovery contract", () => {
  const canonicalDraftRuntime = readRepoFile("scripts/pasta-protocol/studio-kit/studio-draft.js");
  assert.match(canonicalDraftRuntime, /pasta-studio-draft@1/);
  assert.match(canonicalDraftRuntime, /wtfos\.pasta\.studio\.draft\.v1/);
  assert.match(canonicalDraftRuntime, /wtfos\.pasta\.colander\.workspace\.v1/);
  assert.match(canonicalDraftRuntime, /route\.kind === app/);
  assert.match(canonicalDraftRuntime, /route\.projectId && !routeMatchesApp/);
  assert.match(canonicalDraftRuntime, /function exportBackup/);
  assert.match(canonicalDraftRuntime, /function importBackup/);
  assert.match(canonicalDraftRuntime, /type !== "password"/);
  assert.match(canonicalDraftRuntime, /type !== "file"/);

  for (const appId of PASTA_APPS) {
    const index = readRepoFile(`public/creation-tools/${appId}/index.html`);
    const studio = readRepoFile(studioPath(appId));
    assert.equal(
      readRepoFile(`public/creation-tools/${appId}/js/studio-draft.js`),
      canonicalDraftRuntime,
      `${appId} draft runtime drift`,
    );
    assert.match(index, /js\/studio-draft\.js/, `${appId} should load recovery before its studio module`);
    assert.match(studio, new RegExp(`PastaStudioDraft\\.start\\(\\{\\s*app: "${appId}"`), `${appId} should register its serializer`);
  }
});

test("every newer Pasta studio remembers and resumes its own contracts", () => {
  const canonicalContractRuntime = readRepoFile("scripts/pasta-protocol/studio-kit/studio-contracts.js");
  assert.match(canonicalContractRuntime, /pasta-studio-contract@1/);
  assert.match(canonicalContractRuntime, /wtfos\.pasta\.studio\.contracts\.v1/);
  assert.match(canonicalContractRuntime, /wtfos\.pasta\.colander\.workspace\.v1/);
  assert.match(canonicalContractRuntime, /fetchContractStatus/);
  assert.match(canonicalContractRuntime, /function verifyContract/);
  assert.match(canonicalContractRuntime, /function updateColander/);
  assert.match(canonicalContractRuntime, /pasta_protocol\.contract_resumed/);

  for (const appId of PASTA_APPS) {
    const index = readRepoFile(`public/creation-tools/${appId}/index.html`);
    const studio = readRepoFile(studioPath(appId));
    const common = readRepoFile(commonPath(appId));
    assert.equal(
      readRepoFile(`public/creation-tools/${appId}/js/studio-contracts.js`),
      canonicalContractRuntime,
      `${appId} contract runtime drift`,
    );
    assert.match(index, /js\/studio-contracts\.js/, `${appId} should load remembered contracts before its studio module`);
    assert.match(studio, new RegExp(`PastaStudioContracts\\.start\\(\\{\\s*app: "${appId}"`), `${appId} should register its resume mapping`);
    assert.match(common, /PastaStudioContracts\?\.recordConfirmed/, `${appId} deployments should enter the shared ledger`);
  }
});

test("every Pasta publisher exports the shared self-hosted collector site vertical slice", () => {
  const canonicalHtml = readRepoFile("scripts/pasta-protocol/site-kit/site.html");
  const canonicalCss = readRepoFile("scripts/pasta-protocol/site-kit/site.css");
  const canonicalRuntime = readRepoFile("scripts/pasta-protocol/site-kit/site.js");
  const canonicalBundle = readRepoFile("scripts/pasta-protocol/site-kit/site-bundle.js");

  assert.match(canonicalHtml, /pasta\.config\.js/);
  assert.match(canonicalHtml, /vendor\/octez-connect\.js/);
  assert.match(canonicalRuntime, /MD\.assertOperationSafety\(\)/);
  assert.match(canonicalRuntime, /open_mint/);
  assert.match(canonicalRuntime, /total_minted \|\| state\.storage\.total_supply/);
  assert.match(canonicalRuntime, /methodsObject\.claim/);
  assert.match(canonicalRuntime, /methodsObject\.open_pack/);
  assert.match(canonicalRuntime, /methodsObject\.buy/);
  assert.match(canonicalRuntime, /Primary sale open · fully reserved/);
  assert.match(canonicalRuntime, /\$\{supply\} wrappers live · fully reserved/);
  assert.match(canonicalRuntime, /Number\.isSafeInteger\(amount\)/);
  assert.match(canonicalRuntime, /Only \$\{state\.maxAmount\} editions remain/);
  assert.match(canonicalBundle, /recordColanderSite/);

  for (const appId of PASTA_APPS) {
    const index = readRepoFile(`public/creation-tools/${appId}/index.html`);
    assert.match(index, /id="btnExportSite"/, `${appId} should expose site export`);
    assert.match(index, new RegExp(`app: "${appId}"`), `${appId} should configure its collector action`);
    assert.equal(readRepoFile(`public/creation-tools/${appId}/site.html`), canonicalHtml, `${appId} site HTML drift`);
    assert.equal(readRepoFile(`public/creation-tools/${appId}/css/site.css`), canonicalCss, `${appId} site CSS drift`);
    assert.equal(readRepoFile(`public/creation-tools/${appId}/js/site.js`), canonicalRuntime, `${appId} site runtime drift`);
    assert.equal(readRepoFile(`public/creation-tools/${appId}/js/site-bundle.js`), canonicalBundle, `${appId} site bundle drift`);
  }
});

test("fixed-edition publishers originate the sale-enabled storage shape and configure primary sales", () => {
  for (const appId of ["spaghetti", "ravioli"]) {
    const studio = readRepoFile(`public/creation-tools/${appId}/js/studio.js`);
    const manifestName = appId === "ravioli" ? "pasta-bundle.template.json" : "pasta-standard-collection.template.json";
    const manifest = JSON.parse(readRepoFile(`public/creation-tools/${appId}/contract/${manifestName}`));
    assert.match(studio, /sales: new M\(\)/, `${appId} origination must initialize sales storage`);
    assert.match(studio, /methodsObject\.set_sale/, `${appId} publish must configure its direct sale`);
    assert(manifest.entrypoints.includes("set_sale"), `${appId} artifact manifest must expose set_sale`);
    assert(manifest.entrypoints.includes("set_sale_active"), `${appId} artifact manifest must expose set_sale_active`);
    assert(manifest.entrypoints.includes("buy"), `${appId} artifact manifest must expose buy`);
    assert(manifest.entrypoints.includes("transfer_administration"), `${appId} artifact manifest must expose admin transfer`);
    assert(manifest.entrypoints.includes("accept_administration"), `${appId} artifact manifest must expose admin acceptance`);
    if (appId === "ravioli") {
      assert(manifest.entrypoints.includes("commit_recipe"), "Ravioli must fully back every recipe before wrapper issue");
      assert(manifest.entrypoints.includes("finalize_pack"), "Ravioli must finalize backing before wrapper issue");
      assert(manifest.entrypoints.includes("open_pack"), "Ravioli must atomically fulfill child assets when opened");
    }
  }
});

test("Rotini reserves seeds and finalizes self-contained artifacts instead of pre-minting recipe tokens", () => {
  const studio = readRepoFile("public/creation-tools/rotini/js/studio.js");
  const artifact = readRepoFile("public/creation-tools/rotini/js/rotini-artifact.js");
  const mint = readRepoFile("public/creation-tools/rotini/js/rotini-mint.js");
  const manifest = JSON.parse(readRepoFile("public/creation-tools/rotini/contract/pasta-generative-collection.template.json"));
  assert.match(studio, /pasta-generative-collection\.contract\.json/);
  assert.match(studio, /projects: new M\(\)/);
  assert.match(studio, /methodsObject\.create_project/);
  assert.match(studio, /methodsObject\.reserve_iteration/);
  assert.match(studio, /methodsObject\.finalize_iteration/);
  assert.match(studio, /file: v\.file/);
  assert.match(studio, /no iteration tokens exist until collectors finalize artifacts/i);
  assert.match(artifact, /image\/png/);
  assert.match(artifact, /image\/gif/);
  assert.match(artifact, /application\/zip/);
  assert.match(artifact, /interactive ZIP requires top-level index\.html/);
  assert.match(mint, /pasta:artifactSha256/);
  assert.doesNotMatch(studio, /methodsObject\.create_token/);
  assert(manifest.entrypoints.includes("create_project"));
  assert(manifest.entrypoints.includes("reserve_iteration"));
  assert(manifest.entrypoints.includes("finalize_iteration"));
  assert(manifest.entrypoints.includes("cancel_expired_reservation"));
  assert.equal(manifest.entrypoints.includes("mint_iteration"), false);
  assert(manifest.entrypoints.includes("set_project_active"));
  assert(manifest.entrypoints.includes("transfer_administration"));
  assert(manifest.entrypoints.includes("accept_administration"));
});

test("Gnocchi publishes and manages timed, forever, and limited editions in one collection", () => {
  const index = readRepoFile("public/creation-tools/gnocchi/index.html");
  const studio = readRepoFile("public/creation-tools/gnocchi/js/studio.js");
  const contract = readRepoFile("contracts/pasta-protocol/PastaOpenEditionFA2.py");
  const manifest = JSON.parse(readRepoFile("public/creation-tools/gnocchi/contract/pasta-open-edition.template.json"));
  assert.match(index, /value="timed"/);
  assert.match(index, /value="forever"/);
  assert.match(index, /value="limited"/);
  assert.match(index, /id="publishTarget"/);
  assert.match(index, /id="existingCollectionKt"/);
  assert.match(index, /id="creatorReserve"/);
  assert.match(index, /id="lockPolicy"/);
  assert.match(index, /id="btnLoadCollectionEditions"/);
  assert.match(index, /id="btnVaultEdition"/);
  assert.match(index, /id="btnUnvaultEdition"/);
  assert.match(studio, /methodsObject\.create_open_edition/);
  assert.match(studio, /gnocchi\.collection_verified/);
  assert.match(studio, /gnocchi\.collection_editions_viewed/);
  assert.match(studio, /total_minted: new M\(\)/);
  assert.match(studio, /policy_locked: new M\(\)/);
  assert.match(studio, /creator_reserve: policy\.creatorReserve/);
  assert.match(studio, /lock_policy: policy\.lockPolicy/);
  assert.match(studio, /methodsObject\.set_sale_active/);
  assert.match(studio, /gnocchi\.edition_vaulted/);
  assert.match(studio, /gnocchi\.edition_unvaulted/);
  assert.match(contract, /CAP_BELOW_COMMITTED/);
  assert.match(contract, /POLICY_LOCKED/);
  assert.match(contract, /self\.data\.total_minted/);
  assert(manifest.entrypoints.includes("create_open_edition"));
  assert(manifest.entrypoints.includes("lock_sale_policy"));
  assert(manifest.entrypoints.includes("open_mint"));
});

test("Colander discovery supports Shadownet proof contracts before signed actions", () => {
  const colander = readRepoFile("client/src/features/pasta-protocol/colander/ColanderApp.tsx");
  assert.match(colander, /shadownet\.tzkt\.io/, "Colander should link Shadownet contracts to Shadownet TzKT");
  assert.match(colander, /parseJsonDataUri/, "Colander should decode data:application/json metadata");
  assert.match(colander, /metadataFetchUrl/, "Colander should centralize remote metadata fetch URL policy");
  assert.match(colander, /startsWith\("ipfs:\/\/"\)/, "Colander should preserve IPFS relationship metadata reads");
  assert.match(colander, /\^https:\\\/\\\//, "Colander should allow HTTPS relationship metadata reads");
  assert.match(
    colander,
    /await colanderAssertNetworkReadyForSend\(me\)/,
    "Colander should verify wallet account and chain id before signed writes",
  );
  assert.match(
    colander,
    /\?\? assertNetworkReadyForSend\)\(address\)/,
    "Colander's test harness seam must delegate to the production preflight by default",
  );
});
