import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { JWT_SHAPED_CREDENTIAL_PATTERN } from "./public-release-secret-patterns.mjs";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

test("Particle Painter accepts only an explicit session-only Pinata credential", () => {
  const service = read("PP/src/features/tezos/teiaService.ts");
  const modal = read("PP/src/components/MintModal.tsx");
  const viteEnv = read("PP/src/vite-env.d.ts");

  assert.doesNotMatch(service, /import\.meta\.env/);
  assert.doesNotMatch(service, /VITE_PINATA_JWT/);
  assert.doesNotMatch(viteEnv, /PINATA|JWT/);
  assert.match(service, /userCredential = pinataJWT\.trim\(\)/);
  assert.match(service, /Bearer \$\{userCredential\}/);
  assert.doesNotMatch(service, /localStorage|sessionStorage/);

  assert.match(modal, /type="password"/);
  assert.match(modal, /autoComplete="off"/);
  assert.match(modal, /Particle Painter never saves it/);
  assert.match(modal, /disabled=\{isMinting \|\| !pinataJWT\.trim\(\)\}/);
  assert.doesNotMatch(modal, /localStorage|sessionStorage/);
});

test("Particle Painter public assets contain no JWT-shaped credential and registry points at the built entry", () => {
  const assetDir = path.join(root, "public/creation-tools/particle-painter/assets");
  assert.equal(existsSync(assetDir), true);
  const browserJavaScript = readdirSync(assetDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(path.join(assetDir, name), "utf8"))
    .join("\n");

  assert.doesNotMatch(browserJavaScript, JWT_SHAPED_CREDENTIAL_PATTERN);
  assert.doesNotMatch(browserJavaScript, /VITE_PINATA_JWT/);
  assert.match(browserJavaScript, /pinFileToIPFS/);

  const html = read("public/creation-tools/particle-painter/index.html");
  const entryMatch = html.match(/src="\.\/assets\/(index-[^"]+\.js)"/);
  assert.ok(entryMatch, "Particle Painter build must declare its hashed JavaScript entry");
  const registry = read("client/src/features/creation-tools/tool-registry.ts");
  assert.match(
    registry,
    new RegExp(`/creation-tools/particle-painter/assets/${entryMatch[1]}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});
