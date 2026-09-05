import assert from "node:assert/strict";
import test from "node:test";

import { cacheFileBase, isImmutableSource } from "./cache-files";

test("canonical FileShip URLs retain immutable IPFS cache identity", () => {
  const cid = "bafybeigdyrztfixturecid";
  assert.equal(isImmutableSource(`https://ipfs.fileship.xyz/${cid}`), true);
  assert.equal(
    cacheFileBase(`https://ipfs.fileship.xyz/${cid}`),
    cacheFileBase(`https://ipfs.io/ipfs/${cid}`),
  );
});
