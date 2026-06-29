import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGENT_PERMISSION_KEYS,
  AGENT_PROVIDER_ADAPTERS,
  AGENT_PROVIDER_IDS,
  addAgentCodeActions,
  addAgentPlanItem,
  addAgentWorkspaceFile,
  analyzeAgentWorkspace,
  agentMcpScopesForPermissions,
  applyAgentCodeAction,
  answerAgentCompanionQuestion,
  buildAgentMcpAccessPreview,
  buildAgentProviderCapabilityProfile,
  changedAgentFiles,
  commitAgentGitChanges,
  createAgentGitBranch,
  createDefaultAgentExtensionManifests,
  createDefaultAgentWorkspace,
  deleteAgentWorkspaceFile,
  detectAgentProviderCapabilities,
  dismissAgentCodeAction,
  extractAgentCodeSymbols,
  getAgentGitStatus,
  installAgentExtension,
  normalizeAgentWorkspaceFilePath,
  normalizeAgentWorkspace,
  parseAgentActionsFromText,
  removeAgentExtension,
  renameAgentWorkspaceFile,
  searchAgentWorkspaceFiles,
  setAgentProviderCapabilityOverrides,
  setAgentExtensionEnabled,
  stageAgentGitPaths,
  switchAgentGitBranch,
  summarizeAgentRepository,
  summarizeProviderConnection,
  unstageAgentGitPaths,
  updateAgentPlanItemStatus,
} from "./agent-model";

test("provider adapters cover every supported Agent provider without server proxy ownership", () => {
  const adapterIds = AGENT_PROVIDER_ADAPTERS.map((adapter) => adapter.id).sort();
  assert.deepEqual(adapterIds, [...AGENT_PROVIDER_IDS].sort());

  for (const adapter of AGENT_PROVIDER_ADAPTERS) {
    assert.equal(adapter.credentialOwner, "user", `${adapter.id} owns user credentials`);
    assert.equal(adapter.proxyPolicy, "never-proxied", `${adapter.id} must not proxy credentials through wtfOS`);
    assert.ok(adapter.capabilities.includes("chat"), `${adapter.id} should support chat`);
    assert.ok(adapter.authMethods.includes(adapter.defaultAuthMethod), `${adapter.id} default auth method is valid`);
  }
});

test("local provider endpoints add local inference and custom endpoint capabilities", () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const ollama = workspace.providers.ollama;
  const custom = {
    ...workspace.providers["openai-compatible"],
    endpoint: "http://localhost:8000/v1",
    model: "reasoning-local",
  };

  assert.ok(detectAgentProviderCapabilities(ollama).includes("local-inference"));
  assert.ok(detectAgentProviderCapabilities(custom).includes("custom-endpoints"));
  assert.ok(detectAgentProviderCapabilities(custom).includes("reasoning"));
  assert.match(summarizeProviderConnection(ollama), /Ollama/);
});

test("provider capability profiles can be reviewed, overridden, and reset", () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const openAiProfile = buildAgentProviderCapabilityProfile(workspace.providers.openai);
  assert.equal(openAiProfile.overrideActive, false);
  assert.equal(openAiProfile.items.find((item) => item.capability === "chat")?.enabled, true);
  assert.equal(openAiProfile.items.find((item) => item.capability === "chat")?.configurable, false);

  const narrowed = setAgentProviderCapabilityOverrides(
    workspace,
    "openai",
    ["code"],
    "2026-06-29T01:00:00.000Z"
  );
  const narrowedCapabilities = detectAgentProviderCapabilities(narrowed.providers.openai);
  assert.deepEqual(narrowed.providers.openai.capabilityOverrides, ["chat", "code"]);
  assert.ok(narrowedCapabilities.includes("chat"));
  assert.ok(narrowedCapabilities.includes("code"));
  assert.equal(narrowedCapabilities.includes("multimodal"), false);
  assert.equal(buildAgentProviderCapabilityProfile(narrowed.providers.openai).overrideActive, true);

  const custom = setAgentProviderCapabilityOverrides(
    {
      ...workspace,
      providers: {
        ...workspace.providers,
        "openai-compatible": {
          ...workspace.providers["openai-compatible"],
          endpoint: "https://models.example.test/v1",
        },
      },
    },
    "openai-compatible",
    ["multimodal", "artifacts", "not-real"],
    "2026-06-29T02:00:00.000Z"
  );
  assert.deepEqual(custom.providers["openai-compatible"].capabilityOverrides, [
    "chat",
    "multimodal",
    "artifacts",
  ]);

  const reset = setAgentProviderCapabilityOverrides(
    narrowed,
    "openai",
    null,
    "2026-06-29T03:00:00.000Z"
  );
  assert.equal(reset.providers.openai.capabilityOverrides, undefined);
  assert.equal(buildAgentProviderCapabilityProfile(reset.providers.openai).overrideActive, false);
});

