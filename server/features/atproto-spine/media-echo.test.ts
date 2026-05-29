import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMediaEchoRecord,
  mediaGatewayBaseUrl,
  mediaGatewayUrlForCid,
  isAllowedMediaKey,
} from "./media-echo";

test("buildMediaEchoRecord embeds storage coordinates and core fields", () => {
  const echo = buildMediaEchoRecord({
    cid: "bafkreiexample",
    mimeType: "image/png",
    key: "media/2026/post-7.png",
    size: 1024,
    alt: "a cat",
    storage: { provider: "s3", bucket: "wtfos-media", key: "media/2026/post-7.png", region: "fsn1" },
  });
  assert.equal(echo.cid, "bafkreiexample");
  assert.equal(echo.mimeType, "image/png");
  assert.equal(echo.storage.bucket, "wtfos-media");
  assert.equal(echo.storage.key, "media/2026/post-7.png");
  assert.equal(echo.alt, "a cat");
});

test("buildMediaEchoRecord rejects traversal/scheme keys (public-media guard)", () => {
  assert.throws(
    () =>
      buildMediaEchoRecord({
        cid: "bafkrei1",
        mimeType: "image/png",
        key: "../secret.png",
        storage: { provider: "s3", bucket: "x", key: "../secret.png" },
      }),
    /not an allowed public media key/,
  );
});

test("buildMediaEchoRecord enforces the configured public media prefix (no private echo)", () => {
  const prefixEnv = { WTFOS_MEDIA_KEY_PREFIX: "media/" } as NodeJS.ProcessEnv;
  assert.throws(
    () =>
      buildMediaEchoRecord(
        {
          cid: "bafkrei2",
          mimeType: "image/png",
          key: "private/dm-attachment.png",
          storage: { provider: "s3", bucket: "x", key: "private/dm-attachment.png" },
        },
        prefixEnv,
      ),
    /not an allowed public media key/,
  );
  const ok = buildMediaEchoRecord(
    {
      cid: "bafkrei3",
      mimeType: "image/png",
      key: "media/ok.png",
      storage: { provider: "s3", bucket: "x", key: "media/ok.png" },
    },
    prefixEnv,
  );
  assert.equal(ok.cid, "bafkrei3");
});

test("media gateway URLs derive from the network domain or explicit override", () => {
  assert.equal(mediaGatewayBaseUrl({ WTFOS_ATPROTO_NETWORK_DOMAIN: "wtfos.me" } as NodeJS.ProcessEnv), "https://media.wtfos.me");
  assert.equal(
    mediaGatewayBaseUrl({ WTFOS_MEDIA_GATEWAY_URL: "https://cdn.example.net/" } as NodeJS.ProcessEnv),
    "https://cdn.example.net",
  );
  assert.equal(
    mediaGatewayUrlForCid("bafkrei123", { WTFOS_ATPROTO_NETWORK_DOMAIN: "wtfos.me" } as NodeJS.ProcessEnv),
    "https://media.wtfos.me/blob/bafkrei123",
  );
});

test("isAllowedMediaKey blocks traversal, schemes, and prefix violations", () => {
  assert.equal(isAllowedMediaKey("media/2026/post.png"), true);
  assert.equal(isAllowedMediaKey("/etc/passwd"), false);
  assert.equal(isAllowedMediaKey("../secret"), false);
  assert.equal(isAllowedMediaKey("a/../../b"), false);
  assert.equal(isAllowedMediaKey("https://evil.com/x"), false);
  assert.equal(isAllowedMediaKey(""), false);
  assert.equal(
    isAllowedMediaKey("other/x.png", { WTFOS_MEDIA_KEY_PREFIX: "media/" } as NodeJS.ProcessEnv),
    false,
  );
  assert.equal(
    isAllowedMediaKey("media/x.png", { WTFOS_MEDIA_KEY_PREFIX: "media/" } as NodeJS.ProcessEnv),
    true,
  );
});
