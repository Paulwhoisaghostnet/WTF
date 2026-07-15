import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("W X integration surgery policy", () => {
  it("does not register personal DM sync or backfill jobs", () => {
    const syncSource = readFileSync("server/lib/x-dm-sync.ts", "utf8");

    assert.match(syncSource, /name: "x-dm-sync-groupchat"/);
    assert.doesNotMatch(syncSource, /name: "x-dm-sync-users"/);
    assert.doesNotMatch(syncSource, /name: "x-dm-backfill"/);
    assert.match(syncSource, /personal DM sync\/backfill disabled/);
  });

  it("keeps personal W DM routes disabled and groupchat writes fail-closed", () => {
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
    assert.match(routeSource, /W Gameshow groupchat is read-only/);
    assert.doesNotMatch(routeSource, /path: `\/dm_conversations\/\$\{encodeURIComponent\(conversationId\)\}\/messages`/);
    assert.doesNotMatch(routeSource, /platformSent: true/);
  });

  it("keeps the W client to a read-only Tezos digest", () => {
    const pageSource = readFileSync("client/src/pages/W.tsx", "utf8");
    const querySource = readFileSync("client/src/features/w/useWDataQueries.ts", "utf8");
    const messagesSource = readFileSync("client/src/features/w/messages/WMessagesPanel.tsx", "utf8");
    const timelineSource = readFileSync("client/src/features/w/timeline/WTimelinePanel.tsx", "utf8");

    assert.equal(existsSync("client/src/features/w/useWMutations.ts"), false);

    for (const source of [pageSource, querySource, messagesSource]) {
      assert.doesNotMatch(source, /userDms/i);
      assert.doesNotMatch(source, /userDm/i);
      assert.doesNotMatch(source, /directUserDm/i);
      assert.doesNotMatch(source, /\/api\/w\/user-dms/);
      assert.doesNotMatch(source, /\/api\/w\/post/);
      assert.doesNotMatch(source, /\/api\/w\/follows/);
      assert.doesNotMatch(source, /\/api\/w\/spaces/);
    }
    assert.match(pageSource, /label: "Tezos digest"/);
    assert.doesNotMatch(pageSource, /label: "Media"/);
    assert.doesNotMatch(pageSource, /label: "Gameshow Chat"/);
    assert.doesNotMatch(pageSource, /label: "Spaces"/);
    assert.doesNotMatch(pageSource, /label: "Settings"/);
    assert.doesNotMatch(timelineSource, /GroupBox label="New Post"/);
    assert.doesNotMatch(timelineSource, /Post in W/);
    assert.match(timelineSource, /twitter\.com\/intent\/retweet/);
    assert.match(timelineSource, /twitter\.com\/intent\/tweet/);
    assert.doesNotMatch(timelineSource, /\/api\/w\/\$\{action\}/);
    assert.doesNotMatch(messagesSource, /Send to this X groupchat/);
    assert.doesNotMatch(messagesSource, />Send<\/Button>/);
    assert.match(querySource, /enabled: Boolean\(capabilities\) && capabilities\?\.mode !== "digest"/);
  });

  it("registers only rate-limited timeline engagement routes, not compose/follow/social routes", () => {
    const wRouteSource = readFileSync("server/routes/w.ts", "utf8");
    const actionSource = readFileSync("server/features/w/action-routes.ts", "utf8");
    assert.match(wRouteSource, /registerWActionRoutes\(router,[\s\S]*group: "engagement"/);
    assert.match(actionSource, /W_TIMELINE_ACTION_MIN_INTERVAL_MS/);
    assert.match(actionSource, /assertTimelineActionRateLimit/);
    const socialRouteSource = readFileSync("server/features/w/social-routes.ts", "utf8");
    assert.match(socialRouteSource, /follower\/following lookup is disabled/);
    assert.match(socialRouteSource, /W Spaces lookup is disabled/);
  });

  it("removes legacy per-user timeline fanout from the timeline route", () => {
    const timelineRoute = readFileSync("server/features/w/timeline-routes.ts", "utf8");

    assert.doesNotMatch(timelineRoute, /USE_LEGACY_TIMELINE_FANOUT/);
    assert.doesNotMatch(timelineRoute, /\/users\/\$\{encodeURIComponent\(userId\)\}\/tweets/);
    assert.match(timelineRoute, /\? "filtered-stream-cache"/);
    assert.match(timelineRoute, /: "db-cache"/);
  });
});