test("Agent extension registry installs, toggles, and removes user manifests", () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const coreManifests = createDefaultAgentExtensionManifests();
  assert.equal(workspace.extensions.length, coreManifests.length);
  assert.ok(workspace.extensions.some((extension) => extension.id === "provider.openai" && extension.enabled));
  assert.ok(workspace.extensions.some((extension) => extension.extensionPoint === "knowledge-pack"));

  const installed = installAgentExtension(
    workspace,
    {
      id: "tool.Local Linter",
      label: "Local Linter",
      extensionPoint: "tool",
      version: "0.1.0",
      owner: "QA Team",
      description: "Runs local checks through visible execute grants.",
      permissions: ["read", "project", "execute", "not-real"],
      enabled: true,
      enabledByDefault: true,
      references: ["wtfos://Agent/Extensions/local-linter"],
    },
    "2026-06-29T01:00:00.000Z"
  );
  const userExtension = installed.extensions.find((extension) => extension.id === "tool.local-linter");
  assert.equal(userExtension?.source, "user");
  assert.equal(userExtension?.enabled, false);
  assert.deepEqual(userExtension?.permissions, ["read", "project", "execute"]);

  const enabled = setAgentExtensionEnabled(
    installed,
    "tool.local-linter",
    true,
    "2026-06-29T02:00:00.000Z"
  );
  assert.equal(enabled.extensions.find((extension) => extension.id === "tool.local-linter")?.enabled, true);

  const removed = removeAgentExtension(
    enabled,
    "tool.local-linter",
    "2026-06-29T03:00:00.000Z"
  );
  assert.equal(removed.extensions.some((extension) => extension.id === "tool.local-linter"), false);
  assert.throws(() => removeAgentExtension(workspace, "provider.openai"), /Core Agent extensions/);
  assert.throws(() => installAgentExtension(workspace, { id: "provider.openai", label: "Fake", extensionPoint: "provider" }), /already installed|Core/);
});

test("Agent permission categories normalize and derive scoped MCP grants", () => {
  assert.deepEqual(
    [...AGENT_PERMISSION_KEYS].sort(),
    [
      "application",
      "execute",
      "filesystem",
      "network",
      "persistent",
      "project",
      "read",
      "temporary",
      "terminal",
      "wallet",
      "write",
    ].sort()
  );

  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const scopes = agentMcpScopesForPermissions(workspace.permissions);
  assert.ok(scopes.includes("desktop:read"));
  assert.ok(scopes.includes("desktop:write"));
  assert.ok(scopes.includes("pet:read"));
  assert.ok(scopes.includes("pet:write"));
  assert.ok(scopes.includes("map-lab:write"));
  assert.ok(scopes.includes("crp-nominations:write"));
  assert.equal(scopes.includes("arcade:write"), false);
  assert.equal(scopes.includes("market:write"), false);

  const elevated = workspace.permissions.map((permission) =>
    permission.key === "wallet" || permission.key === "execute"
      ? { ...permission, enabled: true }
      : permission
  );
  const elevatedScopes = agentMcpScopesForPermissions(elevated);
  assert.ok(elevatedScopes.includes("market:write"));
  assert.ok(elevatedScopes.includes("arcade:write"));

  const fallbackScopes = agentMcpScopesForPermissions(undefined);
  assert.ok(fallbackScopes.includes("desktop:read"));
  assert.equal(fallbackScopes.includes("arcade:write"), false);
});

