import assert from "node:assert/strict";
import test from "node:test";
import { TeiaService } from "../PP/src/features/tezos/teiaService.ts";

test("Particle Painter forwards only the supplied credential and redacts upstream errors", async () => {
  const service = new TeiaService();
  const originalFetch = globalThis.fetch;
  const userCredential = "user-owned-pinata-test-credential";
  let fetchCalls = 0;
  let authorization = "";

  try {
    globalThis.fetch = (async (_input, init) => {
      fetchCalls += 1;
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      return new Response(JSON.stringify({ IpfsHash: "QmParticlePainterTestCid" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await assert.rejects(
      service.uploadToIPFS(new Blob(["art"]), "art.gif", "  "),
      /Enter your own Pinata JWT/,
    );
    assert.equal(fetchCalls, 0);

    const result = await service.uploadToIPFS(
      new Blob(["art"]),
      "art.gif",
      `  ${userCredential}  `,
    );
    assert.equal(fetchCalls, 1);
    assert.equal(authorization, `Bearer ${userCredential}`);
    assert.equal(result.ipfsUri, "ipfs://QmParticlePainterTestCid");

    globalThis.fetch = (async () =>
      new Response(`upstream detail containing ${userCredential}`, { status: 403 })) as typeof fetch;

    await assert.rejects(
      service.uploadToIPFS(new Blob(["art"]), "art.gif", userCredential),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /HTTP 403/);
        assert.equal(error.message.includes(userCredential), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
