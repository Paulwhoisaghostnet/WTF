import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { z } from "zod";
import { MAX_ZIP_ENTRIES } from "../features/game-studio/packaging";
import {
  createMcpJsonParser, MCP_MAX_REQUEST_BODY_BYTES, MCP_MAX_TOOL_INPUT_ELEMENTS,
  McpPrimitiveRecordSchema, mcpBoundedArray, mcpBoundedRecord,
} from "./mcp-input-limits";

test("MCP collection limits reject before allocating per-entry validation errors", () => {
  let validatedEntries = 0;
  const item = z.preprocess((value) => { validatedEntries++; return value; }, z.string());
  const arrays = mcpBoundedArray(item, 100);
  assert.equal(arrays.parse(Array(100).fill("asset")).length, 100);
  validatedEntries = 0;
  const arrayResult = arrays.safeParse(Array(101).fill({ invalid: true }));
  assert.equal(arrayResult.success, false);
  if (!arrayResult.success) assert.equal(arrayResult.error.issues.length, 1);
  assert.equal(validatedEntries, 0);

  const files = mcpBoundedRecord(item, MAX_ZIP_ENTRIES);
  assert.equal(Object.keys(files.parse(Object.fromEntries(
    Array.from({ length: MAX_ZIP_ENTRIES }, (_, i) => [`${i}.js`, "export {}"]),
  ))).length, MAX_ZIP_ENTRIES);
  validatedEntries = 0;
  const recordResult = files.safeParse(Object.fromEntries(
    Array.from({ length: MAX_ZIP_ENTRIES + 1 }, (_, i) => [`${i}.js`, { invalid: true }]),
  ));
  assert.equal(recordResult.success, false);
  if (!recordResult.success) assert.equal(recordResult.error.issues.length, 1);
  assert.equal(validatedEntries, 0);
});

test("MCP primitive maps fail at the first invalid value and preserve valid maps", () => {
  const valid = { string: "value", number: 7, boolean: true };
  assert.deepEqual(McpPrimitiveRecordSchema.parse(valid), valid);
  const attack = Object.fromEntries(Array.from({ length: MAX_ZIP_ENTRIES }, (_, i) => [i, []]));
  const result = McpPrimitiveRecordSchema.safeParse(attack);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.issues.length, 1);
});

test("MCP byte ceiling runs before a broader global parser and preserves large scalar uploads", async (t) => {
  const app = express();
  app.use("/mcp", createMcpJsonParser());
  app.use(express.json({ limit: MCP_MAX_REQUEST_BODY_BYTES * 2 }));
  let dispatched = 0;
  app.post("/mcp", (req, res) => { dispatched++; res.json({ length: req.body.file.length }); });
  const http = app.listen(0, "127.0.0.1");
  await once(http, "listening");
  t.after(() => new Promise<void>((resolve) => http.close(() => resolve())));
  const address = http.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/mcp`;
  const overhead = Buffer.byteLength(JSON.stringify({ file: "" }));
  const file = "x".repeat(MCP_MAX_REQUEST_BODY_BYTES - overhead);
  const accepted = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file }) });
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { length: file.length });
  const rejected = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file: `${file}x` }) });
  assert.equal(rejected.status, 413);
  assert.match((await rejected.json() as { error: string }).error, /10 MiB/);
  assert.equal(dispatched, 1);
  assert.equal(MCP_MAX_TOOL_INPUT_ELEMENTS, MCP_MAX_REQUEST_BODY_BYTES / 2);
});
