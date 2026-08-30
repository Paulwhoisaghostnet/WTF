import assert from "node:assert/strict";
import test from "node:test";
import { ARCADE_SOURCE_STORAGE_MODE } from "../arcade/source-constants";
import { getConsoleSourceAttribution } from "./attribution";

test("console attribution labels source arcade imports with MIT provenance", () => {
  assert.deepEqual(
    getConsoleSourceAttribution({
      storageMode: ARCADE_SOURCE_STORAGE_MODE,
      sourceUrl: "https://hacktez.com/arcade-files/demo/v1/index.html",
    }),
    {
      sourceUrl: "https://hacktez.com/arcade-files/demo/v1/index.html",
      sourceLabel: "Built on hack.tez",
      licenseName: "MIT",
    }
  );
});

test("console attribution preserves creator source links without inventing a license", () => {
  assert.deepEqual(
    getConsoleSourceAttribution({
      storageMode: "console_bundle",
      sourceUrl: "https://example.com/source.zip",
    }),
    {
      sourceUrl: "https://example.com/source.zip",
      sourceLabel: "Creator source",
      licenseName: null,
    }
  );
});

test("console attribution identifies Game Studio publications in plain language", () => {
  assert.deepEqual(
    getConsoleSourceAttribution({
      storageMode: "console_bundle",
      creationSource: "game_studio_project",
    }),
    {
      sourceUrl: null,
      sourceLabel: "Built with WTF Game Studio",
      licenseName: null,
    }
  );
});
