export const AGENT_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "google",
  "openrouter",
  "ollama",
  "lm-studio",
  "openai-compatible",
] as const;

export type AgentProviderId = (typeof AGENT_PROVIDER_IDS)[number];

export type AgentAuthMethod =
  | "api-key"
  | "oauth"
  | "enterprise-login"
  | "local-endpoint"
  | "endpoint-api-key";

export const AGENT_CAPABILITY_KEYS = [
  "chat",
  "code",
  "reasoning",
  "multimodal",
  "artifacts",
  "tools",
  "local-inference",
  "embeddings",
  "custom-endpoints",
] as const;

export type AgentCapability = (typeof AGENT_CAPABILITY_KEYS)[number];

export const AGENT_CAPABILITY_DETAILS: Record<
  AgentCapability,
  { label: string; description: string }
> = {
  chat: {
    label: "Chat",
    description: "Natural conversation and instruction following inside the Agent workspace.",
  },
  code: {
    label: "Code",
    description: "Coding, refactoring, debugging, and repository explanation workflows.",
  },
  reasoning: {
    label: "Reasoning",
    description: "Deliberate planning, multi-step analysis, and hard problem decomposition.",
  },
  multimodal: {
    label: "Multimodal",
    description: "Image or mixed-media inputs and outputs when the provider supports them.",
  },
  artifacts: {
    label: "Artifacts",
    description: "Structured files, previews, or generated objects surfaced alongside chat.",
  },
  tools: {
    label: "Tools",
    description: "Provider-native tool calls that still pass through visible wtfOS permissions.",
  },
  "local-inference": {
    label: "Local Inference",
    description: "Models running on the user's machine through Ollama, LM Studio, or a local endpoint.",
  },
  embeddings: {
    label: "Embeddings",
    description: "Vector/search support for project understanding and memory retrieval.",
  },
  "custom-endpoints": {
    label: "Custom Endpoints",
    description: "OpenAI-compatible or local URLs chosen by the user instead of a fixed cloud endpoint.",
  },
};

export type AgentProviderCapabilityProfileItem = {
  capability: AgentCapability;
  label: string;
  description: string;
  enabled: boolean;
  configurable: boolean;
  source: "adapter" | "user" | "endpoint" | "model" | "disabled";
};

export type AgentProviderCapabilityProfile = {
  providerId: AgentProviderId;
  overrideActive: boolean;
  capabilities: AgentCapability[];
  items: AgentProviderCapabilityProfileItem[];
  warnings: string[];
};

export type AgentProviderAdapter = {
  id: AgentProviderId;
  label: string;
  authMethods: AgentAuthMethod[];
  defaultAuthMethod: AgentAuthMethod;
  defaultEndpoint: string;
  defaultModel: string;
  capabilities: AgentCapability[];
  credentialOwner: "user";
  proxyPolicy: "never-proxied";
  localRuntime: boolean;
};

export const AGENT_PROVIDER_ADAPTERS: AgentProviderAdapter[] = [
  {
    id: "openai",
    label: "OpenAI",
    authMethods: ["api-key", "oauth", "enterprise-login"],
    defaultAuthMethod: "api-key",
    defaultEndpoint: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1",
    capabilities: ["chat", "code", "reasoning", "multimodal", "artifacts", "tools", "embeddings"],
    credentialOwner: "user",
    proxyPolicy: "never-proxied",
    localRuntime: false,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    authMethods: ["api-key", "oauth", "enterprise-login"],
    defaultAuthMethod: "api-key",
    defaultEndpoint: "https://api.anthropic.com",
    defaultModel: "claude-3-5-sonnet",
    capabilities: ["chat", "code", "reasoning", "multimodal", "artifacts", "tools"],
    credentialOwner: "user",
    proxyPolicy: "never-proxied",
    localRuntime: false,
  },
  {
    id: "google",
    label: "Google",
    authMethods: ["api-key", "oauth", "enterprise-login"],
    defaultAuthMethod: "oauth",
    defaultEndpoint: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-1.5-pro",
    capabilities: ["chat", "code", "reasoning", "multimodal", "tools", "embeddings"],
    credentialOwner: "user",
    proxyPolicy: "never-proxied",
    localRuntime: false,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    authMethods: ["api-key"],
    defaultAuthMethod: "api-key",
    defaultEndpoint: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/auto",
    capabilities: ["chat", "code", "reasoning", "multimodal", "tools", "custom-endpoints"],
    credentialOwner: "user",
    proxyPolicy: "never-proxied",
    localRuntime: false,
  },
  {
    id: "ollama",
    label: "Ollama",
    authMethods: ["local-endpoint"],
    defaultAuthMethod: "local-endpoint",
    defaultEndpoint: "http://127.0.0.1:11434",
    defaultModel: "llama3.1",
    capabilities: ["chat", "code", "local-inference", "embeddings", "custom-endpoints"],
    credentialOwner: "user",
    proxyPolicy: "never-proxied",
    localRuntime: true,
  },
  {
    id: "lm-studio",
    label: "LM Studio",
    authMethods: ["local-endpoint"],
    defaultAuthMethod: "local-endpoint",
    defaultEndpoint: "http://127.0.0.1:1234/v1",
    defaultModel: "local-model",
    capabilities: ["chat", "code", "local-inference", "custom-endpoints"],
    credentialOwner: "user",
    proxyPolicy: "never-proxied",
    localRuntime: true,
  },
  {
    id: "openai-compatible",
    label: "OpenAI-compatible",
    authMethods: ["endpoint-api-key", "local-endpoint"],
    defaultAuthMethod: "endpoint-api-key",
    defaultEndpoint: "http://127.0.0.1:8000/v1",
    defaultModel: "custom-model",
    capabilities: ["chat", "code", "reasoning", "tools", "custom-endpoints"],
    credentialOwner: "user",
    proxyPolicy: "never-proxied",
    localRuntime: false,
  },
];

export const AGENT_PERMISSION_KEYS = [
  "read",
  "write",
  "execute",
  "terminal",
  "filesystem",
  "wallet",
  "network",
  "application",
  "temporary",
  "project",
  "persistent",
] as const;

export type AgentPermissionKey = (typeof AGENT_PERMISSION_KEYS)[number];

export type AgentPermissionGrant = {
  key: AgentPermissionKey;
  label: string;
  description: string;
  enabled: boolean;
  revocable: boolean;
  scope: "temporary" | "project" | "persistent";
};

export type AgentProviderConnection = {
  providerId: AgentProviderId;
  authMethod: AgentAuthMethod;
  endpoint: string;
  model: string;
  connected: boolean;
  credentialPresent: boolean;
  capabilityOverrides?: AgentCapability[];
  updatedAt: string;
};

export type AgentWorkspaceFile = {
  path: string;
  language: string;
  kind: "source" | "markdown" | "config" | "image";
  content: string;
  baselineContent: string;
};

export type AgentMemory = {
  architecture: string;
  conventions: string;
  goals: string;
  notes: string;
  priorConversations: string;
};

export type AgentChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  providerId: AgentProviderId;
  createdAt: string;
};

export type AgentPlanStatus = "todo" | "doing" | "done" | "blocked";

export type AgentPlanItem = {
  id: string;
  title: string;
  details: string;
  status: AgentPlanStatus;
  createdAt: string;
  updatedAt: string;
};

export type AgentCodeActionKind =
  | "create-file"
  | "update-file"
  | "delete-file"
  | "rename-file"
  | "run-command";

export type AgentCodeActionStatus = "proposed" | "applied" | "dismissed";

