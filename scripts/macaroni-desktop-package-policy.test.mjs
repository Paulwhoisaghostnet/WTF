import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

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
  assert.equal(desktopPackage.devDependencies.electron, "43.8.3");
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
    "provenance/**/*",
  ]);
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
  assert.match(prepareSource, /public\/creation-tools\/macaroni/);
  assert.match(prepareSource, /contract\/mydrop\.contract\.json/);
  assert.match(studioSource, /IS_NATIVE_APP/);
  assert.match(studioSource, /Macaroni Desktop uses your own Pinata JWT or IPFS node/);
  assert.match(studioSource, /wtfosAccessState = "native"/);
  assert.match(studioSource, /gate\.hidden = !showHostedPublish/);
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

test("Macaroni desktop live verifier follows the current alpha package release", () => {
  assert.equal(desktopPackage.version, "1.0.1-alpha.2");
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

test("Macaroni live manifest validation preserves legacy identity and release integrity", () => {
  const expected = {
    label: "macOS",
    manifestFileName: "Macaroni-Studio.dmg",
    url: `https://github.com/Paulwhoisaghostnet/WTF/releases/download/macaroni-desktop-v${desktopPackage.version}/Macaroni-Studio-${desktopPackage.version}-mac-universal.dmg`,
    sha256: "a".repeat(64),
  };
  const legacyManifest = {
    ok: true,
    version: desktopPackage.version,
    installers: [{ key: "macos", label: expected.label, fileName: expected.manifestFileName, available: true, url: expected.url, sha256: expected.sha256 }],
  };
  const validatorSource = liveCheckSource.slice(
    liveCheckSource.indexOf("function validateManifest("),
    liveCheckSource.indexOf("async function assertUnauthenticatedManifestIsProtected("),
  );
  function validate(manifest) {
    const failures = [];
    const validator = runInNewContext(`${validatorSource}\nvalidateManifest`, {
      EXPECTED_VERSION: desktopPackage.version,
      URL,
      fail: (message) => failures.push(message),
      ok: () => {},
    });
    validator(manifest, { macos: expected });
    return failures;
  }
  assert.deepEqual(validate(legacyManifest), []);
  assert.deepEqual(validate({ ...legacyManifest, product: "macaroni" }), []);
  for (const product of ["spaghetti", null, ""]) {
    assert.match(validate({ ...legacyManifest, product })[0], /product mismatch/);
  }
  assert.match(validate({ ...legacyManifest, version: "stale-version" })[0], /version mismatch/);
  for (const [field, badValue, error] of [
    ["url", "https://example.invalid/wrong-release.dmg", /URL mismatch/],
    ["sha256", "b".repeat(64), /SHA-256 mismatch/],
  ]) {
    const changed = structuredClone(legacyManifest);
    changed.installers[0][field] = badValue;
    assert.ok(validate(changed).some((message) => error.test(message)));
  }
});
