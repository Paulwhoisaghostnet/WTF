import assert from "node:assert/strict";
import test from "node:test";

import { validateConsoleBundleZip } from "../console/bundle-storage";
import { buildGameStudioScaffold } from "./catalog";
import {
  GAME_STUDIO_MAX_LOCAL_ASSET_BYTES,
  normalizeLocalAssets,
  buildGameStudioZip,
} from "./packaging";

test("buildGameStudioZip creates a Console-valid bundle with stock assets", () => {
  const scaffold = buildGameStudioScaffold("endless-runner");
  const { zip, manifest } = buildGameStudioZip({
    title: "Neon Jump",
    slug: "neon-jump",
    template: scaffold.template,
    files: scaffold.files,
    selectedAssetIds: ["sprite-neon-runner", "audio-jump-a", "shader-crt-lite"],
  });

  const validation = validateConsoleBundleZip(zip);
  assert.equal(validation.ok, true, validation.errors.join(", "));
  assert.ok(manifest.files.includes("index.html"));
  assert.ok(manifest.files.includes("wtf-game.json"));
  assert.ok(manifest.files.includes("assets/manifest.json"));
  assert.ok(manifest.files.some((file) => file.startsWith("assets/stock/")));
});

test("buildGameStudioZip includes uploaded local assets under assets/uploads", () => {
  const scaffold = buildGameStudioScaffold("match-puzzle");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const { zip, manifest } = buildGameStudioZip({
    title: "Gem Draft",
    slug: "gem-draft",
    template: scaffold.template,
    files: scaffold.files,
    localAssets: [
      {
        id: "local-png",
        name: "My Gem.png",
        size: png.length,
        type: "image/png",
        dataBase64: png.toString("base64"),
      },
    ],
  });

  const validation = validateConsoleBundleZip(zip);
  assert.equal(validation.ok, true, validation.errors.join(", "));
  assert.ok(manifest.files.includes("assets/uploads/my-gem.png"));
  assert.equal(manifest.uploadedAssets[0]?.path, "assets/uploads/my-gem.png");
});

test("normalizeLocalAssets strict mode enforces saved project upload limits", () => {
  assert.throws(
    () =>
      normalizeLocalAssets(
        [
          {
            id: "bad",
            name: "huge.png",
            size: GAME_STUDIO_MAX_LOCAL_ASSET_BYTES + 1,
            type: "image/png",
            dataBase64: Buffer.alloc(8).toString("base64"),
          },
        ],
        { strict: true }
      ),
    /asset size limit/
  );

  assert.throws(
    () =>
      normalizeLocalAssets(
        [
          {
            id: "bad-type",
            name: "movie.mp4",
            size: 4,
            type: "video/mp4",
            dataBase64: Buffer.alloc(4).toString("base64"),
          },
        ],
        { strict: true }
      ),
    /unsupported asset type/
  );
});
