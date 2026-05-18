import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveWGroupchatConfigState } from "./groupchat-config";

const messageRoutesSource = readFileSync("server/features/w/message-routes.ts", "utf8");
const socialPanelSource = readFileSync("client/src/features/w/social/WSocialPanel.tsx", "utf8");

describe("W gameshow groupchat config source resolution", () => {
  it("prefers DB config by default and reports ignored env config", () => {
    const resolved = resolveWGroupchatConfigState({
      dbValue: '["g111"]',
      envValue: "g222",
      defaultValue: "g333",
    });

    assert.equal(resolved.mode, "db_preferred");
    assert.equal(resolved.source, "db");
    assert.deepEqual(resolved.conversationIds, ["g111"]);
    assert.equal(resolved.db.valid, true);
    assert.equal(resolved.env.valid, true);
    assert.match(resolved.warnings.join(","), /db_preferred_ignores_env_value/);
  });

  it("can explicitly let env override DB config", () => {
    const resolved = resolveWGroupchatConfigState({
      mode: "env_override",
      dbValue: "g111",
      envValue: "g222",
      defaultValue: "g333",
    });

    assert.equal(resolved.mode, "env_override");
    assert.equal(resolved.source, "env");
    assert.deepEqual(resolved.conversationIds, ["g222"]);
    assert.match(resolved.warnings.join(","), /env_override_ignores_db_value/);
  });

  it("reports default source instead of hiding missing DB/env state", () => {
    const resolved = resolveWGroupchatConfigState({
      dbValue: null,
      envValue: null,
      defaultValue: "g1934373363226407162",
    });

    assert.equal(resolved.source, "default");
    assert.deepEqual(resolved.conversationIds, ["g1934373363226407162"]);
    assert.equal(resolved.db.configured, false);
    assert.equal(resolved.env.configured, false);
  });

  it("can report explicitly unconfigured when DB, env, and default are absent", () => {
    const resolved = resolveWGroupchatConfigState({
      dbValue: "",
      envValue: "",
      defaultValue: "",
    });

    assert.equal(resolved.source, "unconfigured");
    assert.deepEqual(resolved.conversationIds, []);
    assert.equal(resolved.conversationId, null);
  });

  it("keeps invalid DB values visible without selecting them", () => {
    const resolved = resolveWGroupchatConfigState({
      dbValue: "not a dm conversation id",
      envValue: "g222",
      defaultValue: "g333",
    });

    assert.equal(resolved.source, "env");
    assert.equal(resolved.db.configured, true);
    assert.equal(resolved.db.valid, false);
    assert.match(resolved.warnings.join(","), /db_value_invalid/);
  });
});

describe("W gameshow groupchat config source surfaces", () => {
  it("surfaces source metadata in diagnostics, groupchat, and admin responses", () => {
    assert.match(messageRoutesSource, /groupchatConfig = await loadWGroupchatConfig\(\)/);
    assert.match(messageRoutesSource, /groupchatConfigSource: groupchatConfig\.source/);
    assert.match(messageRoutesSource, /groupchatConfig,/);
    assert.match(messageRoutesSource, /Active config source: \$\{groupchatConfig\.source\}/);
  });

  it("shows active config source warnings in the W admin UI", () => {
    assert.match(socialPanelSource, /groupchat source/);
    assert.match(socialPanelSource, /adminDmConversations\.config\.source/);
    assert.match(socialPanelSource, /adminDmConversations\.config\.warnings/);
  });
});
