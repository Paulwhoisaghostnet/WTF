import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allowedOriginsForRuntime,
  isArcadeSourceAssetPath,
  normalizeOrigin,
  shouldAllowNullOriginArcadeSource,
} from "./cors-origins";

describe("CORS origin resolution", () => {
  it("normalizes configured origins to their URL origin", () => {
    assert.equal(normalizeOrigin("https://collekt.wtfgameshow.app/wtf"), "https://collekt.wtfgameshow.app");
    assert.equal(normalizeOrigin("not a url"), null);
  });

  it("includes the standalone colleKT and dues module origins", () => {
    const origins = allowedOriginsForRuntime({
      NODE_ENV: "production",
      PUBLIC_SITE_URL: "https://wtfgameshow.app",
      COLLEKT_MODULE_URL: "https://collekt.wtfgameshow.app/wtf",
      DUES_MODULE_URL: "https://dues.wtfgameshow.app",
      CORS_ALLOWED_ORIGINS: "https://extra.example/path",
    });

    assert.equal(origins.has("https://wtfgameshow.app"), true);
    assert.equal(origins.has("https://collekt.wtfgameshow.app"), true);
    assert.equal(origins.has("https://dues.wtfgameshow.app"), true);
    assert.equal(origins.has("https://extra.example"), true);
  });

  it("allows the local colleKT dev server without extra env", () => {
    const origins = allowedOriginsForRuntime({ NODE_ENV: "development" });

    assert.equal(origins.has("http://localhost:3001"), true);
    assert.equal(origins.has("http://127.0.0.1:3001"), true);
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
});
