import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMacaroniPublishedHtml,
  macaroniStaticAssetBase,
  sanitizeMacaroniConfigForPublish,
  slugForDropTitle,
} from "./publish";

test("Macaroni drop titles become user-site-safe slugs", () => {
  assert.equal(slugForDropTitle("Summer Drop: Blind Mint #1!"), "summer-drop-blind-mint-1");
  assert.equal(slugForDropTitle("  "), "macaroni-drop");
  assert.equal(slugForDropTitle("A".repeat(100)), "a".repeat(80));
});

test("Macaroni published page loads stable app assets from the public origin", () => {
  const html = buildMacaroniPublishedHtml({
    publicOrigin: "https://wtfos.app/",
    config: {
      title: "Macaroni Summer",
      contract: "KT1MacaroniDrop1111111111111111111111",
    },
  });

  assert.equal(macaroniStaticAssetBase("https://wtfos.app/"), "https://wtfos.app/creation-tools/macaroni");
  assert.match(html, /https:\/\/wtfos\.app\/creation-tools\/macaroni\/css\/theme\.css/);
  assert.match(html, /https:\/\/wtfos\.app\/creation-tools\/macaroni\/vendor\/tezos\.js/);
  assert.match(html, /https:\/\/wtfos\.app\/creation-tools\/macaroni\/js\/common\.js/);
  assert.match(html, /https:\/\/wtfos\.app\/creation-tools\/macaroni\/js\/drop\.js/);
  assert.match(html, /id="btnDisconnect"/);
  assert.match(html, /id="walletBalance"/);
  assert.match(html, /id="walletLimitStatus"/);
  assert.match(html, /id="ownedMintStatus"/);
  assert.match(html, /id="recentMintsSection"/);
  assert.match(html, /id="recentMintsStatus" role="status" aria-live="polite"/);
  assert.match(html, /id="recentMintsList"/);
  assert.match(html, /Recent mints:/);
  assert.match(html, /<main class="wrap narrow" id="main">/);
  assert.match(html, /id="mintPanel" aria-labelledby="mintHeading"/);
  assert.match(html, /id="supplyProgress" role="progressbar"/);
  assert.match(html, /id="btnConnect" type="button" aria-label="Connect wallet"/);
  assert.match(html, /id="mintStatus" role="status" aria-live="polite"/);
  assert.match(html, /id="qtyMinus" type="button" aria-label="Decrease mint quantity"/);
  assert.equal(html.includes("drop.config.js"), false);
});

test("Macaroni published page escapes title and script-embedded config", () => {
  const html = buildMacaroniPublishedHtml({
    publicOrigin: "https://wtfos.app",
    config: {
      title: "<script>bad</script>",
      description: "</script><script>alert(1)</script>",
    },
  });

  assert.match(html, /<title>&lt;script&gt;bad&lt;\/script&gt;<\/title>/);
  assert.equal(html.includes("</script><script>alert(1)</script>"), false);
  assert.match(html, /\\u003cscript\\u003ebad\\u003c\/script\\u003e/);
  assert.match(html, /\\u003c\/script\\u003e\\u003cscript\\u003ealert\(1\)\\u003c\/script\\u003e/);
});

test("Macaroni published page strips stored CSS injection surfaces", () => {
  const maliciousCss =
    '</style><img src=x onerror=alert(1)>body{--accent:url(javascript:alert(1));}';
  const safe = sanitizeMacaroniConfigForPublish({
    title: "CSS check",
    theme: {
      name: "neon",
      accent: "#abc123",
      font: "'Courier New', monospace",
      customCss: maliciousCss,
      unknown: maliciousCss,
    },
  });
  assert.deepEqual(safe.theme, {
    name: "neon",
    accent: "#abc123",
    font: "'Courier New', monospace",
    customCss: "",
  });

  const unsafe = sanitizeMacaroniConfigForPublish({
    title: "CSS check",
    theme: {
      name: 'dark" onclick="alert(1)',
      accent: "red;--bg:url(javascript:alert(1))",
      font: "Arial;src:url(javascript:alert(1))",
      customCss: maliciousCss,
    },
  });
  assert.deepEqual(unsafe.theme, { name: "dark", accent: "", font: "", customCss: "" });

  const html = buildMacaroniPublishedHtml({
    publicOrigin: "https://wtfos.app",
    config: {
      title: "CSS check",
      theme: {
        name: "dark",
        accent: maliciousCss,
        font: maliciousCss,
        customCss: maliciousCss,
      },
    },
  });
  assert.equal(html.includes(maliciousCss), false);
  assert.equal(html.includes("</style><img"), false);
  assert.equal(html.includes("javascript:alert"), false);
  assert.match(html, /"theme":\{"name":"dark","accent":"","font":"","customCss":""\}/);
});
