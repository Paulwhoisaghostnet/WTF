import assert from "node:assert/strict";
import test from "node:test";
import boundary from "../apps/pasta-suite-desktop/src/local-boundary.cjs";
import macaroniBoundary from "../apps/macaroni-desktop/src/local-boundary.cjs";

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

test("standalone Macaroni applies the same exact local write and navigation boundary", () => {
  const standaloneOrigin = "http://127.0.0.1:30771";
  assert.equal(macaroniBoundary.isTrustedMutation({ host: "127.0.0.1:30771", origin: standaloneOrigin }, standaloneOrigin), true);
  assert.equal(macaroniBoundary.isTrustedMutation({ host: "localhost:30771", origin: standaloneOrigin }, standaloneOrigin), false);
  assert.equal(macaroniBoundary.isTrustedMutation({ host: "127.0.0.1:30771", origin: `${standaloneOrigin}.attacker.example` }, standaloneOrigin), false);
  assert.equal(macaroniBoundary.isSameOrigin(`${standaloneOrigin}/studio.html`, standaloneOrigin), true);
  assert.equal(macaroniBoundary.isSameOrigin(`${standaloneOrigin}@attacker.example/`, standaloneOrigin), false);
});
