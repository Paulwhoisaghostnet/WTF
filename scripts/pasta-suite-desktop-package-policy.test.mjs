import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const desktopPackage = JSON.parse(readFileSync("apps/pasta-suite-desktop/package.json", "utf8"));
const mainSource = readFileSync("apps/pasta-suite-desktop/src/main.cjs", "utf8");
const preloadSource = readFileSync("apps/pasta-suite-desktop/src/preload.cjs", "utf8");
const prepareSource = readFileSync("apps/pasta-suite-desktop/scripts/prepare-assets.mjs", "utf8");
const workflowSource = readFileSync(".github/workflows/pasta-suite-desktop-installers.yml", "utf8");
const routeSource = readFileSync("server/routes/pasta-installers.ts", "utf8");
const routesSource = readFileSync("server/routes.ts", "utf8");
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const gitignoreSource = readFileSync(".gitignore", "utf8");
const liveCheckSource = readFileSync("scripts/check-pasta-suite-installers-live.mjs", "utf8");
const envExampleSource = readFileSync(".env.example", "utf8");

const pastaTools = ["macaroni", "spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"];

test("Pasta suite desktop package bundles all Pasta tools in an Electron shell", () => {
  assert.equal(desktopPackage.main, "src/main.cjs");
  assert.equal(desktopPackage.devDependencies.electron, "42.4.0");
  assert.equal(desktopPackage.devDependencies["electron-builder"], "26.15.3");
  assert.equal(desktopPackage.homepage, "https://wtfos.app/tools/ch-ease");
  assert.equal(desktopPackage.desktopName, "pasta-suite");
  assert.equal(desktopPackage.author.name, "wtfOS");
  assert.equal(desktopPackage.author.email, "support@wtfos.app");
  assert.match(desktopPackage.scripts.prepare, /prepare-assets\.mjs/);
  assert.match(desktopPackage.scripts["dist:mac"], /--mac dmg zip --universal/);
  assert.match(desktopPackage.scripts["dist:windows"], /--win nsis --x64/);
  assert.match(desktopPackage.scripts["dist:raspberry-pi"], /--linux deb --arm64/);
  assert.deepEqual(desktopPackage.build.files, ["package.json", "src/**/*", "pasta/**/*"]);
  assert.equal(desktopPackage.build.artifactName, "Pasta-Suite-${version}-${os}-${arch}.${ext}");
  assert.equal(desktopPackage.build.executableName, "pasta-suite");
  assert.equal(desktopPackage.build.linux.maintainer, "wtfOS <support@wtfos.app>");
  assert.equal(desktopPackage.build.linux.syncDesktopName, true);
  assert.equal(desktopPackage.build.deb.packageName, "pasta-suite");
  assert.equal(desktopPackage.build.deb.packageCategory, "devel");
  assert.equal(desktopPackage.build.deb.maintainer, "wtfOS <support@wtfos.app>");
  assert.match(gitignoreSource, /apps\/pasta-suite-desktop\/pasta\//);
  assert.match(gitignoreSource, /apps\/pasta-suite-desktop\/release\//);
});

test("Pasta suite asset preparation preserves production creation-tool paths", () => {
  for (const id of pastaTools) {
    assert.match(prepareSource, new RegExp(`id: "${id}"`));
    assert.match(prepareSource, /public\/creation-tools/);
    assert.match(prepareSource, new RegExp(`/creation-tools/${id}/`));
    assert.ok(existsSync(`public/creation-tools/${id}`), `${id} source folder should exist`);
  }
  assert.match(prepareSource, /outToolsDir = path\.join\(outDir, "creation-tools"\)/);
  assert.match(prepareSource, /suite-manifest\.json/);
  assert.match(prepareSource, /Pasta Suite/);
  assert.match(prepareSource, /Hosted wtfOS pinning, publishing, and authenticated package records are intentionally disabled/);
  assert.match(prepareSource, /contract\/pasta-standard-collection\.contract\.json/);
  assert.match(prepareSource, /contract\/pasta-open-edition\.contract\.json/);
  assert.match(prepareSource, /contract\/pasta-bundle\.contract\.json/);
  assert.match(prepareSource, /contract\/pasta-distribution\.contract\.json/);
  assert.match(prepareSource, /contract\/pasta-exhibition\.contract\.json/);
});

test("Pasta suite desktop runtime serves local assets and blocks hosted wtfOS APIs", () => {
  assert.match(mainSource, /http\.createServer/);
  assert.match(mainSource, /baseUrl = `http:\/\/127\.0\.0\.1:\$\{address\.port\}`/);
  assert.match(mainSource, /mainWindow\.loadURL\(`\$\{baseUrl\}\/`\)/);
  assert.match(mainSource, /path\.join\(appRoot\(\), "pasta"\)/);
  assert.match(mainSource, /\/creation-tools\/\$\{id\}\/studio\.html/);
  assert.match(mainSource, /\/creation-tools\/\$\{id\}\/index\.html/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/auth\/user"/);
  assert.match(mainSource, /Pasta Suite Desktop does not include wtfOS hosted resources/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/pasta\/installers"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/macaroni\/ipfs\/pin"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/macaroni\/publish"/);
  assert.match(mainSource, /async function exportMacaroniSite\(req, res\)/);
  assert.match(mainSource, /app\.getPath\("documents"\), "Pasta Suite", "macaroni-site"/);
  assert.match(mainSource, /nodeIntegration: false/);
  assert.match(mainSource, /contextIsolation: true/);
  assert.match(mainSource, /sandbox: true/);
  assert.match(mainSource, /setWindowOpenHandler/);
  assert.match(preloadSource, /PASTA_SUITE_DESKTOP/);
  assert.match(preloadSource, /MACARONI_DESKTOP/);
  assert.match(preloadSource, /native: true/);
});

test("Pasta suite installer workflow builds all target packages", () => {
  assert.match(workflowSource, /name: Pasta Suite Desktop Installers/);
  assert.match(workflowSource, /workflow_dispatch/);
  assert.match(workflowSource, /pasta-suite-desktop-v\*/);
  assert.match(workflowSource, /node-version: 22/);
  assert.match(workflowSource, /macos-latest/);
  assert.match(workflowSource, /windows-latest/);
  assert.match(workflowSource, /ubuntu-latest/);
  assert.match(workflowSource, /npm ci --prefix apps\/pasta-suite-desktop/);
  assert.match(workflowSource, /npm run pasta-suite:desktop:check/);
  assert.match(workflowSource, /npm run dist:mac --prefix apps\/pasta-suite-desktop/);
  assert.match(workflowSource, /npm run dist:windows --prefix apps\/pasta-suite-desktop/);
  assert.match(workflowSource, /npm run dist:raspberry-pi --prefix apps\/pasta-suite-desktop/);
  assert.match(workflowSource, /actions\/upload-artifact@v4/);
  assert.match(workflowSource, /softprops\/action-gh-release@v2/);
});

test("Pasta suite production installer manifest keeps Macaroni hardening rules", () => {
  assert.match(routesSource, /import pastaInstallerRoutes from "\.\/routes\/pasta-installers"/);
  assert.match(routesSource, /app\.use\(pastaInstallerRoutes\)/);
  assert.match(routeSource, /router\.get\("\/api\/pasta\/installers", isAuthenticated/);
  assert.match(routeSource, /router\.get\("\/api\/pasta\/installers\/catalog", isAuthenticated/);
  assert.match(routeSource, /PASTA_SUITE_INSTALLER_VERSION/);
  assert.match(routeSource, /PASTA_SUITE_INSTALLER_MACOS_URL/);
  assert.match(routeSource, /PASTA_SUITE_INSTALLER_MACOS_SHA256/);
  assert.match(routeSource, /PASTA_SUITE_INSTALLER_WINDOWS_URL/);
  assert.match(routeSource, /PASTA_SUITE_INSTALLER_WINDOWS_SHA256/);
  assert.match(routeSource, /PASTA_SUITE_INSTALLER_RASPBERRY_PI_URL/);
  assert.match(routeSource, /PASTA_SUITE_INSTALLER_RASPBERRY_PI_SHA256/);
  assert.match(routeSource, /fileName: "Pasta-Suite\.exe"/);
  assert.doesNotMatch(routeSource, /fileName: "Pasta-Suite\.msi"/);
  assert.match(routeSource, /const BUNDLED_PASTA_APPS = \[/);
  for (const id of pastaTools) {
    assert.match(routeSource, new RegExp(`key: "${id}"`));
  }
  assert.match(routeSource, /bundledApps: BUNDLED_PASTA_APPS/);
  assert.match(routeSource, /const INDIVIDUAL_PASTA_INSTALLER_PRODUCTS = \[/);
  for (const id of pastaTools) {
    assert.match(routeSource, new RegExp(`manifestPath: "/api/${id}/installers"`));
    assert.match(routeSource, new RegExp(`${id.toUpperCase()}_INSTALLER_VERSION`));
  }
  assert.match(routeSource, /product: "pasta-protocol-installers"/);
  assert.match(routeSource, /manifestVersion: 1/);
  assert.match(routeSource, /suiteAvailable: suite\.installers\.every\(\(item\) => item\.available\)/);
  assert.match(routeSource, /individualAvailable: individualApps\.every\(\(app\) => app\.installers\.every\(\(item\) => item\.available\)\)/);
  assert.match(routeSource, /products: \[suite, \.\.\.individualApps\]/);
  assert.match(routeSource, /function isLoopbackInstallerHost\(hostname: string\): boolean/);
  assert.match(routeSource, /url\.protocol === "https:"/);
  assert.match(routeSource, /process\.env\.NODE_ENV !== "production" && url\.protocol === "http:" && isLoopbackInstallerHost\(url\.hostname\)/);
  assert.doesNotMatch(routeSource, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
  assert.match(routeSource, /safeInstallerSha256/);
  assert.match(routeSource, /available: Boolean\(url && sha256\)/);
  assert.match(routeSource, /url: url && sha256 \? url : null/);
  assert.match(envExampleSource, /PASTA_SUITE_INSTALLER_VERSION=/);
  assert.match(envExampleSource, /PASTA_SUITE_INSTALLER_MACOS_URL=/);
  assert.match(envExampleSource, /PASTA_SUITE_INSTALLER_MACOS_SHA256=/);
  assert.match(envExampleSource, /PASTA_SUITE_INSTALLER_WINDOWS_URL=/);
  assert.match(envExampleSource, /PASTA_SUITE_INSTALLER_WINDOWS_SHA256=/);
  assert.match(envExampleSource, /PASTA_SUITE_INSTALLER_RASPBERRY_PI_URL=/);
  assert.match(envExampleSource, /PASTA_SUITE_INSTALLER_RASPBERRY_PI_SHA256=/);
  assert.match(liveCheckSource, /pasta-suite-desktop-v\$\{EXPECTED_VERSION\}/);
  assert.match(liveCheckSource, /\/api\/pasta\/installers/);
  assert.match(liveCheckSource, /Pasta-Suite-\$\{EXPECTED_VERSION\}-mac-universal\.dmg/);
  assert.match(liveCheckSource, /Pasta-Suite-\$\{EXPECTED_VERSION\}-win-x64\.exe/);
  assert.match(liveCheckSource, /Pasta-Suite-\$\{EXPECTED_VERSION\}-linux-arm64\.deb/);
  assert.match(liveCheckSource, /asset\.digest/);
  assert.match(liveCheckSource, /EXPECTED_BUNDLED_APPS/);
  assert.match(liveCheckSource, /manifest\.bundledApps/);
  assert.equal(rootPackage.scripts["pasta-suite:desktop:prepare"], "npm run prepare --prefix apps/pasta-suite-desktop");
  assert.equal(rootPackage.scripts["pasta-suite:desktop:check"], "node --test scripts/pasta-suite-desktop-package-policy.test.mjs");
  assert.equal(rootPackage.scripts["pasta-suite:installers:live-check"], "node scripts/check-pasta-suite-installers-live.mjs");
  assert.equal(rootPackage.scripts["pasta-suite:desktop:dist"], "npm run dist --prefix apps/pasta-suite-desktop");
});
