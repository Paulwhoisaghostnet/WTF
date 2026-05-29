import test from "node:test";
import assert from "node:assert/strict";
import type { WtfosClient } from "@wtfos/sdk";
import { listRecordsTool, getRecordTool, WTFOS_MCP_TOOLS } from "../src/tools";

function fakeClient(overrides: Partial<WtfosClient>): WtfosClient {
  return overrides as unknown as WtfosClient;
}

test("wtfos_list_records returns serialized page content", async () => {
  const client = fakeClient({
    listRecords: async (filters) => {
      assert.equal(filters?.collection, "app.wtfos.social.board.post");
      return { records: [{ uri: "at://a/b/c", value: { text: "gm" } } as never], cursor: "5" };
    },
  });
  const result = await listRecordsTool.handler({ collection: "app.wtfos.social.board.post" }, client);
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /"cursor": "5"/);
});

test("wtfos_get_record reports not-found as an error result", async () => {
  const client = fakeClient({ getRecord: async () => null });
  const result = await getRecordTool.handler({ uri: "at://x/y/z" }, client);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /record not found/);
});

test("wtfos_get_record returns the record when present", async () => {
  const client = fakeClient({
    getRecord: async (uri) => ({ uri, value: { hi: true } } as never),
  });
  const result = await getRecordTool.handler({ uri: "at://x/y/z" }, client);
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /"hi": true/);
});

test("tool handlers convert thrown errors into error content", async () => {
  const client = fakeClient({
    listRecords: async () => {
      throw new Error("network down");
    },
  });
  const result = await listRecordsTool.handler({}, client);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /network down/);
});

test("registry exposes both tools with unique names", () => {
  const names = WTFOS_MCP_TOOLS.map((t) => t.name);
  assert.deepEqual([...names].sort(), ["wtfos_get_record", "wtfos_list_records"]);
});
