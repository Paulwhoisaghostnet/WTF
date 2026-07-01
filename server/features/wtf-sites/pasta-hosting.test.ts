import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { WTF_USER_SITE_HOME_SLUG } from "@shared/wtf-user-sites";
import {
  PASTA_WTFME_NETWORK,
  PASTA_WTFME_PROOF_CONTRACTS,
  assertPastaHostedPageSnapshots,
  buildPastaHostedPageSnapshots,
} from "./pasta-hosting";
import { buildUserSiteManifest, digestUserSiteManifest } from "./policy";

const DID_TARGET = {
  did: "did:web:wtf-admin.wtfos.me",
  source: "wtf" as const,
  handle: "wtf-admin.wtfos.me",
  pdsUrl: "https://pds.wtfos.me",
  wtfosIdentityId: 1,
};

test("Pasta hosted WTF.ME snapshots cover landing, mint, and collection pages", () => {
  const pages = buildPastaHostedPageSnapshots();
  assertPastaHostedPageSnapshots(pages);

  assert.deepEqual(
    pages.map((page) => page.slug),
    [WTF_USER_SITE_HOME_SLUG, "mint", "collection"]
  );

  const landing = pages.find((page) => page.slug === WTF_USER_SITE_HOME_SLUG);
  assert.ok(landing);
  assert.match(landing.html, /data-pasta-hosted-page="landing"/);
  assert.match(landing.html, /Pasta Protocol/);
  assert.match(landing.html, /WTF\.ME/);
  for (const contract of PASTA_WTFME_PROOF_CONTRACTS) {
    assert.match(landing.html, new RegExp(contract.contract));
    assert.match(landing.html, new RegExp(contract.relationshipGroup));
  }

  const gnocchi = PASTA_WTFME_PROOF_CONTRACTS.find((item) => item.app === "gnocchi");
  assert.ok(gnocchi);
  const mint = pages.find((page) => page.slug === "mint");
  assert.ok(mint);
  assert.match(mint.html, /data-pasta-hosted-page="mint"/);
  assert.match(mint.html, /data-pasta-network="shadownet"/);
  assert.match(mint.html, new RegExp(`data-pasta-chain-id="${PASTA_WTFME_NETWORK.chainId}"`));
  assert.match(mint.html, new RegExp(`data-pasta-contract="${gnocchi.contract}"`));
  assert.match(mint.html, /data-pasta-token-id="0"/);
  assert.match(mint.html, /data-pasta-mint-entrypoint="open_mint"/);
  assert.match(mint.html, /data-pasta-price-mutez="1"/);
  assert.match(mint.html, /data-pasta-wallet-action="connect"/);
  assert.match(mint.html, /data-pasta-purchase-action="mint"/);
  assert.match(mint.html, new RegExp(`${PASTA_WTFME_NETWORK.tzkt}/${gnocchi.contract}`));

  const spaghetti = PASTA_WTFME_PROOF_CONTRACTS.find((item) => item.app === "spaghetti");
  assert.ok(spaghetti);
  const collection = pages.find((page) => page.slug === "collection");
  assert.ok(collection);
  assert.match(collection.html, /data-pasta-hosted-page="collection"/);
  assert.match(collection.html, new RegExp(`data-pasta-contract="${spaghetti.contract}"`));
  assert.match(collection.html, /data-pasta-token-id="0"/);
  assert.match(collection.html, new RegExp(spaghetti.relationshipGroup));
  assert.match(collection.html, new RegExp(`${PASTA_WTFME_NETWORK.tzkt}/${spaghetti.contract}`));
});

test("Pasta WTF.ME proof fixture uses the current Shadownet proof contracts", () => {
  const fixture = readFileSync("shared/pasta-shadownet-proof-contracts.json", "utf8");
  for (const current of [
    "KT1WTFnZAyWqcC2SB32xEjMS4F4cutnGsyVc",
    "KT1W2ijLhjRHeH7wWYnvYcDwDsgRM7TpAFZK",
    "KT194igzFGez1pB3HHhU8HFqyMzMLSLAPskB",
    "KT1HqzEFqbwcR8BpXZrrfPALY6bJaPGQgDHQ",
    "KT1EPdyxCjmosesvJ21cr8WqoCnTXoomCpRz",
    "KT1TEz2Rq8nUiNcJEAssrdrTqPj1h3ZN9B8r",
  ]) {
    assert.match(fixture, new RegExp(current));
  }
  for (const stale of [
    "KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH",
    "KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax",
    "KT1CeJYHodXy8dvmNFgXxk4zh6SjVB5KYLaG",
    "KT1SHHPFkthiSTf9CAmhAzWmbi7t5rTcUeYz",
    "KT1DDY9Pyr7PYNJgXxnHnJn9T7WHaVx7ztdx",
    "KT1GrrYTevWKExvhFWVigUdGKR86SQKwYceN",
  ]) {
    assert.doesNotMatch(fixture, new RegExp(stale));
  }
});

test("Pasta hosted snapshots participate in immutable user-site manifest digests", () => {
  const pages = buildPastaHostedPageSnapshots();
  const manifest = buildUserSiteManifest({
    host: "wtf-admin.wtfos.me",
    url: "https://wtf-admin.wtfos.me/",
    didTarget: DID_TARGET,
    pages,
    assetMediaIds: [],
    versionNumber: 1,
    publishedAt: "2026-07-01T00:00:00.000Z",
  });

  assert.deepEqual(manifest.pageSlugs, [WTF_USER_SITE_HOME_SLUG, "mint", "collection"]);
  const manifestPages = manifest.pages as Array<{ slug: string; title: string; htmlSha256: string }>;
  assert.equal(manifestPages.length, 3);
  for (const page of manifestPages) {
    assert.match(page.htmlSha256, /^[a-f0-9]{64}$/);
  }

  const digest = digestUserSiteManifest(manifest);
  const changedDigest = digestUserSiteManifest(
    buildUserSiteManifest({
      host: "wtf-admin.wtfos.me",
      url: "https://wtf-admin.wtfos.me/",
      didTarget: DID_TARGET,
      pages: pages.map((page) =>
        page.slug === "mint"
          ? { ...page, html: page.html.replace("1 mutez", "2 mutez") }
          : page
      ),
      assetMediaIds: [],
      versionNumber: 1,
      publishedAt: "2026-07-01T00:00:00.000Z",
    })
  );
  assert.notEqual(changedDigest, digest);
});
