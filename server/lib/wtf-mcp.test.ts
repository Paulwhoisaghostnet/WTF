import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_DESKTOP_APP_CONFIG } from "../../shared/desktop-apps";

process.env.DATABASE_URL ||= "postgresql://wtf:wtf@localhost:5432/wtf_test";

test("isMcpFeatureEnabled mirrors admin desktop app gates", async () => {
  const { isMcpFeatureEnabled } = await import("./wtf-mcp");

  const apps = {
    ...DEFAULT_DESKTOP_APP_CONFIG,
    wtfiam: true,
    wim: true,
    w: true,
    tv: false,
    dicksword: true,
    "i-hate-telegram": true,
    "dear-diary": true,
    arcade: true,
    console: true,
    "game-studio": true,
    studio: true,
    gallery: true,
    skywire: true,
    tz2at: true,
    "crp-nominations": true,
    "rat-race": true,
    "map-lab": true,
    mail: true,
    casino: true,
    "dues-manager": true,
  };

  assert.equal(isMcpFeatureEnabled(apps, "tv"), false);
  assert.equal(isMcpFeatureEnabled(apps, "gallery"), true);
  assert.equal(isMcpFeatureEnabled(apps, null), true);
});

test("hasMcpScope supports exact, domain wildcard, and global wildcard grants", async () => {
  const { hasMcpScope } = await import("./wtf-mcp");

  assert.equal(hasMcpScope(["game-studio:read"], "game-studio:read"), true);
  assert.equal(hasMcpScope(["game-studio:*"], "game-studio:write"), true);
  assert.equal(hasMcpScope(["*"], "console:write"), true);
  assert.equal(hasMcpScope(["console:read"], "console:write"), false);
});

test("MCP token scopes are capped to the paired user's account role", async () => {
  const { normalizeMcpScopes } = await import("./mcp-scope-policy");

  assert.deepEqual(
    normalizeMcpScopes(
      ["arcade:read", "arcade:admin", "arcade:*", "console:*", "*", "market:write", "map-lab:write", "crp-nominations:write"],
      "witness"
    ),
    ["arcade:read", "market:write", "map-lab:write", "crp-nominations:write"]
  );
  assert.deepEqual(normalizeMcpScopes(["arcade:admin", "*"], "admin"), [
    "arcade:admin",
    "*",
  ]);
  assert.deepEqual(normalizeMcpScopes(["arcade:admin"], "witness"), []);
  assert.ok(normalizeMcpScopes(undefined, "witness").includes("desktop:read"));
});

