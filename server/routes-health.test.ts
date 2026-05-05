import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

test("disk health reports crit once cache usage reaches the configured budget", async (t) => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "wtf-health-cache-test-"));
  t.after(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  process.env.TV_CACHE_DIR = cacheDir;
  process.env.TV_CACHE_MAX_REMOTE_BYTES = String(20 * 1024 * 1024);
  process.env.TV_CACHE_MAX_TOTAL_BYTES = String(20 * 1024 * 1024);
  await writeFile(path.join(cacheDir, "sample.bin"), Buffer.alloc(20 * 1024 * 1024));

  const { registerRoutes } = await import("./routes");
  const app = express();
  registerRoutes(app);
  const server = await listen(app);
  t.after(server.close);

  const response = await fetch(`${server.baseUrl}/api/health/disk`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "crit", JSON.stringify(body));
  assert.equal(body.ok, false);
});
