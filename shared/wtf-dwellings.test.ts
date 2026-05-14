import assert from "node:assert/strict";
import test from "node:test";
import { PAGE_DEFS } from "../client/src/routes/page-defs";
import { WTF_DWELLING_KEYS, WTF_DWELLINGS, getWtfDwelling } from "./wtf-dwellings";

test("WTF dwellings include every Law-mandated filesystem home exactly once", () => {
  assert.equal(WTF_DWELLINGS.length, WTF_DWELLING_KEYS.length);
  assert.deepEqual(
    WTF_DWELLINGS.map((dwelling) => dwelling.key),
    WTF_DWELLING_KEYS
  );
  assert.equal(new Set(WTF_DWELLINGS.map((dwelling) => dwelling.key)).size, WTF_DWELLINGS.length);
});

test("every WTF dwelling has a real shell route and doctrine bundle ownership", () => {
  const routes = new Set(PAGE_DEFS.map((page) => page.pattern));

  for (const dwelling of WTF_DWELLINGS) {
    assert.match(dwelling.path, /^WTF\/[A-Z][A-Za-z]+$/);
    assert(routes.has(dwelling.route), `${dwelling.key} route ${dwelling.route} is not registered`);
    assert(dwelling.owner.length > 0, `${dwelling.key} needs an owner`);
    assert(dwelling.doctrineRole.length > 20, `${dwelling.key} needs a doctrine role`);
    assert(dwelling.bundleDomains.length > 0, `${dwelling.key} needs bundle domains`);
    assert.equal(getWtfDwelling(dwelling.key).path, dwelling.path);
  }
});
