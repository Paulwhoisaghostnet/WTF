import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_IPFS_GATEWAYS,
  DEFAULT_IPFS_GATEWAY_ORIGINS,
  buildWtfIpfsGatewayPolicy,
  buildIpfsGatewayCandidates,
  extractIpfsPath,
  normalizeIpfsGatewayBase,
  normalizeIpfsGatewayList,
  normalizeIpfsUri,
} from "./ipfs-gateways";

test("default gateway origins expose CSP-safe FileShip and alternate hosts", () => {
  assert.deepEqual(DEFAULT_IPFS_GATEWAY_ORIGINS, [
    "https://ipfs.fileship.xyz",
    "https://nftstorage.link",
    "https://w3s.link",
    "https://gateway.pinata.cloud",
    "https://dweb.link",
    "https://cf-ipfs.com",
    "https://ipfs.io",
  ]);
});

test("normalizes IPFS gateway bases into /ipfs/ roots", () => {
  assert.equal(normalizeIpfsGatewayBase("https://example.com"), "https://example.com/ipfs/");
  assert.equal(normalizeIpfsGatewayBase("https://example.com/ipfs"), "https://example.com/ipfs/");
  assert.equal(normalizeIpfsGatewayBase("https://ipfs.fileship.xyz/ipfs/"), "https://ipfs.fileship.xyz/");
  assert.equal(normalizeIpfsGatewayBase("ftp://example.com/ipfs"), null);
});

test("builds the WTF IPFS gateway policy surfaced to OS clients", () => {
  const policy = buildWtfIpfsGatewayPolicy();

  assert.equal(policy.version, 1);
  assert.equal(policy.primaryGateway, "https://ipfs.fileship.xyz/");
  assert.equal(policy.finalFallbackGateway, "https://ipfs.io/ipfs/");
  assert.ok(policy.invariants.some((entry) => entry.includes("single hard-coded gateway")));
});

test("extracts IPFS paths from protocol, path gateway, subdomain gateway, and bare CID forms", () => {
  assert.equal(extractIpfsPath("ipfs://bafybeigdyrzt/path.png"), "bafybeigdyrzt/path.png");
  assert.equal(extractIpfsPath("https://ipfs.io/ipfs/bafybeigdyrzt/path.png?x=1"), "bafybeigdyrzt/path.png?x=1");
  assert.equal(extractIpfsPath("https://ipfs.fileship.xyz/bafybeigdyrzt/path.png"), "bafybeigdyrzt/path.png");
  assert.equal(extractIpfsPath("https://bafybeigdyrzt.ipfs.dweb.link/path.png"), "bafybeigdyrzt/path.png");
  assert.equal(extractIpfsPath("bafybeigdyrzt/path.png"), "bafybeigdyrzt/path.png");
});

test("builds deduped multi-gateway rendering candidates with ipfs.io last by default", () => {
  const candidates = buildIpfsGatewayCandidates("ipfs://bafybeigdyrzt/path.png");

  assert.equal(candidates.length, DEFAULT_IPFS_GATEWAYS.length);
  assert.equal(candidates[0], "https://ipfs.fileship.xyz/bafybeigdyrzt/path.png");
  assert.equal(candidates.at(-1), "https://ipfs.io/ipfs/bafybeigdyrzt/path.png");
  assert.equal(normalizeIpfsUri("ipfs://bafybeigdyrzt/path.png"), candidates[0]);
});

test("honors operator gateway order while discarding invalid and duplicate values", () => {
  assert.deepEqual(
    normalizeIpfsGatewayList("https://a.example/ipfs,not-a-url,https://a.example/ipfs/,https://b.example"),
    ["https://a.example/ipfs/", "https://b.example/ipfs/"]
  );
  assert.deepEqual(buildIpfsGatewayCandidates("ipfs://bafy", "https://a.example,https://b.example"), [
    "https://a.example/ipfs/bafy",
    "https://b.example/ipfs/bafy",
  ]);
});