test("Agent MCP access preview explains allowed and blocked tools from visible grants", () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const preview = buildAgentMcpAccessPreview(workspace.permissions);

  assert.ok(preview.scopes.includes("desktop:read"));
  assert.ok(preview.resources.some((resource) => resource.id === "public-data"));
  assert.ok(preview.allowedTools.some((tool) => tool.name === "wtf_get_access_manifest"));
  assert.ok(preview.allowedTools.some((tool) => tool.name === "wtf_create_map_lab_document"));
  assert.ok(preview.blockedTools.some((tool) => tool.name === "wtf_create_arcade_play_intent"));
  assert.ok(preview.blockedTools.some((tool) => tool.name === "wtf_create_trusted_creator_market_item"));
  assert.ok(preview.warnings.some((warning) => warning.includes("Execute is off")));
  assert.ok(preview.warnings.some((warning) => warning.includes("Wallet is off")));

  const elevated = workspace.permissions.map((permission) =>
    permission.key === "wallet" || permission.key === "execute"
      ? { ...permission, enabled: true }
      : permission
  );
  const elevatedPreview = buildAgentMcpAccessPreview(elevated);
  assert.ok(elevatedPreview.allowedTools.some((tool) => tool.name === "wtf_create_arcade_play_intent"));
  assert.ok(elevatedPreview.allowedTools.some((tool) => tool.name === "wtf_create_trusted_creator_market_item"));
  assert.equal(
    elevatedPreview.blockedTools.some((tool) => tool.name === "wtf_create_arcade_play_intent"),
    false
  );

  const fallbackPreview = buildAgentMcpAccessPreview(undefined);
  assert.ok(fallbackPreview.allowedTools.some((tool) => tool.name === "wtf_get_access_manifest"));
  assert.ok(fallbackPreview.blockedTools.some((tool) => tool.name === "wtf_create_arcade_play_intent"));
});

test("workspace normalization keeps durable memory and rejects unknown provider ids", () => {
  const normalized = normalizeAgentWorkspace({
    activeProviderId: "not-real",
    memory: { goals: "ship Agent", notes: "keep secrets local" },
    files: [
      {
        path: "wtfos://Agent/Projects/demo/index.ts",
        language: "typescript",
        kind: "source",
        content: "export const ok = true;\n",
        baselineContent: "export const ok = false;\n",
      },
    ],
    selectedFilePath: "wtfos://Agent/Projects/demo/index.ts",
    messages: [{ id: "bad", role: "assistant", content: "x", providerId: "unknown" }],
    extensions: [
      {
        id: "knowledge.team-pack",
        label: "Team Pack",
        extensionPoint: "knowledge-pack",
        version: "0.2.0",
        owner: "Team",
        description: "Project-specific notes.",
        permissions: ["read", "persistent", "fake"],
        enabled: true,
        references: ["wtfos://Agent/Knowledge/team"],
      },
      {
        id: "broken",
        label: "Broken",
        extensionPoint: "not-real",
      },
    ],
  });

  assert.equal(normalized.activeProviderId, "openai");
  assert.equal(normalized.memory.goals, "ship Agent");
  assert.equal(normalized.memory.notes, "keep secrets local");
  assert.equal(normalized.selectedFilePath, "wtfos://Agent/Projects/demo/index.ts");
  assert.equal(normalized.messages[0].id, "system-welcome");
  assert.ok(normalized.plan.length > 0);
  assert.deepEqual(normalized.codeActions, []);
  assert.equal(normalized.git.currentBranch, "agent/native-workspace");
  assert.deepEqual(normalized.git.stagedPaths, []);
  assert.equal(changedAgentFiles(normalized).length, 1);
  assert.ok(normalized.extensions.some((extension) => extension.id === "provider.openai" && extension.source === "core"));
  assert.equal(normalized.extensions.find((extension) => extension.id === "knowledge.team-pack")?.enabled, true);
  assert.deepEqual(
    normalized.extensions.find((extension) => extension.id === "knowledge.team-pack")?.permissions,
    ["read", "persistent"]
  );
  assert.equal(normalized.extensions.some((extension) => extension.id === "broken"), false);

  const withMalformedActions = normalizeAgentWorkspace({
    ...normalized,
    codeActions: [
      {
        kind: "create-file",
        targetPath: "../outside.ts",
        content: "export const nope = true;\n",
      },
      {
        kind: "create-file",
        targetPath: "wtfos://Other/Project/outside.ts",
        content: "export const nope = true;\n",
      },
    ],
  });
  assert.deepEqual(withMalformedActions.codeActions, []);
});

test("companion knowledge answers wtfOS-specific agent questions", () => {
  assert.match(answerAgentCompanionQuestion("How does MCP permission work?"), /paired bearer tokens/);
  assert.match(answerAgentCompanionQuestion("Explain Tezos signing"), /Mainnet and Shadownet/);
  assert.match(answerAgentCompanionQuestion("Where do project files live?"), /wtfOS filesystem/);
});

