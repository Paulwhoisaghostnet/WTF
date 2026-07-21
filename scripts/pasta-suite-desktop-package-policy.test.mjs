import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import staticPathModule from "../apps/pasta-suite-desktop/src/static-path.cjs";

const { resolveStaticPath } = staticPathModule;

const desktopPackage = JSON.parse(readFileSync("apps/pasta-suite-desktop/package.json", "utf8"));
const mainSource = readFileSync("apps/pasta-suite-desktop/src/main.cjs", "utf8");
const preloadSource = readFileSync("apps/pasta-suite-desktop/src/preload.cjs", "utf8");
const siteArchiveSource = readFileSync("apps/pasta-suite-desktop/src/site-archive.cjs", "utf8");
const prepareSource = readFileSync("apps/pasta-suite-desktop/scripts/prepare-assets.mjs", "utf8");
const portableCheaseSource = readFileSync("public/creation-tools/ch-ease/js/studio.js", "utf8");
const rotiniArtifactSource = readFileSync("public/creation-tools/rotini/js/rotini-artifact.js", "utf8");
const rotiniMintSource = readFileSync("public/creation-tools/rotini/js/rotini-mint.js", "utf8");
const rotiniContractManifest = JSON.parse(readFileSync("public/creation-tools/rotini/contract/pasta-generative-collection.template.json", "utf8"));
const gnocchiStudioSource = readFileSync("public/creation-tools/gnocchi/js/studio.js", "utf8");
const gnocchiContractManifest = JSON.parse(readFileSync("public/creation-tools/gnocchi/contract/pasta-open-edition.template.json", "utf8"));
const workflowSource = readFileSync(".github/workflows/pasta-suite-desktop-installers.yml", "utf8");
const routeSource = readFileSync("server/routes/pasta-installers.ts", "utf8");
const routesSource = readFileSync("server/routes.ts", "utf8");
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const gitignoreSource = readFileSync(".gitignore", "utf8");
const liveCheckSource = readFileSync("scripts/check-pasta-suite-installers-live.mjs", "utf8");
const artifactSmokeSource = readFileSync("scripts/pasta-suite-desktop-artifact-smoke.mjs", "utf8");
const reviewManifestSource = readFileSync("scripts/pasta-suite-desktop-review-manifest.mjs", "utf8");
const envExampleSource = readFileSync(".env.example", "utf8");

const bundledPastaTools = ["ch-ease", "macaroni", "spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"];
const individualPastaTools = ["macaroni", "spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"];

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
  assert.equal(desktopPackage.build.executableName, undefined);
  assert.equal(desktopPackage.build.directories.buildResources, "build");
  assert.equal(desktopPackage.build.mac.icon, "build/icon.icns");
  assert.equal(desktopPackage.build.mac.entitlements, "build/entitlements.mac.plist");
  assert.equal(desktopPackage.build.mac.entitlementsInherit, "build/entitlements.mac.plist");
  assert.equal(desktopPackage.build.win.icon, "build/icon.ico");
  assert.equal(desktopPackage.build.nsis.oneClick, false);
  assert.equal(desktopPackage.build.dmg.license, "build/license_mac.txt");
  assert.equal(desktopPackage.build.nsis.license, "build/license_en.rtf");
  assert.equal(desktopPackage.build.nsis.perMachine, false);
  assert.equal(desktopPackage.build.nsis.allowToChangeInstallationDirectory, true);
  assert.equal(desktopPackage.build.nsis.createDesktopShortcut, true);
  assert.equal(desktopPackage.build.nsis.createStartMenuShortcut, true);
  assert.equal(desktopPackage.build.nsis.runAfterFinish, true);
  assert.equal(desktopPackage.build.nsis.deleteAppDataOnUninstall, false);
  for (const asset of [
    "apps/pasta-suite-desktop/build/icon.svg",
    "apps/pasta-suite-desktop/build/icon.png",
    "apps/pasta-suite-desktop/build/icon.icns",
    "apps/pasta-suite-desktop/build/icon.ico",
    "apps/pasta-suite-desktop/build/entitlements.mac.plist",
    "apps/pasta-suite-desktop/build/license_en.rtf",
    "apps/pasta-suite-desktop/build/license_mac.txt",
    "apps/pasta-suite-desktop/build/README.txt",
  ]) {
    assert.ok(existsSync(asset), `${asset} should exist`);
  }
  assert.equal(desktopPackage.build.linux.maintainer, "wtfOS <support@wtfos.app>");
  assert.equal(desktopPackage.build.linux.syncDesktopName, true);
  assert.equal(desktopPackage.build.deb.packageName, "pasta-suite");
  assert.equal(desktopPackage.build.deb.packageCategory, "devel");
  assert.equal(desktopPackage.build.deb.maintainer, "wtfOS <support@wtfos.app>");
  assert.match(gitignoreSource, /apps\/pasta-suite-desktop\/pasta\//);
  assert.match(gitignoreSource, /apps\/pasta-suite-desktop\/release\//);
});

