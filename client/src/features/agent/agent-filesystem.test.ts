import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGENT_FILESYSTEM_ROOT,
  AGENT_FILESYSTEM_STORAGE_KEY,
  agentFilesystemStats,
  createAgentProjectSnapshot,
  exportAgentProjectSnapshot,
  importAgentProjectSnapshot,
  persistAgentProjectSnapshot,
  readAgentProjectSnapshots,
  restoreAgentProjectSnapshot,
  saveAgentProjectSnapshot,
} from "./agent-filesystem";
import {
  addAgentCodeActions,
  addAgentPlanItem,
  commitAgentGitChanges,
  createDefaultAgentWorkspace,
  parseAgentActionsFromText,
  stageAgentGitPaths,
} from "./agent-model";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("Agent filesystem snapshots persist project files under the wtfOS namespace", () => {
  const storage = new MemoryStorage();
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const snapshot = saveAgentProjectSnapshot(workspace, {
    storage,
    updatedAt: "2026-06-29T01:00:00.000Z",
  });

  assert.equal(snapshot.source, "wtfos-agent");
  assert.equal(snapshot.filesystemPath, `${AGENT_FILESYSTEM_ROOT}/native-agent`);
  assert.equal(snapshot.projectPath, "wtfos://Agent/Projects/native-agent");
  assert.equal(snapshot.files.length, workspace.files.length);

  const rawStore = storage.getItem(AGENT_FILESYSTEM_STORAGE_KEY);
  assert.ok(rawStore);

  const snapshots = readAgentProjectSnapshots(storage);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].id, "native-agent");
});

test("Agent filesystem restore rebuilds a normalized workspace without remote credential readiness", () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const connectedWorkspace = {
    ...workspace,
    providers: {
      ...workspace.providers,
      openai: {
        ...workspace.providers.openai,
        connected: true,
        credentialPresent: true,
      },
      ollama: {
        ...workspace.providers.ollama,
        connected: true,
        credentialPresent: true,
      },
    },
  };

  const snapshot = createAgentProjectSnapshot(connectedWorkspace, {
    updatedAt: "2026-06-29T01:00:00.000Z",
  });
  const restored = restoreAgentProjectSnapshot(snapshot, "2026-06-29T02:00:00.000Z");

  assert.equal(restored.providers.openai.connected, false);
  assert.equal(restored.providers.openai.credentialPresent, false);
  assert.equal(restored.providers.ollama.connected, true);
  assert.equal(restored.providers.ollama.credentialPresent, true);
  assert.equal(restored.projectPath, workspace.projectPath);
  assert.equal(restored.updatedAt, "2026-06-29T02:00:00.000Z");
});

test("Agent filesystem export and import roundtrip rejects unknown provider ids", () => {
  const storage = new MemoryStorage();
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const snapshot = saveAgentProjectSnapshot(workspace, { storage });
  const exported = exportAgentProjectSnapshot(snapshot);
  const tampered = exported.replace('"activeProviderId": "openai"', '"activeProviderId": "not-real"');
  const imported = importAgentProjectSnapshot(tampered);
  const persisted = persistAgentProjectSnapshot(imported, { storage });

  assert.equal(imported.activeProviderId, "openai");
  assert.equal(persisted.id, "native-agent");
  assert.equal(readAgentProjectSnapshots(storage).length, 1);
});

test("Agent filesystem artifacts do not serialize accidental secret fields", () => {
  const snapshot = importAgentProjectSnapshot({
    version: 1,
    source: "wtfos-agent",
    id: "secret-demo",
    name: "secret demo",
    filesystemPath: `${AGENT_FILESYSTEM_ROOT}/secret-demo`,
    projectPath: "wtfos://Agent/Projects/secret-demo",
    branch: "agent/secret-demo",
    activeProviderId: "openai",
    providers: {
      openai: {
        providerId: "openai",
        authMethod: "api-key",
        endpoint: "https://api.openai.com/v1",
        model: "gpt-4.1",
        connected: true,
        credentialPresent: true,
        updatedAt: "2026-06-29T00:00:00.000Z",
        secret: "sk-should-not-survive",
      },
    },
    permissions: [],
    memory: { goals: "keep it clean" },
    files: [
      {
        path: "wtfos://Agent/Projects/secret-demo/index.ts",
        language: "typescript",
        kind: "source",
        content: "export const ok = true;\n",
        baselineContent: "export const ok = true;\n",
      },
    ],
    selectedFilePath: "wtfos://Agent/Projects/secret-demo/index.ts",
    companionEnabled: true,
    messages: [
      {
        id: "msg-1",
        role: "user",
        content: "hello",
        providerId: "openai",
        createdAt: "2026-06-29T00:00:00.000Z",
      },
    ],
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
  });
  const exported = exportAgentProjectSnapshot(snapshot);

  assert.doesNotMatch(exported, /sk-should-not-survive/);
  assert.doesNotMatch(exported, /"secret"/);
  assert.equal(snapshot.providers.openai.credentialPresent, false);
});

test("Agent filesystem stats summarize saved project snapshots", () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const snapshot = createAgentProjectSnapshot(workspace);
  const stats = agentFilesystemStats([snapshot]);

  assert.equal(stats.snapshotCount, 1);
  assert.equal(stats.fileCount, workspace.files.length);
  assert.equal(stats.messageCount, workspace.messages.length);
  assert.ok(stats.contentBytes > 0);
  assert.ok(stats.latestUpdatedAt);
});

test("Agent filesystem snapshots preserve project plans and reviewable actions", () => {
  const storage = new MemoryStorage();
  const base = addAgentPlanItem(
    createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z"),
    "Review generated edits",
    "Apply only after inspecting the diff.",
    "2026-06-29T00:30:00.000Z"
  );
  const actions = parseAgentActionsFromText(
    base,
    [
      "```typescript file=src/generated.test.ts",
      "export const generated = true;",
      "```",
    ].join("\n"),
    { createdAt: "2026-06-29T01:00:00.000Z" }
  );
  const workspace = addAgentCodeActions(base, actions, "2026-06-29T01:05:00.000Z");

  const snapshot = saveAgentProjectSnapshot(workspace, { storage });
  const restored = restoreAgentProjectSnapshot(snapshot, "2026-06-29T02:00:00.000Z");

  assert.equal(restored.plan.some((entry) => entry.title === "Review generated edits"), true);
  assert.equal(restored.codeActions.length, 1);
  assert.equal(restored.codeActions[0].status, "proposed");
  assert.equal(restored.codeActions[0].targetPath, "wtfos://Agent/Projects/native-agent/src/generated.test.ts");
});

test("Agent filesystem snapshots preserve native git branches and commits", () => {
  const storage = new MemoryStorage();
  const base = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const staged = stageAgentGitPaths(
    base,
    ["README.md"],
    "2026-06-29T01:00:00.000Z"
  );
  const committed = commitAgentGitChanges(
    staged,
    "Commit Agent README",
    "2026-06-29T02:00:00.000Z"
  );

  const snapshot = saveAgentProjectSnapshot(committed, { storage });
  const restored = restoreAgentProjectSnapshot(snapshot, "2026-06-29T03:00:00.000Z");

  assert.equal(restored.git.currentBranch, "agent/native-workspace");
  assert.equal(restored.git.commits.length, 1);
  assert.equal(restored.git.commits[0].message, "Commit Agent README");
  assert.deepEqual(restored.git.stagedPaths, []);
});
