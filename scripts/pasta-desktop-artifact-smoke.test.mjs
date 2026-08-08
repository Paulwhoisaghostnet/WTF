import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isExpectedDesktopStubResponse,
  PRODUCT_KEYS,
  PRODUCTS,
  validateBuildProvenance,
} from "./pasta-desktop-artifact-smoke.mjs";

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const artifactSmokeSource = readFileSync("scripts/pasta-desktop-artifact-smoke.mjs", "utf8");

test("artifact smoke registry covers the suite and every standalone on a unique stable origin", () => {
  assert.deepEqual(PRODUCT_KEYS, [
    "pasta-suite",
    "macaroni",
    "spaghetti",
    "gnocchi",
    "ravioli",
    "rotini",
    "penne",
    "lasagna",
    "ch-ease",
  ]);

  const origins = PRODUCT_KEYS.map((key) => PRODUCTS[key].origin);
  assert.equal(new Set(origins).size, PRODUCT_KEYS.length);
  for (const key of PRODUCT_KEYS) {
    assert.match(PRODUCTS[key].origin, /^http:\/\/127\.0\.0\.1:3077\d$/);
    assert.ok(PRODUCTS[key].entryPath.startsWith("/"));
    assert.ok(PRODUCTS[key].assetPaths.length > 0);
  }
});

test("artifact smoke registry requires current Ravioli and Rotini runtime assets", () => {
  for (const path of [
    "/js/rotini-artifact.js",
    "/js/rotini-mint.js",
    "/contract/pasta-blind-pack-controller.contract.json",
    "/contract/pasta-ravioli-deployment-certificate.json",
  ]) {
    assert.ok(PRODUCTS.ravioli.assetPaths.includes(path), `Ravioli should smoke ${path}`);
  }
  for (const path of [
    "/js/rotini-artifact.js",
    "/js/rotini-mint.js",
    "/contract/pasta-generative-collection.contract.json",
  ]) {
    assert.ok(PRODUCTS.rotini.assetPaths.includes(path), `Rotini should smoke ${path}`);
  }
  for (const prefix of ["/creation-tools/ravioli", "/creation-tools/rotini"]) {
    assert.ok(
      PRODUCTS["pasta-suite"].assetPaths.some((path) => path.startsWith(`${prefix}/js/rotini-`)),
      `Pasta Suite should smoke current renderer assets below ${prefix}`,
    );
    assert.ok(
      PRODUCTS["ch-ease"].assetPaths.some((path) => path.startsWith(`${prefix}/js/rotini-`)),
      `CH-EASE should smoke current renderer assets below ${prefix}`,
    );
  }
});

test("suite artifact smoke traverses every bundled tool", () => {
  assert.deepEqual(
    PRODUCTS["pasta-suite"].bundledTools.map((tool) => tool.id),
    ["ch-ease", "macaroni", "spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"],
  );
});

