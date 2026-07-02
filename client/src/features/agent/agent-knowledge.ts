import { WTF_DWELLINGS } from "@shared/wtf-dwellings";
import { WTF_PROJECT_BUNDLE_SECTIONS } from "@shared/wtf-project-bundles";
import { ADMIN_SURFACES } from "../admin-os/admin-surface-registry";
import { PAGE_DEFS } from "../../routes/page-defs";
import {
  AGENT_EXTENSION_POINT_KEYS,
  AGENT_PROVIDER_ADAPTERS,
  DEFAULT_AGENT_PERMISSIONS,
  createDefaultAgentExtensionManifests,
  type AgentExtensionManifest,
  type AgentExtensionPoint,
  type AgentPermissionKey,
} from "./agent-model";

export type AgentKnowledgeKind =
  | "application"
  | "admin-surface"
  | "provider"
  | "filesystem"
  | "project-bundle"
  | "mcp"
  | "permission"
  | "extension"
  | "architecture"
  | "chain-policy";

export type AgentKnowledgeEntry = {
  id: string;
  title: string;
  kind: AgentKnowledgeKind;
  source: string;
  summary: string;
  tags: string[];
  route?: string;
  permissions?: AgentPermissionKey[];
  references?: string[];
};

export type AgentKnowledgeBase = {
  version: 1;
  source: "wtfos-agent-knowledge";
  entries: AgentKnowledgeEntry[];
};

export type AgentExtensionCatalog = {
  version: 1;
  source: "wtfos-agent-extension-catalog";
  extensionPoints: readonly AgentExtensionPoint[];
  manifests: AgentExtensionManifest[];
};

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9:/._-]+/)
    .filter(Boolean);
}

