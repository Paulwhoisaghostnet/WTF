// Run after the exact-commit installed ZIP and DMG smoke; outputs stay in release/.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const release = path.join(root, "apps/pasta-suite-desktop/release");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
assert.equal(git("status", "--porcelain"), "", "Freeze a clean source commit before recording the handoff");
const sha = git("rev-parse", "HEAD");
const pkg = JSON.parse(await readFile(path.join(root, "apps/pasta-suite-desktop/package.json"), "utf8"));
const files = [
  `Pasta-Suite-${pkg.version}-mac-universal.dmg`,
  `Pasta-Suite-${pkg.version}-mac-universal.zip`,
];
for (const format of ["dmg", "zip"]) {
  const name = `pasta-suite-${format}-smoke.json`;
  const receipt = JSON.parse(await readFile(path.join(release, name), "utf8"));
  assert.equal(receipt.ok, true);
  assert.equal(receipt.app, "pasta-suite");
  assert.equal(receipt.provenance.gitSha, sha);
  assert.equal(receipt.provenance.dirty, false);
  assert.equal(receipt.stableOriginRelaunch, true);
  assert.equal(receipt.bundledToolsOpened, 8);
  files.push(name, `pasta-suite-${format}-first-run.png`);
}
const assets = [];
for (const name of files) {
  const bytes = await readFile(path.join(release, name));
  assets.push({ name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
const manifest = {
  schema: "pasta.review-handoff.v1",
  product: "Pasta Suite",
  version: pkg.version,
  releaseTag: "pasta-review-2026-10-06",
  sourceCommit: sha,
  sourceUrl: `https://github.com/Paulwhoisaghostnet/WTF/tree/${sha}`,
  reviewUrl: `https://github.com/Paulwhoisaghostnet/WTF/tree/${sha}/pasta-protocol`,
  build: { dirty: false, platform: "darwin", architecture: "universal", signed: false, notarized: false },
  scope: "Developer review; Shadownet-only instructions, not an enforced network restriction or readiness signoff",
  liveFundedLifecycleVerified: false,
  windowsLinuxIncluded: false,
  assets,
};
const manifestName = "Pasta-Review-Manifest.json";
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
await writeFile(path.join(release, manifestName), manifestBytes);
const sums = [...assets, { name: manifestName, sha256: createHash("sha256").update(manifestBytes).digest("hex") }];
await writeFile(path.join(release, "SHA256SUMS.txt"), sums.map(x => `${x.sha256}  ${x.name}`).join("\n") + "\n");
console.log(JSON.stringify({ sourceCommit: sha, manifest: manifestName, assets: files }));
