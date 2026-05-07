import assert from "node:assert/strict";
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
    console: true,
    "game-studio": true,
    studio: true,
    gallery: true,
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