test("capability tool catalog stays in sync with registered MCP tools", async () => {
  const { WTF_MCP_TOOL_NAMES } = await import("./wtf-mcp");
  const source = await readFile(new URL("./wtf-mcp.ts", import.meta.url), "utf8");
  const crpSource = await readFile(
    new URL("../features/crp-nominations/mcp.ts", import.meta.url),
    "utf8"
  );
  const registeredToolNames = [
    ...Array.from(source.matchAll(/server\.registerTool\(\s*"([^"]+)"/g), (match) => match[1]),
    ...Array.from(crpSource.matchAll(/server\.registerTool\(\s*"([^"]+)"/g), (match) => match[1]),
  ];

  assert.deepEqual(
    [...new Set(WTF_MCP_TOOL_NAMES)],
    [...WTF_MCP_TOOL_NAMES],
    "advertised MCP tools should be unique"
  );
  assert.deepEqual(
    [...new Set(registeredToolNames)],
    registeredToolNames,
    "registered MCP tools should be unique"
  );
  assert.deepEqual(
    [...WTF_MCP_TOOL_NAMES],
    registeredToolNames,
    "capabilities should advertise exactly the registered WTF MCP tools"
  );
  assert.ok(WTF_MCP_TOOL_NAMES.includes("wtf_get_arcade_play_status"));
  assert.ok(WTF_MCP_TOOL_NAMES.includes("wtf_get_access_manifest"));
  assert.ok(WTF_MCP_TOOL_NAMES.includes("wtf_get_registered_inventory"));
  assert.ok(WTF_MCP_TOOL_NAMES.includes("wtf_create_map_lab_document"));
  assert.ok(WTF_MCP_TOOL_NAMES.includes("wtf_run_arcade_source_import"));
  assert.ok(WTF_MCP_TOOL_NAMES.includes("wtf_submit_game_studio_project_to_arcade"));
  assert.ok(WTF_MCP_TOOL_NAMES.includes("wtf_submit_crp_nomination"));
});

test("standard access manifest exposes browser, API, and MCP without cookie/bearer overlap", async () => {
  const { buildWtfAccessManifest } = await import("./wtf-access");

  const manifest = buildWtfAccessManifest({
    origin: "https://wtfos.app",
    mcpEndpoint: "https://wtfos.app/mcp",
    apps: {
      ...DEFAULT_DESKTOP_APP_CONFIG,
      wtfiam: true,
      wim: true,
      w: true,
      tv: true,
      dicksword: true,
      "i-hate-telegram": true,
      "dear-diary": true,
      arcade: false,
      console: true,
      "game-studio": true,
      studio: true,
      gallery: true,
      skywire: true,
      tz2at: true,
      "crp-nominations": true,
      "rat-race": true,
      "map-lab": true,
      mail: true,
      casino: true,
      "dues-manager": true,
    },
    now: new Date("2026-05-09T12:00:00.000Z"),
  });

  assert.equal(manifest.origin, "https://wtfos.app");
  assert.equal(manifest.mcp.endpoint, "https://wtfos.app/mcp");
  assert.ok(manifest.apiRoutes.some((route) => route.path === "/api/access"));
  assert.ok(manifest.browserRoutes.some((route) => route.path === "/command-palette"));
  assert.ok(manifest.browserRoutes.some((route) => route.path === "/notification-center"));
  assert.ok(manifest.browserRoutes.some((route) => route.path === "/theme-builder"));
  assert.ok(manifest.browserRoutes.some((route) => route.path === "/desktop-settings"));
  assert.ok(manifest.browserRoutes.some((route) => route.path === "/tools/broot"));
  assert.equal(
    manifest.browserRoutes.find((route) => route.path === "/tools/ch-ease")?.appGate,
    "ch-ease"
  );
  assert.equal(
    manifest.browserRoutes.find((route) => route.path === "/arcade")?.enabled,
    false
  );
  assert.ok(
    manifest.guarantees.some((entry) => entry.includes("connect.sid session cookie"))
  );
  assert.ok(
    manifest.guarantees.some((entry) => entry.includes("Authorization: Bearer wtf_mcp"))
  );
  assert.ok(
    manifest.guarantees.some((entry) => entry.includes("never sends Set-Cookie"))
  );
  assert.ok(
    manifest.guarantees.some((entry) => entry.includes("cap token scopes to the user's WTF account role"))
  );
});

test("MCP response guard suppresses Set-Cookie without blocking other headers", async () => {
  const { suppressMcpSetCookieHeader } = await import("../routes/mcp");
  const headers = new Map<string, unknown>();
  const res = {
    setHeader(name: string, value: unknown) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
  };

  suppressMcpSetCookieHeader(res as any);
  res.setHeader("Set-Cookie", "connect.sid=should-not-ship");
  res.setHeader("Content-Type", "application/json");

  assert.equal(headers.has("set-cookie"), false);
  assert.equal(headers.get("content-type"), "application/json");
});

test("selectKeepAliveActions chooses urgent bounded care actions", async () => {
  const { selectKeepAliveActions } = await import("./wtf-mcp");
  const { DEFAULT_HAMSTER_STATE } = await import("../../shared/desktop");

  assert.deepEqual(
    selectKeepAliveActions(
      {
        ...DEFAULT_HAMSTER_STATE,
        alive: true,
        hunger: 20,
        thirst: 30,
        hygiene: 20,
        happiness: 40,
        energy: 20,
      },
      3
    ),
    ["water", "feed", "scoop"]
  );

  assert.deepEqual(
    selectKeepAliveActions({ ...DEFAULT_HAMSTER_STATE, alive: false }, 5),
    ["revive"]
  );
});
