import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const desktopPackage = JSON.parse(readFileSync("apps/macaroni-desktop/package.json", "utf8"));
const mainSource = readFileSync("apps/macaroni-desktop/src/main.cjs", "utf8");
const preloadSource = readFileSync("apps/macaroni-desktop/src/preload.cjs", "utf8");
const prepareSource = readFileSync("apps/macaroni-desktop/scripts/prepare-assets.mjs", "utf8");
const companionAdapterSource = readFileSync("companion/macaroni-v35/desktop-adapter.cjs", "utf8");
const desktopSetupSource = readFileSync("companion/macaroni-v35/desktop-setup.cjs", "utf8");
const companionPackage = JSON.parse(readFileSync("companion/macaroni-v35/package.json", "utf8"));
const workflowSource = readFileSync(".github/workflows/macaroni-desktop-installers.yml", "utf8");
const studioSource = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");
const studioHtml = readFileSync("public/creation-tools/macaroni/studio.html", "utf8");
const gitignoreSource = readFileSync(".gitignore", "utf8");
const liveCheckSource = readFileSync("scripts/check-macaroni-installers-live.mjs", "utf8");

test("Macaroni desktop package bundles a no-prereq Electron shell", () => {
  assert.equal(desktopPackage.main, "src/main.cjs");
  assert.equal(desktopPackage.devDependencies.electron, "42.4.0");
  assert.equal(desktopPackage.devDependencies["electron-builder"], "26.15.3");
  assert.equal(desktopPackage.homepage, "https://wtfos.app/creation-tools/macaroni/studio.html");
  assert.equal(desktopPackage.desktopName, "macaroni-studio");
  assert.equal(desktopPackage.author.name, "wtfOS");
  assert.equal(desktopPackage.author.email, "support@wtfos.app");
  assert.match(desktopPackage.scripts.prepare, /prepare-assets\.mjs/);
  assert.match(desktopPackage.scripts["dist:mac"], /--mac dmg zip --universal/);
  assert.match(desktopPackage.scripts["dist:windows"], /--win nsis --x64/);
  assert.match(desktopPackage.scripts["dist:raspberry-pi"], /--linux deb --arm64/);
  assert.deepEqual(desktopPackage.build.files, [
    "package.json",
    "src/**/*",
    "macaroni/**/*",
    "companion/**/*",
    "provenance/**/*",
  ]);
  assert.equal(desktopPackage.build.artifactName, "Macaroni-Studio-${version}-${os}-${arch}.${ext}");
  assert.equal(desktopPackage.build.executableName, "macaroni-studio");
  assert.equal(desktopPackage.build.linux.maintainer, "wtfOS <support@wtfos.app>");
  assert.equal(desktopPackage.build.linux.syncDesktopName, true);
  assert.equal(desktopPackage.build.deb.packageName, "macaroni-studio");
  assert.equal(desktopPackage.build.deb.packageCategory, "devel");
  assert.equal(desktopPackage.build.deb.maintainer, "wtfOS <support@wtfos.app>");
  assert.deepEqual(desktopPackage.dependencies, companionPackage.dependencies);
  assert.match(gitignoreSource, /apps\/macaroni-desktop\/macaroni\//);
  assert.match(gitignoreSource, /apps\/macaroni-desktop\/release\//);
});

test("Macaroni desktop runtime serves local assets and blocks wtfOS hosted APIs", () => {
  assert.match(mainSource, /http\.createServer/);
  assert.match(mainSource, /listenOnStableOrigin\(nextServer, PRODUCT_NAME\)/);
  assert.match(mainSource, /mainWindow\.loadURL\(`\$\{baseUrl\}\/studio\.html`\)/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/auth\/user"/);
  assert.match(mainSource, /Macaroni Desktop does not include wtfOS hosted resources/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/macaroni\/ipfs\/pin"/);
  assert.match(mainSource, /parsed\.pathname === "\/api\/macaroni\/publish"/);
  assert.match(mainSource, /async function exportSite\(req, res\)/);
  assert.match(mainSource, /app\.getPath\("documents"\), "Macaroni", "site"/);
  assert.match(mainSource, /nodeIntegration: false/);
  assert.match(mainSource, /contextIsolation: true/);
  assert.match(mainSource, /sandbox: true/);
  assert.match(mainSource, /setWindowOpenHandler/);
  assert.match(preloadSource, /MACARONI_DESKTOP/);
  assert.match(preloadSource, /native: true/);
  assert.match(preloadSource, /openCompanionSetupGuide/);
  assert.match(preloadSource, /openCompanionConfigFolder/);
  assert.match(preloadSource, /ipcRenderer\.invoke\("macaroni:companion-setup", \{ action \}\)/);
  assert.match(prepareSource, /public\/creation-tools\/macaroni/);
  assert.match(prepareSource, /contract\/mydrop\.contract\.json/);
  assert.match(prepareSource, /contract\/macaroni-v35\.contract\.json/);
  assert.match(prepareSource, /companion\/macaroni-v35/);
  assert.match(prepareSource, /companionExcludedTopLevel/);
  assert.match(prepareSource, /trackedCompanionFiles/);
  assert.match(prepareSource, /"node_modules", "data", "secrets", "\.env"/);
  for (const excluded of ["node_modules", "data", "secrets", ".env"]) {
    assert.equal(existsSync(`apps/macaroni-desktop/companion/macaroni-v35/${excluded}`), false);
  }
  assert.match(mainSource, /js\/octez-wallet\.js/);
  assert.match(mainSource, /vendor\/octez-connect\.js/);
  assert.match(mainSource, /pasta-service\.json/);
  assert.match(mainSource, /utilityProcess\.fork/);
  assert.match(mainSource, /startCompanionAdapter/);
  assert.match(mainSource, /alphaShadownetOnly: app\.getVersion\(\)\.includes\("-alpha\."\)/);
  assert.match(mainSource, /isTrustedMutation\(req\.headers, baseUrl\)/);
  assert.match(mainSource, /isSameOrigin\(navigationUrl, baseUrl\)/);
  assert.match(readFileSync("apps/macaroni-desktop/macaroni/js/common.js", "utf8"), /This Macaroni alpha supports only Tezos Shadownet/);
  assert.match(mainSource, /app\.getPath\("userData"\), "macaroni-v35-companion"/);
  assert.match(mainSource, /companionAdapter\.proxy/);
  assert.match(mainSource, /ipcMain\.handle\(COMPANION_SETUP_IPC_CHANNEL/);
  assert.match(mainSource, /sender\.origin !== appOrigin \|\| sender\.pathname !== COMPANION_STUDIO_PATH/);
  assert.match(mainSource, /COMPANION_STUDIO_PATH = "\/studio\.html"/);
  assert.match(mainSource, /prepareDesktopSetupKit/);
  assert.match(mainSource, /shell\.openPath\(guidePath\)/);
  assert.match(mainSource, /shell\.showItemInFolder\(companionAdapter\.envPath\)/);
  assert.match(mainSource, /return \{ ok: true, action \}/);
  assert.doesNotMatch(mainSource, /readFile\(companionAdapter\.envPath/);
  assert.match(companionAdapterSource, /Authorization: `Bearer \$\{adminToken\}`/);
  assert.match(companionAdapterSource, /studioApiReady: true/);
  assert.match(companionAdapterSource, /companion_response_rejected/);
  assert.doesNotMatch(mainSource, /copyDropAsset\([^\n]*(?:\.env|secrets|private-assets|admin\.token|finalizer\.key)/);
  assert.match(studioSource, /IS_NATIVE_APP/);
  assert.match(studioSource, /Macaroni Desktop uses your own Pinata JWT or IPFS node/);
  assert.match(studioSource, /wtfosAccessState = "native"/);
  assert.match(studioSource, /gate\.hidden = !showHostedPublish/);
  assert.match(studioSource, /section\.hidden = true/);
  assert.match(studioSource, /renderNativeCompanionSetup/);
  assert.match(studioSource, /bridge\.openCompanionSetupGuide/);
  assert.match(studioSource, /bridge\.openCompanionConfigFolder/);
  assert.match(studioSource, /checkNativeCompanionAgain/);
  for (const id of [
    "nativeCompanionSetup",
    "nativeCompanionSetupReason",
    "nativeCompanionActionStatus",
    "btnOpenCompanionSetupGuide",
    "btnOpenCompanionConfigFolder",
    "btnCheckCompanionAgain",
  ]) {
    assert.match(studioHtml, new RegExp(`id="${id}"`));
  }
  assert.match(desktopSetupSource, /SAFE_SETUP_DIRECTORIES/);
  assert.match(desktopSetupSource, /FORBIDDEN_SEGMENTS = new Set\(\["data", "node_modules", "secrets"\]\)/);
  assert.match(desktopSetupSource, /FORBIDDEN_FILE_NAMES = new Set\(\["\.env", "admin\.token", "finalizer\.key", "master\.key"\]\)/);
  assert.ok(existsSync("companion/macaroni-v35/DESKTOP_SETUP.md"));
  assert.ok(existsSync("apps/macaroni-desktop/companion/macaroni-v35/desktop-setup.cjs"));
  assert.ok(existsSync("apps/macaroni-desktop/companion/macaroni-v35/DESKTOP_SETUP.md"));
});

test("Macaroni desktop installer workflow builds all target packages", () => {
  assert.match(workflowSource, /name: Macaroni Desktop Installers/);
  assert.match(workflowSource, /workflow_dispatch/);
  assert.match(workflowSource, /node-version: 22/);
  assert.match(workflowSource, /macos-latest/);
  assert.match(workflowSource, /windows-latest/);
  assert.match(workflowSource, /ubuntu-latest/);
  assert.match(workflowSource, /npm ci --prefix apps\/macaroni-desktop/);
  assert.match(workflowSource, /npm run dist:mac --prefix apps\/macaroni-desktop/);
  assert.match(workflowSource, /npm run dist:windows --prefix apps\/macaroni-desktop/);
  assert.match(workflowSource, /npm run dist:raspberry-pi --prefix apps\/macaroni-desktop/);
  assert.match(workflowSource, /actions\/upload-artifact@v4/);
  assert.match(workflowSource, /softprops\/action-gh-release@v2/);
});

test("Macaroni desktop live verifier follows the current alpha package release", () => {
  assert.equal(desktopPackage.version, "1.0.1-alpha.1");
  assert.match(liveCheckSource, /macaroni-desktop-v\$\{EXPECTED_VERSION\}/);
  assert.match(liveCheckSource, /\/api\/macaroni\/installers/);
  assert.match(liveCheckSource, /Macaroni-Studio-\$\{EXPECTED_VERSION\}-mac-universal\.dmg/);
  assert.match(liveCheckSource, /Macaroni-Studio-\$\{EXPECTED_VERSION\}-win-x64\.exe/);
  assert.match(liveCheckSource, /Macaroni-Studio-\$\{EXPECTED_VERSION\}-linux-arm64\.deb/);
  assert.match(liveCheckSource, /asset\.digest/);
  assert.doesNotMatch(liveCheckSource, /const RELEASES =/);
  assert.equal(
    JSON.parse(readFileSync("package.json", "utf8")).scripts["macaroni:installers:live-check"],
    "node scripts/check-macaroni-installers-live.mjs"
  );
});
