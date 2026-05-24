import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./wallet-context.tsx", import.meta.url), "utf8");

test("passive wallet rehydration never requests ownership signatures", () => {
  assert.match(source, /interface LinkWalletOptions \{/);
  assert.match(source, /allowSignatureLink\?: boolean/);
  assert.match(
    source,
    /if \(!options\.allowSignatureLink\) \{\s*return;\s*\}[\s\S]*\/api\/wallets\/challenge/,
    "challenge creation must stay behind explicit signature-link permission"
  );
  assert.match(
    source,
    /linkWalletToUser\(address, \{ allowSignatureLink: false \}\)/,
    "page-load cached wallet reconciliation must stay read/sync-only"
  );
});

test("explicit wallet connect may link a newly connected wallet", () => {
  assert.match(
    source,
    /linkWalletToUser\(result\.address, \{ allowSignatureLink: true \}\)/,
    "user-initiated connect should remain able to request wallet proof"
  );
});
