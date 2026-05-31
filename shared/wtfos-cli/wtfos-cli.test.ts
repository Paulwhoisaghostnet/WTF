import assert from "node:assert/strict";
import test from "node:test";
import { parseCliInput, tokenizeCliInput } from "./parse";
import { nextCliThemeId, normalizeCliThemeId } from "./themes";

test("tokenizeCliInput respects quoted strings", () => {
  assert.deepEqual(tokenizeCliInput(`open "/mission control"`), ["open", "/mission control"]);
  assert.deepEqual(tokenizeCliInput("echo 'hello world'"), ["echo", "hello world"]);
});

test("parseCliInput strips optional wtf prefix", () => {
  assert.deepEqual(parseCliInput("wtf help"), { name: "help", args: [], raw: "wtf help" });
  assert.deepEqual(parseCliInput("open /terminal"), {
    name: "open",
    args: ["/terminal"],
    raw: "open /terminal",
  });
});

test("parseCliInput returns null for blank input", () => {
  assert.equal(parseCliInput("   "), null);
});

test("normalizeCliThemeId falls back to phosphor", () => {
  assert.equal(normalizeCliThemeId("tezos"), "tezos");
  assert.equal(normalizeCliThemeId("nope"), "phosphor");
});

test("nextCliThemeId cycles themes", () => {
  assert.equal(nextCliThemeId("tezos"), "phosphor");
  assert.equal(nextCliThemeId("phosphor"), "amber");
});