function entryText(entry: AgentKnowledgeEntry): string {
  return [
    entry.id,
    entry.title,
    entry.kind,
    entry.source,
    entry.summary,
    entry.route,
    ...(entry.tags ?? []),
    ...(entry.references ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function applicationEntries(): AgentKnowledgeEntry[] {
  return PAGE_DEFS.map((def) => ({
    id: `route:${def.pattern}`,
    title: def.title ?? def.pattern,
    kind: "application",
    source: "PAGE_DEFS",
    route: def.pattern,
    permissions: def.auth ? ["application", "read"] : ["read"],
    tags: unique([
      def.group ?? "route",
      def.auth ? "session" : "public",
      ...(def.roles ?? []),
      def.startMenu ? "start-menu" : "",
      def.desktopIcon ? "desktop-icon" : "",
    ].filter(Boolean)),
    summary: `${def.auth ? "Session" : "Public"} ${def.group ?? "route"} route${def.roles?.length ? ` for ${def.roles.join(", ")}` : ""}.`,
    references: ["client/src/routes/page-defs.ts"],
  }));
}

function adminSurfaceEntries(): AgentKnowledgeEntry[] {
  return ADMIN_SURFACES.map((surface) => ({
    id: `admin:${surface.id}`,
    title: surface.label,
    kind: "admin-surface",
    source: "ADMIN_SURFACES",
    route: surface.routePatterns[0],
    permissions: ["application", "read"],
    tags: unique([
      surface.domain,
      surface.subdomain,
      surface.kind,
      surface.desktopAppKey ?? "",
      ...surface.adminPanelTabs,
      ...surface.automationHandles,
    ].filter(Boolean)),
    summary: `${surface.domain} / ${surface.subdomain}; routes ${surface.routePatterns.join(", ")}; handles ${surface.automationHandles.join(", ")}.`,
    references: ["client/src/features/admin-os/admin-surface-registry.ts"],
  }));
}

function providerEntries(): AgentKnowledgeEntry[] {
  return AGENT_PROVIDER_ADAPTERS.map((adapter) => ({
    id: `provider:${adapter.id}`,
    title: adapter.label,
    kind: "provider",
    source: "AGENT_PROVIDER_ADAPTERS",
    permissions: adapter.localRuntime ? ["network"] : ["network", "temporary"],
    tags: unique([
      adapter.id,
      ...adapter.authMethods,
      ...adapter.capabilities,
      adapter.localRuntime ? "local-runtime" : "remote-provider",
      adapter.proxyPolicy,
    ]),
    summary: `${adapter.label} uses ${adapter.defaultAuthMethod} against ${adapter.defaultEndpoint}; credentials are user-owned and ${adapter.proxyPolicy}.`,
    references: ["client/src/features/agent/agent-model.ts"],
  }));
}

function filesystemEntries(): AgentKnowledgeEntry[] {
  return WTF_DWELLINGS.map((dwelling) => ({
    id: `filesystem:${dwelling.key}`,
    title: dwelling.label,
    kind: "filesystem",
    source: "WTF_DWELLINGS",
    route: dwelling.route,
    permissions: ["filesystem", "read"],
    tags: unique([dwelling.key, dwelling.owner, dwelling.access, ...dwelling.bundleDomains]),
    summary: `${dwelling.path} is owned by ${dwelling.owner}: ${dwelling.doctrineRole}`,
    references: ["shared/wtf-dwellings.ts"],
  }));
}

function projectBundleEntries(): AgentKnowledgeEntry[] {
  return WTF_PROJECT_BUNDLE_SECTIONS.map((section) => ({
    id: `project-bundle:${section.key}`,
    title: section.label,
    kind: "project-bundle",
    source: "WTF_PROJECT_BUNDLE_SECTIONS",
    route: section.route,
    permissions: ["project", "filesystem", "read"],
    tags: unique([
      section.key,
      section.dwelling,
      section.owner,
      ...section.requiredArtifacts,
      ...section.eventHandles,
    ]),
    summary: `${section.owner} project bundle section in ${section.dwelling}: ${section.purpose}`,
    references: ["shared/wtf-project-bundles.ts"],
  }));
}

function permissionEntries(): AgentKnowledgeEntry[] {
  return DEFAULT_AGENT_PERMISSIONS.map((permission) => ({
    id: `permission:${permission.key}`,
    title: permission.label,
    kind: "permission",
    source: "DEFAULT_AGENT_PERMISSIONS",
    permissions: [permission.key],
    tags: [permission.key, permission.scope, permission.enabled ? "enabled" : "disabled"],
    summary: permission.description,
    references: ["client/src/features/agent/agent-model.ts"],
  }));
}

const ARCHITECTURE_ENTRIES: AgentKnowledgeEntry[] = [
  {
    id: "architecture:agent-platform",
    title: "Agent modular platform",
    kind: "architecture",
    source: "Agent architecture",
    permissions: ["read", "project", "persistent"],
    tags: ["provider-adapters", "provider-capability-profiles", "conversation-engine", "ide", "git", "mcp", "mcp-access-preview", "permission-manager", "knowledge-engine", "extension-system", "extension-manifests"],
    summary:
      "Agent is split into provider adapters, provider capability profiles, UI, IDE workbench, native git worktree state, conversation runtime, MCP boundary and access preview, permission grants, knowledge base, filesystem snapshots, and user-reviewed extension manifests.",
    references: ["client/src/features/agent"],
  },
  {
    id: "mcp:paired-token-boundary",
    title: "MCP paired-token boundary",
    kind: "mcp",
    source: "WTF OS Registry",
    permissions: ["read", "application", "temporary"],
    tags: ["mcp", "paired-token", "scopes", "revocation", "app-gates"],
    summary:
      "MCP access uses paired bearer tokens, scoped tool grants, app-gate checks, rate limits, and revocation. Browser cookies are not accepted by the /mcp endpoint.",
    route: "/agent",
    references: ["docs/domains/wtf-os-registry.md"],
  },
  {
    id: "chain:tezos-rpc-policy",
    title: "Tezos and Etherlink RPC policy",
    kind: "chain-policy",
    source: "AGENTS.md",
    permissions: ["network", "wallet", "temporary"],
    tags: ["tezos", "etherlink", "mainnet", "shadownet", "rpc", "wallet"],
    summary:
      "Tezos Mainnet, Tezos Shadownet, Etherlink Mainnet, and Etherlink Shadownet choices stay explicit; defaults come from project config before public fallbacks, and wallet actions need visible chain/account review.",
    references: ["AGENTS.md"],
  },
  {
    id: "identity:at-protocol-policy",
    title: "AT Protocol identity policy",
    kind: "architecture",
    source: "wtfOS identity architecture",
    permissions: ["read", "application", "temporary"],
    tags: ["at-protocol", "bluesky", "oauth", "repo", "identity"],
    summary:
      "AT Protocol work centers on user-owned repos, explicit OAuth scopes, canonical callback identity, app-specific records, and indexable facts without broad account power.",
    references: ["docs/domains/identity-and-social.md"],
  },
];

export function buildAgentKnowledgeBase(): AgentKnowledgeBase {
  const extensionManifests = createDefaultAgentExtensionManifests();
  return {
    version: 1,
    source: "wtfos-agent-knowledge",
    entries: [
      ...applicationEntries(),
      ...adminSurfaceEntries(),
      ...providerEntries(),
      ...filesystemEntries(),
      ...projectBundleEntries(),
      ...permissionEntries(),
      ...ARCHITECTURE_ENTRIES,
      ...extensionManifests.map((extension) => ({
        id: `extension:${extension.id}`,
        title: extension.label,
        kind: "extension" as const,
        source: "Agent extension catalog",
        permissions: extension.permissions,
        tags: [extension.extensionPoint, extension.owner, extension.enabledByDefault ? "enabled" : "disabled"],
        summary: extension.description,
        references: extension.references,
      })),
    ],
  };
}

export function buildAgentExtensionCatalog(): AgentExtensionCatalog {
  return {
    version: 1,
    source: "wtfos-agent-extension-catalog",
    extensionPoints: AGENT_EXTENSION_POINT_KEYS,
    manifests: createDefaultAgentExtensionManifests(),
  };
}

export function searchAgentKnowledgeBase(
  query: string,
  base: AgentKnowledgeBase = buildAgentKnowledgeBase(),
  limit = 8
): AgentKnowledgeEntry[] {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return base.entries.slice(0, limit);

  return base.entries
    .map((entry) => {
      const text = entryText(entry);
      const score = queryTokens.reduce((sum, token) => {
        if (entry.id.toLowerCase().includes(token)) return sum + 4;
        if (entry.title.toLowerCase().includes(token)) return sum + 3;
        if (entry.tags.some((tag) => tag.toLowerCase().includes(token))) return sum + 2;
        return text.includes(token) ? sum + 1 : sum;
      }, 0);
      return { entry, score };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit)
    .map((result) => result.entry);
}

export function answerAgentCompanionQuestionFromKnowledge(
  question: string,
  base: AgentKnowledgeBase = buildAgentKnowledgeBase()
): string {
  const lowerQuestion = question.toLowerCase();
  const preferredMcp = lowerQuestion.includes("mcp")
    ? base.entries.find((entry) => entry.id === "mcp:paired-token-boundary")
    : undefined;
  const matches = [
    ...(preferredMcp ? [preferredMcp] : []),
    ...searchAgentKnowledgeBase(question, base, 4).filter(
      (entry) => entry.id !== preferredMcp?.id
    ),
  ].slice(0, 3);
  if (matches.length === 0) {
    return "Agent can help plan, edit, test, debug, and explain wtfOS work while keeping provider credentials client-owned and every cross-app action behind visible OS permissions.";
  }

  return matches
    .map((entry) => `${entry.title}: ${entry.summary}`)
    .join("\n\n");
}
