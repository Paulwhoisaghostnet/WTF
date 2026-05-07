import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

function buildZip(files: Record<string, string | Buffer>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const compressed = deflateRawSync(body);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(compressed.byteLength, 18);
    local.writeUInt32LE(body.byteLength, 22);
    local.writeUInt16LE(nameBytes.byteLength, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(compressed.byteLength, 20);
    central.writeUInt32LE(body.byteLength, 24);
    central.writeUInt16LE(nameBytes.byteLength, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);

    offset += local.byteLength + nameBytes.byteLength + compressed.byteLength;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const entryCount = Object.keys(files).length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entryCount, 8);
  eocd.writeUInt16LE(entryCount, 10);
  eocd.writeUInt32LE(centralDirectory.byteLength, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

test("validates and extracts a root index console bundle with SDK injection", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wtf-console-bundles-"));
  process.env.CONSOLE_BUNDLE_ROOT = root;
  const bundleStorage = await import(`./bundle-storage.ts?extract-${Date.now()}`);
  const zip = buildZip({
    "index.html": "<!doctype html><html><head><title>Test</title></head><body></body></html>",
    "game.js": "window.__testGame = true;",
    "assets/sprite.png": Buffer.from([137, 80, 78, 71]),
  });

  const validation = bundleStorage.validateConsoleBundleZip(zip);
  assert.equal(validation.ok, true);
  assert.equal(validation.files.length, 3);

  const extraction = await bundleStorage.extractConsoleBundleZip({
    zipBytes: zip,
    slug: "unit-game",
    version: 1,
  });
  assert.equal(extraction.entryUri, "/api/console/bundles/unit-game/v1/index.html?game=unit-game&slug=unit-game");

  const html = await fs.readFile(
    path.join(root, "unit-game", "v1", "index.html"),
    "utf8"
  );
  assert.match(html, /\/api\/console\/sdk\.js/);
});

test("rejects traversal paths before extraction", async () => {
  const bundleStorage = await import(`./bundle-storage.ts?traversal-${Date.now()}`);
  const zip = buildZip({
    "index.html": "<html></html>",
    "../evil.js": "alert(1)",
  });
  const validation = bundleStorage.validateConsoleBundleZip(zip);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error: string) => error.includes("unsafe_path_segment")));
});

test("requires root index.html and allowlisted extensions", async () => {
  const bundleStorage = await import(`./bundle-storage.ts?missing-${Date.now()}`);
  const zip = buildZip({
    "src/index.html": "<html></html>",
    "server.php": "<?php echo 'no';",
  });
  const validation = bundleStorage.validateConsoleBundleZip(zip);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("missing_root_index_html"));
  assert.ok(validation.errors.some((error: string) => error.includes("extension_not_allowed")));
});
