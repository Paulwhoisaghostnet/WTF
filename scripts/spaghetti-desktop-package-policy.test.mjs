import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const desktopPackage = JSON.parse(readFileSync("apps/spaghetti-desktop/package.json", "utf8"));
const mainSource = readFileSync("apps/spaghetti-desktop/src/main.cjs", "utf8");
const preloadSource = readFileSync("apps/spaghetti-desktop/src/preload.cjs", "utf8");
const prepareSource = readFileSync("apps/spaghetti-desktop/scripts/prepare-assets.mjs", "utf8");
const workflowSource = readFileSync(".github/workflows/spaghetti-desktop-installers.yml", "utf8");
const routeSource = readFileSync("server/routes/spaghetti-installers.ts", "utf8");
const routesSource = readFileSync("server/routes.ts", "utf8");
const studioSource = readFileSync("public/creation-tools/spaghetti/js/studio.js", "utf8");
const commonSource = readFileSync("public/creation-tools/spaghetti/js/common.js", "utf8");
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const gitignoreSource = readFileSync(".gitignore", "utf8");
const liveCheckSource = readFileSync("scripts/check-spaghetti-installers-live.mjs", "utf8");
const envExampleSource = readFileSync(".env.example", "utf8");
const inventorySource = readFileSync("tests/e2e/inventory/domain-workflows.mjs", "utf8");