export type AgentCodeAction = {
  id: string;
  kind: AgentCodeActionKind;
  title: string;
  status: AgentCodeActionStatus;
  targetPath?: string;
  nextPath?: string;
  content?: string;
  command?: string;
  rationale?: string;
  sourceMessageId?: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentGitCommit = {
  id: string;
  branch: string;
  message: string;
  filePaths: string[];
  summary: string;
  createdAt: string;
};

export type AgentGitState = {
  currentBranch: string;
  branches: string[];
  stagedPaths: string[];
  commits: AgentGitCommit[];
  updatedAt: string;
};

export type AgentGitFileStatusKind = "added" | "modified";

export type AgentGitFileStatus = {
  path: string;
  relativePath: string;
  status: AgentGitFileStatusKind;
  staged: boolean;
  additions: number;
  deletions: number;
};

export type AgentMcpAccessLevel = "read" | "write" | "execute" | "admin";

export type AgentMcpResourcePolicy = {
  id: string;
  label: string;
  description: string;
  scope: string;
  accessLevel: AgentMcpAccessLevel;
};

export type AgentMcpToolPolicy = {
  name: string;
  label: string;
  description: string;
  scope: string;
  accessLevel: AgentMcpAccessLevel;
  requiredPermissions: AgentPermissionKey[];
};

export type AgentMcpAccessPreview = {
  scopes: string[];
  resources: AgentMcpResourcePolicy[];
  allowedTools: AgentMcpToolPolicy[];
  blockedTools: AgentMcpToolPolicy[];
  warnings: string[];
};

export const AGENT_EXTENSION_POINT_KEYS = [
  "provider",
  "mcp-server",
  "tool",
  "personality",
  "theme",
  "knowledge-pack",
] as const;

export type AgentExtensionPoint = (typeof AGENT_EXTENSION_POINT_KEYS)[number];

export type AgentExtensionManifest = {
  id: string;
  label: string;
  extensionPoint: AgentExtensionPoint;
  version: string;
  owner: string;
  description: string;
  permissions: AgentPermissionKey[];
  enabledByDefault: boolean;
  references: string[];
};

export type AgentWorkspaceExtension = AgentExtensionManifest & {
  enabled: boolean;
  source: "core" | "user";
  installedAt: string;
  updatedAt: string;
};

export type AgentWorkspaceState = {
  version: 1;
  activeProviderId: AgentProviderId;
  providers: Record<AgentProviderId, AgentProviderConnection>;
  permissions: AgentPermissionGrant[];
  memory: AgentMemory;
  files: AgentWorkspaceFile[];
  selectedFilePath: string;
  projectPath: string;
  branch: string;
  companionEnabled: boolean;
  messages: AgentChatMessage[];
  plan: AgentPlanItem[];
  codeActions: AgentCodeAction[];
  git: AgentGitState;
  extensions: AgentWorkspaceExtension[];
  updatedAt: string;
};

export type AgentFileDiagnosticSeverity = "error" | "warning" | "info";

export type AgentFileDiagnostic = {
  id: string;
  severity: AgentFileDiagnosticSeverity;
  rule: string;
  message: string;
  filePath?: string;
  line?: number;
};

export type AgentWorkspaceSearchMatch = {
  filePath: string;
  line: number;
  excerpt: string;
};

export type AgentCodeSymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "constant"
  | "heading"
  | "section";

export type AgentCodeSymbol = {
  filePath: string;
  name: string;
  kind: AgentCodeSymbolKind;
  line: number;
  signature: string;
};

export type AgentRepositorySummary = {
  projectPath: string;
  branch: string;
  fileCount: number;
  changedCount: number;
  languageCounts: Array<{ language: string; count: number }>;
  directories: string[];
  largestFiles: Array<{ path: string; bytes: number }>;
  diagnostics: AgentFileDiagnostic[];
};

const DEFAULT_MEMORY: AgentMemory = {
  architecture:
    "Agent is split into provider adapters, conversation engine, IDE workbench, MCP permission layer, project memory, companion knowledge, and wtfOS filesystem integration.",
  conventions:
    "Use local wtfOS registries first. Keep user credentials local to the device. Route MCP actions through scoped paired tokens and visible grants.",
  goals:
    "Authenticate a provider, open a project, plan the next change, edit files, inspect diffs, run safe commands, and hand authorized context to paired agents.",
  notes:
    "This workspace stores project context under the wtfOS filesystem namespace and keeps provider secrets out of server APIs.",
  priorConversations:
    "Initial brief: build Agent as the native AI workspace for wtfOS, combining chat, coding, planning, debugging, MCP, permissions, memory, and a companion guide.",
};

const DEFAULT_PLAN_TITLES = [
  "Map request",
  "Edit files",
  "Run diagnostics",
  "Review diff",
  "Commit through git",
] as const;

export const DEFAULT_AGENT_PERMISSIONS: AgentPermissionGrant[] = [
  {
    key: "read",
    label: "Read",
    description: "Inspect allowed project files, docs, app manifests, and public context.",
    enabled: true,
    revocable: true,
    scope: "project",
  },
  {
    key: "write",
    label: "Write",
    description: "Edit files inside the active wtfOS project workspace.",
    enabled: true,
    revocable: true,
    scope: "project",
  },
  {
    key: "execute",
    label: "Execute",
    description: "Run approved build, test, and diagnostic actions.",
    enabled: false,
    revocable: true,
    scope: "temporary",
  },
  {
    key: "terminal",
    label: "Terminal",
    description: "Use the safe terminal bridge and command transcripts.",
    enabled: false,
    revocable: true,
    scope: "temporary",
  },
  {
    key: "filesystem",
    label: "Filesystem",
    description: "Browse and manage project files in the wtfOS filesystem namespace.",
    enabled: true,
    revocable: true,
    scope: "project",
  },
  {
    key: "wallet",
    label: "Wallet",
    description: "Read wallet-adjacent context only after user-visible approval.",
    enabled: false,
    revocable: true,
    scope: "temporary",
  },
  {
    key: "network",
    label: "Network",
    description: "Call the selected provider or local endpoint from the user's client.",
    enabled: true,
    revocable: true,
    scope: "temporary",
  },
  {
    key: "application",
    label: "Application",
    description: "Open authorized wtfOS apps and route handoffs through OS gates.",
    enabled: true,
    revocable: true,
    scope: "project",
  },
  {
    key: "temporary",
    label: "Temporary",
    description: "Expire short-lived task grants when the work session ends.",
    enabled: true,
    revocable: true,
    scope: "temporary",
  },
  {
    key: "project",
    label: "Project",
    description: "Persist project-specific memory and workspace state.",
    enabled: true,
    revocable: true,
    scope: "project",
  },
  {
    key: "persistent",
    label: "Persistent",
    description: "Keep long-running architecture, convention, and goal memory.",
    enabled: true,
    revocable: true,
    scope: "persistent",
  },
];

function normalizeAgentPermissionGrants(
  permissions: readonly AgentPermissionGrant[] | null | undefined
): AgentPermissionGrant[] {
  return DEFAULT_AGENT_PERMISSIONS.map((permission) => {
    const rawPermission = Array.isArray(permissions)
      ? permissions.find((entry) => entry?.key === permission.key)
      : undefined;
    return {
      ...permission,
      enabled:
        typeof rawPermission?.enabled === "boolean"
          ? rawPermission.enabled
          : permission.enabled,
    };
  });
}

export function createDefaultAgentExtensionManifests(): AgentExtensionManifest[] {
  const providerManifests: AgentExtensionManifest[] = AGENT_PROVIDER_ADAPTERS.map((adapter) => ({
    id: `provider.${adapter.id}`,
    label: adapter.label,
    extensionPoint: "provider",
    version: "1.0.0",
    owner: adapter.label,
    description: `${adapter.label} provider adapter with ${adapter.capabilities.join(", ")} capability discovery.`,
    permissions: adapter.localRuntime ? ["network"] : ["network", "temporary"],
    enabledByDefault: true,
    references: ["client/src/features/agent/agent-model.ts"],
  }));

  return [
    ...providerManifests,
    {
      id: "mcp.wtfos-core",
      label: "wtfOS Core MCP",
      extensionPoint: "mcp-server",
      version: "1.0.0",
      owner: "wtfOS",
      description: "Scoped paired-token access to authorized wtfOS apps, files, public data, and system tools.",
      permissions: ["read", "application", "temporary"],
      enabledByDefault: true,
      references: ["docs/domains/wtf-os-registry.md"],
    },
    {
      id: "tool.safe-terminal",
      label: "Safe Terminal",
      extensionPoint: "tool",
      version: "1.0.0",
      owner: "Agent",
      description: "Allowlisted terminal transcript tool for project diagnostics and git status summaries.",
      permissions: ["terminal", "execute", "temporary"],
      enabledByDefault: true,
      references: ["client/src/pages/Agent.tsx"],
    },
    {
      id: "personality.wtfos-guide",
      label: "wtfOS Guide",
      extensionPoint: "personality",
      version: "1.0.0",
      owner: "Agent",
      description: "Friendly OS companion persona for wtfOS workflows, Tezos, AT Protocol, and development support.",
      permissions: ["read", "persistent"],
      enabledByDefault: true,
      references: ["client/src/features/agent/agent-knowledge.ts"],
    },
    {
      id: "theme.native-wtfos",
      label: "Native wtfOS",
      extensionPoint: "theme",
      version: "1.0.0",
      owner: "wtfOS",
      description: "Agent chrome that follows the active wtfOS AppWindow, typography, controls, and permission visuals.",
      permissions: ["application"],
      enabledByDefault: true,
      references: ["client/src/pages/Agent.tsx"],
    },
    {
      id: "knowledge.wtfos-registry",
      label: "wtfOS Registry",
      extensionPoint: "knowledge-pack",
      version: "1.0.0",
      owner: "wtfOS",
      description: "Machine-readable route, app, provider, MCP, filesystem, project bundle, and permission knowledge.",
      permissions: ["read", "persistent"],
      enabledByDefault: true,
      references: ["client/src/features/agent/agent-knowledge.ts"],
    },
  ];
}

function normalizeAgentExtensionPoint(value: unknown): AgentExtensionPoint | null {
  return typeof value === "string" &&
    (AGENT_EXTENSION_POINT_KEYS as readonly string[]).includes(value)
    ? (value as AgentExtensionPoint)
    : null;
}

function normalizeAgentExtensionId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function normalizeAgentExtensionPermissions(value: unknown): AgentPermissionKey[] {
  const permissions = Array.isArray(value) ? value : [];
  return permissions
    .filter((permission): permission is AgentPermissionKey =>
      typeof permission === "string" &&
      (AGENT_PERMISSION_KEYS as readonly string[]).includes(permission)
    )
    .filter((permission, index, values) => values.indexOf(permission) === index)
    .slice(0, AGENT_PERMISSION_KEYS.length);
}

function normalizeAgentExtensionReferences(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((reference): reference is string => typeof reference === "string" && Boolean(reference.trim()))
        .map((reference) => reference.trim())
        .filter((reference, index, values) => values.indexOf(reference) === index)
        .slice(0, 12)
    : [];
}

export function normalizeAgentExtensionManifest(
  value: unknown,
  installedAt = new Date().toISOString()
): AgentWorkspaceExtension | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<AgentExtensionManifest & AgentWorkspaceExtension>;
  const extensionPoint = normalizeAgentExtensionPoint(entry.extensionPoint);
  const label = typeof entry.label === "string" ? entry.label.trim() : "";
  const id = typeof entry.id === "string" ? normalizeAgentExtensionId(entry.id) : "";
  if (!id || !label || !extensionPoint) return null;
  const version = typeof entry.version === "string" && entry.version.trim()
    ? entry.version.trim().slice(0, 40)
    : "0.1.0";
  const owner = typeof entry.owner === "string" && entry.owner.trim()
    ? entry.owner.trim().slice(0, 80)
    : "Third party";
  const description = typeof entry.description === "string" && entry.description.trim()
    ? entry.description.trim().slice(0, 480)
    : "User-installed Agent extension manifest.";
  const normalizedInstalledAt = timestampOrNow(installedAt);
  return {
    id,
    label: label.slice(0, 80),
    extensionPoint,
    version,
    owner,
    description,
    permissions: normalizeAgentExtensionPermissions(entry.permissions),
    enabledByDefault: Boolean(entry.enabledByDefault),
    references: normalizeAgentExtensionReferences(entry.references),
    enabled: Boolean(entry.enabled),
    source: entry.source === "core" ? "core" : "user",
    installedAt: timestampOrNow(entry.installedAt, normalizedInstalledAt),
    updatedAt: timestampOrNow(entry.updatedAt, normalizedInstalledAt),
  };
}

function createCoreAgentExtensions(updatedAt: string): AgentWorkspaceExtension[] {
  return createDefaultAgentExtensionManifests().map((manifest) => ({
    ...manifest,
    enabled: manifest.enabledByDefault,
    source: "core",
    installedAt: updatedAt,
    updatedAt,
  }));
}

function normalizeAgentWorkspaceExtensions(
  value: unknown,
  updatedAt: string
): AgentWorkspaceExtension[] {
  const coreExtensions = createCoreAgentExtensions(updatedAt);
  const extensions = new Map(coreExtensions.map((extension) => [extension.id, extension]));
  if (!Array.isArray(value)) return coreExtensions;

  for (const rawExtension of value) {
    const normalized = normalizeAgentExtensionManifest(rawExtension, updatedAt);
    if (!normalized) continue;
    const coreExtension = extensions.get(normalized.id);
    if (coreExtension?.source === "core") {
      extensions.set(normalized.id, {
        ...coreExtension,
        enabled: normalized.enabled,
        updatedAt: normalized.updatedAt,
      });
      continue;
    }
    extensions.set(normalized.id, {
      ...normalized,
      source: "user",
      enabled: normalized.enabled,
    });
  }

  return [...extensions.values()]
    .sort(
      (left, right) =>
        Number(left.source === "user") - Number(right.source === "user") ||
        left.extensionPoint.localeCompare(right.extensionPoint) ||
        left.label.localeCompare(right.label)
    )
    .slice(0, 120);
}

