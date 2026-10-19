import assert from "node:assert/strict";
import { describe, it } from "node:test";
import express from "express";
import cors from "cors";
import { readFileSync } from "node:fs";

import {
  allowedOriginsForRuntime,
  corsOptionsFor,
  isArcadeSourceAssetPath,
  isPrivatePageFormHandoff,
  normalizeOrigin,
  shouldAllowNullOriginArcadeSource,
} from "./cors-origins";

describe("CORS origin resolution", () => {
  it("normalizes configured origins to their URL origin", () => {
    assert.equal(normalizeOrigin("https://collekt.wtfgameshow.app/wtf"), "https://collekt.wtfgameshow.app");
    assert.equal(normalizeOrigin("not a url"), null);
  });

  it("includes the standalone Skywire, gamma, beta, colleKT, and dues module origins plus legacy aliases", () => {
    const origins = allowedOriginsForRuntime({
      NODE_ENV: "production",
      PUBLIC_SITE_URL: "https://wtfgameshow.app",
      COLLEKT_MODULE_URL: "https://collekt.wtfos.app/wtf",
      DUES_MODULE_URL: "https://dues.wtfos.app",
      CORS_ALLOWED_ORIGINS: "https://extra.example/path",
    });

    assert.equal(origins.has("https://wtfos.app"), true);
    assert.equal(origins.has("https://operator.wtfos.app"), true);
    assert.equal(origins.has("https://skywire.wtfos.app"), true);
    assert.equal(origins.has("https://gamma.wtfos.app"), true);
    assert.equal(origins.has("https://beta.wtfos.app"), true);
    assert.equal(origins.has("https://wtfgameshow.app"), true);
    assert.equal(origins.has("https://collekt.wtfos.app"), true);
    assert.equal(origins.has("https://dues.wtfos.app"), true);
    assert.equal(origins.has("https://dues.wtfgameshow.app"), true);
    assert.equal(origins.has("https://extra.example"), true);
  });

  it("allows the local colleKT dev server without extra env", () => {
    const origins = allowedOriginsForRuntime({ NODE_ENV: "development" });

    assert.equal(origins.has("http://localhost:3001"), true);
    assert.equal(origins.has("http://127.0.0.1:3001"), true);
  });

  it("allows the active local dev server port", () => {
    const origins = allowedOriginsForRuntime({ NODE_ENV: "development", PORT: "3317" });

    assert.equal(origins.has("http://localhost:3317"), true);
    assert.equal(origins.has("http://127.0.0.1:3317"), true);
  });

  it("allows null-origin CORS only for public Arcade source assets", () => {
    assert.equal(
      isArcadeSourceAssetPath("/api/arcade/source/fUAedxk5ti23jSWH9S1IyoSr/v1/game.js"),
      true
    );
    assert.equal(
      isArcadeSourceAssetPath("/api/console/hackcade/fUAedxk5ti23jSWH9S1IyoSr/v1/game.js"),
      true
    );
    assert.equal(isArcadeSourceAssetPath("/api/auth/me"), false);
    assert.equal(
      shouldAllowNullOriginArcadeSource(
        "null",
        "/api/arcade/source/fUAedxk5ti23jSWH9S1IyoSr/v1/hackcade-sdk.js"
      ),
      true
    );
    assert.equal(shouldAllowNullOriginArcadeSource("null", "/api/auth/me"), false);
    assert.equal(
      shouldAllowNullOriginArcadeSource(
        "https://evil.example",
        "/api/arcade/source/fUAedxk5ti23jSWH9S1IyoSr/v1/game.js"
      ),
      false
    );
  });

  it("recognizes only opaque POST handoffs to a classified user-site host", () => {
    const handoff = { origin: "null", method: "POST", path: "/_private/access", host: "player.wtfos.me", networkDomain: "wtfos.me" };
    assert.equal(isPrivatePageFormHandoff(handoff), true);
    for (const change of [
      { origin: undefined }, { origin: "https://evil.example" }, { method: "GET" }, { method: "OPTIONS" },
      { path: "/api/auth/me" }, { path: "/_private/work" }, { path: "/_private/access/" },
      { host: "wtfos.app" }, { host: "wtfos.me" }, { host: "pds.wtfos.me" },
      { host: "player.wtfos.me.evil.example" }, { host: "nested.player.wtfos.me" },
      { networkDomain: "another.example" },
    ]) assert.equal(isPrivatePageFormHandoff({ ...handoff, ...change }), false, JSON.stringify(change));
    assert.equal(isPrivatePageFormHandoff({ ...handoff, host: "player.shows.example", networkDomain: "shows.example" }), true);
  });

  it("runs the app's CORS policy without exposing private handoffs to JavaScript or relaxing other routes", async () => {
    const app = express();
    app.use(cors(corsOptionsFor(new Set(["https://wtfos.app"]))));
    app.use((_req, res) => res.status(204).end());
    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      assert.match(error.message, /Origin not allowed by CORS/);
      res.status(403).end();
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    try {
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const request = (path: string, method = "POST", source = "null", host = "player.wtfos.me") => fetch(`${origin}${path}`, {
        method, headers: { Origin: source, "X-Forwarded-Host": host },
      });
      const accepted = await request("/_private/access");
      assert.equal(accepted.status, 204);
      assert.equal(accepted.headers.get("access-control-allow-origin"), null);
      assert.equal(accepted.headers.get("access-control-allow-credentials"), null);
      for (const [path, method, source, host] of [
        ["/api/auth/me", "POST", "null", "player.wtfos.me"],
        ["/_private/work", "POST", "null", "player.wtfos.me"],
        ["/_private/access", "GET", "null", "player.wtfos.me"],
        ["/_private/access", "OPTIONS", "null", "player.wtfos.me"],
        ["/_private/access", "POST", "null", "wtfos.app"],
        ["/_private/access", "POST", "null", "pds.wtfos.me"],
        ["/_private/access", "POST", "https://evil.example", "player.wtfos.me"],
      ]) assert.equal((await request(path, method, source, host)).status, 403, `${method} ${path} from ${source} at ${host}`);
      const platform = await request("/api/auth/me", "GET", "https://wtfos.app", "wtfos.app");
      assert.equal(platform.status, 204);
      assert.equal(platform.headers.get("access-control-allow-origin"), "https://wtfos.app");
      assert.equal(platform.headers.get("access-control-allow-credentials"), "true");
      const arcade = await request("/api/arcade/source/game/main.js", "GET");
      assert.equal(arcade.headers.get("access-control-allow-origin"), "*");
      assert.equal(arcade.headers.get("access-control-allow-credentials"), null);
      const macaroni = await request("/api/macaroni/reveal-request", "POST", "https://mint.example");
      assert.equal(macaroni.headers.get("access-control-allow-origin"), "https://mint.example");
      assert.equal(macaroni.headers.get("access-control-allow-credentials"), null);
      const source = readFileSync("server/app.ts", "utf8");
      assert.match(source, /corsOptionsFor,[\s\S]*from "\.\/lib\/cors-origins"/);
      assert.ok(source.indexOf("app.use(cors(corsOptionsFor(allowedOrigins)))") < source.indexOf("app.use(userSiteHostRouter)"));
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
