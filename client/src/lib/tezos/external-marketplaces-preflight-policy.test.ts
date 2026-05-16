import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./external-marketplaces.ts", import.meta.url),
  "utf8"
);

test("external marketplace builders preflight before Taquito wallet contract construction", () => {
  assert.match(
    source,
    /export async function buildFa2BatchTransferOps\([\s\S]*?\): Promise<WalletParamsWithKind\[\]> \{\s*await assertNetworkReadyForSend\(sender\);\s*const tezos = await getTezos\(\);[\s\S]*?tezos\.wallet\.at\(fa\)/
  );
  assert.match(
    source,
    /export async function buildCancelExternalListingsOps\(\s*walletAddress: string,[\s\S]*?\): Promise<WalletParamsWithKind\[\]> \{\s*await assertNetworkReadyForSend\(walletAddress\);\s*const tezos = await getTezos\(\);[\s\S]*?tezos\.wallet\.at\(listing\.marketplaceContract\)/
  );
  assert.match(
    source,
    /export async function buildRevokeOperatorOps\([\s\S]*?\): Promise<WalletParamsWithKind\[\]> \{\s*await assertNetworkReadyForSend\(ownerAddress\);\s*const tezos = await getTezos\(\);[\s\S]*?tezos\.wallet\.at\(fa\)/
  );
});

test("external listing cancellation threads the expected signer into its builder", () => {
  assert.match(
    source,
    /const ops = await buildCancelExternalListingsOps\(walletAddress, listings\);/
  );
  assert.doesNotMatch(source, /buildCancelExternalListingsOps\(listings\)/);
});
