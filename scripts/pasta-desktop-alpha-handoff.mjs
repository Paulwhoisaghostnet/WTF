#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const ALPHA_VERSION = "1.0.1-alpha.1";
const EXPECTED_TARGET = Object.freeze({
  platform: "darwin",
  arch: "universal",
  format: "dmg+zip",
});

const products = Object.freeze([
  {
    key: "pasta-suite",
    directory: "pasta-suite-desktop",
    packageName: "@wtf/pasta-suite-desktop",
    artifactBase: "Pasta-Suite",
    bundleName: "Pasta Suite.app",
    executableName: "Pasta Suite",
    origin: "http://127.0.0.1:30770",
  },
  {
    key: "ch-ease",
    directory: "ch-ease-desktop",
    packageName: "@wtf/ch-ease-desktop",
    artifactBase: "CH-EASE-Studio",
    bundleName: "ch-ease-studio.app",
    executableName: "ch-ease-studio",
    origin: "http://127.0.0.1:30778",
  },
  {
    key: "macaroni",
    directory: "macaroni-desktop",
    packageName: "@wtf/macaroni-desktop",
    artifactBase: "Macaroni-Studio",
    bundleName: "macaroni-studio.app",
    executableName: "macaroni-studio",
    origin: "http://127.0.0.1:30771",
  },
  {
    key: "spaghetti",
    directory: "spaghetti-desktop",
    packageName: "@wtf/spaghetti-desktop",
    artifactBase: "Spaghetti-Studio",
    bundleName: "spaghetti-studio.app",
    executableName: "spaghetti-studio",
    origin: "http://127.0.0.1:30772",
  },
  {
    key: "gnocchi",
    directory: "gnocchi-desktop",
    packageName: "@wtf/gnocchi-desktop",
    artifactBase: "Gnocchi-Studio",
    bundleName: "gnocchi-studio.app",
    executableName: "gnocchi-studio",
    origin: "http://127.0.0.1:30773",
  },
  {
    key: "ravioli",
    directory: "ravioli-desktop",
    packageName: "@wtf/ravioli-desktop",
    artifactBase: "Ravioli-Studio",
    bundleName: "ravioli-studio.app",
    executableName: "ravioli-studio",
    origin: "http://127.0.0.1:30774",
  },
  {
    key: "rotini",
    directory: "rotini-desktop",
    packageName: "@wtf/rotini-desktop",
    artifactBase: "Rotini-Studio",
    bundleName: "rotini-studio.app",
    executableName: "rotini-studio",
    origin: "http://127.0.0.1:30775",
  },
  {
    key: "penne",
    directory: "penne-desktop",
    packageName: "@wtf/penne-desktop",
    artifactBase: "Penne-Studio",
    bundleName: "penne-studio.app",
    executableName: "penne-studio",
    origin: "http://127.0.0.1:30776",
  },
  {
    key: "lasagna",
    directory: "lasagna-desktop",
    packageName: "@wtf/lasagna-desktop",
    artifactBase: "Lasagna-Studio",
    bundleName: "lasagna-studio.app",
    executableName: "lasagna-studio",
    origin: "http://127.0.0.1:30777",
  },
]);

