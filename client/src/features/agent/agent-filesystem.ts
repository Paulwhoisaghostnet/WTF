import {
  AGENT_PROVIDER_IDS,
  createDefaultAgentWorkspace,
  getAgentProviderAdapter,
  normalizeAgentWorkspace,
  type AgentMemory,
  type AgentPermissionGrant,
  type AgentProviderConnection,
  type AgentProviderId,
  type AgentWorkspaceFile,
  type AgentWorkspaceState,
  type AgentChatMessage,
  type AgentPlanItem,
  type AgentCodeAction,
  type AgentGitState,
} from "./agent-model";

export const AGENT_FILESYSTEM_STORAGE_KEY = "wtfos.agent.filesystem.projects.v1";
export const AGENT_FILESYSTEM_ROOT = "WTF/Projects/Agent";
export const AGENT_PROJECT_SNAPSHOT_VERSION = 1;

export type AgentFilesystemStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type AgentProjectSnapshot = {
  version: 1;
  source: "wtfos-agent";
  id: string;
  name: string;
  filesystemPath: `${typeof AGENT_FILESYSTEM_ROOT}/${string}`;
  projectPath: string;
  branch: string;
  activeProviderId: AgentProviderId;
  providers: Record<AgentProviderId, AgentProviderConnection>;
  permissions: AgentPermissionGrant[];
  memory: AgentMemory;
  files: AgentWorkspaceFile[];
  selectedFilePath: string;
  companionEnabled: boolean;
  messages: AgentChatMessage[];
  plan: AgentPlanItem[];
  codeActions: AgentCodeAction[];
  git: AgentGitState;
  createdAt: string;
  updatedAt: string;
};

export type AgentFilesystemStore = {
  version: 1;
  rootPath: typeof AGENT_FILESYSTEM_ROOT;
  snapshots: AgentProjectSnapshot[];
  updatedAt: string;
};

export type AgentFilesystemStats = {
  snapshotCount: number;
  fileCount: number;
  messageCount: number;
  contentBytes: number;
  latestUpdatedAt: string | null;
};

function browserStorage(): AgentFilesystemStorage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function storageOrNull(storage?: AgentFilesystemStorage | null) {
  return storage ?? browserStorage();
}

function timestamp(value?: string) {
  return value && Number.isFinite(Date.parse(value)) ? value : new Date().toISOString();
}

function slugify(value: string) {
  const slug = value
    .replace(/^wtfos:\/\/Agent\/Projects\//, "")
    .replace(/^WTF\/Projects\/Agent\//, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || "agent-project";
}

function nameFromProjectPath(projectPath: string) {
  const clean = projectPath.replace(/\/+$/, "");
  return clean.split("/").at(-1) || "Agent project";
}

function isLocalEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return /(^|\.)localhost(?::|\/|$)|127\.0\.0\.1|0\.0\.0\.0|::1/.test(endpoint);
  }
}

function sanitizeProviderConnection(
  connection: AgentProviderConnection
): AgentProviderConnection {
  const adapter = getAgentProviderAdapter(connection.providerId);
  const localRuntime =
    adapter.localRuntime ||
    connection.authMethod === "local-endpoint" ||
    isLocalEndpoint(connection.endpoint);

  return {
    ...connection,
    connected: localRuntime,
    credentialPresent: localRuntime,
  };
}

function sanitizeProviders(
  providers: AgentWorkspaceState["providers"]
): AgentProjectSnapshot["providers"] {
  return Object.fromEntries(
    AGENT_PROVIDER_IDS.map((providerId) => [
      providerId,
      sanitizeProviderConnection(providers[providerId]),
    ])
  ) as AgentProjectSnapshot["providers"];
}

