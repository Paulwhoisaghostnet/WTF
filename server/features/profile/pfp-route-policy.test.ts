import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../routes/profile.ts", import.meta.url),
  "utf8",
);

function routeBlock(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing route marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing route marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("remote PFP writes sanitize before update and verify positive token ownership", () => {
  const block = routeBlock(
    'router.put("/api/profile/pfp"',
    'router.delete("/api/profile/pfp"',
  );
  assert.match(block, /sanitizeProfilePfpImageUrl\(imageUrl\)/);
  assert.match(block, /normalizeProfilePfpTokenReference\(tokenContract, tokenId\)/);
  assert.match(block, /await hasPositivePfpHolding\(user\.id, tokenReference\.value\)/);
  assert.match(block, /pfpImageUrl: safeImageUrl/);
  assert.match(block, /avatarUrl: safeImageUrl/);
  assert.doesNotMatch(block, /pfpImageUrl: imageUrl/);
  assert.ok(
    block.indexOf("sanitizeProfilePfpImageUrl") < block.indexOf(".update(users)"),
    "sanitization must happen before the user row update",
  );
});

test("edited PFP media keeps owner and token ownership checks before assignment", () => {
  const block = routeBlock(
    'router.put("/api/profile/avatar-media"',
    'router.get("/api/profile/avatar-media/:id/file"',
  );
  assert.match(block, /normalizeProfilePfpTokenReference/);
  assert.match(block, /await hasPositivePfpHolding\(user\.id, tokenReference\.value\)/);
  assert.match(block, /item\.ownerUserId !== user\.id/);
  assert.match(block, /item\.sourceType !== "upload"/);
  assert.match(block, /pfpTokenContract: tokenReference\.value\?\.tokenContract \|\| null/);
  assert.match(block, /pfpTokenId: tokenReference\.value\?\.tokenId \|\| null/);
  assert.ok(
    block.indexOf("item.ownerUserId !== user.id") < block.indexOf(".update(users)"),
    "media ownership must be checked before the user row update",
  );
});
