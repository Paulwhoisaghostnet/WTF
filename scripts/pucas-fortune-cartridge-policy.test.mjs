import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const publicRoot = path.resolve("public");
const cartridgeRoot = path.join(publicRoot, "games", "installed", "pucas-fortune");
const artifactUri = "/games/installed/pucas-fortune/index.html";

test("Púca’s Fortune is a complete base-path-safe WTF Arcade cartridge", () => {
  const manifest = JSON.parse(readFileSync(path.join(publicRoot, "games", "installed", "manifest.json"), "utf8"));
  const cartridge = manifest.cartridges.find((entry) => entry.slug === "pucas-fortune");
  assert.ok(cartridge, "pucas-fortune must be present in the installed manifest");
  assert.equal(cartridge.title, "Púca’s Fortune");
  assert.equal(cartridge.artifactUri, artifactUri);
  assert.equal(cartridge.kind, "html5");
  assert.equal(cartridge.thumbnailUri, "/games/installed/pucas-fortune/thumbnail.png");

  const sourcePackage = path.resolve("games-sources", "pucas-fortune.zip");
  assert.ok(existsSync(sourcePackage), "the rebuildable source cartridge package must ship");
  assert.ok(statSync(sourcePackage).size > 1_000_000, "the source cartridge package is unexpectedly small");

  const html = readFileSync(path.join(cartridgeRoot, "index.html"), "utf8");
  assert.match(html, /\/games\/installed\/pucas-fortune\/assets\/index-[^"']+\.js/);
  assert.match(html, /\/games\/installed\/pucas-fortune\/assets\/index-[^"']+\.css/);
  assert.match(html, /\/games\/installed\/pucas-fortune\/favicon\.svg/);
  assert.doesNotMatch(html, /(?:src|href)=["']\/(?:assets|favicon|src)\//);

  for (const relativePath of [
    "thumbnail.png",
    "art/fortune-table-texture.png",
    "art/puca-bestiary-texture.jpg",
    "content/pucas.json",
    "content/runes.json",
    "content/totems.json",
    "content/game-modes.json",
    "content/locales/en.json",
  ]) {
    assert.ok(existsSync(path.join(cartridgeRoot, relativePath)), `${relativePath} is missing from the cartridge`);
  }

  const bundleName = html.match(/assets\/(index-[^"']+\.js)/)?.[1];
  assert.ok(bundleName, "the cartridge JavaScript bundle reference is missing");
  const bundle = readFileSync(path.join(cartridgeRoot, "assets", bundleName), "utf8");
  assert.match(bundle, /\/games\/installed\/pucas-fortune\//);
  assert.match(bundle, /content\/pucas\.json/);
  assert.match(bundle, /art\/puca-bestiary-texture\.jpg/);
  assert.doesNotMatch(bundle, /fetch\(["']\/content\//);
});

test("manifest regeneration preserves every non-package static cartridge", () => {
  const manifest = JSON.parse(readFileSync(path.join(publicRoot, "games", "installed", "manifest.json"), "utf8"));
  const slugs = new Set(manifest.cartridges.map((entry) => entry.slug));
  for (const slug of ["inverse-snake", "backwards-pong", "mindwalk", "pixel-runner", "space-blocks"]) {
    assert.ok(slugs.has(slug), `${slug} disappeared during manifest regeneration`);
  }
});
