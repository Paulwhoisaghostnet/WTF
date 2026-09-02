import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveWGroupchatConfigState,
  validateWGroupchatConversationSelection,
  W_GROUPCHAT_MAX_CONVERSATIONS,
} from "./groupchat-config";

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
      dbValue: '["g111"]',
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

  it("requires DB values to use the bounded JSON-array schema", () => {
    const legacyString = resolveWGroupchatConfigState({
      dbValue: "g111,g222",
      envValue: "g333",
    });
    const oversized = resolveWGroupchatConfigState({
      dbValue: JSON.stringify(
        Array.from({ length: W_GROUPCHAT_MAX_CONVERSATIONS + 1 }, (_, index) => `g${index}`)
      ),
      envValue: "g333",
    });

    assert.equal(legacyString.db.valid, false);
    assert.equal(legacyString.source, "env");
    assert.equal(oversized.db.valid, false);
    assert.equal(oversized.source, "env");
  });

  it("rejects malformed and over-limit admin selections without truncating", () => {
    assert.deepEqual(validateWGroupchatConversationSelection(["g111", "g111", "g222"]), {
      ok: true,
      conversationIds: ["g111", "g222"],
    });
    assert.equal(validateWGroupchatConversationSelection(["g111", 222]).ok, false);
    assert.equal(validateWGroupchatConversationSelection(["g111", "not valid"]).ok, false);
    assert.equal(
      validateWGroupchatConversationSelection(
        Array.from({ length: W_GROUPCHAT_MAX_CONVERSATIONS + 1 }, (_, index) => `g${index}`)
      ).ok,
      false
    );
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

  it("supports optimistic locking on admin platform_settings writes", () => {
    assert.match(messageRoutesSource, /expectedUpdatedAt: req\.body\?\.expectedUpdatedAt/);
    assert.match(messageRoutesSource, /PlatformSettingConflictError/);
    assert.match(messageRoutesSource, /status\(409\)/);
    assert.match(messageRoutesSource, /manifestUpdatedAt/);
    assert.match(socialPanelSource, /expectedUpdatedAt: adminStreamRules\?\.manifestUpdatedAt/);
  });

  it("validates and bounds the groupchat selection before upstream lookups and persistence", () => {
    const validationIndex = messageRoutesSource.indexOf(
      "validateWGroupchatConversationSelection(requestedIds)"
    );
    const lookupIndex = messageRoutesSource.indexOf("fetchDmConversationSummary", validationIndex);
    const writeIndex = messageRoutesSource.indexOf("upsertPlatformSetting", validationIndex);

    assert.notEqual(validationIndex, -1);
    assert.ok(validationIndex < lookupIndex);
    assert.ok(validationIndex < writeIndex);
    assert.match(messageRoutesSource, /PlatformSettingValidationError/);
  });
});