test("Pasta suite asset preparation preserves production creation-tool paths", () => {
  for (const id of bundledPastaTools) {
    assert.match(prepareSource, new RegExp(`id: "${id}"`));
    assert.match(prepareSource, /public\/creation-tools/);
    assert.match(prepareSource, new RegExp(`/creation-tools/${id}/`));
    assert.ok(existsSync(`public/creation-tools/${id}`), `${id} source folder should exist`);
  }
  assert.match(prepareSource, /outToolsDir = path\.join\(outDir, "creation-tools"\)/);
  assert.match(prepareSource, /suite-manifest\.json/);
  assert.match(prepareSource, /Pasta Suite/);
  assert.match(prepareSource, /<h1>Colander<\/h1>/);
  assert.match(prepareSource, /id="project-network"/);
  assert.match(prepareSource, /Shadownet \(recommended for testing\)/);
  assert.match(prepareSource, /localStorage\.getItem\("wtf:network"\) \|\| "shadownet"/);
  assert.match(prepareSource, /wtfos\.pasta\.colander\.workspace\.v1/);
  assert.match(prepareSource, /handoff: "colander-workspace"/);
  assert.match(prepareSource, /Export active manifest/);
  assert.match(prepareSource, /Import manifest/);
  assert.match(prepareSource, /Contract manager/);
  assert.match(prepareSource, /Self-hosted pages/);
  assert.match(prepareSource, /\/api\/pasta\/sites/);
  assert.match(prepareSource, /Open local page/);
  assert.match(prepareSource, /function normalizeProject/);
  assert.match(prepareSource, /pasta-studio-draft-ref@1/);
  assert.match(prepareSource, /pasta-contract-ref@1/);
  assert.match(prepareSource, /project-drafts/);
  assert.match(prepareSource, /project-contracts/);
  assert.match(prepareSource, /project-sites/);
  assert.match(prepareSource, /Resume draft/);
  assert.match(prepareSource, /Open in contract manager/);
  assert.match(prepareSource, /Open installed page/);
  assert.match(prepareSource, /Uninstall local page/);
  assert.match(prepareSource, /Confirm uninstall page/);
  assert.match(prepareSource, /Forget record only/);
  assert.match(prepareSource, /pasta_suite\.site_uninstalled/);
  assert.match(prepareSource, /colander\.site_record_forgotten/);
  assert.match(prepareSource, /Resume in owner app/);
  assert.match(prepareSource, /Duplicate as new project/);
  assert.match(prepareSource, /Confirm permanent delete/);
  assert.match(prepareSource, /colander\.project_archived/);
  assert.match(prepareSource, /colander\.project_restored/);
  assert.match(prepareSource, /toolId === "ch-ease" \? "preparing" : "planning"/);
  assert.match(prepareSource, /Prepare package/);
  assert.match(portableCheaseSource, /wtfos\.pasta\.chease-package\.v1/);
  assert.match(portableCheaseSource, /wtfos\.pasta\.chease\.draft\.v1/);
  assert.match(portableCheaseSource, /pasta-studio-draft-ref@1/);
  assert.match(portableCheaseSource, /sessionStorage\.setItem/);
  assert.match(portableCheaseSource, /Local file bytes remain available in the ZIP only/);
  assert.match(portableCheaseSource, /api\.pinata\.cloud\/pinning\/pinFileToIPFS/);
  assert.match(portableCheaseSource, /api\/v0\/add\?pin=true&cid-version=1/);
  assert.match(portableCheaseSource, /chease\.media_pinned/);
  assert.doesNotMatch(portableCheaseSource, /state\.(?:pinataJwt|pinNode|pinProvider)/);
  assert.match(prepareSource, /connect-wallet/);
  assert.match(prepareSource, /function contractType/);
  assert.match(prepareSource, /Configure direct sale/);
  assert.match(prepareSource, /Reveal pack contents/);
  assert.match(prepareSource, /MD\.assertOperationSafety/);
  assert.match(prepareSource, /project\.contracts = \[kt/);
  assert.match(prepareSource, /project\.contractRecords/);
  assert.match(prepareSource, /Hosted wtfOS pinning, publishing, and authenticated package records are intentionally disabled/);
  assert.match(prepareSource, /contract\/pasta-standard-collection\.contract\.json/);
  assert.match(prepareSource, /contract\/pasta-open-edition\.contract\.json/);
  assert.match(prepareSource, /contract\/pasta-bundle\.contract\.json/);
  assert.match(prepareSource, /contract\/pasta-gnocchi-pack-adapter\.contract\.json/);
  assert.match(prepareSource, /contract\/pasta-rotini-pack-adapter\.contract\.json/);
  assert.match(prepareSource, /contract\/pasta-generative-collection\.contract\.json/);
  assert.match(prepareSource, /contract\/pasta-distribution\.contract\.json/);
  assert.match(prepareSource, /contract\/pasta-exhibition\.contract\.json/);
  assert.match(rotiniArtifactSource, /pasta-rotini-interactive@1/);
  assert.match(rotiniArtifactSource, /contains an external URL/);
  assert.match(rotiniMintSource, /reserve_iteration/);
  assert.match(rotiniMintSource, /finalize_iteration/);
  assert.match(gnocchiStudioSource, /gnocchi\.collection_verified/);
  assert.match(gnocchiStudioSource, /total_minted: new M\(\)/);
  assert.match(gnocchiStudioSource, /policy_locked: new M\(\)/);
  assert(gnocchiContractManifest.entrypoints.includes("create_open_edition"));
  assert(gnocchiContractManifest.entrypoints.includes("lock_sale_policy"));
  assert(gnocchiContractManifest.entrypoints.includes("open_mint"));
  assert.deepEqual(rotiniContractManifest.entrypoints.filter((entrypoint) => /iteration|reservation/.test(entrypoint)), [
    "reserve_iteration",
    "finalize_iteration",
    "cancel_expired_reservation",
    "mint_pack_iteration",
  ]);
});

test("Pasta suite desktop runtime serves local assets and blocks hosted wtfOS APIs", () => {
  assert.match(mainSource, /http\.createServer/);
  assert.match(mainSource, /baseUrl = `http:\/\/127\.0\.0\.1:\$\{address\.port\}`/);
  assert.match(mainSource, /mainWindow\.loadURL\(`\$\{baseUrl\}\/`\)/);
  assert.match(mainSource, /path\.join\(appRoot\(\), "pasta"\)/);
  assert.match(mainSource, /resolveStaticPath\(pastaRoot\(\), urlPath\)/);
  assert.match(mainSource, /\/creation-tools\/\$\{id\}\/studio\.html/);
  assert.match(mainSource, /\/creation-tools\/\$\{id\}\/index\.html/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/auth\/user"/);
  assert.match(mainSource, /Pasta Suite Desktop does not include wtfOS hosted resources/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/pasta\/installers"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/macaroni\/ipfs\/pin"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/macaroni\/publish"/);
  assert.match(mainSource, /async function exportMacaroniSite\(req, res\)/);
  assert.match(mainSource, /app\.getPath\("documents"\), "Pasta Suite", "macaroni-site"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/pasta\/sites\/install"/);
  assert.match(mainSource, /req\.method === "DELETE" && removeSiteMatch/);
  assert.match(mainSource, /removeStoredSite/);
  assert.match(mainSource, /path\.join\(app\.getPath\("documents"\), "Pasta Suite", "sites"\)/);
  assert.match(mainSource, /installStoredSite/);
  assert.match(mainSource, /hostedSitePath/);
  assert.match(siteArchiveSource, /resolveHostedSitePath/);
  assert.match(siteArchiveSource, /async function removeStoredSite/);
  assert.match(siteArchiveSource, /\.removing-/);
  assert.match(siteArchiveSource, /stats\.isSymbolicLink\(\)/);
  assert.match(siteArchiveSource, /\.installing/);
  assert.match(siteArchiveSource, /site archive must contain index\.html/);
  assert.match(siteArchiveSource, /unencrypted stored ZIP entries/);
  assert.match(siteArchiveSource, /site archive exceeds local hosting limits/);
  assert.match(mainSource, /nodeIntegration: false/);
  assert.match(mainSource, /contextIsolation: true/);
  assert.match(mainSource, /sandbox: true/);
  assert.match(mainSource, /setWindowOpenHandler/);
  assert.match(mainSource, /if \(baseUrl && value\.startsWith\(baseUrl\)\) return true/);
  assert.match(prepareSource, /window\.open\(card\.dataset\.entry/);
  assert.match(preloadSource, /PASTA_SUITE_DESKTOP/);
  assert.match(preloadSource, /MACARONI_DESKTOP/);
  assert.match(preloadSource, /native: true/);
});

test("Pasta suite desktop resolves its root document on POSIX and Windows", () => {
  const posixRoot = "/Applications/Pasta Suite.app/Contents/Resources/app.asar/pasta";
  const windowsRoot = "C:\\Users\\runner\\AppData\\Local\\Programs\\Pasta Suite\\resources\\app.asar\\pasta";

  assert.equal(resolveStaticPath(posixRoot, "/", path.posix), path.posix.join(posixRoot, "index.html"));
  assert.equal(resolveStaticPath(windowsRoot, "/", path.win32), path.win32.join(windowsRoot, "index.html"));
  assert.equal(
    resolveStaticPath(windowsRoot, "/creation-tools/ch-ease/index.html", path.win32),
    path.win32.join(windowsRoot, "creation-tools", "ch-ease", "index.html"),
  );
  assert.equal(resolveStaticPath(windowsRoot, "../outside.txt", path.win32), null);
  assert.equal(resolveStaticPath(posixRoot, "%E0%A4%A", path.posix), null);
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
  assert.match(workflowSource, /Smoke packaged macOS application/);
  assert.match(workflowSource, /Install and smoke packaged Windows application/);
  assert.match(workflowSource, /pasta-suite:desktop:artifact-smoke/);
  assert.match(workflowSource, /Pasta-Suite-\$version-win-x64\.exe/);
  assert.match(workflowSource, /Start-Process -FilePath \$installer -ArgumentList "\/S"/);
  assert.match(workflowSource, /Pasta Suite desktop shortcut was not created/);
  assert.match(workflowSource, /Pasta Suite Start menu shortcut was not created/);
  assert.match(workflowSource, /Get-ChildItem \$installed\.DirectoryName -Filter "Uninstall\*\.exe"/);
  assert.match(workflowSource, /Pasta Suite executable remained after uninstall/);
  assert.match(artifactSmokeSource, /PASTA_SUITE_DESKTOP_EXECUTABLE/);
  assert.match(artifactSmokeSource, /bundledTools: 8/);
  assert.match(artifactSmokeSource, /colanderProjectCreated: true/);
  assert.match(artifactSmokeSource, /chEaseOpened: true/);
  assert.match(reviewManifestSource, /requiresTerminal: false/);
  assert.match(reviewManifestSource, /SHA256SUMS\.txt/);
  assert.match(reviewManifestSource, /developer-review/);
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
  for (const id of bundledPastaTools) {
    assert.match(routeSource, new RegExp(`key: "${id}"`));
  }
  assert.match(routeSource, /bundledApps: BUNDLED_PASTA_APPS/);
  assert.match(routeSource, /const INDIVIDUAL_PASTA_INSTALLER_PRODUCTS = \[/);
  assert.match(routeSource, /manifestPath: "\/api\/ch-ease\/installers"/);
  assert.match(routeSource, /versionEnv: "CH_EASE_INSTALLER_VERSION"/);
  for (const id of individualPastaTools) {
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
  assert.equal(rootPackage.scripts["pasta-suite:desktop:artifact-smoke"], "node scripts/pasta-suite-desktop-artifact-smoke.mjs");
  assert.equal(rootPackage.scripts["pasta-suite:desktop:review-manifest"], "node scripts/pasta-suite-desktop-review-manifest.mjs");
  assert.equal(rootPackage.scripts["pasta-suite:installers:live-check"], "node scripts/check-pasta-suite-installers-live.mjs");
  assert.equal(rootPackage.scripts["pasta-suite:desktop:dist"], "npm run dist --prefix apps/pasta-suite-desktop");
});
