import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const desktopPackage = JSON.parse(readFileSync("apps/gnocchi-desktop/package.json", "utf8"));
const mainSource = readFileSync("apps/gnocchi-desktop/src/main.cjs", "utf8");
const preloadSource = readFileSync("apps/gnocchi-desktop/src/preload.cjs", "utf8");
const prepareSource = readFileSync("apps/gnocchi-desktop/scripts/prepare-assets.mjs", "utf8");
const workflowSource = readFileSync(".github/workflows/gnocchi-desktop-installers.yml", "utf8");
const routeSource = readFileSync("server/routes/gnocchi-installers.ts", "utf8");
const routesSource = readFileSync("server/routes.ts", "utf8");
const studioSource = readFileSync("public/creation-tools/gnocchi/js/studio.js", "utf8");
const gnocchiIndexSource = readFileSync("public/creation-tools/gnocchi/index.html", "utf8");
const gnocchiContractManifest = JSON.parse(readFileSync("public/creation-tools/gnocchi/contract/pasta-open-edition.template.json", "utf8"));
const commonSource = readFileSync("public/creation-tools/gnocchi/js/common.js", "utf8");
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const gitignoreSource = readFileSync(".gitignore", "utf8");
const liveCheckSource = readFileSync("scripts/check-gnocchi-installers-live.mjs", "utf8");
const envExampleSource = readFileSync(".env.example", "utf8");
const inventorySource = readFileSync("tests/e2e/inventory/domain-workflows.mjs", "utf8");