const DEFAULT_FILES: AgentWorkspaceFile[] = [
  {
    path: "wtfos://Agent/Projects/native-agent/README.md",
    language: "markdown",
    kind: "markdown",
    baselineContent: "# Agent\n\nNative AI workspace for wtfOS.\n",
    content:
      "# Agent\n\nNative AI workspace for wtfOS.\n\n- Provider adapters stay modular.\n- User credentials stay local.\n- MCP grants stay visible and revocable.\n",
  },
  {
    path: "wtfos://Agent/Projects/native-agent/src/provider-adapter.ts",
    language: "typescript",
    kind: "source",
    baselineContent:
      "export type ProviderAdapter = { id: string; capabilities: string[] };\n",
    content:
      "export type ProviderAdapter = {\n  id: string;\n  endpoint: string;\n  capabilities: string[];\n  credentialOwner: \"user\";\n};\n",
  },
  {
    path: "wtfos://Agent/Projects/native-agent/docs/permissions.md",
    language: "markdown",
    kind: "markdown",
    baselineContent: "Permissions are scoped per project.\n",
    content:
      "Permissions are scoped per project.\n\nRead, write, execute, terminal, filesystem, wallet, network, application, temporary, project, and persistent grants can be reviewed or revoked before an agent acts.\n",
  },
  {
    path: "wtfos://Agent/Projects/native-agent/assets/workspace-preview.png",
    language: "image",
    kind: "image",
    baselineContent: "image-preview",
    content: "image-preview",
  },
];

export const AGENT_MCP_RESOURCE_POLICIES: AgentMcpResourcePolicy[] = [
  {
    id: "platform-api",
    label: "Versioned wtfOS API",
    description: "Read the bearer-authenticated /api/v1 contract through MCP.",
    scope: "api:read",
    accessLevel: "read",
  },
  {
    id: "platform-api-write",
    label: "Versioned wtfOS API mutations",
    description: "Call /api/v1 mutations as the paired user; normal ownership and permission checks remain active.",
    scope: "api:write",
    accessLevel: "write",
  },
  {
    id: "desktop",
    label: "Desktop appearance and app gates",
    description: "Read or update the paired user's desktop shell appearance through MCP.",
    scope: "desktop:read",
    accessLevel: "read",
  },
  {
    id: "desktop-write",
    label: "Desktop mutations",
    description: "Apply approved desktop appearance changes for the paired user.",
    scope: "desktop:write",
    accessLevel: "write",
  },
  {
    id: "pet",
    label: "Desktop pet",
    description: "Read the paired user's desktop pet state and safe care affordances.",
    scope: "pet:read",
    accessLevel: "read",
  },
  {
    id: "pet-write",
    label: "Desktop pet care",
    description: "Apply safe pet care actions only for the paired user.",
    scope: "pet:write",
    accessLevel: "write",
  },
  {
    id: "public-data",
    label: "Public wtfOS data",
    description: "Read public inventory, access manifests, tokens, TV channels, Arcade, and Console data.",
    scope: "public-data:read",
    accessLevel: "read",
  },
  {
    id: "arcade",
    label: "WTF Arcade",
    description: "Read Arcade catalog, play status, stats, and fee metadata.",
    scope: "arcade:read",
    accessLevel: "read",
  },
  {
    id: "arcade-write",
    label: "Arcade play and imports",
    description: "Create Arcade play intents or run approved Arcade source import actions.",
    scope: "arcade:write",
    accessLevel: "execute",
  },
  {
    id: "console",
    label: "WTF Console",
    description: "Read Console catalog, discovery, player, score, and audit data.",
    scope: "console:read",
    accessLevel: "read",
  },
  {
    id: "console-write",
    label: "Console sessions",
    description: "Use approved Console write actions when a paired agent has execution authority.",
    scope: "console:write",
    accessLevel: "execute",
  },
  {
    id: "game-studio",
    label: "Game Studio",
    description: "Read templates, assets, snippets, targets, and owned project records.",
    scope: "game-studio:read",
    accessLevel: "read",
  },
  {
    id: "game-studio-write",
    label: "Game Studio project writes",
    description: "Create, update, build, and submit Game Studio projects through user-scoped MCP tools.",
    scope: "game-studio:write",
    accessLevel: "write",
  },
  {
    id: "map-lab",
    label: "Map Lab documents",
    description: "Create sanitized Map Lab documents without reading restricted ingested data paths.",
    scope: "map-lab:write",
    accessLevel: "write",
  },
  {
    id: "crp",
    label: "CRP nominations",
    description: "Read CRP categories, nomination status, credits, and owned nomination records.",
    scope: "crp-nominations:read",
    accessLevel: "read",
  },
  {
    id: "crp-write",
    label: "CRP nomination submit",
    description: "Submit a CRP nomination when the paired user keeps write authority enabled.",
    scope: "crp-nominations:write",
    accessLevel: "write",
  },
  {
    id: "market",
    label: "Creator market writes",
    description: "Create trusted creator market items only when wallet authority is explicitly enabled.",
    scope: "market:write",
    accessLevel: "write",
  },
  {
    id: "trade-board",
    label: "Trade board writes",
    description: "Set paired-user trade-board tokens only with wallet-scoped approval.",
    scope: "trade-board:write",
    accessLevel: "write",
  },
];

export const AGENT_MCP_TOOL_POLICIES: AgentMcpToolPolicy[] = [
  {
    name: "wtf_search_api_operations",
    label: "Search the wtfOS API",
    description: "Find OpenAPI operations available to the paired user's role and token scopes.",
    scope: "api:read",
    accessLevel: "read",
    requiredPermissions: ["read"],
  },
  {
    name: "wtf_get_api_operation",
    label: "Inspect a wtfOS API operation",
    description: "Read parameters, payload guidance, responses, scopes, and role for one allowed operationId.",
    scope: "api:read",
    accessLevel: "read",
    requiredPermissions: ["read"],
  },
  {
    name: "wtf_call_api_operation",
    label: "Call a wtfOS API operation",
    description: "Call an allowed operationId as the paired user; mutation operations additionally require api:write.",
    scope: "api:read",
    accessLevel: "read",
    requiredPermissions: ["read"],
  },
  {
    name: "wtf_api_request",
    label: "Call the wtfOS API",
    description: "Call an OpenAPI-listed /api/v1 operation; mutations additionally require api:write.",
    scope: "api:read",
    accessLevel: "read",
    requiredPermissions: ["read"],
  },
  {
    name: "wtf_get_capabilities",
    label: "Get capabilities",
    description: "List available MCP tool families and policy boundaries.",
    scope: "public-data:read",
    accessLevel: "read",
    requiredPermissions: ["read"],
  },
  {
    name: "wtf_get_access_manifest",
    label: "Get access manifest",
    description: "Read browser, API, and MCP access boundaries.",
    scope: "public-data:read",
    accessLevel: "read",
    requiredPermissions: ["read"],
  },
  {
    name: "wtf_get_registered_inventory",
    label: "Get registered inventory",
    description: "Read the machine-readable wtfOS route, package, and pathway inventory.",
    scope: "public-data:read",
    accessLevel: "read",
    requiredPermissions: ["read"],
  },
  {
    name: "wtf_get_desktop_appearance",
    label: "Read desktop appearance",
    description: "Read the paired user's desktop appearance settings.",
    scope: "desktop:read",
    accessLevel: "read",
    requiredPermissions: ["read", "application"],
  },
  {
    name: "wtf_set_desktop_appearance",
    label: "Set desktop appearance",
    description: "Update desktop appearance for the paired user.",
    scope: "desktop:write",
    accessLevel: "write",
    requiredPermissions: ["write", "application"],
  },
  {
    name: "wtf_get_desktop_pet",
    label: "Read desktop pet",
    description: "Read the paired user's desktop pet status.",
    scope: "pet:read",
    accessLevel: "read",
    requiredPermissions: ["read", "application"],
  },
  {
    name: "wtf_keep_desktop_pet_alive",
    label: "Care for desktop pet",
    description: "Apply safe pet care actions for the paired user.",
    scope: "pet:write",
    accessLevel: "write",
    requiredPermissions: ["write", "application"],
  },
  {
    name: "wtf_create_map_lab_document",
    label: "Create Map Lab document",
    description: "Create sanitized Map Lab documents from approved agent context.",
    scope: "map-lab:write",
    accessLevel: "write",
    requiredPermissions: ["write", "project"],
  },
  {
    name: "wtf_search_public_tokens",
    label: "Search public tokens",
    description: "Search public Tezos token data.",
    scope: "public-data:read",
    accessLevel: "read",
    requiredPermissions: ["read"],
  },
  {
    name: "wtf_list_unlisted_trade_board_tokens",
    label: "List unlisted trade-board tokens",
    description: "Read public trade-board token candidates.",
    scope: "public-data:read",
    accessLevel: "read",
    requiredPermissions: ["read"],
  },
  {
    name: "wtf_set_trade_board_tokens",
    label: "Set trade-board tokens",
    description: "Update the paired user's trade-board tokens.",
    scope: "trade-board:write",
    accessLevel: "write",
    requiredPermissions: ["wallet", "write"],
  },
  {
    name: "wtf_list_public_tv_channels",
    label: "List public TV channels",
    description: "Read public WTF TV channel metadata.",
    scope: "public-data:read",
    accessLevel: "read",
    requiredPermissions: ["read"],
  },
  {
    name: "wtf_list_arcade_games",
    label: "List Arcade games",
    description: "Read Arcade catalog entries.",
    scope: "arcade:read",
    accessLevel: "read",
    requiredPermissions: ["read", "application"],
  },
  {
    name: "wtf_get_arcade_play_status",
    label: "Get Arcade play status",
    description: "Read the paired user's Arcade card and credit status.",
    scope: "arcade:read",
    accessLevel: "read",
    requiredPermissions: ["read", "application"],
  },
  {
    name: "wtf_create_arcade_play_intent",
    label: "Create Arcade play intent",
    description: "Create an approved Arcade play intent for the paired user.",
    scope: "arcade:write",
    accessLevel: "execute",
    requiredPermissions: ["execute", "application"],
  },
  {
    name: "wtf_list_console_games",
    label: "List Console games",
    description: "Read Console catalog entries.",
    scope: "console:read",
    accessLevel: "read",
    requiredPermissions: ["read", "application"],
  },
  {
    name: "wtf_list_game_studio_assets",
    label: "List Game Studio assets",
    description: "Read reusable Game Studio stock assets.",
    scope: "game-studio:read",
    accessLevel: "read",
    requiredPermissions: ["read", "project"],
  },
  {
    name: "wtf_create_game_studio_project",
    label: "Create Game Studio project",
    description: "Create a paired-user Game Studio project.",
    scope: "game-studio:write",
    accessLevel: "write",
    requiredPermissions: ["write", "project"],
  },
  {
    name: "wtf_build_game_studio_project",
    label: "Build Game Studio project",
    description: "Build a paired-user Game Studio project bundle.",
    scope: "game-studio:write",
    accessLevel: "execute",
    requiredPermissions: ["execute", "project"],
  },
  {
    name: "wtf_submit_game_studio_project_to_arcade",
    label: "Submit Game Studio project",
    description: "Submit a paired-user Game Studio project to Arcade.",
    scope: "game-studio:write",
    accessLevel: "write",
    requiredPermissions: ["write", "project"],
  },
  {
    name: "wtf_create_trusted_creator_market_item",
    label: "Create creator market item",
    description: "Create a trusted creator market item where the paired user is authorized.",
    scope: "market:write",
    accessLevel: "write",
    requiredPermissions: ["wallet", "write"],
  },
  {
    name: "wtf_list_crp_categories",
    label: "List CRP categories",
    description: "Read available CRP nomination categories.",
    scope: "crp-nominations:read",
    accessLevel: "read",
    requiredPermissions: ["read"],
  },
  {
    name: "wtf_submit_crp_nomination",
    label: "Submit CRP nomination",
    description: "Submit a CRP nomination for the paired user.",
    scope: "crp-nominations:write",
    accessLevel: "write",
    requiredPermissions: ["write", "application"],
  },
];

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  css: "css",
  gif: "image",
  html: "html",
  jpeg: "image",
  jpg: "image",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  md: "markdown",
  mjs: "javascript",
  png: "image",
  svg: "image",
  toml: "toml",
  ts: "typescript",
  tsx: "typescript",
  txt: "text",
  yml: "yaml",
  yaml: "yaml",
};

