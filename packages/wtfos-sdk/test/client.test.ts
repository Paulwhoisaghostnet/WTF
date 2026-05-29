import test from "node:test";
import assert from "node:assert/strict";
import { WtfosClient, WtfosError } from "../src/index";

function mockFetch(handler: (url: URL) => { status: number; body: unknown }): typeof fetch {
  return (async (input: URL | string) => {
    const url = new URL(String(input));
    const { status, body } = handler(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

test("listRecords builds the query string and returns typed records", async () => {
  const client = new WtfosClient({
    baseUrl: "https://api.wtfos.app/",
    fetchImpl: mockFetch((url) => {
      assert.equal(url.pathname, "/api/atproto/appview/records");
      assert.equal(url.searchParams.get("collection"), "app.wtfos.social.board.post");
      assert.equal(url.searchParams.get("limit"), "10");
      return {
        status: 200,
        body: { records: [{ uri: "at://did:plc:a/c/r", value: { text: "gm" } }], cursor: "5" },
      };
    }),
  });
  const page = await client.listRecords({ collection: "app.wtfos.social.board.post", limit: 10 });
  assert.equal(page.records.length, 1);
  assert.equal(page.cursor, "5");
});

test("getRecord returns null on 404 and throws on other errors", async () => {
  const notFound = new WtfosClient({
    baseUrl: "https://api.wtfos.app",
    fetchImpl: mockFetch(() => ({ status: 404, body: { error: "record_not_found" } })),
  });
  assert.equal(await notFound.getRecord("at://x/y/z"), null);

  const boom = new WtfosClient({
    baseUrl: "https://api.wtfos.app",
    fetchImpl: mockFetch(() => ({ status: 500, body: {} })),
  });
  await assert.rejects(() => boom.getRecord("at://x/y/z"), WtfosError);
});

test("iterateRecords follows cursors until exhausted", async () => {
  let calls = 0;
  const client = new WtfosClient({
    baseUrl: "https://api.wtfos.app",
    fetchImpl: mockFetch((url) => {
      calls += 1;
      const cursor = url.searchParams.get("cursor");
      if (!cursor) return { status: 200, body: { records: [{ uri: "a" }], cursor: "1" } };
      return { status: 200, body: { records: [{ uri: "b" }] } };
    }),
  });
  const uris: string[] = [];
  for await (const r of client.iterateRecords()) uris.push(r.uri);
  assert.deepEqual(uris, ["a", "b"]);
  assert.equal(calls, 2);
});

test("bearer token is attached when provided", async () => {
  const client = new WtfosClient({
    baseUrl: "https://api.wtfos.app",
    token: "secret",
    fetchImpl: (async (_url: URL | string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>)?.authorization;
      assert.equal(auth, "Bearer secret");
      return { ok: true, status: 200, json: async () => ({ records: [] }) } as Response;
    }) as unknown as typeof fetch,
  });
  await client.listRecords();
});
