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
  assert.match(chease, /handoff=chease-package/, "CH-EASE should mark Pasta handoff URLs");
  assert.match(chease, /chease\.package_handoff_opened/, "CH-EASE should emit package handoff events");

  for (const appId of PASTA_APPS) {
    const studio = readRepoFile(studioPath(appId));
    const common = readRepoFile(commonPath(appId));
    assert.match(common, /consumeCheaseHandoff/, `${appId} should expose the CH-EASE handoff reader`);
    assert.match(studio, new RegExp(`consumeCheaseHandoff\\("${appId}"\\)`), `${appId} should consume its own CH-EASE handoff`);
  }
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

test("Colander discovery supports Shadownet proof contracts before signed actions", () => {
  const colander = readRepoFile("client/src/features/pasta-protocol/colander/ColanderApp.tsx");
  assert.match(colander, /shadownet\.tzkt\.io/, "Colander should link Shadownet contracts to Shadownet TzKT");
  assert.match(colander, /parseJsonDataUri/, "Colander should decode data:application/json metadata");
  assert.match(colander, /metadataFetchUrl/, "Colander should centralize remote metadata fetch URL policy");
  assert.match(colander, /startsWith\("ipfs:\/\/"\)/, "Colander should preserve IPFS relationship metadata reads");
  assert.match(colander, /\^https:\\\/\\\//, "Colander should allow HTTPS relationship metadata reads");
  assert.match(
    colander,
    /await assertNetworkReadyForSend\(me\)/,
    "Colander should verify wallet account and chain id before signed writes",
  );
});
