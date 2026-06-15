import assert from "node:assert/strict";
import test from "node:test";
import {
  MACARONI_IPFS_AVERAGE_MAX_BYTES,
  MACARONI_IPFS_HARD_MAX_BYTES,
  macaroniIpfsMaxBytes,
  uploadLimitLabel,
} from "./upload-limits";

test("Macaroni upload hard cap stays 1 GB even when legacy env carries the 250 MB average", () => {
  const original = process.env.MACARONI_IPFS_MAX_BYTES;
  try {
    process.env.MACARONI_IPFS_MAX_BYTES = String(MACARONI_IPFS_AVERAGE_MAX_BYTES);
    assert.equal(macaroniIpfsMaxBytes(), MACARONI_IPFS_HARD_MAX_BYTES);

    process.env.MACARONI_IPFS_MAX_BYTES = String(2 * MACARONI_IPFS_HARD_MAX_BYTES);
    assert.equal(macaroniIpfsMaxBytes(), MACARONI_IPFS_HARD_MAX_BYTES);
  } finally {
    if (original == null) delete process.env.MACARONI_IPFS_MAX_BYTES;
    else process.env.MACARONI_IPFS_MAX_BYTES = original;
  }
});

test("Macaroni upload limit labels remain creator-readable", () => {
  assert.equal(uploadLimitLabel(MACARONI_IPFS_HARD_MAX_BYTES), "1 GB");
  assert.equal(uploadLimitLabel(MACARONI_IPFS_AVERAGE_MAX_BYTES), "250 MB");
});
