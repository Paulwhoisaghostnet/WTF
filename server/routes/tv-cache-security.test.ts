import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";

async function listen(app: express.Express): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  const info = address as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${info.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  };
}

test("TV cache rejects arbitrary URLs while generic cache still serves allowlisted images", async (t) => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "wtf-tv-cache-test-"));
  t.after(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  process.env.TV_CACHE_DIR = cacheDir;
  delete process.env.TV_CACHE_ALLOWED_HOSTS;

  const { default: tvRoutes } = await import("./tv");
  const app = express();
  app.use(tvRoutes);
  const server = await listen(app);
  t.after(server.close);

  const response = await fetch(
    `${server.baseUrl}/api/tv/cache/media?url=${encodeURIComponent("https://example.com/")}`
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Unsupported media URL" });

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const target = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    if (target.startsWith(server.baseUrl)) {
      return realFetch(input as Parameters<typeof fetch>[0], init);
    }
    return new Response(Uint8Array.from([137, 80, 78, 71]), {
      headers: {
        "content-type": "image/png",
        "content-length": "4",
      },
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const imageUrl = "https://ipfs.io/ipfs/fake-image.png";
  const genericImageResponse = await realFetch(
    `${server.baseUrl}/api/cache/media?url=${encodeURIComponent(imageUrl)}`
  );
  assert.equal(genericImageResponse.status, 200);
  assert.equal(genericImageResponse.headers.get("content-type"), "image/png");
  assert.equal((await genericImageResponse.arrayBuffer()).byteLength, 4);

  const tvImageResponse = await realFetch(
    `${server.baseUrl}/api/tv/cache/media?url=${encodeURIComponent(imageUrl)}`
  );
  assert.equal(tvImageResponse.status, 415);
  assert.match(
    (await tvImageResponse.json()).error,
    /^Unsupported (cached|remote) media content type$/
  );
});