function sanitizeSnapshot(snapshot: AgentProjectSnapshot): AgentProjectSnapshot {
  const normalized = normalizeAgentWorkspace({
    version: 1,
    activeProviderId: snapshot.activeProviderId,
    providers: snapshot.providers,
    permissions: snapshot.permissions,
    memory: snapshot.memory,
    files: snapshot.files,
    selectedFilePath: snapshot.selectedFilePath,
    projectPath: snapshot.projectPath,
    branch: snapshot.branch,
    companionEnabled: snapshot.companionEnabled,
    messages: snapshot.messages,
    plan: snapshot.plan,
    codeActions: snapshot.codeActions,
    git: snapshot.git,
    updatedAt: snapshot.updatedAt,
  });
  const updatedAt = timestamp(snapshot.updatedAt);
  const id = slugify(snapshot.id || normalized.projectPath);

  return {
    version: 1,
    source: "wtfos-agent",
    id,
    name: snapshot.name?.trim() || nameFromProjectPath(normalized.projectPath),
    filesystemPath: `${AGENT_FILESYSTEM_ROOT}/${id}` as AgentProjectSnapshot["filesystemPath"],
    projectPath: normalized.projectPath,
    branch: normalized.branch,
    activeProviderId: normalized.activeProviderId,
    providers: sanitizeProviders(normalized.providers),
    permissions: normalized.permissions,
    memory: normalized.memory,
    files: normalized.files,
    selectedFilePath: normalized.selectedFilePath,
    companionEnabled: normalized.companionEnabled,
    messages: normalized.messages,
    plan: normalized.plan,
    codeActions: normalized.codeActions,
    git: normalized.git,
    createdAt: timestamp(snapshot.createdAt) || updatedAt,
    updatedAt,
  };
}

function normalizeStore(value: unknown): AgentFilesystemStore {
  const fallback: AgentFilesystemStore = {
    version: 1,
    rootPath: AGENT_FILESYSTEM_ROOT,
    snapshots: [],
    updatedAt: new Date().toISOString(),
  };
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<AgentFilesystemStore>;
  const snapshots = Array.isArray(raw.snapshots)
    ? raw.snapshots
        .filter((snapshot): snapshot is AgentProjectSnapshot =>
          Boolean(snapshot && typeof snapshot === "object")
        )
        .map(sanitizeSnapshot)
    : [];

  return {
    version: 1,
    rootPath: AGENT_FILESYSTEM_ROOT,
    snapshots,
    updatedAt: timestamp(raw.updatedAt),
  };
}

function parseStorePayload(payload: string | null): AgentFilesystemStore {
  if (!payload) return normalizeStore(null);
  try {
    return normalizeStore(JSON.parse(payload));
  } catch {
    return normalizeStore(null);
  }
}

export function readAgentProjectSnapshots(
  storage?: AgentFilesystemStorage | null
): AgentProjectSnapshot[] {
  const resolved = storageOrNull(storage);
  if (!resolved) return [];
  return parseStorePayload(resolved.getItem(AGENT_FILESYSTEM_STORAGE_KEY)).snapshots;
}

export function writeAgentProjectSnapshots(
  snapshots: AgentProjectSnapshot[],
  options: { storage?: AgentFilesystemStorage | null; updatedAt?: string } = {}
): AgentFilesystemStore {
  const store: AgentFilesystemStore = {
    version: 1,
    rootPath: AGENT_FILESYSTEM_ROOT,
    snapshots: snapshots.map(sanitizeSnapshot),
    updatedAt: timestamp(options.updatedAt),
  };
  const resolved = storageOrNull(options.storage);
  if (resolved) {
    resolved.setItem(AGENT_FILESYSTEM_STORAGE_KEY, JSON.stringify(store));
  }
  return store;
}

export function createAgentProjectSnapshot(
  workspaceValue: AgentWorkspaceState | unknown,
  options: { id?: string; name?: string; createdAt?: string; updatedAt?: string } = {}
): AgentProjectSnapshot {
  const workspace = normalizeAgentWorkspace(workspaceValue);
  const updatedAt = timestamp(options.updatedAt ?? workspace.updatedAt);
  const id = slugify(options.id ?? workspace.projectPath);

  return sanitizeSnapshot({
    version: 1,
    source: "wtfos-agent",
    id,
    name: options.name?.trim() || nameFromProjectPath(workspace.projectPath),
    filesystemPath: `${AGENT_FILESYSTEM_ROOT}/${id}` as AgentProjectSnapshot["filesystemPath"],
    projectPath: workspace.projectPath,
    branch: workspace.branch,
    activeProviderId: workspace.activeProviderId,
    providers: workspace.providers,
    permissions: workspace.permissions,
    memory: workspace.memory,
    files: workspace.files,
    selectedFilePath: workspace.selectedFilePath,
    companionEnabled: workspace.companionEnabled,
    messages: workspace.messages,
    plan: workspace.plan,
    codeActions: workspace.codeActions,
    git: workspace.git,
    createdAt: timestamp(options.createdAt ?? updatedAt),
    updatedAt,
  });
}

