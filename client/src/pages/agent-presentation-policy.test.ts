import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const agentSource = readFileSync(new URL("./Agent.tsx", import.meta.url), "utf8");

test("Agent workspace exposes Gamma presentation ownership without forking Agent logic", () => {
  assert.match(agentSource, /usePresentationShell/);
  assert.match(agentSource, /const presentation = usePresentationShell\(\)/);
  assert.match(agentSource, /data-agent-surface="workspace"/);
  assert.match(agentSource, /data-agent-presentation-host=\{presentation\.host\}/);
  assert.match(agentSource, /data-agent-provider=\{workspace\.activeProviderId\}/);
  assert.match(agentSource, /agentRegionAttrs\("surface"\)/);
  assert.match(agentSource, /data-agent-tab=\{tab\}/);
});

test("Agent marks the native workspace regions the Gamma harness measures", () => {
  for (const region of [
    "header",
    "agent-mark",
    "header-meta",
    "tabs",
    "tab",
    "status-cell",
    "status-label",
    "badge",
    "chat-bubble",
    "action-row",
    "file-button",
    "editor",
    "preview-pane",
    "diff-pane",
    "terminal-pane",
    "permission-row",
    "capability-option",
    "image-preview",
  ]) {
    assert.match(
      agentSource,
      new RegExp(`data-agent-region": "${region}"|data-agent-region="${region}"|agentRegionAttrs\\("${region}"\\)`),
      `missing Agent region marker: ${region}`
    );
  }
});

test("Agent Gamma chrome follows the presentation style budget", () => {
  assert.match(agentSource, /\[data-agent-presentation-host="gamma"\]/);
  assert.match(agentSource, /background:\s*#070706/);
  assert.match(agentSource, /background:\s*#11110f\s*!important/);
  assert.match(agentSource, /color:\s*#f2ead9/);
  assert.match(agentSource, /color:\s*#00d2ff/);
  assert.match(agentSource, /border-color:\s*#d6ff3f/);
  assert.match(agentSource, /background-image:\s*none\s*!important/);
  assert.match(agentSource, /box-shadow:\s*none\s*!important/);
  assert.match(agentSource, /text-shadow:\s*none\s*!important/);
  assert.match(agentSource, /border-radius:\s*6px\s*!important/);
  assert.match(agentSource, /border:\s*1px solid rgba\(242,\s*234,\s*217,\s*0\.16\)\s*!important/);
});

test("Agent keeps shared provider, filesystem, MCP, and local workspace behavior raw", () => {
  for (const preserved of [
    "wtfos.agent.workspace.v1",
    "wtfos.agent.credentials.session.v1",
    "/api/mcp/tokens",
    "sendAgentProviderMessage",
    "persistAgentProjectSnapshot",
    "readAgentProjectSnapshots",
    "saveAgentProjectSnapshot",
    "commitAgentGitChanges",
  ]) {
    assert.match(agentSource, new RegExp(preserved.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(agentSource, /\/api\/gamma/i, "Gamma must not introduce Agent-specific presentation APIs");
  assert.doesNotMatch(agentSource, /gamma\/api/i, "Gamma must not rewrite shared API paths");
  assert.doesNotMatch(
    agentSource,
    /presentation\.host\s*===\s*["']gamma["'].*sendAgentProviderMessage/s,
    "Gamma presentation must not fork provider execution"
  );
});
