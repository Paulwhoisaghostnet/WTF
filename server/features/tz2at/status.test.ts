import test from "node:test";
import assert from "node:assert/strict";
import { buildTz2atStatusPayload } from "./status";

const relay = { baseUrl: "https://tz2at.xyz", ok: true, network: "mainnet" };
const account = {
  id: 1,
  did: "did:plc:example",
  handle: "example.bsky.social",
  pdsUrl: "https://bsky.social",
  oauthScopes: "atproto",
};

test("tz2at status mapper handles no AT account", () => {
  const status = buildTz2atStatusPayload({
    account: null,
    links: [],
    tezosWallets: [],
    etherlinkWallets: [],
    relay,
  });

  assert.equal(status.account, null);
  assert.equal(status.links.length, 0);
  assert.equal(status.permissions.identityScope, "atproto");
  assert.equal(status.pdsOffering.identity, null);
  assert.equal(status.pdsOffering.canonicalRepoPolicy.allowedWriteCollections.length, 1);
  assert.equal(status.firehose.mode, "read-only-appview-consumer");
});

test("tz2at status mapper handles connected account and local wallets", () => {
  const status = buildTz2atStatusPayload({
    account,
    links: [],
    tezosWallets: [{ id: 7, walletAddress: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb", isPrimary: true, tezDomain: "example.tez" }],
    etherlinkWallets: [{ id: 8, walletAddress: "0x1111111111111111111111111111111111111111", isPrimary: false, network: "etherlink-mainnet", chainId: 42793 }],
    relay,
  });

  assert.equal(status.account?.hasWalletLinkScope, false);
  assert.equal(status.wallets.tezos[0].tezDomain, "example.tez");
  assert.equal(status.wallets.etherlink[0].chainId, 42793);
  assert.equal(status.pdsOffering.wtfRepoPolicy.writePrefix, "app.wtfos");
});

test("tz2at status mapper exposes imported and published records", () => {
  const status = buildTz2atStatusPayload({
    account: { ...account, oauthScopes: "atproto repo:xyz.tz2at.identity.walletLink" },
    links: [
      {
        id: 3,
        chain: "tezos",
        walletAddress: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
        source: "tzbsky_import",
        verificationStatus: "imported",
        importedUri: "at://did:plc:example/com.tzbsky.cryptoAddress/self",
        importedCid: "bafyimport",
        tz2atRecordUri: null,
        tz2atRecordCid: null,
        importedAt: new Date("2026-01-01T00:00:00Z"),
        verifiedAt: null,
        publishedAt: null,
      },
      {
        id: 4,
        chain: "etherlink",
        walletAddress: "0x1111111111111111111111111111111111111111",
        source: "wtf_signature",
        verificationStatus: "published",
        importedUri: null,
        importedCid: null,
        tz2atRecordUri: "at://did:plc:example/xyz.tz2at.identity.walletLink/abc",
        tz2atRecordCid: "bafypublished",
        importedAt: null,
        verifiedAt: new Date("2026-01-02T00:00:00Z"),
        publishedAt: new Date("2026-01-02T00:00:00Z"),
      },
    ],
    tezosWallets: [],
    etherlinkWallets: [],
    relay,
  });

  assert.equal(status.account?.hasWalletLinkScope, true);
  assert.equal(status.links[0].source, "tzbsky_import");
  assert.equal(status.links[1].verificationStatus, "published");
});

test("tz2at status mapper exposes linked WTFOS PDS offering separately from canonical DID", () => {
  const status = buildTz2atStatusPayload({
    account,
    links: [],
    tezosWallets: [],
    etherlinkWallets: [],
    relay,
    pdsOffering: {
      pdsUrl: "https://pds.wtfgameshow.app",
      handleDomain: "wtfgameshow.app",
      identityLinkCollection: "app.wtfos.identity.link",
      gameLexiconPrefix: "app.wtfos",
      suggestedHandle: "example.wtfgameshow.app",
    },
    wtfosIdentity: {
      id: 9,
      canonicalDid: account.did,
      canonicalHandle: account.handle,
      wtfDid: null,
      wtfHandle: "example.wtfgameshow.app",
      wtfPdsUrl: "https://pds.wtfgameshow.app",
      status: "requested",
      linkageRecordUri: null,
      linkageRecordCid: null,
      requestedAt: new Date("2026-05-26T00:00:00Z"),
      provisionedAt: null,
      lastCheckedAt: null,
    },
  });

  assert.equal(status.pdsOffering.identity?.canonicalDid, account.did);
  assert.equal(status.pdsOffering.identity?.wtfDid, null);
  assert.equal(status.pdsOffering.suggestedHandle, "example.wtfgameshow.app");
  assert.equal(status.pdsOffering.wtfRepoPolicy.role.includes("game"), true);
});
