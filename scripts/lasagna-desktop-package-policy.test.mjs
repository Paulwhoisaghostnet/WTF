import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const desktopPackage = JSON.parse(readFileSync("apps/lasagna-desktop/package.json", "utf8"));
const mainSource = readFileSync("apps/lasagna-desktop/src/main.cjs", "utf8");
const preloadSource = readFileSync("apps/lasagna-desktop/src/preload.cjs", "utf8");
const prepareSource = readFileSync("apps/lasagna-desktop/scripts/prepare-assets.mjs", "utf8");
const workflowSource = readFileSync(".github/workflows/lasagna-desktop-installers.yml", "utf8");
const routeSource = readFileSync("server/routes/lasagna-installers.ts", "utf8");
const routesSource = readFileSync("server/routes.ts", "utf8");
const studioSource = readFileSync("public/creation-tools/lasagna/js/studio.js", "utf8");
const commonSource = readFileSync("public/creation-tools/lasagna/js/common.js", "utf8");
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const gitignoreSource = readFileSync(".gitignore", "utf8");
const liveCheckSource = readFileSync("scripts/check-lasagna-installers-live.mjs", "utf8");
const envExampleSource = readFileSync(".env.example", "utf8");
const inventorySource = readFileSync("tests/e2e/inventory/domain-workflows.mjs", "utf8");

