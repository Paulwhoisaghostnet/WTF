import assert from "node:assert/strict";
import test from "node:test";

import { FALLBACK_DEMO_CARTRIDGES } from "./manifest";
import { isConsoleStockSlug } from "./surfaces";

test("fallback console manifest includes all WTF stock cartridges", () => {
  const slugs = new Set(FALLBACK_DEMO_CARTRIDGES.map((cart) => cart.slug));
  for (const slug of ["pixel-runner", "space-blocks", "inverse-snake", "backwards-pong"]) {
    assert.equal(isConsoleStockSlug(slug), true, slug);
    assert.equal(slugs.has(slug), true, slug);
  }
});
