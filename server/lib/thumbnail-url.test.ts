import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_IPFS_GATEWAYS } from "@shared/ipfs-gateways";
import { sanitizeThumbnailUrl } from "./thumbnail-url";

test("sanitizeThumbnailUrl rewrites ipfs thumbnails through the shared primary gateway", () => {
  assert.equal(
    sanitizeThumbnailUrl("ipfs://bafybeigdyrzt/thumb.png"),
    `${DEFAULT_IPFS_GATEWAYS[0]}bafybeigdyrzt/thumb.png`
  );
});

test("sanitizeThumbnailUrl rejects private hosts and strips http credentials", () => {
  assert.equal(sanitizeThumbnailUrl("https://127.0.0.1/secret.png"), null);
  assert.equal(
    sanitizeThumbnailUrl("http://user:pass@cdn.objkt.com/thumb.png"),
    "https://cdn.objkt.com/thumb.png"
  );
});