function createStableId(prefix: string, value: string, createdAt: string) {
  return `${prefix}-${createdAt}-${value}`
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function timestampOrNow(value: unknown, fallback = new Date().toISOString()) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : fallback;
}

function fileExtension(path: string) {
  const cleanPath = path.split(/[?#]/)[0].toLowerCase();
  const match = cleanPath.match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export function inferAgentFileKind(path: string): AgentWorkspaceFile["kind"] {
  const extension = fileExtension(path);
  if (["png", "jpg", "jpeg", "gif", "svg"].includes(extension)) return "image";
  if (extension === "md") return "markdown";
  if (["json", "toml", "yaml", "yml"].includes(extension)) return "config";
  return "source";
}

export function inferAgentFileLanguage(path: string): string {
  return EXTENSION_LANGUAGE_MAP[fileExtension(path)] ?? "text";
}

export function normalizeAgentWorkspaceFilePath(
  workspace: Pick<AgentWorkspaceState, "projectPath">,
  path: string
): string {
  const projectRoot = workspace.projectPath.replace(/\/+$/, "");
  const raw = path.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!raw) throw new Error("Enter a file path.");
  if (raw.endsWith("/")) throw new Error("File path must point to a file, not a folder.");
  if (raw === projectRoot) throw new Error("File path must point to a file inside the project.");
  if (raw.startsWith(`${projectRoot}/`)) return raw;
  if (raw.startsWith("wtfos://")) {
    throw new Error("File path must stay inside the active Agent project workspace.");
  }

  const relative = raw.replace(/^\/+/, "").replace(/\/+/g, "/");
  if (relative.split("/").some((segment) => segment === "..")) {
    throw new Error("File path must stay inside the Agent project workspace.");
  }
  return `${projectRoot}/${relative}`;
}

export function createAgentWorkspaceFile(
  workspace: Pick<AgentWorkspaceState, "projectPath">,
  path: string,
  content = "",
  baselineContent = content
): AgentWorkspaceFile {
  const normalizedPath = normalizeAgentWorkspaceFilePath(workspace, path);
  return {
    path: normalizedPath,
    language: inferAgentFileLanguage(normalizedPath),
    kind: inferAgentFileKind(normalizedPath),
    content,
    baselineContent,
  };
}

export function createAgentPlanItem(
  title: string,
  options: {
    details?: string;
    status?: AgentPlanStatus;
    id?: string;
    createdAt?: string;
    updatedAt?: string;
  } = {}
): AgentPlanItem {
  const createdAt = timestampOrNow(options.createdAt);
  const normalizedTitle = title.trim() || "Untitled task";
  return {
    id: options.id || createStableId("plan", normalizedTitle, createdAt),
    title: normalizedTitle,
    details: options.details?.trim() || "",
    status: options.status || "todo",
    createdAt,
    updatedAt: timestampOrNow(options.updatedAt, createdAt),
  };
}

function defaultAgentPlan(updatedAt: string): AgentPlanItem[] {
  return DEFAULT_PLAN_TITLES.map((title, index) =>
    createAgentPlanItem(title, {
      status: index === 0 ? "doing" : "todo",
      details:
        index === 0
          ? "Clarify the request, project state, permissions, and provider capabilities."
          : "",
      createdAt: updatedAt,
      updatedAt,
    })
  );
}

function normalizeAgentGitBranchName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!normalized || normalized.includes("..") || normalized.startsWith("/") || normalized.endsWith("/")) {
    return null;
  }
  return normalized;
}

function createDefaultAgentGit(branch: string, updatedAt: string): AgentGitState {
  const currentBranch = normalizeAgentGitBranchName(branch) ?? "agent/native-workspace";
  return {
    currentBranch,
    branches: [currentBranch, "main"].filter((value, index, values) => values.indexOf(value) === index),
    stagedPaths: [],
    commits: [],
    updatedAt,
  };
}

export function getAgentProviderAdapter(
  providerId: AgentProviderId
): AgentProviderAdapter {
  return (
    AGENT_PROVIDER_ADAPTERS.find((adapter) => adapter.id === providerId) ??
    AGENT_PROVIDER_ADAPTERS[0]
  );
}

export function createDefaultProviderConnection(
  providerId: AgentProviderId,
  updatedAt = new Date().toISOString()
): AgentProviderConnection {
  const adapter = getAgentProviderAdapter(providerId);
  return {
    providerId,
    authMethod: adapter.defaultAuthMethod,
    endpoint: adapter.defaultEndpoint,
    model: adapter.defaultModel,
    connected: adapter.localRuntime,
    credentialPresent: adapter.localRuntime,
    updatedAt,
  };
}

export function createDefaultAgentWorkspace(
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  const branch = "agent/native-workspace";
  const providers = Object.fromEntries(
    AGENT_PROVIDER_IDS.map((providerId) => [
      providerId,
      createDefaultProviderConnection(providerId, updatedAt),
    ])
  ) as Record<AgentProviderId, AgentProviderConnection>;

  return {
    version: 1,
    activeProviderId: "openai",
    providers,
    permissions: DEFAULT_AGENT_PERMISSIONS.map((permission) => ({ ...permission })),
    memory: { ...DEFAULT_MEMORY },
    files: DEFAULT_FILES.map((file) => ({ ...file })),
    selectedFilePath: DEFAULT_FILES[0].path,
    projectPath: "wtfos://Agent/Projects/native-agent",
    branch,
    companionEnabled: true,
    messages: [
      {
        id: "system-welcome",
        role: "system",
        providerId: "openai",
        createdAt: updatedAt,
        content:
          "Agent is ready. Select a provider, review permissions, and start with the project plan.",
      },
    ],
    plan: defaultAgentPlan(updatedAt),
    codeActions: [],
    git: createDefaultAgentGit(branch, updatedAt),
    extensions: createCoreAgentExtensions(updatedAt),
    updatedAt,
  };
}

function isProviderId(value: unknown): value is AgentProviderId {
  return (
    typeof value === "string" &&
    (AGENT_PROVIDER_IDS as readonly string[]).includes(value)
  );
}

function isAgentCapability(value: unknown): value is AgentCapability {
  return (
    typeof value === "string" &&
    (AGENT_CAPABILITY_KEYS as readonly string[]).includes(value)
  );
}

function isAgentLocalEndpoint(endpoint: string): boolean {
  return /(^https?:\/\/)?(localhost|127\.0\.0\.1|\[?::1\]?)(?::|\/|$)/i.test(endpoint.trim());
}

function providerAllowsCustomCapabilityOverrides(
  providerId: AgentProviderId,
  endpoint: string
): boolean {
  const adapter = getAgentProviderAdapter(providerId);
  return (
    providerId === "openai-compatible" ||
    adapter.localRuntime ||
    isAgentLocalEndpoint(endpoint)
  );
}

function normalizeProviderCapabilityOverrides(
  providerId: AgentProviderId,
  endpoint: string,
  capabilities: unknown
): AgentCapability[] | undefined {
  if (!Array.isArray(capabilities)) return undefined;
  const adapter = getAgentProviderAdapter(providerId);
  const allowed = new Set<AgentCapability>(
    providerAllowsCustomCapabilityOverrides(providerId, endpoint)
      ? AGENT_CAPABILITY_KEYS
      : adapter.capabilities
  );
  const normalized = capabilities
    .filter(isAgentCapability)
    .filter((capability) => allowed.has(capability));
  const unique = [...new Set<AgentCapability>(["chat", ...normalized])];
  return unique.length ? unique : undefined;
}

function normalizeProviderConnection(
  value: unknown,
  providerId: AgentProviderId,
  updatedAt: string
): AgentProviderConnection {
  const fallback = createDefaultProviderConnection(providerId, updatedAt);
  if (!value || typeof value !== "object") return fallback;
  const entry = value as Partial<AgentProviderConnection>;
  const adapter = getAgentProviderAdapter(providerId);
  const authMethod = adapter.authMethods.includes(entry.authMethod as AgentAuthMethod)
    ? (entry.authMethod as AgentAuthMethod)
    : adapter.defaultAuthMethod;
  const endpoint =
    typeof entry.endpoint === "string" && entry.endpoint.trim()
      ? entry.endpoint.trim()
      : adapter.defaultEndpoint;
  const model =
    typeof entry.model === "string" && entry.model.trim()
      ? entry.model.trim()
      : adapter.defaultModel;
  const capabilityOverrides = normalizeProviderCapabilityOverrides(
    providerId,
    endpoint,
    entry.capabilityOverrides
  );

  return {
    providerId,
    authMethod,
    endpoint,
    model,
    connected: Boolean(entry.connected),
    credentialPresent: Boolean(entry.credentialPresent),
    capabilityOverrides,
    updatedAt:
      typeof entry.updatedAt === "string" && entry.updatedAt
        ? entry.updatedAt
        : updatedAt,
  };
}

function isPlanStatus(value: unknown): value is AgentPlanStatus {
  return value === "todo" || value === "doing" || value === "done" || value === "blocked";
}

