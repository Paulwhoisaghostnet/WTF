import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PASTA_DESKTOP_PROVENANCE_SCHEMA,
  parseBuildProvenanceArguments,
  writeDesktopBuildProvenance,
} from "./pasta-desktop-build-provenance.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const desktopApps = [
  "pasta-suite-desktop",
  "macaroni-desktop",
  "ch-ease-desktop",
  "spaghetti-desktop",
  "gnocchi-desktop",
  "ravioli-desktop",
  "rotini-desktop",
  "penne-desktop",
  "lasagna-desktop",
];

test("preflight provenance records an exact revision and dirty marker while release fails closed", () => {
  const fixture = createGitFixture();
  try {
    const options = parseBuildProvenanceArguments(
      [
        `--app-dir=${fixture.appDir}`,
        "--mode=preflight",
        "--platform=test-os",
        "--arch=test-arch",
        "--format=directory",
        "--output=bundle/build-provenance.json",
      ],
      { cwd: () => fixture.appDir, platform: "test-os", arch: "test-arch" },
    );

    const cleanManifest = writeDesktopBuildProvenance(options);
    assert.equal(cleanManifest.schema, PASTA_DESKTOP_PROVENANCE_SCHEMA);
    assert.equal(cleanManifest.app, "@wtf/test-desktop");
    assert.equal(cleanManifest.version, "1.0.1-alpha.1");
    assert.match(cleanManifest.gitSha, /^[0-9a-f]{40}$/);
    assert.equal(cleanManifest.sourceRevision, cleanManifest.gitSha);
    assert.equal(cleanManifest.dirty, false);
    assert.deepEqual(cleanManifest.target, {
      platform: "test-os",
      arch: "test-arch",
      format: "directory",
    });

    writeFileSync(path.join(fixture.root, "tracked.txt"), "changed\n", "utf8");
    const dirtyManifest = writeDesktopBuildProvenance(options);
    assert.equal(dirtyManifest.gitSha, cleanManifest.gitSha);
    assert.equal(dirtyManifest.sourceRevision, `${cleanManifest.gitSha}-dirty`);
    assert.equal(dirtyManifest.dirty, true);

    const releaseOptions = { ...options, mode: "release", format: "dmg+zip" };
    const beforeRejectedRelease = readFileSync(options.outputPath, "utf8");
    assert.throws(
      () => writeDesktopBuildProvenance(releaseOptions),
      /Refusing release provenance for dirty source/,
    );
    assert.equal(readFileSync(options.outputPath, "utf8"), beforeRejectedRelease);

    execFileSync("git", ["add", "tracked.txt"], { cwd: fixture.root });
    execFileSync("git", ["commit", "-qm", "clean release source"], { cwd: fixture.root });
    const releaseManifest = writeDesktopBuildProvenance(releaseOptions);
    assert.equal(releaseManifest.dirty, false);
    assert.equal(releaseManifest.sourceRevision, releaseManifest.gitSha);
    assert.notEqual(releaseManifest.gitSha, cleanManifest.gitSha);
    assert.deepEqual(releaseManifest.target, {
      platform: "test-os",
      arch: "test-arch",
      format: "dmg+zip",
    });
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("package and lockfile identity drift is rejected before a manifest is written", () => {
  const fixture = createGitFixture();
  try {
    const lockPath = path.join(fixture.appDir, "package-lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    lock.version = "1.0.0";
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

    const options = parseBuildProvenanceArguments([
      `--app-dir=${fixture.appDir}`,
      "--mode=preflight",
      "--output=bundle/build-provenance.json",
    ]);
    assert.throws(
      () => writeDesktopBuildProvenance(options),
      /Desktop package and lockfile identity do not match/,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("all nine Pasta desktop packages share the alpha version and guarded provenance flow", () => {
  for (const directory of desktopApps) {
    const output = "provenance/build-provenance.json";
    const appDir = path.join(repoRoot, "apps", directory);
    const packageJson = JSON.parse(readFileSync(path.join(appDir, "package.json"), "utf8"));
    const packageLock = JSON.parse(readFileSync(path.join(appDir, "package-lock.json"), "utf8"));

    assert.equal(packageJson.version, "1.0.1-alpha.1", directory);
    assert.equal(packageLock.version, packageJson.version, directory);
    assert.equal(packageLock.packages[""].version, packageJson.version, directory);
    assert.match(packageJson.scripts.start, /--mode=preflight/, directory);
    assert.match(packageJson.scripts.pack, /--mode=preflight/, directory);
    assert.match(packageJson.scripts["dist:mac:dir"], /--mode=preflight/, directory);
    assert.match(packageJson.scripts["dist:alpha:mac"], /--mode=preflight/, directory);
    assert.match(packageJson.scripts["dist:alpha:mac"], /electron-builder --mac dmg zip --universal --publish never/, directory);
    for (const releaseScript of ["dist", "dist:mac", "dist:windows", "dist:raspberry-pi"]) {
      assert.match(packageJson.scripts[releaseScript], /--mode=release/, `${directory}:${releaseScript}`);
    }
    assert.ok(
      Object.values(packageJson.scripts).some((command) => command.includes(`--output=${output}`)),
      directory,
    );
    assert.ok(packageJson.build.files.includes("provenance/**/*"), `${directory}: packaged provenance path`);
    assert.equal(
      packageJson.build.files.some(
        (file) => typeof file === "object" && file.to === "build/build-provenance.json",
      ),
      false,
      `${directory}: packaged provenance must not target Electron Builder's excluded build-resources directory`,
    );
  }

  const suitePreparer = readFileSync(
    path.join(repoRoot, "apps/pasta-suite-desktop/scripts/prepare-assets.mjs"),
    "utf8",
  );
  assert.match(suitePreparer, /version: packageJson\.version/);
  assert.doesNotMatch(suitePreparer, /version: "1\.0\.0"/);
});

function createGitFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "pasta-provenance-"));
  const appDir = path.join(root, "apps/test-desktop");
  mkdirSync(appDir, { recursive: true });
  writeFileSync(path.join(root, ".gitignore"), "apps/test-desktop/bundle/\n", "utf8");
  writeFileSync(path.join(root, "tracked.txt"), "clean\n", "utf8");
  writeFileSync(
    path.join(appDir, "package.json"),
    `${JSON.stringify(
      {
        name: "@wtf/test-desktop",
        version: "1.0.1-alpha.1",
        build: { productName: "Test Studio" },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(appDir, "package-lock.json"),
    `${JSON.stringify(
      {
        name: "@wtf/test-desktop",
        version: "1.0.1-alpha.1",
        lockfileVersion: 3,
        packages: {
          "": {
            name: "@wtf/test-desktop",
            version: "1.0.1-alpha.1",
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Pasta Test"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  return { root, appDir };
}
