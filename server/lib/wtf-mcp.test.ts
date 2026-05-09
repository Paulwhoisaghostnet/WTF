import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://wtf:wtf@localhost:5432/wtf_test";

test("isMcpFeatureEnabled mirrors admin desktop app gates", async () => {
  const { isMcpFeatureEnabled } = await import("./wtf-mcp");

  const apps = {
    wtfiam: true,
    hoard: true,
    w: true,
    tv: false,
    dicksword: true,
    arcade: true,
    console: true,
    "game-studio": true,
    studio: true,
    gallery: true,
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

test("capability tool catalog stays in sync with registered MCP tools", async () => {
  const { WTF_MCP_TOOL_NAMES } = await import("./wtf-mcp");
  const source = await readFile(new URL("./wtf-mcp.ts", import.meta.url), "utf8");
  const registeredToolNames = Array.from(
    source.matchAll(/server\.registerTool\(\s*"([^"]+)"/g),
    (match) => match[1]
  );

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
  assert.ok(WTF_MCP_TOOL_NAMES.includes("wtf_run_arcade_source_import"));
  assert.ok(WTF_MCP_TOOL_NAMES.includes("wtf_submit_game_studio_project_to_arcade"));
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
