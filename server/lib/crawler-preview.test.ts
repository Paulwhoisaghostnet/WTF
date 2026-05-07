import assert from "node:assert/strict";
import test from "node:test";

import {
  compactText,
  htmlEscape,
  renderCrawlerPreviewHtml,
} from "./crawler-preview";

test("crawler preview HTML emits safe OG and Twitter tags", () => {
  const html = renderCrawlerPreviewHtml({
    title: "Board <general>",
    description: "Latest & greatest",
    canonicalUrl: "https://example.test/messageboard?channel=1",
    imageUrl: "https://example.test/image.png",
    siteName: "WTF",
  });

  assert.match(html, /property="og:title" content="Board &lt;general&gt;"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /property="og:image" content="https:\/\/example.test\/image.png"/);
});

test("crawler preview helpers escape and compact text", () => {
  assert.equal(htmlEscape(`"<>&'`), "&quot;&lt;&gt;&amp;&#39;");
  assert.equal(compactText("a\n\nb   c", 10), "a b c");
  assert.equal(compactText("1234567890", 6), "12345...");
});
