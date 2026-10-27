import assert from "node:assert/strict";
import test from "node:test";
import boundary from "../apps/pasta-suite-desktop/src/local-boundary.cjs";

const origin = "http://127.0.0.1:30770";

test("Suite writes require the exact installed Host and Origin", () => {
  assert.equal(boundary.isTrustedMutation({ host: "127.0.0.1:30770", origin }, origin), true);
  for (const headers of [
    { host: "127.0.0.1:30770" },
    { host: "127.0.0.1:30770", origin: "https://attacker.example" },
    { host: "localhost:30770", origin },
    { host: "127.0.0.1:30770", origin: `${origin}.attacker.example` },
  ]) assert.equal(boundary.isTrustedMutation(headers, origin), false);
});

test("external popup URL tricks never inherit the Suite preload", () => {
  assert.equal(boundary.isSameOrigin(`${origin}/creation-tools/macaroni/studio.html`, origin), true);
  for (const url of [
    `${origin}@attacker.example/`,
    `${origin}.attacker.example/`,
    "https://shadownet.kukai.app/",
    "about:blank",
  ]) assert.equal(boundary.isSameOrigin(url, origin), false);
});