test("Spaghetti desktop package bundles the standard collection publisher in an Electron shell", () => {
  assert.equal(desktopPackage.name, "@wtf/spaghetti-desktop");
  assert.equal(desktopPackage.version, "1.0.1-alpha.1");
  assert.equal(desktopPackage.main, "src/main.cjs");
  assert.equal(desktopPackage.devDependencies.electron, "42.4.0");
  assert.equal(desktopPackage.devDependencies["electron-builder"], "26.15.3");
  assert.equal(desktopPackage.homepage, "https://wtfos.app/creation-tools/spaghetti/index.html");
  assert.equal(desktopPackage.desktopName, "spaghetti-studio");
  assert.equal(desktopPackage.author.name, "wtfOS");
  assert.equal(desktopPackage.author.email, "support@wtfos.app");
  assert.match(desktopPackage.scripts.prepare, /prepare-assets\.mjs/);
  assert.match(desktopPackage.scripts["dist:mac"], /--mac dmg zip --universal/);
  assert.match(desktopPackage.scripts["dist:windows"], /--win nsis --x64/);
  assert.match(desktopPackage.scripts["dist:raspberry-pi"], /--linux deb --arm64/);
  assert.deepEqual(desktopPackage.build.files, [
    "package.json",
    "src/**/*",
    "spaghetti/**/*",
    "provenance/**/*",
  ]);
  assert.equal(desktopPackage.build.artifactName, "Spaghetti-Studio-${version}-${os}-${arch}.${ext}");
  assert.equal(desktopPackage.build.executableName, "spaghetti-studio");
  assert.equal(desktopPackage.build.linux.maintainer, "wtfOS <support@wtfos.app>");
  assert.equal(desktopPackage.build.linux.syncDesktopName, true);
  assert.equal(desktopPackage.build.deb.packageName, "spaghetti-studio");
  assert.equal(desktopPackage.build.deb.packageCategory, "devel");
  assert.equal(desktopPackage.build.deb.maintainer, "wtfOS <support@wtfos.app>");
  assert.match(gitignoreSource, /apps\/spaghetti-desktop\/spaghetti\//);
  assert.match(gitignoreSource, /apps\/spaghetti-desktop\/release\//);
});

test("Spaghetti desktop asset preparation preserves the static publisher contract", () => {
  assert.match(prepareSource, /public\/creation-tools\/spaghetti/);
  assert.match(prepareSource, /contract\/pasta-standard-collection\.contract\.json/);
  assert.match(prepareSource, /js\/pasta-foundation\.js/);
  assert.match(prepareSource, /vendor\/tezos\.js/);
  assert.match(prepareSource, /vendor\/octez-connect\.js/);
  assert.ok(existsSync("public/creation-tools/spaghetti/index.html"), "Spaghetti source page should exist");
  assert.ok(existsSync("public/creation-tools/spaghetti/contract/pasta-standard-collection.contract.json"), "Spaghetti contract artifact should exist");
  assert.match(studioSource, /Pasta Protocol standard collection/);
  assert.match(studioSource, /spaghetti\.token_published/);
  assert.match(commonSource, /window\.MD/);
});

test("Spaghetti desktop runtime serves local assets and blocks hosted wtfOS APIs", () => {
  assert.match(mainSource, /http\.createServer/);
  assert.match(mainSource, /listenOnStableOrigin\(nextServer, PRODUCT_NAME\)/);
  assert.match(mainSource, /mainWindow\.loadURL\(`\$\{baseUrl\}\/`\)/);
  assert.match(mainSource, /path\.join\(appRoot\(\), "spaghetti"\)/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/auth\/user"/);
  assert.match(mainSource, /Spaghetti Desktop does not include wtfOS hosted resources/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/auth\/csrf-token"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/spaghetti\/installers"/);
  assert.match(mainSource, /product: "spaghetti"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/system\/logs\/client"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/macaroni\/ipfs\/pin"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/macaroni\/publish"/);
  assert.match(mainSource, /Use Pinata or your own IPFS node/);
  assert.match(mainSource, /nodeIntegration: false/);
  assert.match(mainSource, /contextIsolation: true/);
  assert.match(mainSource, /sandbox: true/);
  assert.match(mainSource, /setWindowOpenHandler/);
  assert.match(preloadSource, /SPAGHETTI_DESKTOP/);
  assert.match(preloadSource, /PASTA_TOOL_DESKTOP/);
  assert.match(preloadSource, /native: true/);
});

test("Spaghetti desktop installer workflow builds all target packages", () => {
  assert.match(workflowSource, /name: Spaghetti Desktop Installers/);
  assert.match(workflowSource, /workflow_dispatch/);
  assert.match(workflowSource, /spaghetti-desktop-v\*/);
  assert.match(workflowSource, /node-version: 22/);
  assert.match(workflowSource, /macos-latest/);
  assert.match(workflowSource, /windows-latest/);
  assert.match(workflowSource, /ubuntu-latest/);
  assert.match(workflowSource, /npm ci --prefix apps\/spaghetti-desktop/);
  assert.match(workflowSource, /npm run spaghetti:desktop:check/);
  assert.match(workflowSource, /npm run dist:mac --prefix apps\/spaghetti-desktop/);
  assert.match(workflowSource, /npm run dist:windows --prefix apps\/spaghetti-desktop/);
  assert.match(workflowSource, /npm run dist:raspberry-pi --prefix apps\/spaghetti-desktop/);
  assert.match(workflowSource, /actions\/upload-artifact@v4/);
  assert.match(workflowSource, /softprops\/action-gh-release@v2/);
});

test("Spaghetti production installer manifest keeps release download hardening rules", () => {
  assert.match(routesSource, /import spaghettiInstallerRoutes from "\.\/routes\/spaghetti-installers"/);
  assert.match(routesSource, /app\.use\(spaghettiInstallerRoutes\)/);
  assert.match(routeSource, /router\.get\("\/api\/spaghetti\/installers", isAuthenticated/);
  assert.match(routeSource, /product: "spaghetti"/);
  assert.match(routeSource, /SPAGHETTI_INSTALLER_VERSION/);
  assert.match(routeSource, /SPAGHETTI_INSTALLER_MACOS_URL/);
  assert.match(routeSource, /SPAGHETTI_INSTALLER_MACOS_SHA256/);
  assert.match(routeSource, /SPAGHETTI_INSTALLER_WINDOWS_URL/);
  assert.match(routeSource, /SPAGHETTI_INSTALLER_WINDOWS_SHA256/);
  assert.match(routeSource, /SPAGHETTI_INSTALLER_RASPBERRY_PI_URL/);
  assert.match(routeSource, /SPAGHETTI_INSTALLER_RASPBERRY_PI_SHA256/);
  assert.match(routeSource, /fileName: "Spaghetti-Studio\.exe"/);
  assert.doesNotMatch(routeSource, /fileName: "Spaghetti-Studio\.msi"/);
  assert.match(routeSource, /function isLoopbackInstallerHost\(hostname: string\): boolean/);
  assert.match(routeSource, /url\.protocol === "https:"/);
  assert.match(routeSource, /process\.env\.NODE_ENV !== "production" && url\.protocol === "http:" && isLoopbackInstallerHost\(url\.hostname\)/);
  assert.doesNotMatch(routeSource, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
  assert.match(routeSource, /safeInstallerSha256/);
  assert.match(routeSource, /available: Boolean\(url && sha256\)/);
  assert.match(routeSource, /url: url && sha256 \? url : null/);
  assert.match(envExampleSource, /SPAGHETTI_INSTALLER_VERSION=/);
  assert.match(envExampleSource, /SPAGHETTI_INSTALLER_MACOS_URL=/);
  assert.match(envExampleSource, /SPAGHETTI_INSTALLER_MACOS_SHA256=/);
  assert.match(envExampleSource, /SPAGHETTI_INSTALLER_WINDOWS_URL=/);
  assert.match(envExampleSource, /SPAGHETTI_INSTALLER_WINDOWS_SHA256=/);
  assert.match(envExampleSource, /SPAGHETTI_INSTALLER_RASPBERRY_PI_URL=/);
  assert.match(envExampleSource, /SPAGHETTI_INSTALLER_RASPBERRY_PI_SHA256=/);
  assert.match(liveCheckSource, /spaghetti-desktop-v\$\{EXPECTED_VERSION\}/);
  assert.match(liveCheckSource, /\/api\/spaghetti\/installers/);
  assert.match(liveCheckSource, /Spaghetti-Studio-\$\{EXPECTED_VERSION\}-mac-universal\.dmg/);
  assert.match(liveCheckSource, /Spaghetti-Studio-\$\{EXPECTED_VERSION\}-win-x64\.exe/);
  assert.match(liveCheckSource, /Spaghetti-Studio-\$\{EXPECTED_VERSION\}-linux-arm64\.deb/);
  assert.match(liveCheckSource, /asset\.digest/);
  assert.match(inventorySource, /spaghetti\.installer_manifest\.viewed/);
  assert.match(inventorySource, /\/api\/spaghetti\/installers/);
});

test("Spaghetti desktop root scripts expose package preparation, policy, and dist", () => {
  assert.equal(rootPackage.scripts["spaghetti:desktop:prepare"], "npm run prepare --prefix apps/spaghetti-desktop");
  assert.equal(rootPackage.scripts["spaghetti:desktop:check"], "node --test scripts/spaghetti-desktop-package-policy.test.mjs");
  assert.equal(rootPackage.scripts["spaghetti:installers:live-check"], "node scripts/check-spaghetti-installers-live.mjs");
  assert.equal(rootPackage.scripts["spaghetti:desktop:dist"], "npm run dist --prefix apps/spaghetti-desktop");
});