function normalizePlanItem(value: unknown, index: number, updatedAt: string): AgentPlanItem | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<AgentPlanItem>;
  if (typeof entry.title !== "string" || !entry.title.trim()) return null;
  const createdAt = timestampOrNow(entry.createdAt, updatedAt);
  return createAgentPlanItem(entry.title, {
    id:
      typeof entry.id === "string" && entry.id.trim()
        ? entry.id
        : createStableId("plan", `${entry.title}-${index}`, createdAt),
    details: typeof entry.details === "string" ? entry.details : "",
    status: isPlanStatus(entry.status) ? entry.status : "todo",
    createdAt,
    updatedAt: timestampOrNow(entry.updatedAt, createdAt),
  });
}

function isCodeActionKind(value: unknown): value is AgentCodeActionKind {
  return (
    value === "create-file" ||
    value === "update-file" ||
    value === "delete-file" ||
    value === "rename-file" ||
    value === "run-command"
  );
}

function isCodeActionStatus(value: unknown): value is AgentCodeActionStatus {
  return value === "proposed" || value === "applied" || value === "dismissed";
}

function normalizeCodeAction(
  workspace: Pick<AgentWorkspaceState, "projectPath" | "files">,
  value: unknown,
  index: number,
  updatedAt: string
): AgentCodeAction | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<AgentCodeAction>;
  if (!isCodeActionKind(entry.kind)) return null;
  const createdAt = timestampOrNow(entry.createdAt, updatedAt);
  let targetPath: string | undefined;
  let nextPath: string | undefined;
  try {
    targetPath =
      typeof entry.targetPath === "string" && entry.targetPath.trim()
        ? normalizeAgentWorkspaceFilePath(workspace, entry.targetPath)
        : undefined;
    nextPath =
      typeof entry.nextPath === "string" && entry.nextPath.trim()
        ? normalizeAgentWorkspaceFilePath(workspace, entry.nextPath)
        : undefined;
  } catch {
    return null;
  }
  const command =
    typeof entry.command === "string" && entry.command.trim()
      ? entry.command.trim()
      : undefined;

  if (entry.kind !== "run-command" && !targetPath) return null;
  if (entry.kind === "rename-file" && !nextPath) return null;
  if (entry.kind === "run-command" && !command) return null;

  return {
    id:
      typeof entry.id === "string" && entry.id.trim()
        ? entry.id
        : createStableId("action", `${entry.kind}-${targetPath ?? command ?? index}`, createdAt),
    kind: entry.kind,
    title:
      typeof entry.title === "string" && entry.title.trim()
        ? entry.title.trim()
        : `${entry.kind} ${targetPath ?? command ?? ""}`.trim(),
    status: isCodeActionStatus(entry.status) ? entry.status : "proposed",
    targetPath,
    nextPath,
    content: typeof entry.content === "string" ? entry.content : undefined,
    command,
    rationale: typeof entry.rationale === "string" ? entry.rationale : undefined,
    sourceMessageId:
      typeof entry.sourceMessageId === "string" && entry.sourceMessageId.trim()
        ? entry.sourceMessageId
        : undefined,
    createdAt,
    updatedAt: timestampOrNow(entry.updatedAt, createdAt),
  };
}

function lineDelta(before: string, after: string) {
  const beforeLines = before ? before.split("\n") : [];
  const afterLines = after ? after.split("\n") : [];
  const max = Math.max(beforeLines.length, afterLines.length);
  let additions = 0;
  let deletions = 0;
  for (let index = 0; index < max; index += 1) {
    const previous = beforeLines[index];
    const next = afterLines[index];
    if (previous === next) continue;
    if (next !== undefined) additions += 1;
    if (previous !== undefined) deletions += 1;
  }
  return { additions, deletions };
}

function normalizeAgentGitCommit(
  workspace: Pick<AgentWorkspaceState, "projectPath" | "files">,
  value: unknown,
  index: number,
  fallbackBranch: string,
  updatedAt: string
): AgentGitCommit | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<AgentGitCommit>;
  if (typeof entry.message !== "string" || !entry.message.trim()) return null;
  const createdAt = timestampOrNow(entry.createdAt, updatedAt);
  const branch = normalizeAgentGitBranchName(entry.branch) ?? fallbackBranch;
  const filePaths = Array.isArray(entry.filePaths)
    ? entry.filePaths
        .map((filePath) => {
          if (typeof filePath !== "string" || !filePath.trim()) return null;
          try {
            return normalizeAgentWorkspaceFilePath(workspace, filePath);
          } catch {
            return null;
          }
        })
        .filter((filePath): filePath is string => Boolean(filePath))
        .slice(0, 120)
    : [];
  if (!filePaths.length) return null;

  return {
    id:
      typeof entry.id === "string" && entry.id.trim()
        ? entry.id
        : createStableId("commit", `${branch}-${entry.message}-${index}`, createdAt),
    branch,
    message: entry.message.trim(),
    filePaths,
    summary:
      typeof entry.summary === "string" && entry.summary.trim()
        ? entry.summary.trim()
        : `${filePaths.length} file(s) committed on ${branch}`,
    createdAt,
  };
}

function normalizeAgentGitState(
  workspace: Pick<AgentWorkspaceState, "projectPath" | "files">,
  value: unknown,
  branch: string,
  updatedAt: string
): AgentGitState {
  const fallback = createDefaultAgentGit(branch, updatedAt);
  if (!value || typeof value !== "object") return fallback;
  const entry = value as Partial<AgentGitState>;
  const currentBranch =
    normalizeAgentGitBranchName(entry.currentBranch) ??
    normalizeAgentGitBranchName(branch) ??
    fallback.currentBranch;
  const branches = [
    currentBranch,
    ...(Array.isArray(entry.branches)
      ? entry.branches
          .map(normalizeAgentGitBranchName)
          .filter((name): name is string => Boolean(name))
      : fallback.branches),
  ].filter((name, index, values) => values.indexOf(name) === index).slice(0, 40);
  const changedPaths = new Set(
    workspace.files
      .filter((file) => file.content !== file.baselineContent)
      .map((file) => file.path)
  );
  const stagedPaths = Array.isArray(entry.stagedPaths)
    ? entry.stagedPaths
        .map((filePath) => {
          if (typeof filePath !== "string" || !filePath.trim()) return null;
          try {
            return normalizeAgentWorkspaceFilePath(workspace, filePath);
          } catch {
            return null;
          }
        })
        .filter((filePath): filePath is string => Boolean(filePath && changedPaths.has(filePath)))
        .filter((filePath, index, values) => values.indexOf(filePath) === index)
        .slice(0, 200)
    : [];
  const commits = Array.isArray(entry.commits)
    ? entry.commits
        .map((commit, index) =>
          normalizeAgentGitCommit(workspace, commit, index, currentBranch, updatedAt)
        )
        .filter((commit): commit is AgentGitCommit => Boolean(commit))
        .slice(-80)
    : [];

  return {
    currentBranch,
    branches,
    stagedPaths,
    commits,
    updatedAt: timestampOrNow(entry.updatedAt, updatedAt),
  };
}

export function normalizeAgentWorkspace(value: unknown): AgentWorkspaceState {
  const fallback = createDefaultAgentWorkspace();
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<AgentWorkspaceState>;
  const updatedAt =
    typeof raw.updatedAt === "string" && raw.updatedAt
      ? raw.updatedAt
      : fallback.updatedAt;
  const providers = Object.fromEntries(
    AGENT_PROVIDER_IDS.map((providerId) => [
      providerId,
      normalizeProviderConnection(raw.providers?.[providerId], providerId, updatedAt),
    ])
  ) as Record<AgentProviderId, AgentProviderConnection>;
  const permissions = normalizeAgentPermissionGrants(raw.permissions);
  const files = Array.isArray(raw.files) && raw.files.length > 0
    ? raw.files
        .filter((file): file is AgentWorkspaceFile =>
          Boolean(
            file &&
              typeof file.path === "string" &&
              typeof file.content === "string" &&
              typeof file.baselineContent === "string"
          )
        )
        .map((file) => ({
          path: file.path,
          language: file.language || "text",
          kind: file.kind || "source",
          content: file.content,
          baselineContent: file.baselineContent,
        }))
    : fallback.files;
  const selectedFilePath =
    typeof raw.selectedFilePath === "string" &&
    files.some((file) => file.path === raw.selectedFilePath)
      ? raw.selectedFilePath
      : files[0].path;
  const projectPath =
    typeof raw.projectPath === "string" && raw.projectPath
      ? raw.projectPath
      : fallback.projectPath;
  const branch =
    typeof raw.branch === "string" && raw.branch
      ? raw.branch
      : fallback.branch;
  const plan =
    Array.isArray(raw.plan) && raw.plan.length > 0
      ? raw.plan
          .map((entry, index) => normalizePlanItem(entry, index, updatedAt))
          .filter((entry): entry is AgentPlanItem => Boolean(entry))
          .slice(0, 40)
      : fallback.plan;
  const normalizedWorkspaceShape = { projectPath, files };
  const git = normalizeAgentGitState(normalizedWorkspaceShape, raw.git, branch, updatedAt);
  const extensions = normalizeAgentWorkspaceExtensions(raw.extensions, updatedAt);
  const codeActions = Array.isArray(raw.codeActions)
    ? raw.codeActions
        .map((entry, index) =>
          normalizeCodeAction(normalizedWorkspaceShape, entry, index, updatedAt)
        )
        .filter((entry): entry is AgentCodeAction => Boolean(entry))
        .slice(-80)
    : [];
  const normalizedMessages = Array.isArray(raw.messages) && raw.messages.length > 0
    ? raw.messages
        .filter((message): message is AgentChatMessage =>
          Boolean(
            message &&
              typeof message.id === "string" &&
              typeof message.content === "string" &&
              isProviderId(message.providerId)
          )
        )
        .slice(-80)
    : [];

  return {
    version: 1,
    activeProviderId: isProviderId(raw.activeProviderId)
      ? raw.activeProviderId
      : fallback.activeProviderId,
    providers,
    permissions,
    memory: {
      architecture:
        typeof raw.memory?.architecture === "string"
          ? raw.memory.architecture
          : fallback.memory.architecture,
      conventions:
        typeof raw.memory?.conventions === "string"
          ? raw.memory.conventions
          : fallback.memory.conventions,
      goals:
        typeof raw.memory?.goals === "string" ? raw.memory.goals : fallback.memory.goals,
      notes:
        typeof raw.memory?.notes === "string" ? raw.memory.notes : fallback.memory.notes,
      priorConversations:
        typeof raw.memory?.priorConversations === "string"
          ? raw.memory.priorConversations
          : fallback.memory.priorConversations,
    },
    files,
    selectedFilePath,
    projectPath,
    branch: git.currentBranch,
    companionEnabled:
      typeof raw.companionEnabled === "boolean"
        ? raw.companionEnabled
        : fallback.companionEnabled,
    messages: normalizedMessages.length > 0 ? normalizedMessages : fallback.messages,
    plan: plan.length > 0 ? plan : fallback.plan,
    codeActions,
    git,
    extensions,
    updatedAt,
  };
}

