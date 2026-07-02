import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const desktopPackage = JSON.parse(readFileSync("apps/macaroni-desktop/package.json", "utf8"));
const mainSource = readFileSync("apps/macaroni-desktop/src/main.cjs", "utf8");
const preloadSource = readFileSync("apps/macaroni-desktop/src/preload.cjs", "utf8");
const prepareSource = readFileSync("apps/macaroni-desktop/scripts/prepare-assets.mjs", "utf8");
const workflowSource = readFileSync(".github/workflows/macaroni-desktop-installers.yml", "utf8");
const studioSource = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");
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
  assert.deepEqual(desktopPackage.build.files, ["package.json", "src/**/*", "macaroni/**/*"]);
  assert.equal(desktopPackage.build.artifactName, "Macaroni-Studio-${version}-${os}-${arch}.${ext}");
  assert.equal(desktopPackage.build.executableName, "macaroni-studio");
  assert.equal(desktopPackage.build.linux.maintainer, "wtfOS <support@wtfos.app>");
  assert.equal(desktopPackage.build.linux.syncDesktopName, true);
  assert.equal(desktopPackage.build.deb.packageName, "macaroni-studio");
  assert.equal(desktopPackage.build.deb.packageCategory, "devel");
  assert.equal(desktopPackage.build.deb.maintainer, "wtfOS <support@wtfos.app>");
  assert.match(gitignoreSource, /apps\/macaroni-desktop\/macaroni\//);
  assert.match(gitignoreSource, /apps\/macaroni-desktop\/release\//);
});

test("Macaroni desktop runtime serves local assets and blocks wtfOS hosted APIs", () => {
  assert.match(mainSource, /http\.createServer/);
  assert.match(mainSource, /baseUrl = `http:\/\/127\.0\.0\.1:\$\{address\.port\}`/);
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
  assert.match(prepareSource, /public\/creation-tools\/macaroni/);
  assert.match(prepareSource, /contract\/mydrop\.contract\.json/);
  assert.match(studioSource, /IS_NATIVE_APP/);
  assert.match(studioSource, /Macaroni Desktop uses your own Pinata JWT or IPFS node/);
  assert.match(studioSource, /section\.hidden = true/);
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

test("Macaroni desktop live verifier pins the published v1 installer release", () => {
  assert.equal(desktopPackage.version, "1.0.0");
  assert.match(liveCheckSource, /macaroni-desktop-v1\.0\.0/);
  assert.match(liveCheckSource, /Macaroni-Studio-1\.0\.0-mac-universal\.dmg/);
  assert.match(liveCheckSource, /Macaroni-Studio-1\.0\.0-win-x64\.exe/);
  assert.match(liveCheckSource, /Macaroni-Studio-1\.0\.0-linux-arm64\.deb/);
  assert.match(liveCheckSource, /9c91ad656bd249d7d921084d429ba23f00692d68819937505aa3deec8e50f600/);
  assert.match(liveCheckSource, /6b40525d524dd916ba3a46ab28bb36c3238c7cbffd993f2c1803f61f5063e1d4/);
  assert.match(liveCheckSource, /6ed21c165f5b2c5f476b0c8ab23c78397de59a2990d3f4f21dfb741b5e7e6216/);
  assert.equal(
    JSON.parse(readFileSync("package.json", "utf8")).scripts["macaroni:installers:live-check"],
    "node scripts/check-macaroni-installers-live.mjs"
  );
});