function parseEvidenceRoot(argv) {
  const argument = argv.find((value) => value.startsWith("--evidence-dir="));
  const raw = argument?.slice("--evidence-dir=".length) || process.env.PASTA_ALPHA_INSTALLER_EVIDENCE_DIR;
  if (!raw) {
    throw new Error(
      "Set --evidence-dir=<path> or PASTA_ALPHA_INSTALLER_EVIDENCE_DIR to the completed smoke-evidence directory.",
    );
  }
  return path.resolve(raw);
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function relativeToRepo(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function validateReceipt(receipt, product, distribution, expectedGitSha) {
  assert.equal(receipt.ok, true, `${product.key} ${distribution} smoke should pass`);
  assert.equal(receipt.app, product.key, `${product.key} ${distribution} app id should match`);
  assert.equal(receipt.origin, product.origin, `${product.key} ${distribution} origin should match`);
  assert.equal(receipt.stableOriginRelaunch, true, `${product.key} ${distribution} should persist after relaunch`);
  assert.equal(receipt.provenance?.app, product.packageName, `${product.key} provenance app should match`);
  assert.equal(receipt.provenance?.version, ALPHA_VERSION, `${product.key} version should match`);
  assert.equal(receipt.provenance?.gitSha, expectedGitSha, `${product.key} Git SHA should match`);
  assert.equal(receipt.provenance?.dirty, true, `${product.key} local alpha provenance should be dirty`);
  assert.equal(
    receipt.provenance?.sourceRevision,
    `${expectedGitSha}-dirty`,
    `${product.key} dirty source revision should match`,
  );
  assert.deepEqual(receipt.provenance?.target, EXPECTED_TARGET, `${product.key} target should match`);
  assert.equal(
    receipt.executablePath.includes(distribution === "zip" ? "/zip/" : "/dmg-installed/"),
    true,
    `${product.key} receipt should identify the ${distribution} installation path`,
  );
}

function verifyUniversalZip(zipPath, product) {
  const extractionRoot = mkdtempSync(path.join(os.tmpdir(), `pasta-alpha-${product.key}-`));
  try {
    execFileSync("unzip", ["-tq", zipPath], { stdio: "ignore" });
    execFileSync("ditto", ["-x", "-k", zipPath, extractionRoot], { stdio: "ignore" });
    const executablePath = path.join(
      extractionRoot,
      product.bundleName,
      "Contents",
      "MacOS",
      product.executableName,
    );
    const architectures = execFileSync("lipo", ["-archs", executablePath], {
      encoding: "utf8",
    })
      .trim()
      .split(/\s+/)
      .sort();
    assert.deepEqual(architectures, ["arm64", "x86_64"], `${product.key} executable should be universal`);
    return architectures;
  } finally {
    rmSync(extractionRoot, { recursive: true, force: true });
  }
}

function artifactRecord(repoRoot, product, distribution, filePath, architectures) {
  const details = statSync(filePath);
  return {
    app: product.key,
    distribution,
    path: relativeToRepo(repoRoot, filePath),
    bytes: details.size,
    sha256: sha256(filePath),
    unsigned: true,
    verified: distribution === "zip" ? "unzip-test+lipo+launch+relaunch" : "dmg-verify+mount+copy+launch+relaunch",
    architectures,
  };
}

function handoffMarkdown(inventory) {
  const rows = inventory.products
    .map(
      (product) =>
        `| ${product.app} | ${product.origin} | ${product.assetsVerified} | ${product.bundledToolsOpened} | ZIP + DMG |`,
    )
    .join("\n");
  const artifacts = inventory.artifacts
    .map(
      (artifact) =>
        `| ${artifact.app} | ${artifact.distribution.toUpperCase()} | ${artifact.bytes} | \`${artifact.sha256}\` | \`${artifact.path}\` |`,
    )
    .join("\n");

  return `# Pasta Protocol macOS alpha installer handoff

## Outcome

All nine macOS universal applications passed their actual distributed-package boundary in both forms: ZIP extraction and launch, plus DMG verification, license acceptance where present, mount, copy, and launch. Every app then quit and relaunched against the same profile and recovered its local browser state without an unexpected page, request, console, or HTTP failure.

These artifacts are explicitly **dirty-preflight developer-review builds**. They are suitable for the current controlled human alpha, are unsigned, and must not be published as clean release binaries.

## Runtime coverage

| App | Stable origin | Required assets | Suite tools opened | Formats smoked |
| --- | --- | ---: | ---: | --- |
${rows}

## Exact artifact inventory

| App | Format | Bytes | SHA-256 | Path |
| --- | --- | ---: | --- | --- |
${artifacts}

## Architecture and workflow boundary

- Pasta Suite owns Colander at \`http://127.0.0.1:30770\` and opens all eight bundled tools as native child windows.
- Each standalone owns a different immutable loopback origin, so the suite and standalones can run together without sharing or changing their localStorage namespace.
- The packaged runtime blocks hosted wtfOS-only APIs. Wallet authority stays in the user's wallet; portable pages use creator-owned Pinata/Kubo/static hosting.
- Every artifact embeds \`provenance/build-provenance.json\` for version \`${inventory.version}\`, base Git SHA \`${inventory.gitSha}\`, dirty state, and target \`darwin/universal/dmg+zip\`.

## Alpha runbook

1. Verify the selected artifact against \`SHA256SUMS.txt\` in this directory.
2. Prefer the DMG for the normal install journey; accept the pre-release license, drag the app into Applications, and Control-click → Open if Gatekeeper warns about an unidentified developer.
3. Confirm the app opens on its registered Shadownet-default local surface without Node.js, npm, Homebrew, a terminal, or a separately started web server.
4. Create or import a project/draft, quit the complete application, reopen it, and verify the state recovers.
5. For Pasta Suite, walk Colander → CH-EASE → publisher → exported public page. For each standalone, test its focused creator journey and export.
6. File UX/UI findings against the exact artifact SHA-256, app id, macOS version, hardware architecture, and screenshot/steps.

## Known risks and limits

- The macOS artifacts are unsigned and not notarized; the manual Open flow is expected for this controlled alpha.
- Their provenance intentionally says \`dirty: true\`. A clean commit rebuild is mandatory before publication or broader distribution.
- This handoff proves macOS arm64 and x86_64 binaries inside universal packages. Native Windows NSIS and arm64 Debian/Raspberry Pi execution remain separate platform gates.
- Shadownet remains the pre-release default. Mainnet actions require explicit selection and normal wallet approval.

## Promotion gates

1. Consolidate the intended source into one clean reviewed commit without sweeping in unrelated dirty-worktree changes.
2. Rebuild all platform artifacts so embedded provenance identifies that exact clean commit.
3. Run native installed-package smoke on macOS and Windows, native arm64 Debian smoke, and a physical Raspberry Pi alpha pass.
4. Add signing/notarization when public distribution no longer relies on the documented manual permission flow.
`;
}

function main() {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const evidenceRoot = parseEvidenceRoot(process.argv.slice(2));
  const expectedGitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  assert.match(expectedGitSha, /^[0-9a-f]{40}$/);

  const artifacts = [];
  const productEvidence = [];
  for (const product of products) {
    const releaseRoot = path.join(repoRoot, "apps", product.directory, "release");
    const zipPath = path.join(
      releaseRoot,
      `${product.artifactBase}-${ALPHA_VERSION}-mac-universal.zip`,
    );
    const dmgPath = path.join(
      releaseRoot,
      `${product.artifactBase}-${ALPHA_VERSION}-mac-universal.dmg`,
    );
    const architectures = verifyUniversalZip(zipPath, product);
    execFileSync("hdiutil", ["verify", dmgPath], { stdio: "ignore" });

    const receipts = {};
    for (const distribution of ["zip", "dmg"]) {
      const receiptPath = path.join(evidenceRoot, `${product.key}-${distribution}-smoke.json`);
      const screenshotPath = path.join(evidenceRoot, `${product.key}-${distribution}-first-run.png`);
      const receipt = readJson(receiptPath);
      validateReceipt(receipt, product, distribution, expectedGitSha);
      assert.equal(path.resolve(receipt.screenshotPath), screenshotPath);
      const signature = readFileSync(screenshotPath).subarray(0, 8).toString("hex");
      assert.equal(signature, "89504e470d0a1a0a", `${product.key} ${distribution} screenshot should be PNG`);
      receipts[distribution] = {
        receipt: relativeToRepo(repoRoot, receiptPath),
        receiptSha256: sha256(receiptPath),
        screenshot: relativeToRepo(repoRoot, screenshotPath),
        screenshotSha256: sha256(screenshotPath),
      };
    }

    artifacts.push(artifactRecord(repoRoot, product, "dmg", dmgPath, architectures));
    artifacts.push(artifactRecord(repoRoot, product, "zip", zipPath, architectures));
    productEvidence.push({
      app: product.key,
      origin: product.origin,
      assetsVerified: readJson(path.join(evidenceRoot, `${product.key}-dmg-smoke.json`)).assetsVerified,
      bundledToolsOpened: readJson(path.join(evidenceRoot, `${product.key}-dmg-smoke.json`)).bundledToolsOpened,
      stableOriginRelaunch: true,
      receipts,
    });
  }

  const inventory = {
    schema: "wtfos.pasta.desktop-alpha-handoff.v1",
    generatedAt: new Date().toISOString(),
    version: ALPHA_VERSION,
    channel: "controlled-human-alpha",
    publishable: false,
    unsigned: true,
    gitSha: expectedGitSha,
    sourceRevision: `${expectedGitSha}-dirty`,
    target: EXPECTED_TARGET,
    summary: {
      apps: products.length,
      artifacts: artifacts.length,
      runtimeSmokes: products.length * 2,
      screenshots: products.length * 2,
      stableOriginRelaunches: products.length * 2,
      failures: 0,
    },
    products: productEvidence,
    artifacts,
    limitations: [
      "dirty-preflight provenance; clean commit rebuild required before publication",
      "unsigned and not notarized",
      "native Windows and arm64 Debian/Raspberry Pi runtime gates are outside this macOS handoff",
    ],
  };

  writeFileSync(
    path.join(evidenceRoot, "pasta-alpha-installer-inventory.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(evidenceRoot, "SHA256SUMS.txt"),
    `${artifacts.map((artifact) => `${artifact.sha256}  ${artifact.path}`).join("\n")}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(evidenceRoot, "PASTA-ALPHA-INSTALLER-HANDOFF.md"),
    handoffMarkdown(inventory),
    "utf8",
  );

  console.log(JSON.stringify(inventory.summary));
}

main();