export function detectAgentProviderCapabilities(
  connection: AgentProviderConnection
): AgentCapability[] {
  const adapter = getAgentProviderAdapter(connection.providerId);
  const capabilities = new Set<AgentCapability>(
    connection.capabilityOverrides?.length
      ? connection.capabilityOverrides
      : adapter.capabilities
  );
  if (connection.endpoint.includes("127.0.0.1") || connection.endpoint.includes("localhost")) {
    capabilities.add("local-inference");
    capabilities.add("custom-endpoints");
  }
  if (connection.model.toLowerCase().includes("reason")) capabilities.add("reasoning");
  return [...capabilities];
}

export function buildAgentProviderCapabilityProfile(
  connection: AgentProviderConnection
): AgentProviderCapabilityProfile {
  const adapter = getAgentProviderAdapter(connection.providerId);
  const detected = new Set(detectAgentProviderCapabilities(connection));
  const adapterCapabilities = new Set(adapter.capabilities);
  const overrideCapabilities = new Set(connection.capabilityOverrides ?? []);
  const overrideActive = Boolean(connection.capabilityOverrides?.length);
  const localEndpoint = isAgentLocalEndpoint(connection.endpoint) || adapter.localRuntime;
  const customOverrideAllowed = providerAllowsCustomCapabilityOverrides(
    connection.providerId,
    connection.endpoint
  );
  const items = AGENT_CAPABILITY_KEYS.map((capability) => {
    const endpointInferred =
      localEndpoint &&
      (capability === "local-inference" || capability === "custom-endpoints");
    const modelInferred =
      capability === "reasoning" && connection.model.toLowerCase().includes("reason");
    const source: AgentProviderCapabilityProfileItem["source"] =
      overrideActive && overrideCapabilities.has(capability)
        ? "user"
        : endpointInferred
          ? "endpoint"
          : modelInferred
            ? "model"
            : adapterCapabilities.has(capability)
              ? "adapter"
              : "disabled";

    return {
      capability,
      label: AGENT_CAPABILITY_DETAILS[capability].label,
      description: AGENT_CAPABILITY_DETAILS[capability].description,
      enabled: detected.has(capability),
      configurable:
        capability !== "chat" &&
        (customOverrideAllowed || adapterCapabilities.has(capability)),
      source: detected.has(capability) ? source : "disabled",
    };
  });
  const warnings: string[] = [];

  if (overrideActive) {
    warnings.push("Capability overrides are active for this provider; reset to return to automatic detection.");
  }
  if (localEndpoint) {
    warnings.push("Local/custom endpoint detected. Agent can surface local inference controls without proxying through wtfOS.");
  }
  if (!detected.has("tools")) {
    warnings.push("Provider-native tools are off, so Agent keeps actions in the review queue instead of assuming tool-call support.");
  }
  if (!detected.has("multimodal")) {
    warnings.push("Multimodal features are off for this provider profile; image previews stay local to the workspace.");
  }

  return {
    providerId: connection.providerId,
    overrideActive,
    capabilities: [...detected],
    items,
    warnings,
  };
}

export function setAgentProviderCapabilityOverrides(
  workspace: AgentWorkspaceState,
  providerId: AgentProviderId,
  capabilities: readonly unknown[] | null,
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  const connection = workspace.providers[providerId];
  if (!connection) throw new Error("Select a supported Agent provider.");
  const capabilityOverrides =
    capabilities === null
      ? undefined
      : normalizeProviderCapabilityOverrides(providerId, connection.endpoint, capabilities);
  return {
    ...workspace,
    providers: {
      ...workspace.providers,
      [providerId]: {
        ...connection,
        capabilityOverrides,
        updatedAt,
      },
    },
    updatedAt,
  };
}

export function summarizeProviderConnection(
  connection: AgentProviderConnection
): string {
  const adapter = getAgentProviderAdapter(connection.providerId);
  if (!connection.connected) return `${adapter.label} is configured but not connected`;
  if (adapter.localRuntime) return `${adapter.label} is connected through ${connection.endpoint}`;
  return `${adapter.label} is connected with user-owned credentials`;
}

export function agentMcpScopesForPermissions(
  permissions: readonly AgentPermissionGrant[] | null | undefined
): string[] {
  const normalizedPermissions = normalizeAgentPermissionGrants(permissions);
  const enabled = new Set(
    normalizedPermissions.filter((permission) => permission.enabled).map((permission) => permission.key)
  );
  const scopes = new Set<string>();
  if (enabled.has("read")) {
    scopes.add("api:read");
    scopes.add("desktop:read");
    scopes.add("pet:read");
    scopes.add("public-data:read");
    scopes.add("game-studio:read");
    scopes.add("arcade:read");
    scopes.add("console:read");
    scopes.add("crp-nominations:read");
  }
  if (enabled.has("write")) {
    scopes.add("api:write");
    scopes.add("desktop:write");
    scopes.add("pet:write");
    scopes.add("game-studio:write");
    scopes.add("map-lab:write");
    scopes.add("crp-nominations:write");
  }
  if (enabled.has("execute")) {
    scopes.add("arcade:write");
    scopes.add("console:write");
  }
  if (enabled.has("application")) {
    scopes.add("arcade:read");
    scopes.add("console:read");
  }
  if (enabled.has("wallet")) {
    scopes.add("market:write");
    scopes.add("trade-board:write");
  }
  return [...scopes].sort();
}

function permissionSet(
  permissions: readonly AgentPermissionGrant[] | null | undefined
): Set<AgentPermissionKey> {
  const normalizedPermissions = normalizeAgentPermissionGrants(permissions);
  return new Set(
    normalizedPermissions.filter((permission) => permission.enabled).map((permission) => permission.key)
  );
}

function hasRequiredPermissions(
  enabled: Set<AgentPermissionKey>,
  required: AgentPermissionKey[]
): boolean {
  return required.every((permission) => enabled.has(permission));
}

export function buildAgentMcpAccessPreview(
  permissions: readonly AgentPermissionGrant[] | null | undefined
): AgentMcpAccessPreview {
  const enabled = permissionSet(permissions);
  const scopeSet = new Set(agentMcpScopesForPermissions(permissions));
  const resources = AGENT_MCP_RESOURCE_POLICIES.filter((resource) =>
    scopeSet.has(resource.scope)
  );
  const allowedTools = AGENT_MCP_TOOL_POLICIES.filter(
    (tool) => scopeSet.has(tool.scope) && hasRequiredPermissions(enabled, tool.requiredPermissions)
  );
  const blockedTools = AGENT_MCP_TOOL_POLICIES.filter(
    (tool) => !scopeSet.has(tool.scope) || !hasRequiredPermissions(enabled, tool.requiredPermissions)
  );
  const warnings: string[] = [];

  if (!enabled.has("execute")) {
    warnings.push("Execute is off, so Arcade/Console write actions and build-style MCP tools stay blocked.");
  }
  if (!enabled.has("wallet")) {
    warnings.push("Wallet is off, so market and trade-board mutation tools stay blocked.");
  }
  if (!enabled.has("project")) {
    warnings.push("Project is off, so project-scoped Game Studio and Map Lab tools stay blocked.");
  }
  if (!enabled.has("persistent")) {
    warnings.push("Persistent memory is off; paired agents can still use current-session scopes but should not retain long-running context.");
  }

  return {
    scopes: [...scopeSet].sort(),
    resources,
    allowedTools,
    blockedTools,
    warnings,
  };
}

export function installAgentExtension(
  workspace: AgentWorkspaceState,
  manifest: unknown,
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  const extension = normalizeAgentExtensionManifest(manifest, updatedAt);
  if (!extension) {
    throw new Error("Extension manifest must include id, label, and a supported extensionPoint.");
  }
  if (workspace.extensions.some((entry) => entry.id === extension.id)) {
    throw new Error("An Agent extension with that id is already installed.");
  }
  const coreIds = new Set(createDefaultAgentExtensionManifests().map((entry) => entry.id));
  if (coreIds.has(extension.id)) {
    throw new Error("Core Agent extension ids cannot be replaced by user manifests.");
  }
  const installedExtension: AgentWorkspaceExtension = {
    ...extension,
    source: "user",
    enabled: false,
    installedAt: updatedAt,
    updatedAt,
  };
  return {
    ...workspace,
    extensions: [...workspace.extensions, installedExtension].sort(
      (left, right) =>
        Number(left.source === "user") - Number(right.source === "user") ||
        left.extensionPoint.localeCompare(right.extensionPoint) ||
        left.label.localeCompare(right.label)
    ),
    updatedAt,
  };
}

export function setAgentExtensionEnabled(
  workspace: AgentWorkspaceState,
  id: string,
  enabled: boolean,
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  if (!workspace.extensions.some((extension) => extension.id === id)) {
    throw new Error("Select an installed Agent extension.");
  }
  return {
    ...workspace,
    extensions: workspace.extensions.map((extension) =>
      extension.id === id ? { ...extension, enabled, updatedAt } : extension
    ),
    updatedAt,
  };
}

export function removeAgentExtension(
  workspace: AgentWorkspaceState,
  id: string,
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  const extension = workspace.extensions.find((entry) => entry.id === id);
  if (!extension) throw new Error("Select an installed Agent extension.");
  if (extension.source === "core") throw new Error("Core Agent extensions can be disabled but not removed.");
  return {
    ...workspace,
    extensions: workspace.extensions.filter((entry) => entry.id !== id),
    updatedAt,
  };
}

export function updateAgentFileContent(
  workspace: AgentWorkspaceState,
  path: string,
  content: string,
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  return {
    ...workspace,
    files: workspace.files.map((file) =>
      file.path === path ? { ...file, content } : file
    ),
    updatedAt,
  };
}

export function addAgentWorkspaceFile(
  workspace: AgentWorkspaceState,
  path: string,
  content = "",
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  const file = createAgentWorkspaceFile(workspace, path, content, "");
  if (workspace.files.some((entry) => entry.path === file.path)) {
    throw new Error("A file already exists at that path.");
  }
  return {
    ...workspace,
    files: [...workspace.files, file],
    selectedFilePath: file.path,
    updatedAt,
  };
}

export function renameAgentWorkspaceFile(
  workspace: AgentWorkspaceState,
  currentPath: string,
  nextPath: string,
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  const normalizedNextPath = normalizeAgentWorkspaceFilePath(workspace, nextPath);
  const source = workspace.files.find((file) => file.path === currentPath);
  if (!source) throw new Error("Select an existing file to rename.");
  if (
    normalizedNextPath !== currentPath &&
    workspace.files.some((file) => file.path === normalizedNextPath)
  ) {
    throw new Error("A file already exists at the destination path.");
  }
  return {
    ...workspace,
    files: workspace.files.map((file) =>
      file.path === currentPath
        ? {
            ...file,
            path: normalizedNextPath,
            language: inferAgentFileLanguage(normalizedNextPath),
            kind: inferAgentFileKind(normalizedNextPath),
          }
        : file
    ),
    selectedFilePath:
      workspace.selectedFilePath === currentPath ? normalizedNextPath : workspace.selectedFilePath,
    git: {
      ...workspace.git,
      stagedPaths: workspace.git.stagedPaths.map((filePath) =>
        filePath === currentPath ? normalizedNextPath : filePath
      ),
      updatedAt,
    },
    updatedAt,
  };
}

