import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Macaroni server routes keep pinning and publishing behind trusted creator permission", () => {
  const source = readFileSync("server/routes/macaroni.ts", "utf8");
  const permissionUses = source.match(/requirePermission\("trusted_market_creator"\)/g) ?? [];

  assert.equal(permissionUses.length, 2);
  assert.match(source, /WTFGAMESHOW_IPFS_JWT/);
  assert.match(source, /pinFileToIPFS/);
  assert.equal(source.includes("VITE_PINATA_JWT"), false);
});

test("Macaroni static API calls use the wtfOS CSRF boundary and do not embed pinning secrets", () => {
  const commonSource = readFileSync("public/creation-tools/macaroni/js/common.js", "utf8");
  const studioSource = readFileSync("public/creation-tools/macaroni/js/studio.js", "utf8");

  assert.match(commonSource, /\/api\/auth\/csrf-token/);
  assert.match(commonSource, /X-CSRF-Token/);
  assert.match(commonSource, /\/api\/macaroni\/ipfs\/pin/);
  assert.match(studioSource, /MD\.apiFetch\("\/api\/macaroni\/publish"/);
  assert.equal(commonSource.includes("VITE_PINATA_JWT"), false);
  assert.equal(studioSource.includes("VITE_PINATA_JWT"), false);
});
