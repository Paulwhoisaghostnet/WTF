import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const routesRegistry = readFileSync("server/routes.ts", "utf8");
const pageRegistry = readFileSync("client/src/routes/page-defs.ts", "utf8");

describe("WTF ecosystem wiring", () => {
  it("mounts every phase route module used by the client and bot", () => {
    const expectedRoutes = [
      "attendanceRoutes",
      "calendarRoutes",
      "collectionFactoryRoutes",
      "mintPortalRoutes",
      "operatorWalletRoutes",
      "accessRoutes",
    ];

    for (const route of expectedRoutes) {
      assert.match(routesRegistry, new RegExp(`app\\.use\\(${route}\\)`));
    }
  });

  it("registers desktop pages for mounted feature routes", () => {
    const expectedPages = [
      "/calendar",
      "/mint-portal",
      "/contract-factory",
      "/operator-wallet",
      "/control-board",
    ];

    for (const page of expectedPages) {
      assert.match(pageRegistry, new RegExp(`pattern: "${page}"`));
    }
  });

  it("keeps the Control Board page backed by its server contracts", () => {
    const controlBoardRoutes = readFileSync("server/routes/control-board.ts", "utf8");
    const schema = readFileSync("shared/schema-gameshow.ts", "utf8");

    const expectedServerRoutes = [
      "/api/control-board/feed",
      "/api/seasons/:id/contestants",
      "/api/contestants/:id/eliminate",
      "/api/contestants/:id/promote-from-reserve",
      "/api/rounds/:id/run-rule",
      "/api/rounds/:id/advance",
      "/api/rounds/:id/elimination-rule",
    ];

    for (const route of expectedServerRoutes) {
      assert.match(controlBoardRoutes, new RegExp(route.replaceAll("/", "\\/")));
    }
    assert.match(schema, /export const roundEliminations = pgTable\(\s*"round_eliminations"/);
  });

  it("keeps desktop UI interactions connected to challenge event ingestion and server event logging", () => {
    const desktopShell = readFileSync("client/src/components/layout/Desktop.tsx", "utf8");
    const desktopSettings = readFileSync("client/src/pages/DesktopSettings.tsx", "utf8");
    const desktopItemActors = readFileSync(
      "client/src/features/desktop/items/ItemActors.tsx",
      "utf8"
    );
    const desktopRoutes = readFileSync("server/routes/desktop.ts", "utf8");

    assert.match(desktopRoutes, /router\.post\("\/api\/desktop\/events"/);
    assert.match(desktopRoutes, /ingestSystemEvent/);
    assert.match(desktopRoutes, /logSystemEvent/);
    assert.match(desktopShell, /handleDesktopIconOpen/);
    assert.match(desktopShell, /onInteract=\{handleDesktopItemInteract\}/);
    assert.match(desktopShell, /desktop\.icon\.moved/);
    assert.match(desktopShell, /desktop\.tool\.selected/);
    assert.match(desktopSettings, /desktop\.icon_layout\.reset/);
    assert.match(desktopItemActors, /onInteract\?\.\(item, "jukebox_open"\)/);
    assert.match(desktopItemActors, /portal_gun_equip/);
  });

  it("keeps profile identity mutations connected to normalized social events", () => {
    const profileRoutes = readFileSync("server/routes/profile.ts", "utf8");

    assert.match(profileRoutes, /function emitProfileEvent/);
    assert.match(profileRoutes, /eventType: "profile\.updated"/);
    assert.match(profileRoutes, /eventType: "profile\.social\.unlinked"/);
    assert.match(profileRoutes, /eventType: "profile\.public_visibility\.updated"/);
    assert.match(profileRoutes, /rawRefType: "user"/);
  });

  it("keeps public profile discovery connected to normalized social events", () => {
    const profileRoutes = readFileSync("server/routes/profile.ts", "utf8");

    assert.match(profileRoutes, /function emitPublicProfileEvent/);
    assert.match(profileRoutes, /eventType: "profile\.public\.viewed"/);
    assert.match(profileRoutes, /eventType: "profile\.dm_lookup\.opened"/);
    assert.match(profileRoutes, /sourceModule: "public-profile"/);
  });

  it("keeps notifications connected to normalized social events", () => {
    const notificationRoutes = readFileSync("server/routes/notifications.ts", "utf8");
    const messagesPage = readFileSync("client/src/pages/Messages.tsx", "utf8");

    for (const eventType of [
      "notification.viewed",
      "notification.opened",
      "notification.read",
      "notification.read_all",
      "notification.preference.updated",
    ]) {
      assert.match(notificationRoutes, new RegExp(`eventType: "${eventType.replaceAll(".", "\\.")}"`));
    }
    assert.match(messagesPage, /\/api\/notifications\/\$\{item\.id\}\/opened/);
  });

  it("keeps W timeline and DM mutations connected to normalized social events", () => {
    const wActionRoutes = readFileSync("server/features/w/action-routes.ts", "utf8");
    const wMessageRoutes = readFileSync("server/features/w/message-routes.ts", "utf8");

    for (const eventType of [
      "w.post.created",
      "w.media.uploaded",
      "w.reply.created",
      "w.like.created",
      "w.repost.created",
      "w.quote.created",
    ]) {
      assert.match(wActionRoutes, new RegExp(`eventType: "${eventType.replaceAll(".", "\\.")}"`));
    }
    assert.match(wMessageRoutes, /eventType: "dm\.message\.sent"/);
    assert.match(wActionRoutes, /requireOwnedWMediaIds/);
    assert.match(wMessageRoutes, /requireOwnedWMediaId/);
  });

  it("keeps W social settings connected to normalized social events", () => {
    const wSocialRoutes = readFileSync("server/features/w/social-routes.ts", "utf8");
    const wMessageRoutes = readFileSync("server/features/w/message-routes.ts", "utf8");

    for (const eventType of [
      "w.follow.created",
      "w.spaces.viewed",
      "w.capabilities.viewed",
    ]) {
      assert.match(wSocialRoutes, new RegExp(`eventType: "${eventType.replaceAll(".", "\\.")}"`));
    }
    assert.match(wMessageRoutes, /eventType: "w\.diagnostics\.viewed"/);
  });

  it("keeps W chats and DMs connected to normalized social events", () => {
    const wMessageRoutes = readFileSync("server/features/w/message-routes.ts", "utf8");

    for (const eventType of [
      "w.groupchat.viewed",
      "w.groupchat.message_sent",
      "w.admin.stream_rule.updated",
    ]) {
      assert.match(wMessageRoutes, new RegExp(`eventType: "${eventType.replaceAll(".", "\\.")}"`));
    }
    assert.match(wMessageRoutes, /policy: "w_groupchat_only"/);
    assert.match(wMessageRoutes, /router\.get\("\/api\/w\/user-dms"/);
    assert.match(wMessageRoutes, /router\.post\("\/api\/w\/direct-messages"/);
  });

  it("keeps message board moderation and webhook actions connected to normalized social events", () => {
    const boardRoutes = readFileSync("server/routes/board.ts", "utf8");

    for (const eventType of [
      "board.message.edited",
      "board.message.deleted",
      "board.message.pinned",
      "board.webhook_received",
    ]) {
      assert.match(boardRoutes, new RegExp(`eventType: "${eventType.replaceAll(".", "\\.")}"`));
    }
  });

  it("keeps leaderboard views connected to normalized social events", () => {
    const leaderboardRoutes = readFileSync("server/routes/leaderboard.ts", "utf8");

    assert.match(leaderboardRoutes, /function emitLeaderboardViewed/);
    assert.match(leaderboardRoutes, /eventType: "leaderboard\.viewed"/);
    assert.match(leaderboardRoutes, /eventType: "leaderboard\.xp\.viewed"/);
    assert.match(leaderboardRoutes, /eventType: "leaderboard\.transfers\.viewed"/);
  });

  it("classifies critical disk usage before warning disk usage", () => {
    assert.match(
      routesRegistry,
      /const status = usage >= 1\.0\s+\? "crit"\s+: usage >= 0\.9\s+\? "warn"/
    );
  });

  it("mounts the public standard access manifest before paired MCP token APIs", () => {
    const accessRoutes = readFileSync("server/routes/access.ts", "utf8");
    assert.match(accessRoutes, /router\.get\("\/api\/access"/);
    assert.match(accessRoutes, /buildWtfAccessManifest/);
    assert.match(routesRegistry, /app\.use\(accessRoutes\);[\s\S]*app\.use\(mcpRoutes\);/);
  });

  it("keeps MCP bearer access isolated from browser session cookies", () => {
    const mcpRoutes = readFileSync("server/routes/mcp.ts", "utf8");
    const mcpAuth = readFileSync("server/lib/mcp-agent-auth.ts", "utf8");
    const mcpHandler = mcpRoutes.slice(mcpRoutes.indexOf('router.all("/mcp"'));

    assert.match(mcpHandler, /suppressMcpSetCookieHeader\(res\)/);
    assert.match(mcpHandler, /authenticateMcpBearer\(req\.headers\.authorization\)/);
    assert.match(mcpHandler, /browser session cookies are not accepted on \/mcp/i);
    assert.match(mcpHandler, /mcp\.browser_session_ignored/);
    assert.doesNotMatch(mcpHandler, /req\.login|req\.logIn|req\.logout|passport\.authenticate/);
    assert.doesNotMatch(mcpHandler, /isAuthenticated/);
    assert.doesNotMatch(mcpHandler, /setHeader\(["']Set-Cookie["']/);
    assert.match(mcpRoutes, /normalizeMcpScopes\(req\.body\?\.scopes,\s*user\.role\)/);
    assert.match(mcpAuth, /normalizeMcpScopes\(row\.scopes,\s*row\.role\)/);
  });
});