export function deleteAgentWorkspaceFile(
  workspace: AgentWorkspaceState,
  path: string,
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  if (workspace.files.length <= 1) {
    throw new Error("Agent workspaces keep at least one file.");
  }
  const nextFiles = workspace.files.filter((file) => file.path !== path);
  if (nextFiles.length === workspace.files.length) throw new Error("Select an existing file to delete.");
  return {
    ...workspace,
    files: nextFiles,
    selectedFilePath:
      workspace.selectedFilePath === path ? nextFiles[0].path : workspace.selectedFilePath,
    git: {
      ...workspace.git,
      stagedPaths: workspace.git.stagedPaths.filter((filePath) => filePath !== path),
      updatedAt,
    },
    updatedAt,
  };
}

export function addAgentPlanItem(
  workspace: AgentWorkspaceState,
  title: string,
  details = "",
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  const item = createAgentPlanItem(title, { details, createdAt: updatedAt, updatedAt });
  return {
    ...workspace,
    plan: [...workspace.plan, item],
    updatedAt,
  };
}

export function updateAgentPlanItemStatus(
  workspace: AgentWorkspaceState,
  id: string,
  status: AgentPlanStatus,
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  return {
    ...workspace,
    plan: workspace.plan.map((item) =>
      item.id === id ? { ...item, status, updatedAt } : item
    ),
    updatedAt,
  };
}

function createCodeAction(
  workspace: AgentWorkspaceState,
  value: {
    kind: AgentCodeActionKind;
    title?: string;
    targetPath?: string;
    nextPath?: string;
    content?: string;
    command?: string;
    rationale?: string;
    sourceMessageId?: string;
  },
  createdAt: string,
  index: number
): AgentCodeAction | null {
  const normalized = normalizeCodeAction(
    workspace,
    {
      id: createStableId(
        "action",
        `${value.kind}-${value.targetPath ?? value.command ?? index}`,
        createdAt
      ),
      status: "proposed",
      title: value.title,
      kind: value.kind,
      targetPath: value.targetPath,
      nextPath: value.nextPath,
      content: value.content,
      command: value.command,
      rationale: value.rationale,
      sourceMessageId: value.sourceMessageId,
      createdAt,
      updatedAt: createdAt,
    },
    index,
    createdAt
  );
  return normalized;
}

function codeBlockInfoValue(info: string, key: string) {
  const quoted = new RegExp(`${key}=("[^"]+"|'[^']+')`).exec(info);
  if (quoted?.[1]) return quoted[1].slice(1, -1).trim();
  const bare = new RegExp(`${key}=([^\\s]+)`).exec(info);
  return bare?.[1]?.trim() ?? "";
}

function parseStructuredActionBlock(
  workspace: AgentWorkspaceState,
  raw: unknown,
  createdAt: string,
  sourceMessageId: string | undefined,
  startIndex: number
): AgentCodeAction[] {
  const entries = Array.isArray(raw) ? raw : [raw];
  return entries
    .map((entry, offset) => {
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as Partial<AgentCodeAction>;
      if (!isCodeActionKind(candidate.kind)) return null;
      return createCodeAction(
        workspace,
        {
          kind: candidate.kind,
          title: candidate.title,
          targetPath: candidate.targetPath,
          nextPath: candidate.nextPath,
          content: candidate.content,
          command: candidate.command,
          rationale: candidate.rationale,
          sourceMessageId,
        },
        createdAt,
        startIndex + offset
      );
    })
    .filter((entry): entry is AgentCodeAction => Boolean(entry));
}

export function parseAgentActionsFromText(
  workspace: AgentWorkspaceState,
  content: string,
  options: { sourceMessageId?: string; createdAt?: string } = {}
): AgentCodeAction[] {
  const createdAt = timestampOrNow(options.createdAt);
  const actions: AgentCodeAction[] = [];
  const blockPattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = blockPattern.exec(content)) !== null) {
    const info = (match[1] || "").trim();
    const body = match[2] || "";
    const language = info.split(/\s+/)[0]?.toLowerCase() || "";

    if (language === "agent-action" || language === "agent-actions" || language === "json") {
      try {
        const parsed = JSON.parse(body);
        actions.push(
          ...parseStructuredActionBlock(
            workspace,
            parsed,
            createdAt,
            options.sourceMessageId,
            index
          )
        );
      } catch {
        // Ignore malformed provider action blocks; the user can still read them in chat.
      }
    }

    const targetPath =
      codeBlockInfoValue(info, "file") ||
      codeBlockInfoValue(info, "path") ||
      codeBlockInfoValue(info, "target");
    if (targetPath) {
      try {
        const normalizedPath = normalizeAgentWorkspaceFilePath(workspace, targetPath);
        const exists = workspace.files.some((file) => file.path === normalizedPath);
        const relative = relativeAgentFilePath(workspace, normalizedPath);
        const action = createCodeAction(
          workspace,
          {
            kind: exists ? "update-file" : "create-file",
            title: `${exists ? "Update" : "Create"} ${relative}`,
            targetPath: normalizedPath,
            content: body,
            rationale: "Parsed from provider file block.",
            sourceMessageId: options.sourceMessageId,
          },
          createdAt,
          index
        );
        if (action) actions.push(action);
      } catch {
        // Ignore invalid provider paths so one malformed block does not drop every action.
      }
    }
    index += 1;
  }

  const unique = new Map<string, AgentCodeAction>();
  for (const action of actions) {
    const key = [action.kind, action.targetPath, action.nextPath, action.command, action.content].join(
      "\u0001"
    );
    if (!unique.has(key)) unique.set(key, action);
  }
  return [...unique.values()];
}

export function addAgentCodeActions(
  workspace: AgentWorkspaceState,
  actions: AgentCodeAction[],
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  if (!actions.length) return workspace;
  const existingIds = new Set(workspace.codeActions.map((action) => action.id));
  const nextActions = actions.map((action, index) => ({
    ...action,
    id: existingIds.has(action.id) ? `${action.id}-${index}` : action.id,
  }));
  return {
    ...workspace,
    codeActions: [...workspace.codeActions, ...nextActions].slice(-80),
    updatedAt,
  };
}

function markCodeAction(
  workspace: AgentWorkspaceState,
  id: string,
  status: AgentCodeActionStatus,
  updatedAt: string
): AgentWorkspaceState {
  return {
    ...workspace,
    codeActions: workspace.codeActions.map((action) =>
      action.id === id ? { ...action, status, updatedAt } : action
    ),
    updatedAt,
  };
}

export function applyAgentCodeAction(
  workspace: AgentWorkspaceState,
  id: string,
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  const action = workspace.codeActions.find((entry) => entry.id === id);
  if (!action) throw new Error("Select an Agent action to apply.");
  if (action.status !== "proposed") throw new Error("Only proposed Agent actions can be applied.");

  let next = workspace;
  if (action.kind === "create-file") {
    if (!action.targetPath) throw new Error("Create action has no target file.");
    next = addAgentWorkspaceFile(workspace, action.targetPath, action.content ?? "", updatedAt);
  } else if (action.kind === "update-file") {
    if (!action.targetPath) throw new Error("Update action has no target file.");
    if (!workspace.files.some((file) => file.path === action.targetPath)) {
      throw new Error("Update action target does not exist.");
    }
    next = updateAgentFileContent(workspace, action.targetPath, action.content ?? "", updatedAt);
  } else if (action.kind === "delete-file") {
    if (!action.targetPath) throw new Error("Delete action has no target file.");
    next = deleteAgentWorkspaceFile(workspace, action.targetPath, updatedAt);
  } else if (action.kind === "rename-file") {
    if (!action.targetPath || !action.nextPath) {
      throw new Error("Rename action needs a source and destination path.");
    }
    next = renameAgentWorkspaceFile(workspace, action.targetPath, action.nextPath, updatedAt);
  } else {
    next = { ...workspace, updatedAt };
  }

  return markCodeAction(next, id, "applied", updatedAt);
}

export function dismissAgentCodeAction(
  workspace: AgentWorkspaceState,
  id: string,
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  return markCodeAction(workspace, id, "dismissed", updatedAt);
}

export function getAgentGitStatus(workspace: AgentWorkspaceState): AgentGitFileStatus[] {
  const staged = new Set(workspace.git.stagedPaths);
  return changedAgentFiles(workspace)
    .map((file) => {
      const delta = lineDelta(file.baselineContent, file.content);
      return {
        path: file.path,
        relativePath: relativeAgentFilePath(workspace, file.path),
        status: file.baselineContent ? "modified" : "added",
        staged: staged.has(file.path),
        additions: delta.additions,
        deletions: delta.deletions,
      } satisfies AgentGitFileStatus;
    })
    .sort((a, b) => Number(b.staged) - Number(a.staged) || a.relativePath.localeCompare(b.relativePath));
}

export function stageAgentGitPaths(
  workspace: AgentWorkspaceState,
  paths: string[],
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  const statusPaths = new Set(getAgentGitStatus(workspace).map((status) => status.path));
  const stagedPaths = [
    ...workspace.git.stagedPaths,
    ...paths
      .map((path) => {
        try {
          return normalizeAgentWorkspaceFilePath(workspace, path);
        } catch {
          return null;
        }
      })
      .filter((path): path is string => Boolean(path && statusPaths.has(path))),
  ].filter((path, index, values) => values.indexOf(path) === index);

  return {
    ...workspace,
    git: {
      ...workspace.git,
      stagedPaths,
      updatedAt,
    },
    updatedAt,
  };
}

export function unstageAgentGitPaths(
  workspace: AgentWorkspaceState,
  paths: string[],
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  const normalized = new Set(
    paths
      .map((path) => {
        try {
          return normalizeAgentWorkspaceFilePath(workspace, path);
        } catch {
          return null;
        }
      })
      .filter((path): path is string => Boolean(path))
  );
  return {
    ...workspace,
    git: {
      ...workspace.git,
      stagedPaths: workspace.git.stagedPaths.filter((path) => !normalized.has(path)),
      updatedAt,
    },
    updatedAt,
  };
}

export function stageAllAgentGitChanges(
  workspace: AgentWorkspaceState,
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  return stageAgentGitPaths(
    workspace,
    getAgentGitStatus(workspace).map((status) => status.path),
    updatedAt
  );
}

