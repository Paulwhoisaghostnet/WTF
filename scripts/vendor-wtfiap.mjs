import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = "server/features/wtfiap/runtime";
const assets = "public/games/installed/wtfiap";
const manifestPath = path.join(root, runtime, "release-manifest.json");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceFlag = process.argv.indexOf("--source");

if (sourceFlag !== -1) {
  assert(process.argv[sourceFlag + 1], "--source requires the game workspace path");
  const source = path.resolve(process.argv[sourceFlag + 1]);
  const build = JSON.parse(fs.readFileSync(path.join(source, "review/build.json"), "utf8"));
  const files = [];
  function copy(sourcePath, targetPath, transform) {
    const original = fs.readFileSync(path.join(source, sourcePath));
    const bytes = transform ? Buffer.from(transform(original.toString("utf8"))) : original;
    fs.mkdirSync(path.dirname(path.join(root, targetPath)), { recursive: true });
    fs.writeFileSync(path.join(root, targetPath), bytes);
    files.push({ path: targetPath, sourcePath, sourceSha256: digest(original), sha256: digest(bytes), bytes: bytes.length });
  }
  for (const entry of build.sourceFiles) {
    assert.equal(digest(fs.readFileSync(path.join(source, entry.path))), entry.sha256, `Stale game build: ${entry.path}`);
  }
  assert.equal(digest(fs.readFileSync(path.join(source, "dist/generator.html"))), build.sha256, "Generator does not match the build manifest");
  for (const name of ["index.html", "generator.html", "cast.html", "party-client.js", "tournament.js"]) {
    copy(`dist/${name}`, `${assets}/${name}`);
  }
  copy("dist/party.html", `${assets}/party.html`, (html) => {
    const marker = "<!--WTFIAP_HOST_BOOTSTRAP-->";
    assert.equal(html.split(marker).length, 2, "Party host bootstrap marker must occur exactly once");
    return html.replace('<html lang="en">', '<html lang="en" data-wtfiap-hosted>').replace(marker, '<script src="host-config.js"></script>');
  });
  const hostConfig = `window.WTFIAP_HOST_CONFIG=Object.freeze(${JSON.stringify({ apiBase: "/api/wtfiap/party", csrfTokenPath: "/api/auth/csrf-token", invitePath: "/wtfiap" })});\n`;
  fs.writeFileSync(path.join(root, assets, "host-config.js"), hostConfig);
  files.push({ path: `${assets}/host-config.js`, generatedBy: "scripts/vendor-wtfiap.mjs", sha256: digest(hostConfig), bytes: Buffer.byteLength(hostConfig) });
  copy("game/server/party-server.cjs", `${runtime}/game/server/party-server.cjs`);
  for (const name of fs.readdirSync(path.join(source, "game/core")).filter((name) => name.endsWith(".cjs")).sort()) {
    copy(`game/core/${name}`, `${runtime}/game/core/${name}`);
  }
  for (const name of ["engine.js", "hero-catalog.js", "terrain.js", "zones.js", "zone-policy.js"]) {
    copy(`source/${name}`, `${runtime}/source/${name}`);
  }
  // The host is ESM, but the original engine's .js modules use CommonJS in
  // Node. Keep their package boundary intact rather than rewriting the game.
  const packageBoundary = JSON.stringify({ private: true, type: "commonjs" }, null, 2) + "\n";
  fs.writeFileSync(path.join(root, runtime, "package.json"), packageBoundary);
  files.push({ path: `${runtime}/package.json`, generatedBy: "scripts/vendor-wtfiap.mjs", sha256: digest(packageBoundary), bytes: Buffer.byteLength(packageBoundary) });
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    title: "coLILseum",
    appKey: "wtfiap",
    generatorSha256: build.sha256,
    sourceProject: "lil-guys-autobattler",
    sourceCast: "CAST-v2.md / Lil-Guys-Hero-Cast-v2.pdf",
    castHeroes: 50,
    funding: "Native host escrow pins Shadownet XTZ or Mainnet WTF per new room; older funded rooms retain their original network and recovery commitments",
    recipe: "npm run build in the source project; node scripts/vendor-wtfiap.mjs --source <game-workspace>; node scripts/vendor-wtfiap.mjs",
    files,
  }, null, 2) + "\n");
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert.equal(manifest.title, "coLILseum");
assert.equal(manifest.appKey, "wtfiap");
for (const file of manifest.files) {
  const absolute = path.resolve(root, file.path);
  assert(absolute.startsWith(path.join(root, assets) + path.sep) || absolute.startsWith(path.join(root, runtime) + path.sep), "Manifest path escapes packaged game");
  const bytes = fs.readFileSync(absolute);
  assert.equal(bytes.length, file.bytes, `Packaged size changed: ${file.path}`);
  assert.equal(digest(bytes), file.sha256, `Packaged source changed: ${file.path}`);
}
assert.equal(digest(fs.readFileSync(path.join(root, assets, "generator.html"))), manifest.generatorSha256);
console.log(`coLILseum package verified: ${manifest.files.length} files; generator ${manifest.generatorSha256}`);
