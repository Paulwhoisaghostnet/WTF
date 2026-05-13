import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("W X integration surgery policy", () => {
  it("does not register personal DM sync or backfill jobs", () => {
    const syncSource = readFileSync("server/lib/x-dm-sync.ts", "utf8");

    assert.match(syncSource, /name: "x-dm-sync-groupchat"/);
    assert.doesNotMatch(syncSource, /name: "x-dm-sync-users"/);
    assert.doesNotMatch(syncSource, /name: "x-dm-backfill"/);
    assert.match(syncSource, /personal DM sync\/backfill disabled/);
  });

  it("keeps personal W DM routes disabled and groupchat sends explicit", () => {
    const routeSource = readFileSync("server/features/w/message-routes.ts", "utf8");

    for (const route of [
      `router.get("/api/w/user-dms"`,
      `router.get("/api/w/user-dms/:conversationId/messages"`,
      `router.post("/api/w/user-dms/:conversationId/messages"`,
      `router.post("/api/w/user-dms/direct"`,
      `router.post("/api/w/direct-messages"`,
    ]) {
      const start = routeSource.indexOf(route);
      assert.ok(start >= 0, `${route} route missing`);
      const bodyStart = routeSource.indexOf("{", start);
      const firstStatement = routeSource.slice(bodyStart, bodyStart + 120);
      assert.match(firstStatement, /return sendPersonalDmDisabled\(res\)/, `${route} is not fail-closed first`);
    }

    assert.match(routeSource, /router.post\("\/api\/w\/groupchat\/messages"/);
    assert.match(routeSource, /getUserXOAuth2AccessToken\(user, \["dm.write"\]\)/);
    assert.doesNotMatch(routeSource, /platformSent: true/);
  });

  it("removes legacy per-user timeline fanout from the timeline route", () => {
    const timelineRoute = readFileSync("server/features/w/timeline-routes.ts", "utf8");

    assert.doesNotMatch(timelineRoute, /USE_LEGACY_TIMELINE_FANOUT/);
    assert.doesNotMatch(timelineRoute, /\/users\/\$\{encodeURIComponent\(userId\)\}\/tweets/);
    assert.match(timelineRoute, /source: "filtered-stream-cache"/);
  });
});
