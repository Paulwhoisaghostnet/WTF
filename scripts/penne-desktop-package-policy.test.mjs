import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const desktopPackage = JSON.parse(readFileSync("apps/penne-desktop/package.json", "utf8"));
const mainSource = readFileSync("apps/penne-desktop/src/main.cjs", "utf8");
const preloadSource = readFileSync("apps/penne-desktop/src/preload.cjs", "utf8");
const prepareSource = readFileSync("apps/penne-desktop/scripts/prepare-assets.mjs", "utf8");
const workflowSource = readFileSync(".github/workflows/penne-desktop-installers.yml", "utf8");
const routeSource = readFileSync("server/routes/penne-installers.ts", "utf8");
const routesSource = readFileSync("server/routes.ts", "utf8");
const studioSource = readFileSync("public/creation-tools/penne/js/studio.js", "utf8");
const commonSource = readFileSync("public/creation-tools/penne/js/common.js", "utf8");
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const gitignoreSource = readFileSync(".gitignore", "utf8");
const liveCheckSource = readFileSync("scripts/check-penne-installers-live.mjs", "utf8");
const envExampleSource = readFileSync(".env.example", "utf8");
const inventorySource = readFileSync("tests/e2e/inventory/domain-workflows.mjs", "utf8");

test("Penne desktop package bundles the distribution publisher in an Electron shell", () => {
  assert.equal(desktopPackage.name, "@wtf/penne-desktop");
  assert.equal(desktopPackage.version, "1.0.1-alpha.1");
  assert.equal(desktopPackage.main, "src/main.cjs");
  assert.equal(desktopPackage.devDependencies.electron, "42.4.0");
  assert.equal(desktopPackage.devDependencies["electron-builder"], "26.15.3");
  assert.equal(desktopPackage.homepage, "https://wtfos.app/creation-tools/penne/index.html");
  assert.equal(desktopPackage.desktopName, "penne-studio");
  assert.equal(desktopPackage.author.name, "wtfOS");
  assert.equal(desktopPackage.author.email, "support@wtfos.app");
  assert.match(desktopPackage.scripts.prepare, /prepare-assets\.mjs/);
  assert.match(desktopPackage.scripts["dist:mac"], /--mac dmg zip --universal/);
  assert.match(desktopPackage.scripts["dist:windows"], /--win nsis --x64/);
  assert.match(desktopPackage.scripts["dist:raspberry-pi"], /--linux deb --arm64/);
  assert.deepEqual(desktopPackage.build.files, [
    "package.json",
    "src/**/*",
    "penne/**/*",
    "provenance/**/*",
  ]);
  assert.equal(desktopPackage.build.artifactName, "Penne-Studio-${version}-${os}-${arch}.${ext}");
  assert.equal(desktopPackage.build.executableName, "penne-studio");
  assert.equal(desktopPackage.build.linux.maintainer, "wtfOS <support@wtfos.app>");
  assert.equal(desktopPackage.build.linux.syncDesktopName, true);
  assert.equal(desktopPackage.build.deb.packageName, "penne-studio");
  assert.equal(desktopPackage.build.deb.packageCategory, "devel");
  assert.equal(desktopPackage.build.deb.maintainer, "wtfOS <support@wtfos.app>");
  assert.match(gitignoreSource, /apps\/penne-desktop\/penne\//);
  assert.match(gitignoreSource, /apps\/penne-desktop\/release\//);
});

test("Penne desktop asset preparation preserves the static publisher contract", () => {
  assert.match(prepareSource, /public\/creation-tools\/penne/);
  assert.match(prepareSource, /contract\/pasta-distribution\.contract\.json/);
  assert.match(prepareSource, /js\/pasta-foundation\.js/);
  assert.match(prepareSource, /vendor\/tezos\.js/);
  assert.match(prepareSource, /vendor\/octez-connect\.js/);
  assert.ok(existsSync("public/creation-tools/penne/index.html"), "Penne source page should exist");
  assert.ok(existsSync("public/creation-tools/penne/contract/pasta-distribution.contract.json"), "Penne contract artifact should exist");
  assert.match(studioSource, /Pasta Protocol distribution publisher/);
  assert.match(studioSource, /penne\.distribution_configured/);
  assert.match(commonSource, /window\.MD/);
});

test("Penne desktop runtime serves local assets and blocks hosted wtfOS APIs", () => {
  assert.match(mainSource, /http\.createServer/);
  assert.match(mainSource, /listenOnStableOrigin\(nextServer, PRODUCT_NAME\)/);
  assert.match(mainSource, /mainWindow\.loadURL\(`\$\{baseUrl\}\/`\)/);
  assert.match(mainSource, /path\.join\(appRoot\(\), "penne"\)/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/auth\/user"/);
  assert.match(mainSource, /Penne Desktop does not include wtfOS hosted resources/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/auth\/csrf-token"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/penne\/installers"/);
  assert.match(mainSource, /product: "penne"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/system\/logs\/client"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/macaroni\/ipfs\/pin"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/macaroni\/publish"/);
  assert.match(mainSource, /Use Pinata or your own IPFS node/);
  assert.match(mainSource, /nodeIntegration: false/);
  assert.match(mainSource, /contextIsolation: true/);
  assert.match(mainSource, /sandbox: true/);
  assert.match(mainSource, /setWindowOpenHandler/);
  assert.match(preloadSource, /PENNE_DESKTOP/);
  assert.match(preloadSource, /PASTA_TOOL_DESKTOP/);
  assert.match(preloadSource, /native: true/);
});

test("Penne desktop installer workflow builds all target packages", () => {
  assert.match(workflowSource, /name: Penne Desktop Installers/);
  assert.match(workflowSource, /workflow_dispatch/);
  assert.match(workflowSource, /penne-desktop-v\*/);
  assert.match(workflowSource, /node-version: 22/);
  assert.match(workflowSource, /macos-latest/);
  assert.match(workflowSource, /windows-latest/);
  assert.match(workflowSource, /ubuntu-latest/);
  assert.match(workflowSource, /npm ci --prefix apps\/penne-desktop/);
  assert.match(workflowSource, /npm run penne:desktop:check/);
  assert.match(workflowSource, /npm run dist:mac --prefix apps\/penne-desktop/);
  assert.match(workflowSource, /npm run dist:windows --prefix apps\/penne-desktop/);
  assert.match(workflowSource, /npm run dist:raspberry-pi --prefix apps\/penne-desktop/);
  assert.match(workflowSource, /actions\/upload-artifact@v4/);
  assert.match(workflowSource, /softprops\/action-gh-release@v2/);
});

test("Penne production installer manifest keeps release download hardening rules", () => {
  assert.match(routesSource, /import penneInstallerRoutes from "\.\/routes\/penne-installers"/);
  assert.match(routesSource, /app\.use\(penneInstallerRoutes\)/);
  assert.match(routeSource, /router\.get\("\/api\/penne\/installers", isAuthenticated/);
  assert.match(routeSource, /product: "penne"/);
  assert.match(routeSource, /PENNE_INSTALLER_VERSION/);
  assert.match(routeSource, /PENNE_INSTALLER_MACOS_URL/);
  assert.match(routeSource, /PENNE_INSTALLER_MACOS_SHA256/);
  assert.match(routeSource, /PENNE_INSTALLER_WINDOWS_URL/);
  assert.match(routeSource, /PENNE_INSTALLER_WINDOWS_SHA256/);
  assert.match(routeSource, /PENNE_INSTALLER_RASPBERRY_PI_URL/);
  assert.match(routeSource, /PENNE_INSTALLER_RASPBERRY_PI_SHA256/);
  assert.match(routeSource, /fileName: "Penne-Studio\.exe"/);
  assert.doesNotMatch(routeSource, /fileName: "Penne-Studio\.msi"/);
  assert.match(routeSource, /function isLoopbackInstallerHost\(hostname: string\): boolean/);
  assert.match(routeSource, /url\.protocol === "https:"/);
  assert.match(routeSource, /process\.env\.NODE_ENV !== "production" && url\.protocol === "http:" && isLoopbackInstallerHost\(url\.hostname\)/);
  assert.doesNotMatch(routeSource, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
  assert.match(routeSource, /safeInstallerSha256/);
  assert.match(routeSource, /available: Boolean\(url && sha256\)/);
  assert.match(routeSource, /url: url && sha256 \? url : null/);
  assert.match(envExampleSource, /PENNE_INSTALLER_VERSION=/);
  assert.match(envExampleSource, /PENNE_INSTALLER_MACOS_URL=/);
  assert.match(envExampleSource, /PENNE_INSTALLER_MACOS_SHA256=/);
  assert.match(envExampleSource, /PENNE_INSTALLER_WINDOWS_URL=/);
  assert.match(envExampleSource, /PENNE_INSTALLER_WINDOWS_SHA256=/);
  assert.match(envExampleSource, /PENNE_INSTALLER_RASPBERRY_PI_URL=/);
  assert.match(envExampleSource, /PENNE_INSTALLER_RASPBERRY_PI_SHA256=/);
  assert.match(liveCheckSource, /penne-desktop-v\$\{EXPECTED_VERSION\}/);
  assert.match(liveCheckSource, /\/api\/penne\/installers/);
  assert.match(liveCheckSource, /Penne-Studio-\$\{EXPECTED_VERSION\}-mac-universal\.dmg/);
  assert.match(liveCheckSource, /Penne-Studio-\$\{EXPECTED_VERSION\}-win-x64\.exe/);
  assert.match(liveCheckSource, /Penne-Studio-\$\{EXPECTED_VERSION\}-linux-arm64\.deb/);
  assert.match(liveCheckSource, /asset\.digest/);
  assert.match(inventorySource, /penne\.installer_manifest\.viewed/);
  assert.match(inventorySource, /\/api\/penne\/installers/);
});

test("Penne desktop root scripts expose package preparation, policy, and dist", () => {
  assert.equal(rootPackage.scripts["penne:desktop:prepare"], "npm run prepare --prefix apps/penne-desktop");
  assert.equal(rootPackage.scripts["penne:desktop:check"], "node --test scripts/penne-desktop-package-policy.test.mjs");
  assert.equal(rootPackage.scripts["penne:installers:live-check"], "node scripts/check-penne-installers-live.mjs");
  assert.equal(rootPackage.scripts["penne:desktop:dist"], "npm run dist --prefix apps/penne-desktop");
});
