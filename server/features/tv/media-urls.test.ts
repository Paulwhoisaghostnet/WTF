import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMediaFetchCandidates,
  fetchWithRedirectGuard,
  normalizeExternalTvEmbedUrl,
  normalizeMediaUri,
  resolveTvPlayableMedia,
  TV_IPFS_GATEWAYS,
} from "./media-urls";

const IPFS_PATH = "bafybeigdyrztfixturecid/channel.gif";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

test("normalizeExternalTvEmbedUrl converts Odysee watch URLs to iframe embed URLs", () => {
  assert.equal(
    normalizeExternalTvEmbedUrl("https://odysee.com/@RogerRadio:f/LIVE:922"),
    "https://odysee.com/$/embed/@RogerRadio:f/LIVE:922"
  );
});

test("normalizeExternalTvEmbedUrl keeps safe Odysee embed URLs with query params", () => {
  assert.equal(
    normalizeExternalTvEmbedUrl(
      "https://odysee.com/$/embed/@RogerRadio:f/LIVE:922?autoplay=true"
    ),
    "https://odysee.com/$/embed/@RogerRadio:f/LIVE:922?autoplay=true"
  );
});

test("normalizeExternalTvEmbedUrl rejects non-Odysee and insecure iframe targets", () => {
  assert.equal(normalizeExternalTvEmbedUrl("http://odysee.com/@RogerRadio:f/LIVE:922"), null);
  assert.equal(
    normalizeExternalTvEmbedUrl("https://example.com/$/embed/@RogerRadio:f/LIVE:922"),
    null
  );
});

test("resolveTvPlayableMedia keeps external embeds direct and out of the media cache", () => {
  const resolved = resolveTvPlayableMedia(
    "https://odysee.com/$/embed/@RogerRadio:f/LIVE:922?autoplay=true",
    "text/html"
  );

  assert.equal(resolved.kind, "embed");
  assert.equal(
    resolved.sourceUri,
    "https://odysee.com/$/embed/@RogerRadio:f/LIVE:922?autoplay=true"
  );
  assert.equal(resolved.cacheUrl, resolved.sourceUri);
});

test("resolveTvPlayableMedia still routes normal video sources through the TV cache", () => {
  const resolved = resolveTvPlayableMedia("https://media.example/video.mp4", "video/mp4");

  assert.equal(resolved.kind, "video");
  assert.equal(resolved.sourceUri, "https://media.example/video.mp4");
  assert.equal(
    resolved.cacheUrl,
    "/api/tv/cache/media?url=https%3A%2F%2Fmedia.example%2Fvideo.mp4"
  );
});

test("buildMediaFetchCandidates retains each distinct allowlisted IPFS gateway URL", () => {
  assert.deepEqual(
    buildMediaFetchCandidates(`ipfs://${IPFS_PATH}`),
    TV_IPFS_GATEWAYS.map((gateway) => `${gateway}${IPFS_PATH}`)
  );
});

test("fetchWithRedirectGuard follows an allowlisted nftstorage redirect to dweb", async () => {
  const sourceUrl = `https://nftstorage.link/ipfs/${IPFS_PATH}`;
  const redirectUrl = `https://dweb.link/ipfs/${IPFS_PATH}`;
  const requestedUrls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    requestedUrls.push(url);
    assert.equal(init?.redirect, "manual");
    if (url === sourceUrl) {
      return new Response(null, {
        status: 302,
        headers: { location: redirectUrl },
      });
    }
    if (url === redirectUrl) {
      return new Response("gif", {
        status: 200,
        headers: { "content-type": "image/gif" },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  }) as typeof fetch;

  try {
    const response = await fetchWithRedirectGuard(sourceUrl);
    assert.equal(response.status, 200);
    assert.deepEqual(requestedUrls, [sourceUrl, redirectUrl]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWithRedirectGuard rejects unallowlisted and private redirect targets", async () => {
  const sourceUrl = `https://nftstorage.link/ipfs/${IPFS_PATH}`;
  const originalFetch = globalThis.fetch;
  let redirectUrl = `https://untrusted.example/ipfs/${IPFS_PATH}`;
  let requestedUrls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = requestUrl(input);
    requestedUrls.push(url);
    if (url !== sourceUrl) throw new Error(`Unexpected fetch URL: ${url}`);
    return new Response(null, {
      status: 302,
      headers: { location: redirectUrl },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchWithRedirectGuard(sourceUrl),
      /Redirect target is not allowed/
    );
    assert.deepEqual(requestedUrls, [sourceUrl]);

    redirectUrl = `http://127.0.0.1/ipfs/${IPFS_PATH}`;
    requestedUrls = [];
    await assert.rejects(
      () => fetchWithRedirectGuard(sourceUrl),
      /Redirect target is not allowed/
    );
    assert.deepEqual(requestedUrls, [sourceUrl]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("IPFS source and playable cache URLs remain canonicalized to the primary gateway", () => {
  const alternateGatewayUrl = `https://dweb.link/ipfs/${IPFS_PATH}`;
  const canonicalUrl = `${TV_IPFS_GATEWAYS[0]}${IPFS_PATH}`;

  assert.equal(normalizeMediaUri(alternateGatewayUrl), canonicalUrl);
  assert.deepEqual(resolveTvPlayableMedia(alternateGatewayUrl, "image/gif"), {
    sourceUri: canonicalUrl,
    cacheUrl: `/api/tv/cache/media?url=${encodeURIComponent(canonicalUrl)}`,
    kind: "gif",
  });
});
