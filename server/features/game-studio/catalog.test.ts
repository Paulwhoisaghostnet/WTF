import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_STUDIO_CODE_SNIPPETS,
  GAME_STUDIO_STOCK_ASSETS,
  buildGameStudioStockAssetFile,
  listGameStudioCodeSnippets,
} from "./catalog";

test("Game Studio code snippets are unique and target editable files", () => {
  const snippets = listGameStudioCodeSnippets();
  assert.equal(snippets.length, GAME_STUDIO_CODE_SNIPPETS.length);
  assert.equal(new Set(snippets.map((snippet) => snippet.id)).size, snippets.length);
  assert.ok(snippets.every((snippet) => /\.(js|mjs)$/i.test(snippet.targetFile)));
});

test("Game Studio SDK snippets include Console API calls", () => {
  const sdkSnippets = listGameStudioCodeSnippets().filter(
    (snippet) => snippet.category === "sdk"
  );
  assert.ok(sdkSnippets.length >= 4);
  assert.ok(sdkSnippets.every((snippet) => snippet.code.includes("WTFConsole")));
  assert.ok(
    sdkSnippets.some((snippet) => snippet.code.includes("getAvatarAsset"))
  );
});

test("imported CC0 stock assets resolve to engine-ready PNG files", () => {
  const imported = GAME_STUDIO_STOCK_ASSETS.filter((asset) =>
    asset.tags.includes("cc0")
  );
  assert.ok(imported.length >= 20);

  for (const asset of imported) {
    assert.equal(asset.license, "CC0-1.0");
    const file = buildGameStudioStockAssetFile(asset.id);
    assert.ok(file, `${asset.id} should resolve`);
    if (asset.kind === "model") {
      assert.ok(file?.contentType.startsWith("model/"));
      assert.ok(file?.bytes.byteLength > 0);
    } else {
      assert.equal(file?.contentType, "image/png");
      assert.ok(file?.bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
    }
  }
});