test("Lasagna desktop package bundles the exhibition publisher in an Electron shell", () => {
  assert.equal(desktopPackage.name, "@wtf/lasagna-desktop");
  assert.equal(desktopPackage.version, "1.0.1-alpha.1");
  assert.equal(desktopPackage.main, "src/main.cjs");
  assert.equal(desktopPackage.devDependencies.electron, "42.4.0");
  assert.equal(desktopPackage.devDependencies["electron-builder"], "26.15.3");
  assert.equal(desktopPackage.homepage, "https://wtfos.app/creation-tools/lasagna/index.html");
  assert.equal(desktopPackage.desktopName, "lasagna-studio");
  assert.equal(desktopPackage.author.name, "wtfOS");
  assert.equal(desktopPackage.author.email, "support@wtfos.app");
  assert.match(desktopPackage.scripts.prepare, /prepare-assets\.mjs/);
  assert.match(desktopPackage.scripts["dist:mac"], /--mac dmg zip --universal/);
  assert.match(desktopPackage.scripts["dist:windows"], /--win nsis --x64/);
  assert.match(desktopPackage.scripts["dist:raspberry-pi"], /--linux deb --arm64/);
  assert.deepEqual(desktopPackage.build.files, [
    "package.json",
    "src/**/*",
    "lasagna/**/*",
    "provenance/**/*",
  ]);
  assert.equal(desktopPackage.build.artifactName, "Lasagna-Studio-${version}-${os}-${arch}.${ext}");
  assert.equal(desktopPackage.build.executableName, "lasagna-studio");
  assert.equal(desktopPackage.build.linux.maintainer, "wtfOS <support@wtfos.app>");
  assert.equal(desktopPackage.build.linux.syncDesktopName, true);
  assert.equal(desktopPackage.build.deb.packageName, "lasagna-studio");
  assert.equal(desktopPackage.build.deb.packageCategory, "devel");
  assert.equal(desktopPackage.build.deb.maintainer, "wtfOS <support@wtfos.app>");
  assert.match(gitignoreSource, /apps\/lasagna-desktop\/lasagna\//);
  assert.match(gitignoreSource, /apps\/lasagna-desktop\/release\//);
});

test("Lasagna desktop asset preparation preserves the static publisher contract", () => {
  assert.match(prepareSource, /public\/creation-tools\/lasagna/);
  assert.match(prepareSource, /contract\/pasta-exhibition\.contract\.json/);
  assert.match(prepareSource, /js\/pasta-foundation\.js/);
  assert.match(prepareSource, /vendor\/tezos\.js/);
  assert.match(prepareSource, /vendor\/octez-connect\.js/);
  assert.ok(existsSync("public/creation-tools/lasagna/index.html"), "Lasagna source page should exist");
  assert.ok(existsSync("public/creation-tools/lasagna/contract/pasta-exhibition.contract.json"), "Lasagna contract artifact should exist");
  assert.match(studioSource, /Pasta Protocol on-chain curation/);
  assert.match(studioSource, /lasagna\.exhibition_published/);
  assert.match(commonSource, /window\.MD/);
});

test("Lasagna desktop runtime serves local assets and blocks hosted wtfOS APIs", () => {
  assert.match(mainSource, /http\.createServer/);
  assert.match(mainSource, /listenOnStableOrigin\(nextServer, PRODUCT_NAME\)/);
  assert.match(mainSource, /mainWindow\.loadURL\(`\$\{baseUrl\}\/`\)/);
  assert.match(mainSource, /path\.join\(appRoot\(\), "lasagna"\)/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/auth\/user"/);
  assert.match(mainSource, /Lasagna Desktop does not include wtfOS hosted resources/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/auth\/csrf-token"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/lasagna\/installers"/);
  assert.match(mainSource, /product: "lasagna"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/system\/logs\/client"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/macaroni\/ipfs\/pin"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/macaroni\/publish"/);
  assert.match(mainSource, /Use Pinata or your own IPFS node/);
  assert.match(mainSource, /nodeIntegration: false/);
  assert.match(mainSource, /contextIsolation: true/);
  assert.match(mainSource, /sandbox: true/);
  assert.match(mainSource, /setWindowOpenHandler/);
  assert.match(preloadSource, /LASAGNA_DESKTOP/);
  assert.match(preloadSource, /PASTA_TOOL_DESKTOP/);
  assert.match(preloadSource, /native: true/);
});

test("Lasagna desktop installer workflow builds all target packages", () => {
  assert.match(workflowSource, /name: Lasagna Desktop Installers/);
  assert.match(workflowSource, /workflow_dispatch/);
  assert.match(workflowSource, /lasagna-desktop-v\*/);
  assert.match(workflowSource, /node-version: 22/);
  assert.match(workflowSource, /macos-latest/);
  assert.match(workflowSource, /windows-latest/);
  assert.match(workflowSource, /ubuntu-latest/);
  assert.match(workflowSource, /npm ci --prefix apps\/lasagna-desktop/);
  assert.match(workflowSource, /npm run lasagna:desktop:check/);
  assert.match(workflowSource, /npm run dist:mac --prefix apps\/lasagna-desktop/);
  assert.match(workflowSource, /npm run dist:windows --prefix apps\/lasagna-desktop/);
  assert.match(workflowSource, /npm run dist:raspberry-pi --prefix apps\/lasagna-desktop/);
  assert.match(workflowSource, /actions\/upload-artifact@v4/);
  assert.match(workflowSource, /softprops\/action-gh-release@v2/);
});

test("Lasagna production installer manifest keeps release download hardening rules", () => {
  assert.match(routesSource, /import lasagnaInstallerRoutes from "\.\/routes\/lasagna-installers"/);
  assert.match(routesSource, /app\.use\(lasagnaInstallerRoutes\)/);
  assert.match(routeSource, /router\.get\("\/api\/lasagna\/installers", isAuthenticated/);
  assert.match(routeSource, /product: "lasagna"/);
  assert.match(routeSource, /LASAGNA_INSTALLER_VERSION/);
  assert.match(routeSource, /LASAGNA_INSTALLER_MACOS_URL/);
  assert.match(routeSource, /LASAGNA_INSTALLER_MACOS_SHA256/);
  assert.match(routeSource, /LASAGNA_INSTALLER_WINDOWS_URL/);
  assert.match(routeSource, /LASAGNA_INSTALLER_WINDOWS_SHA256/);
  assert.match(routeSource, /LASAGNA_INSTALLER_RASPBERRY_PI_URL/);
  assert.match(routeSource, /LASAGNA_INSTALLER_RASPBERRY_PI_SHA256/);
  assert.match(routeSource, /fileName: "Lasagna-Studio\.exe"/);
  assert.doesNotMatch(routeSource, /fileName: "Lasagna-Studio\.msi"/);
  assert.match(routeSource, /function isLoopbackInstallerHost\(hostname: string\): boolean/);
  assert.match(routeSource, /url\.protocol === "https:"/);
  assert.match(routeSource, /process\.env\.NODE_ENV !== "production" && url\.protocol === "http:" && isLoopbackInstallerHost\(url\.hostname\)/);
  assert.doesNotMatch(routeSource, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
  assert.match(routeSource, /safeInstallerSha256/);
  assert.match(routeSource, /available: Boolean\(url && sha256\)/);
  assert.match(routeSource, /url: url && sha256 \? url : null/);
  assert.match(envExampleSource, /LASAGNA_INSTALLER_VERSION=/);
  assert.match(envExampleSource, /LASAGNA_INSTALLER_MACOS_URL=/);
  assert.match(envExampleSource, /LASAGNA_INSTALLER_MACOS_SHA256=/);
  assert.match(envExampleSource, /LASAGNA_INSTALLER_WINDOWS_URL=/);
  assert.match(envExampleSource, /LASAGNA_INSTALLER_WINDOWS_SHA256=/);
  assert.match(envExampleSource, /LASAGNA_INSTALLER_RASPBERRY_PI_URL=/);
  assert.match(envExampleSource, /LASAGNA_INSTALLER_RASPBERRY_PI_SHA256=/);
  assert.match(liveCheckSource, /lasagna-desktop-v\$\{EXPECTED_VERSION\}/);
  assert.match(liveCheckSource, /\/api\/lasagna\/installers/);
  assert.match(liveCheckSource, /Lasagna-Studio-\$\{EXPECTED_VERSION\}-mac-universal\.dmg/);
  assert.match(liveCheckSource, /Lasagna-Studio-\$\{EXPECTED_VERSION\}-win-x64\.exe/);
  assert.match(liveCheckSource, /Lasagna-Studio-\$\{EXPECTED_VERSION\}-linux-arm64\.deb/);
  assert.match(liveCheckSource, /asset\.digest/);
  assert.match(inventorySource, /lasagna\.installer_manifest\.viewed/);
  assert.match(inventorySource, /\/api\/lasagna\/installers/);
});

test("Lasagna desktop root scripts expose package preparation, policy, and dist", () => {
  assert.equal(rootPackage.scripts["lasagna:desktop:prepare"], "npm run prepare --prefix apps/lasagna-desktop");
  assert.equal(rootPackage.scripts["lasagna:desktop:check"], "node --test scripts/lasagna-desktop-package-policy.test.mjs");
  assert.equal(rootPackage.scripts["lasagna:installers:live-check"], "node scripts/check-lasagna-installers-live.mjs");
  assert.equal(rootPackage.scripts["lasagna:desktop:dist"], "npm run dist --prefix apps/lasagna-desktop");
});