test("Agent workspace file lifecycle keeps files inside the project namespace", () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  assert.equal(
    normalizeAgentWorkspaceFilePath(workspace, "src/new-tool.ts"),
    "wtfos://Agent/Projects/native-agent/src/new-tool.ts"
  );
  assert.throws(() => normalizeAgentWorkspaceFilePath(workspace, "../outside.ts"), /inside/);
  assert.throws(
    () => normalizeAgentWorkspaceFilePath(workspace, "wtfos://Other/Project/outside.ts"),
    /inside/
  );

  const added = addAgentWorkspaceFile(
    workspace,
    "src/new-tool.ts",
    "export const tool = true;\n",
    "2026-06-29T01:00:00.000Z"
  );
  assert.equal(added.selectedFilePath, "wtfos://Agent/Projects/native-agent/src/new-tool.ts");
  assert.equal(added.files.at(-1)?.language, "typescript");

  const renamed = renameAgentWorkspaceFile(
    added,
    "wtfos://Agent/Projects/native-agent/src/new-tool.ts",
    "src/agent-tool.ts",
    "2026-06-29T02:00:00.000Z"
  );
  assert.equal(renamed.selectedFilePath, "wtfos://Agent/Projects/native-agent/src/agent-tool.ts");
  assert.ok(renamed.files.some((file) => file.path.endsWith("/src/agent-tool.ts")));

  const deleted = deleteAgentWorkspaceFile(
    renamed,
    "wtfos://Agent/Projects/native-agent/src/agent-tool.ts",
    "2026-06-29T03:00:00.000Z"
  );
  assert.equal(deleted.files.length, workspace.files.length);
  assert.notEqual(deleted.selectedFilePath, "wtfos://Agent/Projects/native-agent/src/agent-tool.ts");
});

test("Agent workspace search and diagnostics understand repository content", () => {
  const workspace = addAgentWorkspaceFile(
    createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z"),
    "src/secret.test.ts",
    [
      "const apiKey = \"sk-test-secret-value\";",
      "export const expectation = \"MCP scopes stay visible\";",
    ].join("\n")
  );
  const matches = searchAgentWorkspaceFiles(workspace, "mcp scopes");
  assert.equal(matches[0].filePath, "wtfos://Agent/Projects/native-agent/src/secret.test.ts");
  assert.equal(matches[0].line, 2);

  const symbols = extractAgentCodeSymbols(workspace);
  assert.ok(
    symbols.some(
      (symbol) =>
        symbol.filePath.endsWith("/src/provider-adapter.ts") &&
        symbol.name === "ProviderAdapter" &&
        symbol.kind === "type"
    )
  );
  assert.ok(
    symbols.some(
      (symbol) =>
        symbol.filePath.endsWith("/README.md") &&
        symbol.name === "Agent" &&
        symbol.kind === "heading"
    )
  );
  assert.ok(
    symbols.some(
      (symbol) =>
        symbol.filePath.endsWith("/src/secret.test.ts") &&
        symbol.name === "apiKey" &&
        symbol.line === 1
    )
  );

  const diagnostics = analyzeAgentWorkspace(workspace);
  assert.ok(diagnostics.some((diagnostic) => diagnostic.rule === "possible-secret"));
  assert.equal(diagnostics.some((diagnostic) => diagnostic.rule === "missing-tests"), false);

  const summary = summarizeAgentRepository(workspace);
  assert.equal(summary.fileCount, workspace.files.length);
  assert.ok(summary.languageCounts.some((entry) => entry.language === "typescript"));
  assert.ok(summary.directories.includes("src"));
});

