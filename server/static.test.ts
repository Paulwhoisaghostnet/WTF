import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { serveStatic } from "./static";

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

test("static fallback does not turn missing API routes into SPA HTML", async (t) => {
  const app = express();
  serveStatic(app);
  const server = await listen(app);
  t.after(server.close);

  const response = await fetch(`${server.baseUrl}/api/definitely-not-a-route`);

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("content-type")?.startsWith("application/json"), true);
  assert.deepEqual(await response.json(), { error: "API route not found" });
});
