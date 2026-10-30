import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import setupModule from "../desktop-setup.cjs";

const { prepareDesktopSetupKit } = setupModule;
const companionRoot = path.resolve(import.meta.dirname, "..");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function relativeFiles(root, current = root) {
  const found = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) found.push(...await relativeFiles(root, absolute));
    else found.push(path.relative(root, absolute));
  }
  return found.sort();
}

test("desktop setup kit copies a usable standalone package without local secrets or data", async () => {
  const destinationRoot = await mkdtemp(path.join(tmpdir(), "macaroni-desktop-setup-"));
  try {
    const result = await prepareDesktopSetupKit({ companionRoot, destinationRoot });
    assert.equal(result.guidePath, path.join(destinationRoot, "README.md"));
    assert.match(await readFile(result.guidePath, "utf8"), /Open config folder/);
    for (const relative of [
      "standalone-companion/.dockerignore",
      "standalone-companion/.env.example",
      "standalone-companion/package.json",
      "standalone-companion/package-lock.json",
      "standalone-companion/contract/macaroni-v35.contract.json",
      "standalone-companion/scripts/install-macos-linux.sh",
      "standalone-companion/scripts/install-windows.ps1",
      "standalone-companion/src/index.mjs",
      "standalone-companion/templates/Caddyfile.example",
    ]) {
      assert.equal(await exists(path.join(destinationRoot, relative)), true, `${relative} should be copied`);
    }
    const files = await relativeFiles(destinationRoot);
    assert.equal(files.some((relative) => relative.split(path.sep).includes("node_modules")), false);
    assert.equal(files.some((relative) => relative.split(path.sep).includes("data")), false);
    assert.equal(files.some((relative) => relative.split(path.sep).includes("secrets")), false);
    assert.equal(files.some((relative) => [".env", "admin.token", "finalizer.key", "master.key"].includes(path.basename(relative))), false);
  } finally {
    await rm(destinationRoot, { recursive: true, force: true });
  }
});
