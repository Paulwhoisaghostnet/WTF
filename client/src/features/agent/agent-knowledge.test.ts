import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answerAgentCompanionQuestionFromKnowledge,
  buildAgentExtensionCatalog,
  buildAgentKnowledgeBase,
  searchAgentKnowledgeBase,
} from "./agent-knowledge";
import { AGENT_EXTENSION_POINT_KEYS, AGENT_PROVIDER_IDS } from "./agent-model";

test("Agent knowledge base is built from live wtfOS registries", () => {
  const base = buildAgentKnowledgeBase();
  const ids = new Set(base.entries.map((entry) => entry.id));

  assert.equal(base.version, 1);
  assert(ids.has("route:/agent"));
  assert(ids.has("provider:openai"));
  assert(ids.has("filesystem:projects"));
  assert(ids.has("project-bundle:agent"));
  assert(ids.has("mcp:paired-token-boundary"));
  assert(ids.has("architecture:agent-platform"));
});

test("Agent knowledge search finds route, provider, and chain policy answers", () => {
  const base = buildAgentKnowledgeBase();

  assert.equal(searchAgentKnowledgeBase("/agent route", base)[0]?.id, "route:/agent");
  assert.equal(searchAgentKnowledgeBase("native ai workspace", base)[0]?.id, "admin:agent");
  assert.equal(searchAgentKnowledgeBase("ollama local inference", base)[0]?.id, "provider:ollama");
  assert.equal(searchAgentKnowledgeBase("tezos shadownet rpc", base)[0]?.id, "chain:tezos-rpc-policy");

  const answer = answerAgentCompanionQuestionFromKnowledge("How does MCP permission work?", base);
  assert.match(answer, /paired bearer tokens/);
  assert.match(answer, /scoped tool grants/);
});

test("Agent extension catalog covers every provider and extension point", () => {
  const catalog = buildAgentExtensionCatalog();
  const extensionPoints = new Set(catalog.extensionPoints);
  const manifests = new Map(catalog.manifests.map((manifest) => [manifest.id, manifest]));

  assert.deepEqual([...extensionPoints].sort(), [...AGENT_EXTENSION_POINT_KEYS].sort());

  for (const providerId of AGENT_PROVIDER_IDS) {
    const manifest = manifests.get(`provider.${providerId}`);
    assert(manifest, `${providerId} should be exposed as an Agent provider extension`);
    assert.equal(manifest.extensionPoint, "provider");
    assert.ok(manifest.permissions.includes("network"));
  }

  for (const point of AGENT_EXTENSION_POINT_KEYS) {
    assert(
      catalog.manifests.some((manifest) => manifest.extensionPoint === point),
      `${point} should have at least one manifest`
    );
  }
});