export function commitAgentGitChanges(
  workspace: AgentWorkspaceState,
  message: string,
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) throw new Error("Enter a commit message.");
  const statusPaths = new Set(getAgentGitStatus(workspace).map((status) => status.path));
  const stagedPaths = workspace.git.stagedPaths.filter((path) => statusPaths.has(path));
  if (!stagedPaths.length) throw new Error("Stage at least one changed file before committing.");
  const branch = workspace.git.currentBranch || workspace.branch;
  const commit: AgentGitCommit = {
    id: createStableId("commit", `${branch}-${normalizedMessage}-${stagedPaths.join("-")}`, updatedAt),
    branch,
    message: normalizedMessage,
    filePaths: stagedPaths,
    summary: `${stagedPaths.length} file(s) committed from Agent`,
    createdAt: updatedAt,
  };

  return {
    ...workspace,
    files: workspace.files.map((file) =>
      stagedPaths.includes(file.path) ? { ...file, baselineContent: file.content } : file
    ),
    branch,
    git: {
      ...workspace.git,
      currentBranch: branch,
      stagedPaths: [],
      commits: [...workspace.git.commits, commit].slice(-80),
      updatedAt,
    },
    updatedAt,
  };
}

export function createAgentGitBranch(
  workspace: AgentWorkspaceState,
  branchName: string,
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  const branch = normalizeAgentGitBranchName(branchName);
  if (!branch) throw new Error("Enter a valid branch name.");
  if (workspace.git.branches.includes(branch)) throw new Error("Branch already exists.");
  return {
    ...workspace,
    branch,
    git: {
      ...workspace.git,
      currentBranch: branch,
      branches: [...workspace.git.branches, branch],
      updatedAt,
    },
    updatedAt,
  };
}

export function switchAgentGitBranch(
  workspace: AgentWorkspaceState,
  branchName: string,
  updatedAt = new Date().toISOString()
): AgentWorkspaceState {
  const branch = normalizeAgentGitBranchName(branchName);
  if (!branch || !workspace.git.branches.includes(branch)) {
    throw new Error("Select an existing Agent branch.");
  }
  return {
    ...workspace,
    branch,
    git: {
      ...workspace.git,
      currentBranch: branch,
      updatedAt,
    },
    updatedAt,
  };
}

export function changedAgentFiles(workspace: AgentWorkspaceState): AgentWorkspaceFile[] {
  return workspace.files.filter((file) => file.content !== file.baselineContent);
}

function relativeAgentFilePath(workspace: AgentWorkspaceState, filePath: string) {
  return filePath.startsWith(`${workspace.projectPath}/`)
    ? filePath.replace(`${workspace.projectPath}/`, "")
    : filePath;
}

function diagnosticId(rule: string, filePath: string | undefined, line = 0) {
  return [rule, filePath ?? "workspace", line].join(":");
}

function findFirstMatchingLine(content: string, pattern: RegExp) {
  const lines = content.split("\n");
  const index = lines.findIndex((line) => pattern.test(line));
  return index >= 0 ? index + 1 : undefined;
}

export function analyzeAgentWorkspace(workspace: AgentWorkspaceState): AgentFileDiagnostic[] {
  const diagnostics: AgentFileDiagnostic[] = [];
  const seenPaths = new Map<string, number>();
  const projectRoot = workspace.projectPath.replace(/\/+$/, "");

  for (const file of workspace.files) {
    seenPaths.set(file.path, (seenPaths.get(file.path) ?? 0) + 1);

    if (!file.path.startsWith(`${projectRoot}/`)) {
      diagnostics.push({
        id: diagnosticId("project-boundary", file.path),
        severity: "error",
        rule: "project-boundary",
        filePath: file.path,
        message: "File is outside the active Agent project path.",
      });
    }

    if (file.kind === "source" && !file.content.trim()) {
      diagnostics.push({
        id: diagnosticId("empty-source", file.path),
        severity: "warning",
        rule: "empty-source",
        filePath: file.path,
        message: "Source file is empty.",
      });
    }

    if (file.kind === "markdown" && !/^#\s+.+/m.test(file.content)) {
      diagnostics.push({
        id: diagnosticId("markdown-heading", file.path),
        severity: "warning",
        rule: "markdown-heading",
        filePath: file.path,
        message: "Markdown file has no top-level heading.",
      });
    }

    const secretPattern =
      /(sk-[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{12,}|api[_-]?key\s*[:=]\s*["'][^"']{8,}|-----BEGIN PRIVATE KEY-----)/i;
    const secretLine = findFirstMatchingLine(file.content, secretPattern);
    if (secretLine) {
      diagnostics.push({
        id: diagnosticId("possible-secret", file.path, secretLine),
        severity: "error",
        rule: "possible-secret",
        filePath: file.path,
        line: secretLine,
        message: "Possible provider credential or private key in project content.",
      });
    }
  }

  for (const [filePath, count] of seenPaths) {
    if (count > 1) {
      diagnostics.push({
        id: diagnosticId("duplicate-path", filePath),
        severity: "error",
        rule: "duplicate-path",
        filePath,
        message: "Duplicate file path in Agent workspace.",
      });
    }
  }

  if (!workspace.files.some((file) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file.path))) {
    diagnostics.push({
      id: diagnosticId("missing-tests", undefined),
      severity: "info",
      rule: "missing-tests",
      message: "No test files detected in this Agent project snapshot.",
    });
  }

  for (const file of changedAgentFiles(workspace)) {
    diagnostics.push({
      id: diagnosticId("unsaved-change", file.path),
      severity: "info",
      rule: "unsaved-change",
      filePath: file.path,
      message: "File content differs from its saved baseline.",
    });
  }

  return diagnostics.sort((a, b) => {
    const severityRank: Record<AgentFileDiagnosticSeverity, number> = {
      error: 0,
      warning: 1,
      info: 2,
    };
    return severityRank[a.severity] - severityRank[b.severity] || a.id.localeCompare(b.id);
  });
}

export function searchAgentWorkspaceFiles(
  workspace: AgentWorkspaceState,
  query: string,
  limit = 20
): AgentWorkspaceSearchMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const matches: AgentWorkspaceSearchMatch[] = [];

  for (const file of workspace.files) {
    const relativePath = relativeAgentFilePath(workspace, file.path);
    if (relativePath.toLowerCase().includes(needle)) {
      matches.push({
        filePath: file.path,
        line: 1,
        excerpt: relativePath,
      });
    }
    if (file.kind === "image") continue;
    const lines = file.content.split("\n");
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(needle)) {
        matches.push({
          filePath: file.path,
          line: index + 1,
          excerpt: line.trim().slice(0, 180) || "(blank line)",
        });
      }
    });
    if (matches.length >= limit) return matches.slice(0, limit);
  }

  return matches.slice(0, limit);
}

function createAgentCodeSymbol(
  file: AgentWorkspaceFile,
  line: string,
  index: number
): AgentCodeSymbol | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (file.kind === "markdown") {
    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (!heading) return null;
    return {
      filePath: file.path,
      name: heading[2].trim(),
      kind: "heading",
      line: index + 1,
      signature: trimmed,
    };
  }

  if (file.kind === "config") {
    const section = /^["']?([A-Za-z0-9_.-]+)["']?\s*[:=]/.exec(trimmed);
    if (!section) return null;
    return {
      filePath: file.path,
      name: section[1],
      kind: "section",
      line: index + 1,
      signature: trimmed.slice(0, 180),
    };
  }

  if (file.kind !== "source") return null;

  const patterns: Array<{
    kind: AgentCodeSymbolKind;
    pattern: RegExp;
  }> = [
    {
      kind: "function",
      pattern: /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\b/,
    },
    {
      kind: "class",
      pattern: /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)\b/,
    },
    {
      kind: "interface",
      pattern: /^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)\b/,
    },
    {
      kind: "type",
      pattern: /^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\b/,
    },
    {
      kind: "constant",
      pattern: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/,
    },
  ];

  for (const entry of patterns) {
    const match = entry.pattern.exec(trimmed);
    if (match?.[1]) {
      return {
        filePath: file.path,
        name: match[1],
        kind: entry.kind,
        line: index + 1,
        signature: trimmed.slice(0, 180),
      };
    }
  }

  return null;
}

export function extractAgentCodeSymbols(
  workspace: AgentWorkspaceState,
  filePath?: string,
  limit = 80
): AgentCodeSymbol[] {
  const files = filePath
    ? workspace.files.filter((file) => file.path === filePath)
    : workspace.files;
  const symbols: AgentCodeSymbol[] = [];

  for (const file of files) {
    if (file.kind === "image") continue;
    const lines = file.content.split("\n");
    lines.forEach((line, index) => {
      const symbol = createAgentCodeSymbol(file, line, index);
      if (symbol) symbols.push(symbol);
    });
    if (symbols.length >= limit) return symbols.slice(0, limit);
  }

  return symbols.slice(0, limit);
}

export function summarizeAgentRepository(workspace: AgentWorkspaceState): AgentRepositorySummary {
  const languageMap = new Map<string, number>();
  const directories = new Set<string>();

  for (const file of workspace.files) {
    languageMap.set(file.language, (languageMap.get(file.language) ?? 0) + 1);
    const relativePath = relativeAgentFilePath(workspace, file.path);
    const parts = relativePath.split("/");
    if (parts.length > 1) directories.add(parts.slice(0, -1).join("/"));
  }

  return {
    projectPath: workspace.projectPath,
    branch: workspace.branch,
    fileCount: workspace.files.length,
    changedCount: changedAgentFiles(workspace).length,
    languageCounts: [...languageMap.entries()]
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count || a.language.localeCompare(b.language)),
    directories: [...directories].sort(),
    largestFiles: workspace.files
      .map((file) => ({
        path: relativeAgentFilePath(workspace, file.path),
        bytes: file.content.length,
      }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5),
    diagnostics: analyzeAgentWorkspace(workspace),
  };
}

export function answerAgentCompanionQuestion(question: string): string {
  const normalized = question.toLowerCase();
  if (normalized.includes("tezos")) {
    return "Tezos work in wtfOS should keep Mainnet and Shadownet explicit, use configured RPC defaults, and ask the wallet to sign only after a visible contract, chain, account, and fee review.";
  }
  if (normalized.includes("at protocol") || normalized.includes("bluesky")) {
    return "AT Protocol work in wtfOS is centered on user-owned repos, explicit OAuth scopes, and app-specific records that can be indexed without handing broad account power to an agent.";
  }
  if (normalized.includes("mcp") || normalized.includes("permission")) {
    return "MCP access uses paired bearer tokens, scoped tool grants, app-gate checks, and revocation. Browser cookies are not accepted by the /mcp endpoint.";
  }
  if (normalized.includes("file") || normalized.includes("project")) {
    return "Agent projects belong under the wtfOS filesystem namespace so File Manager, Studio, Game Studio, and MCP tools can reason about the same project object.";
  }
  return "Agent can help plan, edit, test, debug, and explain wtfOS work while keeping provider credentials client-owned and every cross-app action behind visible OS permissions.";
}