export function saveAgentProjectSnapshot(
  workspace: AgentWorkspaceState,
  options: {
    storage?: AgentFilesystemStorage | null;
    id?: string;
    name?: string;
    updatedAt?: string;
  } = {}
): AgentProjectSnapshot {
  const existing = readAgentProjectSnapshots(options.storage);
  const snapshot = createAgentProjectSnapshot(workspace, {
    id: options.id,
    name: options.name,
    createdAt: existing.find((entry) => entry.id === slugify(options.id ?? workspace.projectPath))?.createdAt,
    updatedAt: options.updatedAt,
  });
  const next = [
    snapshot,
    ...existing.filter((entry) => entry.id !== snapshot.id),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  writeAgentProjectSnapshots(next, {
    storage: options.storage,
    updatedAt: snapshot.updatedAt,
  });
  return snapshot;
}

export function persistAgentProjectSnapshot(
  snapshotValue: AgentProjectSnapshot | unknown,
  options: { storage?: AgentFilesystemStorage | null; updatedAt?: string } = {}
): AgentProjectSnapshot {
  const snapshot = sanitizeSnapshot({
    ...(snapshotValue as AgentProjectSnapshot),
    updatedAt: options.updatedAt ?? (snapshotValue as AgentProjectSnapshot)?.updatedAt,
  });
  const existing = readAgentProjectSnapshots(options.storage);
  const next = [
    snapshot,
    ...existing.filter((entry) => entry.id !== snapshot.id),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  writeAgentProjectSnapshots(next, {
    storage: options.storage,
    updatedAt: timestamp(options.updatedAt ?? snapshot.updatedAt),
  });
  return snapshot;
}

export function restoreAgentProjectSnapshot(
  snapshotValue: AgentProjectSnapshot | unknown,
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  const snapshot = sanitizeSnapshot(snapshotValue as AgentProjectSnapshot);
  return normalizeAgentWorkspace({
    version: 1,
    activeProviderId: snapshot.activeProviderId,
    providers: snapshot.providers,
    permissions: snapshot.permissions,
    memory: snapshot.memory,
    files: snapshot.files,
    selectedFilePath: snapshot.selectedFilePath,
    projectPath: snapshot.projectPath,
    branch: snapshot.branch,
    companionEnabled: snapshot.companionEnabled,
    messages: snapshot.messages,
    plan: snapshot.plan,
    codeActions: snapshot.codeActions,
    git: snapshot.git,
    updatedAt,
  });
}

export function exportAgentProjectSnapshot(snapshot: AgentProjectSnapshot): string {
  return JSON.stringify(sanitizeSnapshot(snapshot), null, 2);
}

export function importAgentProjectSnapshot(serialized: string | unknown): AgentProjectSnapshot {
  const parsed =
    typeof serialized === "string"
      ? JSON.parse(serialized)
      : serialized;
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as AgentFilesystemStore).snapshots)) {
    const first = (parsed as AgentFilesystemStore).snapshots[0];
    if (!first) return createAgentProjectSnapshot(createDefaultAgentWorkspace());
    return sanitizeSnapshot(first);
  }
  return sanitizeSnapshot(parsed as AgentProjectSnapshot);
}

export function agentFilesystemStats(
  snapshots: AgentProjectSnapshot[] = readAgentProjectSnapshots()
): AgentFilesystemStats {
  const sanitized = snapshots.map(sanitizeSnapshot);
  return {
    snapshotCount: sanitized.length,
    fileCount: sanitized.reduce((sum, snapshot) => sum + snapshot.files.length, 0),
    messageCount: sanitized.reduce((sum, snapshot) => sum + snapshot.messages.length, 0),
    contentBytes: sanitized.reduce(
      (sum, snapshot) =>
        sum +
        snapshot.files.reduce(
          (fileSum, file) => fileSum + file.content.length + file.baselineContent.length,
          0
        ),
      0
    ),
    latestUpdatedAt: sanitized.map((snapshot) => snapshot.updatedAt).sort().at(-1) ?? null,
  };
}