test("Gnocchi desktop package bundles the open-edition publisher in an Electron shell", () => {
  assert.equal(desktopPackage.name, "@wtf/gnocchi-desktop");
  assert.equal(desktopPackage.version, "1.0.1-alpha.1");
  assert.equal(desktopPackage.main, "src/main.cjs");
  assert.equal(desktopPackage.devDependencies.electron, "42.4.0");
  assert.equal(desktopPackage.devDependencies["electron-builder"], "26.15.3");
  assert.equal(desktopPackage.homepage, "https://wtfos.app/creation-tools/gnocchi/index.html");
  assert.equal(desktopPackage.desktopName, "gnocchi-studio");
  assert.equal(desktopPackage.author.name, "wtfOS");
  assert.equal(desktopPackage.author.email, "support@wtfos.app");
  assert.match(desktopPackage.scripts.prepare, /prepare-assets\.mjs/);
  assert.match(desktopPackage.scripts["dist:mac"], /--mac dmg zip --universal/);
  assert.match(desktopPackage.scripts["dist:windows"], /--win nsis --x64/);
  assert.match(desktopPackage.scripts["dist:raspberry-pi"], /--linux deb --arm64/);
  assert.deepEqual(desktopPackage.build.files, [
    "package.json",
    "src/**/*",
    "gnocchi/**/*",
    "provenance/**/*",
  ]);
  assert.equal(desktopPackage.build.artifactName, "Gnocchi-Studio-${version}-${os}-${arch}.${ext}");
  assert.equal(desktopPackage.build.executableName, "gnocchi-studio");
  assert.equal(desktopPackage.build.linux.maintainer, "wtfOS <support@wtfos.app>");
  assert.equal(desktopPackage.build.linux.syncDesktopName, true);
  assert.equal(desktopPackage.build.deb.packageName, "gnocchi-studio");
  assert.equal(desktopPackage.build.deb.packageCategory, "devel");
  assert.equal(desktopPackage.build.deb.maintainer, "wtfOS <support@wtfos.app>");
  assert.match(gitignoreSource, /apps\/gnocchi-desktop\/gnocchi\//);
  assert.match(gitignoreSource, /apps\/gnocchi-desktop\/release\//);
});

test("Gnocchi desktop asset preparation preserves the static publisher contract", () => {
  assert.match(prepareSource, /public\/creation-tools\/gnocchi/);
  assert.match(prepareSource, /contract\/pasta-open-edition\.contract\.json/);
  assert.match(prepareSource, /js\/pasta-foundation\.js/);
  assert.match(prepareSource, /vendor\/tezos\.js/);
  assert.match(prepareSource, /vendor\/octez-connect\.js/);
  assert.ok(existsSync("public/creation-tools/gnocchi/index.html"), "Gnocchi source page should exist");
  assert.ok(existsSync("public/creation-tools/gnocchi/contract/pasta-open-edition.contract.json"), "Gnocchi contract artifact should exist");
  assert.match(studioSource, /Pasta Protocol open-edition publisher/);
  assert.match(studioSource, /gnocchi\.edition_published/);
  assert.match(studioSource, /gnocchi\.collection_verified/);
  assert.match(studioSource, /gnocchi\.collection_editions_viewed/);
  assert.match(studioSource, /total_minted: new M\(\)/);
  assert.match(studioSource, /policy_locked: new M\(\)/);
  assert.match(gnocchiIndexSource, /value="timed"/);
  assert.match(gnocchiIndexSource, /value="forever"/);
  assert.match(gnocchiIndexSource, /value="limited"/);
  assert.match(gnocchiIndexSource, /id="existingCollectionKt"/);
  assert.match(gnocchiIndexSource, /id="lockPolicy"/);
  assert.deepEqual(gnocchiContractManifest.entrypoints.filter((entrypoint) => /open_edition|sale_policy|open_mint/.test(entrypoint)), [
    "create_open_edition",
    "lock_sale_policy",
    "open_mint",
  ]);
  assert.match(commonSource, /window\.MD/);
});

test("Gnocchi desktop runtime serves local assets and blocks hosted wtfOS APIs", () => {
  assert.match(mainSource, /http\.createServer/);
  assert.match(mainSource, /listenOnStableOrigin\(nextServer, PRODUCT_NAME\)/);
  assert.match(mainSource, /mainWindow\.loadURL\(`\$\{baseUrl\}\/`\)/);
  assert.match(mainSource, /path\.join\(appRoot\(\), "gnocchi"\)/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/auth\/user"/);
  assert.match(mainSource, /Gnocchi Desktop does not include wtfOS hosted resources/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/auth\/csrf-token"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/gnocchi\/installers"/);
  assert.match(mainSource, /product: "gnocchi"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/system\/logs\/client"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/macaroni\/ipfs\/pin"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/macaroni\/publish"/);
  assert.match(mainSource, /Use Pinata or your own IPFS node/);
  assert.match(mainSource, /nodeIntegration: false/);
  assert.match(mainSource, /contextIsolation: true/);
  assert.match(mainSource, /sandbox: true/);
  assert.match(mainSource, /setWindowOpenHandler/);
  assert.match(preloadSource, /GNOCCHI_DESKTOP/);
  assert.match(preloadSource, /PASTA_TOOL_DESKTOP/);
  assert.match(preloadSource, /native: true/);
});

test("Gnocchi desktop installer workflow builds all target packages", () => {
  assert.match(workflowSource, /name: Gnocchi Desktop Installers/);
  assert.match(workflowSource, /workflow_dispatch/);
  assert.match(workflowSource, /gnocchi-desktop-v\*/);
  assert.match(workflowSource, /node-version: 22/);
  assert.match(workflowSource, /macos-latest/);
  assert.match(workflowSource, /windows-latest/);
  assert.match(workflowSource, /ubuntu-latest/);
  assert.match(workflowSource, /npm ci --prefix apps\/gnocchi-desktop/);
  assert.match(workflowSource, /npm run gnocchi:desktop:check/);
  assert.match(workflowSource, /npm run dist:mac --prefix apps\/gnocchi-desktop/);
  assert.match(workflowSource, /npm run dist:windows --prefix apps\/gnocchi-desktop/);
  assert.match(workflowSource, /npm run dist:raspberry-pi --prefix apps\/gnocchi-desktop/);
  assert.match(workflowSource, /actions\/upload-artifact@v4/);
  assert.match(workflowSource, /softprops\/action-gh-release@v2/);
});

test("Gnocchi production installer manifest keeps release download hardening rules", () => {
  assert.match(routesSource, /import gnocchiInstallerRoutes from "\.\/routes\/gnocchi-installers"/);
  assert.match(routesSource, /app\.use\(gnocchiInstallerRoutes\)/);
  assert.match(routeSource, /router\.get\("\/api\/gnocchi\/installers", isAuthenticated/);
  assert.match(routeSource, /product: "gnocchi"/);
  assert.match(routeSource, /GNOCCHI_INSTALLER_VERSION/);
  assert.match(routeSource, /GNOCCHI_INSTALLER_MACOS_URL/);
  assert.match(routeSource, /GNOCCHI_INSTALLER_MACOS_SHA256/);
  assert.match(routeSource, /GNOCCHI_INSTALLER_WINDOWS_URL/);
  assert.match(routeSource, /GNOCCHI_INSTALLER_WINDOWS_SHA256/);
  assert.match(routeSource, /GNOCCHI_INSTALLER_RASPBERRY_PI_URL/);
  assert.match(routeSource, /GNOCCHI_INSTALLER_RASPBERRY_PI_SHA256/);
  assert.match(routeSource, /fileName: "Gnocchi-Studio\.exe"/);
  assert.doesNotMatch(routeSource, /fileName: "Gnocchi-Studio\.msi"/);
  assert.match(routeSource, /function isLoopbackInstallerHost\(hostname: string\): boolean/);
  assert.match(routeSource, /url\.protocol === "https:"/);
  assert.match(routeSource, /process\.env\.NODE_ENV !== "production" && url\.protocol === "http:" && isLoopbackInstallerHost\(url\.hostname\)/);
  assert.doesNotMatch(routeSource, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
  assert.match(routeSource, /safeInstallerSha256/);
  assert.match(routeSource, /available: Boolean\(url && sha256\)/);
  assert.match(routeSource, /url: url && sha256 \? url : null/);
  assert.match(envExampleSource, /GNOCCHI_INSTALLER_VERSION=/);
  assert.match(envExampleSource, /GNOCCHI_INSTALLER_MACOS_URL=/);
  assert.match(envExampleSource, /GNOCCHI_INSTALLER_MACOS_SHA256=/);
  assert.match(envExampleSource, /GNOCCHI_INSTALLER_WINDOWS_URL=/);
  assert.match(envExampleSource, /GNOCCHI_INSTALLER_WINDOWS_SHA256=/);
  assert.match(envExampleSource, /GNOCCHI_INSTALLER_RASPBERRY_PI_URL=/);
  assert.match(envExampleSource, /GNOCCHI_INSTALLER_RASPBERRY_PI_SHA256=/);
  assert.match(liveCheckSource, /gnocchi-desktop-v\$\{EXPECTED_VERSION\}/);
  assert.match(liveCheckSource, /\/api\/gnocchi\/installers/);
  assert.match(liveCheckSource, /Gnocchi-Studio-\$\{EXPECTED_VERSION\}-mac-universal\.dmg/);
  assert.match(liveCheckSource, /Gnocchi-Studio-\$\{EXPECTED_VERSION\}-win-x64\.exe/);
  assert.match(liveCheckSource, /Gnocchi-Studio-\$\{EXPECTED_VERSION\}-linux-arm64\.deb/);
  assert.match(liveCheckSource, /asset\.digest/);
  assert.match(inventorySource, /gnocchi\.installer_manifest\.viewed/);
  assert.match(inventorySource, /\/api\/gnocchi\/installers/);
});

test("Gnocchi desktop root scripts expose package preparation, policy, and dist", () => {
  assert.equal(rootPackage.scripts["gnocchi:desktop:prepare"], "npm run prepare --prefix apps/gnocchi-desktop");
  assert.equal(rootPackage.scripts["gnocchi:desktop:check"], "node --test scripts/gnocchi-desktop-package-policy.test.mjs");
  assert.equal(rootPackage.scripts["gnocchi:installers:live-check"], "node scripts/check-gnocchi-installers-live.mjs");
  assert.equal(rootPackage.scripts["gnocchi:desktop:dist"], "npm run dist --prefix apps/gnocchi-desktop");
});
