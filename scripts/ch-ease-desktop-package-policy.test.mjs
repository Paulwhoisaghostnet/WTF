import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const pkg = JSON.parse(readFileSync("apps/ch-ease-desktop/package.json", "utf8"));
const main = readFileSync("apps/ch-ease-desktop/src/main.cjs", "utf8");
const preload = readFileSync("apps/ch-ease-desktop/src/preload.cjs", "utf8");
const prepare = readFileSync("apps/ch-ease-desktop/scripts/prepare-assets.mjs", "utf8");
const workflow = readFileSync(".github/workflows/ch-ease-desktop-installers.yml", "utf8");
const route = readFileSync("server/routes/ch-ease-installers.ts", "utf8");
const routes = readFileSync("server/routes.ts", "utf8");
const root = JSON.parse(readFileSync("package.json", "utf8"));
const gitignore = readFileSync(".gitignore", "utf8");
const live = readFileSync("scripts/check-ch-ease-installers-live.mjs", "utf8");
const env = readFileSync(".env.example", "utf8");
const inventory = readFileSync("tests/e2e/inventory/domain-workflows.mjs", "utf8");
const targets = ["spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"];

test("CH-EASE desktop is an individual no-prerequisite installer", () => {
  assert.equal(pkg.name, "@wtf/ch-ease-desktop");
  assert.equal(pkg.main, "src/main.cjs");
  assert.equal(pkg.devDependencies.electron, "42.4.0");
  assert.equal(pkg.devDependencies["electron-builder"], "26.15.3");
  assert.equal(pkg.homepage, "https://wtfos.app/tools/ch-ease");
  assert.equal(pkg.desktopName, "ch-ease-studio");
  assert.match(pkg.scripts["dist:mac"], /--mac dmg zip --universal/);
  assert.match(pkg.scripts["dist:windows"], /--win nsis --x64/);
  assert.match(pkg.scripts["dist:raspberry-pi"], /--linux deb --arm64/);
  assert.deepEqual(pkg.build.files, ["package.json", "src/**/*", "pasta/**/*"]);
  assert.equal(pkg.build.artifactName, "CH-EASE-Studio-${version}-${os}-${arch}.${ext}");
  assert.equal(pkg.build.executableName, "ch-ease-studio");
  assert.equal(pkg.build.deb.packageName, "ch-ease-studio");
  assert.match(gitignore, /apps\/ch-ease-desktop\/pasta\//);
  assert.match(gitignore, /apps\/ch-ease-desktop\/release\//);
});

test("CH-EASE desktop bundles preparation plus every same-origin publisher target", () => {
  assert.match(prepare, /public\/creation-tools/);
  assert.match(prepare, /id: "ch-ease"/);
  for (const target of targets) {
    assert.match(prepare, new RegExp(`id: "${target}"`));
    assert.ok(existsSync(`public/creation-tools/${target}`));
  }
  assert.match(prepare, /vendor\/jszip\.min\.js/);
  assert.match(prepare, /wtfos\.pasta\.chease-package\.v1/);
});

test("CH-EASE desktop serves only loopback assets and blocks hosted APIs", () => {
  assert.match(main, /http\.createServer/);
  assert.match(main, /127\.0\.0\.1/);
  assert.match(main, /mainWindow\.loadURL\(`\$\{baseUrl\}\/creation-tools\/ch-ease\/index\.html`\)/);
  assert.match(main, /CH-EASE Desktop does not include wtfOS hosted resources/);
  assert.match(main, /\/api\/ch-ease\/installers/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(main, /value\.startsWith\(baseUrl\)/);
  assert.match(preload, /CH_EASE_DESKTOP/);
  assert.match(preload, /PASTA_TOOL_DESKTOP/);
});

test("CH-EASE workflow, protected manifest, and live verifier are release-ready", () => {
  assert.match(workflow, /name: CH-EASE Desktop Installers/);
  assert.match(workflow, /ch-ease-desktop-v\*/);
  assert.match(workflow, /npm ci --prefix apps\/ch-ease-desktop/);
  assert.match(workflow, /npm run ch-ease:desktop:check/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /softprops\/action-gh-release@v2/);
  assert.match(routes, /import chEaseInstallerRoutes from "\.\/routes\/ch-ease-installers"/);
  assert.match(routes, /app\.use\(chEaseInstallerRoutes\)/);
  assert.match(route, /router\.get\("\/api\/ch-ease\/installers", isAuthenticated/);
  for (const suffix of ["VERSION", "MACOS_URL", "MACOS_SHA256", "WINDOWS_URL", "WINDOWS_SHA256", "RASPBERRY_PI_URL", "RASPBERRY_PI_SHA256"]) {
    assert.match(route, new RegExp(`CH_EASE_INSTALLER_${suffix}`));
    assert.match(env, new RegExp(`CH_EASE_INSTALLER_${suffix}=`));
  }
  assert.match(route, /safeInstallerUrl/);
  assert.match(route, /safeInstallerSha256/);
  assert.match(route, /available: Boolean\(url && sha256\)/);
  assert.match(live, /ch-ease-desktop-v\$\{EXPECTED_VERSION\}/);
  assert.match(live, /CH-EASE-Studio-\$\{EXPECTED_VERSION\}-mac-universal\.dmg/);
  assert.match(live, /asset\.digest/);
  assert.match(inventory, /chease\.installer_manifest\.viewed/);
  assert.match(inventory, /\/api\/ch-ease\/installers/);
});

test("root commands expose CH-EASE prepare, policy, dist, and live verification", () => {
  assert.equal(root.scripts["ch-ease:desktop:prepare"], "npm run prepare --prefix apps/ch-ease-desktop");
  assert.equal(root.scripts["ch-ease:desktop:check"], "node --test scripts/ch-ease-desktop-package-policy.test.mjs");
  assert.equal(root.scripts["ch-ease:desktop:dist"], "npm run dist --prefix apps/ch-ease-desktop");
  assert.equal(root.scripts["ch-ease:installers:live-check"], "node scripts/check-ch-ease-installers-live.mjs");
});
