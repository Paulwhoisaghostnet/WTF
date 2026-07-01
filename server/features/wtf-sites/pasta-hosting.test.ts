import assert from "node:assert/strict";
import test from "node:test";
import { WTF_USER_SITE_HOME_SLUG } from "@shared/wtf-user-sites";
import {
  PASTA_WTFME_NETWORK,
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
  assert.match(landing.html, /KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH/);
  assert.match(landing.html, /KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax/);

  const mint = pages.find((page) => page.slug === "mint");
  assert.ok(mint);
  assert.match(mint.html, /data-pasta-hosted-page="mint"/);
  assert.match(mint.html, /data-pasta-network="shadownet"/);
  assert.match(mint.html, new RegExp(`data-pasta-chain-id="${PASTA_WTFME_NETWORK.chainId}"`));
  assert.match(mint.html, /data-pasta-contract="KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax"/);
  assert.match(mint.html, /data-pasta-token-id="0"/);
  assert.match(mint.html, /data-pasta-mint-entrypoint="open_mint"/);
  assert.match(mint.html, /data-pasta-price-mutez="1"/);
  assert.match(mint.html, /data-pasta-wallet-action="connect"/);
  assert.match(mint.html, /data-pasta-purchase-action="mint"/);
  assert.match(mint.html, /https:\/\/shadownet\.tzkt\.io\/KT1FwS1JifrUakeGqFwGYmMHMmfjuwJABaax/);

  const collection = pages.find((page) => page.slug === "collection");
  assert.ok(collection);
  assert.match(collection.html, /data-pasta-hosted-page="collection"/);
  assert.match(collection.html, /data-pasta-contract="KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH"/);
  assert.match(collection.html, /data-pasta-token-id="0"/);
  assert.match(collection.html, /spaghetti-shadownet-e2e-mr19mwvk/);
  assert.match(collection.html, /https:\/\/shadownet\.tzkt\.io\/KT1LPXV5b83MU8LsvyVM76YCAH25JtNCBJPH/);
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
