import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_STUDIO_CODE_SNIPPETS,
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
  assert.ok(sdkSnippets.length >= 2);
  assert.ok(sdkSnippets.every((snippet) => snippet.code.includes("WTFConsole")));
});