test("Agent native git stages, unstages, commits, and switches local branches", () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const changed = getAgentGitStatus(workspace);
  assert.ok(changed.length > 0);
  assert.equal(changed.some((status) => status.relativePath === "README.md"), true);

  const staged = stageAgentGitPaths(
    workspace,
    ["README.md"],
    "2026-06-29T01:00:00.000Z"
  );
  assert.deepEqual(staged.git.stagedPaths, ["wtfos://Agent/Projects/native-agent/README.md"]);
  assert.equal(getAgentGitStatus(staged).find((status) => status.relativePath === "README.md")?.staged, true);

  const unstaged = unstageAgentGitPaths(
    staged,
    ["README.md"],
    "2026-06-29T01:30:00.000Z"
  );
  assert.deepEqual(unstaged.git.stagedPaths, []);

  const restaged = stageAgentGitPaths(
    unstaged,
    ["README.md"],
    "2026-06-29T02:00:00.000Z"
  );
  const committed = commitAgentGitChanges(
    restaged,
    "Document Agent workspace",
    "2026-06-29T03:00:00.000Z"
  );
  assert.equal(committed.git.commits.length, 1);
  assert.equal(committed.git.commits[0].message, "Document Agent workspace");
  assert.deepEqual(committed.git.stagedPaths, []);
  assert.equal(
    getAgentGitStatus(committed).some((status) => status.relativePath === "README.md"),
    false
  );

  const branched = createAgentGitBranch(
    committed,
    "agent/git-panel",
    "2026-06-29T04:00:00.000Z"
  );
  assert.equal(branched.branch, "agent/git-panel");
  assert.equal(branched.git.currentBranch, "agent/git-panel");

  const switched = switchAgentGitBranch(
    branched,
    "agent/native-workspace",
    "2026-06-29T05:00:00.000Z"
  );
  assert.equal(switched.branch, "agent/native-workspace");
  assert.throws(() => switchAgentGitBranch(switched, "../bad"), /existing/);
});

test("Agent project plan persists and updates task statuses", () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const planned = addAgentPlanItem(
    workspace,
    "Wire action queue",
    "Review provider-proposed edits before applying them.",
    "2026-06-29T01:00:00.000Z"
  );
  const task = planned.plan.find((entry) => entry.title === "Wire action queue");
  assert.ok(task);
  assert.equal(task.status, "todo");

  const doing = updateAgentPlanItemStatus(
    planned,
    task.id,
    "doing",
    "2026-06-29T02:00:00.000Z"
  );
  assert.equal(doing.plan.find((entry) => entry.id === task.id)?.status, "doing");

  const normalized = normalizeAgentWorkspace({
    ...doing,
    plan: [
      ...doing.plan,
      { id: "bad", title: "", status: "not-real", createdAt: "nope" },
    ],
  });
  assert.equal(normalized.plan.some((entry) => entry.title === "Wire action queue"), true);
  assert.equal(normalized.plan.some((entry) => entry.id === "bad"), false);
});

test("Agent parses provider file blocks into reviewable code actions", () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const actions = parseAgentActionsFromText(
    workspace,
    [
      "Here are edits:",
      "```typescript file=src/provider-adapter.ts",
      "export const adapter = \"updated\";",
      "```",
      "```markdown file=docs/new-plan.md",
      "# Plan",
      "```",
      "```typescript file=../outside.ts",
      "export const nope = true;",
      "```",
    ].join("\n"),
    {
      sourceMessageId: "assistant-1",
      createdAt: "2026-06-29T01:00:00.000Z",
    }
  );

  assert.equal(actions.length, 2);
  assert.equal(actions[0].kind, "update-file");
  assert.equal(actions[0].targetPath, "wtfos://Agent/Projects/native-agent/src/provider-adapter.ts");
  assert.equal(actions[0].sourceMessageId, "assistant-1");
  assert.equal(actions[1].kind, "create-file");
  assert.equal(actions[1].targetPath, "wtfos://Agent/Projects/native-agent/docs/new-plan.md");
});

test("Agent parses structured actions and applies or dismisses them", () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const actions = parseAgentActionsFromText(
    workspace,
    [
      "```agent-action",
      JSON.stringify([
        {
          kind: "create-file",
          title: "Create review fixture",
          targetPath: "src/review-fixture.test.ts",
          content: "export const reviewed = true;\\n",
        },
        {
          kind: "run-command",
          title: "Run focused tests",
          command: "npm test",
        },
      ]),
      "```",
    ].join("\n"),
    { createdAt: "2026-06-29T01:00:00.000Z" }
  );
  assert.equal(actions.length, 2);

  const queued = addAgentCodeActions(workspace, actions, "2026-06-29T01:30:00.000Z");
  assert.equal(queued.codeActions.length, 2);

  const applied = applyAgentCodeAction(
    queued,
    queued.codeActions[0].id,
    "2026-06-29T02:00:00.000Z"
  );
  assert.equal(applied.codeActions[0].status, "applied");
  assert.ok(
    applied.files.some((file) => file.path === "wtfos://Agent/Projects/native-agent/src/review-fixture.test.ts")
  );

  const dismissed = dismissAgentCodeAction(
    applied,
    applied.codeActions[1].id,
    "2026-06-29T03:00:00.000Z"
  );
  assert.equal(dismissed.codeActions[1].status, "dismissed");
});
