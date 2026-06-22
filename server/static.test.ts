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

test("static discovery routes return metadata instead of SPA HTML", async (t) => {
  const previousPublicSiteUrl = process.env.PUBLIC_SITE_URL;
  process.env.PUBLIC_SITE_URL = "https://www.wtfgameshow.app";
  t.after(() => {
    if (previousPublicSiteUrl === undefined) {
      delete process.env.PUBLIC_SITE_URL;
    } else {
      process.env.PUBLIC_SITE_URL = previousPublicSiteUrl;
    }
  });

  const app = express();
  serveStatic(app);
  const server = await listen(app);
  t.after(server.close);

  const robots = await fetch(server.baseUrl + "/robots.txt");
  assert.equal(robots.status, 200);
  assert.equal(robots.headers.get("content-type")?.startsWith("text/plain"), true);
  const robotsBody = await robots.text();
  assert.match(robotsBody, /^User-agent: \*/m);
  assert.match(robotsBody, /Sitemap: https:\/\/wtfos\.app\/sitemap\.xml/);
  assert.doesNotMatch(robotsBody, /<!DOCTYPE html>/i);

  const sitemap = await fetch(server.baseUrl + "/sitemap.xml");
  assert.equal(sitemap.status, 200);
  assert.equal(sitemap.headers.get("content-type")?.startsWith("application/xml"), true);
  const sitemapBody = await sitemap.text();
  assert.match(sitemapBody, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(sitemapBody, /<loc>https:\/\/wtfos\.app\/<\/loc>/);
  assert.doesNotMatch(sitemapBody, /<!DOCTYPE html>/i);

  const manifest = await fetch(server.baseUrl + "/manifest.json");
  assert.equal(manifest.status, 200);
  assert.equal(manifest.headers.get("content-type")?.startsWith("application/manifest+json"), true);
  const manifestBody = await manifest.text();
  assert.doesNotMatch(manifestBody, /<!DOCTYPE html>/i);
  const parsed = JSON.parse(manifestBody) as { name: string; short_name: string; start_url: string; display: string };
  assert.equal(parsed.name, "WTF OS");
  assert.equal(parsed.short_name, "wtfOS");
  assert.equal(parsed.start_url, "/");
  assert.equal(parsed.display, "standalone");
});