test("artifact smoke allows only documented local desktop stub responses", () => {
  const origin = PRODUCTS["pasta-suite"].origin;
  assert.equal(isExpectedDesktopStubResponse(`${origin}/api/auth/user`, 401, "GET", origin), true);
  assert.equal(isExpectedDesktopStubResponse(`${origin}/api/profile/social`, 404, "GET", origin), true);
  assert.equal(isExpectedDesktopStubResponse(`${origin}/api/auth/user`, 404, "GET", origin), false);
  assert.equal(isExpectedDesktopStubResponse(`${origin}/api/profile/social`, 401, "GET", origin), false);
  assert.equal(isExpectedDesktopStubResponse(`${origin}/api/auth/user`, 401, "POST", origin), false);
  assert.equal(
    isExpectedDesktopStubResponse("https://wtfos.app/api/auth/user", 401, "GET", origin),
    false,
  );
  assert.match(artifactSmokeSource, /page\.on\("response"/);
  assert.match(artifactSmokeSource, /page\.on\("requestfailed"/);
  assert.match(artifactSmokeSource, /Failed to load resource/);
  assert.match(artifactSmokeSource, /expectedStubResponses/);
  assert.match(artifactSmokeSource, /page\.reload\(\{ waitUntil: "load" \}\)/);
  assert.doesNotMatch(
    artifactSmokeSource,
    /waitForLoadState\("networkidle"\)|waitUntil: "networkidle"/,
    "packaged readiness must use explicit page and asset assertions instead of global network idleness",
  );
});

test("artifact smoke validates exact alpha build provenance", () => {
  const manifest = {
    schema: "wtfos.pasta.desktop-build-provenance.v1",
    app: "@wtf/ravioli-desktop",
    version: "1.0.1-alpha.1",
    gitSha: "0123456789abcdef0123456789abcdef01234567",
    dirty: false,
    sourceRevision: "0123456789abcdef0123456789abcdef01234567",
    target: {
      platform: "darwin",
      arch: "universal",
      format: "dmg+zip",
    },
  };

  assert.deepEqual(
    validateBuildProvenance(manifest, PRODUCTS.ravioli, {
      expectedTarget: "darwin/universal/dmg+zip",
      expectedGitSha: manifest.gitSha,
    }),
    manifest,
  );
  assert.throws(
    () =>
      validateBuildProvenance(
        {
          ...manifest,
          dirty: true,
          sourceRevision: `${manifest.gitSha}-dirty`,
        },
        PRODUCTS.ravioli,
      ),
    /packaged artifact provenance must be clean/,
  );
  assert.throws(
    () => validateBuildProvenance({ ...manifest, gitSha: "dev" }, PRODUCTS.ravioli),
    /40-character Git SHA/,
  );
  assert.throws(
    () =>
      validateBuildProvenance(manifest, PRODUCTS.ravioli, {
        expectedGitSha: "abcdef0123456789abcdef0123456789abcdef01",
      }),
    /workflow source revision/,
  );
});

test("every installer workflow proves macOS DMG/ZIP, Windows NSIS, and native arm64 Debian packages", () => {
  for (const key of PRODUCT_KEYS) {
    const workflow = readFileSync(`.github/workflows/${key}-desktop-installers.yml`, "utf8");
    const packageJson = JSON.parse(
      readFileSync(`apps/${key}-desktop/package.json`, "utf8"),
    );
    const macBundleName = `${packageJson.build.executableName || packageJson.build.productName}.app`;
    assert.match(workflow, /Install and smoke packaged macOS artifacts/);
    assert.match(workflow, /Install and smoke packaged Windows application/);
    assert.match(workflow, /Install and smoke packaged Raspberry Pi application/);
    assert.match(workflow, /os: ubuntu-24\.04-arm/);
    assert.match(workflow, /pasta-desktop-macos-artifact-smoke\.sh/);
    assert.match(workflow, /pasta-desktop-windows-installer-smoke\.ps1/);
    assert.match(workflow, /pasta-desktop-linux-installer-smoke\.sh/);
    assert.match(workflow, /-mac-universal\.dmg/);
    assert.match(workflow, /-mac-universal\.zip/);
    assert.match(workflow, /-linux-arm64\.deb/);
    assert.ok(
      workflow.includes(`"${macBundleName}"`),
      `${key} must smoke Electron Builder's actual macOS bundle ${macBundleName}`,
    );
    assert.match(workflow, /Checkout release source/);
    assert.match(workflow, /EXPECTED_TAG=/);
    assert.match(workflow, /ACTUAL_TAG=/);
    assert.match(workflow, /refs\/tags\/\$\{ACTUAL_TAG\}\^\{\}/);
    assert.match(workflow, /REMOTE_SHA.+GITHUB_SHA/);
    assert.match(
      workflow,
      /target_commitish: \$\{\{ github\.sha \}\}/,
      `${key} must create an absent release tag from the exact workflow source SHA`,
    );
    assert.match(
      workflow,
      /prerelease: \$\{\{ contains\(.+ '-alpha\.'\) \|\| contains\(.+ '-beta\.'\) \|\| contains\(.+ '-rc\.'\) \}\}/,
    );
    assert.doesNotMatch(workflow, /inputs\.release_tag \|\| github\.ref_name, '-'\)/);
  }
  assert.match(
    readFileSync("scripts/pasta-desktop-macos-artifact-smoke.sh", "utf8"),
    /printf 'Y\\n' \| hdiutil attach -nobrowse -readonly -mountpoint/,
  );
  assert.match(
    readFileSync("scripts/pasta-desktop-macos-artifact-smoke.sh", "utf8"),
    /ditto "\$dmg_mount\/\$app_bundle_name" "\$dmg_install_root\/\$app_bundle_name"/,
  );
  assert.match(
    readFileSync("scripts/pasta-desktop-macos-artifact-smoke.sh", "utf8"),
    /npm run pasta:desktop:artifact-smoke/,
  );
  assert.match(
    readFileSync("scripts/pasta-desktop-macos-artifact-smoke.sh", "utf8"),
    /PASTA_DESKTOP_EXPECTED_GIT_SHA="\$\{GITHUB_SHA:\?/, 
  );
  assert.match(
    readFileSync("scripts/pasta-desktop-macos-artifact-smoke.sh", "utf8"),
    /PASTA_DESKTOP_SMOKE_EVIDENCE_DIR/,
  );
  assert.match(
    readFileSync("scripts/pasta-desktop-macos-artifact-smoke.sh", "utf8"),
    /\$\{app_key\}-\$\{format\}-smoke\.json/,
  );
  assert.match(artifactSmokeSource, /PASTA_DESKTOP_RESULT_PATH/);
  assert.match(
    readFileSync("scripts/pasta-desktop-windows-installer-smoke.ps1", "utf8"),
    /npm run pasta:desktop:artifact-smoke/,
  );
  assert.match(
    readFileSync("scripts/pasta-desktop-windows-installer-smoke.ps1", "utf8"),
    /\$env:PASTA_DESKTOP_EXPECTED_GIT_SHA = \$env:GITHUB_SHA/,
  );
  assert.match(
    readFileSync("scripts/pasta-desktop-windows-installer-smoke.ps1", "utf8"),
    /desktop shortcut does not target the installed executable/,
  );
  const linuxInstallerSmokeSource = readFileSync(
    "scripts/pasta-desktop-linux-installer-smoke.sh",
    "utf8",
  );
  assert.match(linuxInstallerSmokeSource, /dpkg --print-architecture/);
  assert.match(linuxInstallerSmokeSource, /dpkg-deb --field "\$deb_path" Architecture/);
  assert.match(linuxInstallerSmokeSource, /sudo apt-get install --yes xvfb "\$deb_path"/);
  assert.match(linuxInstallerSmokeSource, /xvfb-run --auto-servernum npm run pasta:desktop:artifact-smoke/);
  assert.match(linuxInstallerSmokeSource, /sudo apt-get purge --yes "\$package_name"/);
  assert.match(linuxInstallerSmokeSource, /PASTA_DESKTOP_EXPECTED_TARGET="linux\/arm64\/deb"/);
  assert.match(
    linuxInstallerSmokeSource,
    /PASTA_DESKTOP_EXPECTED_GIT_SHA="\$\{GITHUB_SHA:\?/,
  );
  assert.equal(
    rootPackage.scripts["pasta:desktop:artifact-smoke"],
    "node scripts/pasta-desktop-artifact-smoke.mjs",
  );
  assert.equal(
    rootPackage.scripts["pasta:desktop:alpha-handoff"],
    "node scripts/pasta-desktop-alpha-handoff.mjs",
  );
});
