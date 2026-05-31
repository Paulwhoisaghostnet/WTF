import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCliBaseUrl, resolveCliBaseUrl } from "../src/base-url.ts";

test("normalizeCliBaseUrl accepts https production hosts", () => {
  assert.equal(normalizeCliBaseUrl("https://wtfos.app/"), "https://wtfos.app");
  assert.equal(normalizeCliBaseUrl("https://wtfgameshow.app"), "https://wtfgameshow.app");
});

test("normalizeCliBaseUrl accepts http localhost", () => {
  assert.equal(normalizeCliBaseUrl("http://localhost:3000"), "http://localhost:3000");
});

test("normalizeCliBaseUrl rejects http production hosts", () => {
  assert.throws(() => normalizeCliBaseUrl("http://wtfos.app"), /https/);
});

test("normalizeCliBaseUrl rejects credentials in URL", () => {
  assert.throws(() => normalizeCliBaseUrl("https://user:pass@wtfos.app"), /credentials/);
});

test("resolveCliBaseUrl prefers env over stored config", () => {
  assert.equal(
    resolveCliBaseUrl("http://127.0.0.1:3000", "https://wtfos.app"),
    "http://127.0.0.1:3000"
  );
});
