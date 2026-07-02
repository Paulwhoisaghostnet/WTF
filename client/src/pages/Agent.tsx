import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Braces,
  CheckCircle2,
  CircleSlash,
  Code2,
  Download,
  FileCode2,
  FileText,
  FolderOpen,
  GitBranch,
  Image as ImageIcon,
  KeyRound,
  ListChecks,
  MessageSquareText,
  Play,
  PlugZap,
  Save,
  Search,
  Split,
  TerminalSquare,
  Trash2,
  Upload,
} from "lucide-react";
import { Separator } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { UiButton, UiPanel, UiToolbar } from "../components/wtfos-ui";
import { api } from "../lib/api";
import { usePresentationShell } from "../lib/presentation-shell";
import { logClientSystemEvent } from "../lib/system-log";
import {
  AGENT_PROVIDER_ADAPTERS,
  AGENT_PROVIDER_IDS,
  addAgentCodeActions,
  addAgentPlanItem,
  addAgentWorkspaceFile,
  analyzeAgentWorkspace,
  agentMcpScopesForPermissions,
  applyAgentCodeAction,
  buildAgentProviderCapabilityProfile,
  buildAgentMcpAccessPreview,
  changedAgentFiles,
  commitAgentGitChanges,
  createAgentGitBranch,
  createDefaultAgentWorkspace,
  deleteAgentWorkspaceFile,
  detectAgentProviderCapabilities,
  dismissAgentCodeAction,
  extractAgentCodeSymbols,
  getAgentGitStatus,
  getAgentProviderAdapter,
  installAgentExtension,
  normalizeAgentWorkspace,
  parseAgentActionsFromText,
  removeAgentExtension,
  renameAgentWorkspaceFile,
  searchAgentWorkspaceFiles,
  setAgentProviderCapabilityOverrides,
  setAgentExtensionEnabled,
  stageAllAgentGitChanges,
  stageAgentGitPaths,
  switchAgentGitBranch,
  summarizeAgentRepository,
  summarizeProviderConnection,
  unstageAgentGitPaths,
  updateAgentPlanItemStatus,
  updateAgentFileContent,
  type AgentAuthMethod,
  type AgentCapability,
  type AgentChatMessage,
  type AgentCodeAction,
  type AgentCodeSymbol,
  type AgentExtensionPoint,
  type AgentFileDiagnosticSeverity,
  type AgentGitFileStatus,
  type AgentMemory,
  type AgentPlanStatus,
  type AgentProviderId,
  type AgentWorkspaceState,
} from "../features/agent/agent-model";
import {
  answerAgentCompanionQuestionFromKnowledge,
  buildAgentExtensionCatalog,
  buildAgentKnowledgeBase,
  searchAgentKnowledgeBase,
} from "../features/agent/agent-knowledge";
import {
  agentFilesystemStats,
  exportAgentProjectSnapshot,
  importAgentProjectSnapshot,
  persistAgentProjectSnapshot,
  readAgentProjectSnapshots,
  restoreAgentProjectSnapshot,
  saveAgentProjectSnapshot,
  type AgentProjectSnapshot,
} from "../features/agent/agent-filesystem";
import {
  AgentProviderError,
  isLocalAgentEndpoint,
  sendAgentProviderMessage,
} from "../features/agent/provider-runtime";

const STORAGE_KEY = "wtfos.agent.workspace.v1";
const CREDENTIAL_SESSION_KEY = "wtfos.agent.credentials.session.v1";

type AgentTab = "chat" | "plan" | "workbench" | "git" | "permissions" | "memory" | "extensions" | "companion";

type McpTokenRecord = {
  id: number;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type McpTokensResponse = {
  endpoint: string;
  tokens: McpTokenRecord[];
};

type McpTokenCreateResponse = {
  endpoint: string;
  token: string;
  tokenRecord: McpTokenRecord;
  warning: string;
};

const AGENT_MCP_ACCESS_WEIGHT = {
  read: 1,
  write: 2,
  execute: 3,
  admin: 4,
} as const;

const AGENT_EXTENSION_POINT_LABELS: Record<AgentExtensionPoint, string> = {
  provider: "Providers",
  "mcp-server": "MCP Servers",
  tool: "Tools",
  personality: "Personalities",
  theme: "Themes",
  "knowledge-pack": "Knowledge Packs",
};

const DEFAULT_EXTENSION_MANIFEST_DRAFT = JSON.stringify(
  {
    id: "tool.local-linter",
    label: "Local Linter",
    extensionPoint: "tool",
    version: "0.1.0",
    owner: "Your team",
    description: "Adds a local project lint tool manifest that requires explicit execute and project grants before use.",
    permissions: ["read", "project", "execute"],
    enabledByDefault: false,
    references: ["wtfos://Agent/Extensions/local-linter"],
  },
  null,
  2
);

type SessionCredentialState = Partial<
  Record<AgentProviderId, { secretPresent: boolean; secret?: string; updatedAt: string }>
>;

type SendStatus = "idle" | "sending" | "error";

const agentRegionAttrs = (region: string): any => ({
  "data-agent-region": region,
});

const Shell = styled.div.attrs(agentRegionAttrs("surface"))`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;

  &[data-agent-presentation-host="gamma"] {
    background: #070706;
    background-image: none;
    color: #f2ead9;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }

  &[data-agent-presentation-host="gamma"],
  &[data-agent-presentation-host="gamma"] * {
    box-shadow: none !important;
    letter-spacing: 0 !important;
    text-shadow: none !important;
  }

  &[data-agent-presentation-host="gamma"] * {
    background-image: none !important;
  }

  &[data-agent-presentation-host="gamma"] :where(button, input, textarea, select, p, span, strong, div, section, article, nav, h1, h2, h3, h4, label, legend, fieldset) {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  }

  &[data-agent-presentation-host="gamma"] :where(code, pre),
  &[data-agent-presentation-host="gamma"] [data-agent-region="header-meta"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="status-label"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="editor"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="diff-pane"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="terminal-pane"] {
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace !important;
  }

  &[data-agent-presentation-host="gamma"] :where(p, span, div, label, legend, strong) {
    color: #f2ead9 !important;
  }

  &[data-agent-presentation-host="gamma"] [data-agent-region] {
    border-radius: 6px !important;
    min-width: 0;
  }

  &[data-agent-presentation-host="gamma"] section,
  &[data-agent-presentation-host="gamma"] [data-agent-region="header"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="status-cell"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="action-row"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="permission-row"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="capability-option"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="chat-bubble"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="file-button"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="preview-pane"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="notice-pane"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="diff-pane"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="terminal-pane"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="image-preview"] {
    background: #11110f !important;
    border: 1px solid rgba(242, 234, 217, 0.16) !important;
    color: #f2ead9 !important;
  }

  &[data-agent-presentation-host="gamma"] [data-agent-region="tabs"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="tab"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="row-list"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="panel-grid"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="side-column"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="badge-row"] {
    background: transparent !important;
  }

  &[data-agent-presentation-host="gamma"] [data-agent-region="agent-mark"] {
    background: #070706 !important;
    border: 1px solid #00d2ff !important;
    color: #00d2ff !important;
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace !important;
  }

  &[data-agent-presentation-host="gamma"] [data-agent-region="badge"] {
    background: #070706 !important;
    border: 1px solid var(--agent-badge-gamma-border, rgba(242, 234, 217, 0.22)) !important;
    color: var(--agent-badge-gamma-color, #f2ead9) !important;
  }

  &[data-agent-presentation-host="gamma"] [data-agent-region="badge"][data-agent-tone="ok"] {
    border-color: #d6ff3f !important;
    color: #d6ff3f !important;
  }

  &[data-agent-presentation-host="gamma"] [data-agent-region="badge"][data-agent-tone="info"],
  &[data-agent-presentation-host="gamma"] a {
    border-color: rgba(0, 210, 255, 0.58) !important;
    color: #00d2ff !important;
  }

  &[data-agent-presentation-host="gamma"] [data-agent-region="status-label"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="row-meta"],
  &[data-agent-presentation-host="gamma"] [data-agent-region="header-meta"] {
    color: rgba(242, 234, 217, 0.68) !important;
  }

  &[data-agent-presentation-host="gamma"] button:not(:disabled),
  &[data-agent-presentation-host="gamma"] input:not([type="checkbox"]):not([type="radio"]),
  &[data-agent-presentation-host="gamma"] select,
  &[data-agent-presentation-host="gamma"] textarea {
    background: #070706 !important;
    border: 1px solid rgba(242, 234, 217, 0.28) !important;
    border-color: rgba(242, 234, 217, 0.28) !important;
    border-radius: 6px !important;
    color: #f2ead9 !important;
  }

  &[data-agent-presentation-host="gamma"] button[aria-selected="true"],
  &[data-agent-presentation-host="gamma"] button[aria-pressed="true"] {
    border-color: #00d2ff !important;
    color: #00d2ff !important;
  }

  &[data-agent-presentation-host="gamma"] button:hover,
  &[data-agent-presentation-host="gamma"] button:focus-visible,
  &[data-agent-presentation-host="gamma"] input:focus-visible,
  &[data-agent-presentation-host="gamma"] select:focus-visible,
  &[data-agent-presentation-host="gamma"] textarea:focus-visible {
    outline: 1px solid #00d2ff !important;
    outline-offset: 2px;
  }
`;

const HeaderBar = styled(UiToolbar).attrs(agentRegionAttrs("header"))`
  align-items: stretch;
  justify-content: space-between;
`;

const HeaderIdentity = styled.div.attrs(agentRegionAttrs("header-identity"))`
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  min-width: min(100%, 420px);
`;

const AgentMark = styled.div.attrs(agentRegionAttrs("agent-mark"))`
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--wtf-app-border, #808080);
  background:
    linear-gradient(135deg, #111827 0%, #1f766e 52%, #f6c445 100%);
  color: #ffffff;
  font-weight: 800;
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.34);
`;

const HeaderTitle = styled.h1`
  margin: 0;
  font-size: var(--wtf-type-title, 18px);
  line-height: 1.15;
  color: var(--wtf-app-text, #111);
`;

const HeaderMeta = styled.div.attrs(agentRegionAttrs("header-meta"))`
  margin-top: 2px;
  font-size: var(--wtf-type-caption, 13px);
  color: var(--wtf-app-muted-text, #384352);
  overflow-wrap: anywhere;
`;

const HeaderControls = styled.div.attrs(agentRegionAttrs("header-controls"))`
  display: flex;
  flex-wrap: wrap;
  gap: var(--wtf-space-2, 8px);
  justify-content: flex-end;
  align-items: center;
`;

const Select = styled.select.attrs(agentRegionAttrs("select"))`
  min-height: 32px;
  padding: 4px 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-control-bg, #ffffff);
  color: var(--wtf-app-text, #111);
  font: inherit;
`;

const Input = styled.input.attrs(agentRegionAttrs("input"))`
  width: 100%;
  min-height: 32px;
  padding: 5px 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-control-bg, #ffffff);
  color: var(--wtf-app-text, #111);
  font: inherit;
`;

const TextArea = styled.textarea.attrs(agentRegionAttrs("textarea"))`
  width: 100%;
  min-height: 108px;
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-control-bg, #ffffff);
  color: var(--wtf-app-text, #111);
  font: inherit;
  line-height: 1.4;
  resize: vertical;
`;

const Tabs = styled.div.attrs(agentRegionAttrs("tabs"))`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
`;

const TabButton = styled(UiButton).attrs(agentRegionAttrs("tab"))<{ $active: boolean }>`
  min-width: 108px;
  justify-content: center;
  font-weight: ${(p) => (p.$active ? 800 : 600)};
  box-shadow: ${(p) => (p.$active ? "inset 0 3px 0 var(--wtf-app-primary, #000080)" : undefined)};
`;

const StatusGrid = styled.div.attrs(agentRegionAttrs("status-grid"))`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 128px), 1fr));
  gap: var(--wtf-space-2, 8px);

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const StatusCell = styled.div.attrs(agentRegionAttrs("status-cell"))`
  min-height: 66px;
  padding: var(--wtf-space-2, 8px);
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  min-width: 0;
`;

const StatusLabel = styled.div.attrs(agentRegionAttrs("status-label"))`
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 800;
  color: var(--wtf-app-muted-text, #384352);
`;

const StatusValue = styled.div.attrs(agentRegionAttrs("status-value"))`
  margin-top: 4px;
  font-size: var(--wtf-type-body, 15px);
  font-weight: 800;
  overflow-wrap: anywhere;
`;

const SplitLayout = styled.div.attrs(agentRegionAttrs("split-layout"))`
  display: grid;
  grid-template-columns: minmax(250px, 0.78fr) minmax(0, 1.4fr) minmax(260px, 0.88fr);
  gap: var(--wtf-space-3, 12px);
  align-items: start;

  @media (max-width: 1180px) {
    grid-template-columns: minmax(240px, 0.8fr) minmax(0, 1.2fr);
  }

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const SideColumn = styled.div.attrs(agentRegionAttrs("side-column"))`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;
`;

const PanelGrid = styled.div.attrs(agentRegionAttrs("panel-grid"))`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  min-width: 0;
`;

const ProviderGrid = styled.div.attrs(agentRegionAttrs("provider-grid"))`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--wtf-space-2, 8px);

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.label.attrs(agentRegionAttrs("field"))`
  display: grid;
  gap: 4px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;
  color: var(--wtf-app-text, #111);
`;

const BadgeRow = styled.div.attrs(agentRegionAttrs("badge-row"))`
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  min-width: 0;
`;

const Badge = styled.span.attrs(agentRegionAttrs("badge"))<{ $tone?: "ok" | "warn" | "info" | "idle" }>`
  --agent-badge-gamma-border: ${(p) =>
    p.$tone === "ok"
      ? "#d6ff3f"
      : p.$tone === "info"
        ? "rgba(0, 210, 255, 0.58)"
        : "rgba(242, 234, 217, 0.22)"};
  --agent-badge-gamma-color: ${(p) =>
    p.$tone === "ok" ? "#d6ff3f" : p.$tone === "info" ? "#00d2ff" : "#f2ead9"};
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 2px 6px;
  border: 1px solid
    ${(p) =>
      p.$tone === "ok"
        ? "var(--wtf-app-success, #176b38)"
        : p.$tone === "warn"
          ? "var(--wtf-app-warning, #8a4b00)"
          : p.$tone === "info"
            ? "var(--wtf-app-info, #175cd3)"
            : "var(--wtf-app-border, #808080)"};
  background: var(--wtf-app-surface-raised, #ffffff);
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.2;
`;

const ChatLog = styled.div.attrs(agentRegionAttrs("chat-log"))`
  display: grid;
  gap: 8px;
  max-height: 454px;
  overflow: auto;
  padding-right: 2px;
`;

const ChatBubble = styled.div.attrs(agentRegionAttrs("chat-bubble"))<{ $role: "user" | "assistant" | "system" }>`
  justify-self: ${(p) => (p.$role === "user" ? "end" : "stretch")};
  width: ${(p) => (p.$role === "user" ? "min(86%, 620px)" : "100%")};
  padding: 8px;
  border: 1px solid
    ${(p) =>
      p.$role === "system"
        ? "var(--wtf-app-info, #175cd3)"
        : p.$role === "assistant"
          ? "var(--wtf-app-success, #176b38)"
          : "var(--wtf-app-border, #808080)"};
  background: ${(p) =>
    p.$role === "user"
      ? "var(--wtf-app-control-bg, #ffffff)"
      : "var(--wtf-app-surface-raised, #ffffff)"};
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
  white-space: pre-wrap;
`;

const Composer = styled.form.attrs(agentRegionAttrs("composer"))`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const FileSearch = styled.div.attrs(agentRegionAttrs("file-search"))`
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
`;

const FileList = styled.div.attrs(agentRegionAttrs("file-list"))`
  display: grid;
  gap: 5px;
  max-height: 320px;
  overflow: auto;
`;

const FileButton = styled.button.attrs(agentRegionAttrs("file-button"))<{ $active: boolean }>`
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  min-height: 36px;
  padding: 6px;
  border: 1px solid ${(p) => (p.$active ? "var(--wtf-app-primary, #000080)" : "var(--wtf-app-border, #808080)")};
  background: ${(p) => (p.$active ? "color-mix(in srgb, var(--wtf-app-primary, #000080) 12%, #ffffff)" : "var(--wtf-app-control-bg, #ffffff)")};
  color: var(--wtf-app-text, #111);
  text-align: left;
  font: inherit;
  cursor: pointer;
`;

const FilePath = styled.span.attrs(agentRegionAttrs("file-path"))`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const EditorFrame = styled.div.attrs(agentRegionAttrs("editor-frame"))`
  display: grid;
  gap: 8px;
  min-width: 0;
`;

const EditorTextArea = styled.textarea.attrs(agentRegionAttrs("editor"))`
  width: 100%;
  min-height: 386px;
  resize: vertical;
  padding: 10px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: #111827;
  color: #f8fafc;
  font-family: var(--wtf-mono-font, "SFMono-Regular", Consolas, monospace);
  font-size: 13px;
  line-height: 1.45;
  tab-size: 2;
`;

const PreviewPane = styled.div.attrs(agentRegionAttrs("preview-pane"))`
  min-height: 180px;
  padding: 10px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  overflow: auto;
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.45;
`;

const NoticePane = styled.div.attrs(agentRegionAttrs("notice-pane"))`
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
  overflow-wrap: anywhere;
`;

const DiffPane = styled.pre.attrs(agentRegionAttrs("diff-pane"))`
  min-height: 164px;
  max-height: 260px;
  margin: 0;
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: #0f172a;
  color: #e2e8f0;
  overflow: auto;
  font-family: var(--wtf-mono-font, "SFMono-Regular", Consolas, monospace);
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
`;

const TerminalPane = styled.pre.attrs(agentRegionAttrs("terminal-pane"))`
  min-height: 164px;
  max-height: 240px;
  margin: 0;
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: #101010;
  color: #d9f99d;
  overflow: auto;
  font-family: var(--wtf-mono-font, "SFMono-Regular", Consolas, monospace);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
`;

const RowList = styled.div.attrs(agentRegionAttrs("row-list"))`
  display: grid;
  gap: 7px;
`;

const ActionRow = styled.div.attrs(agentRegionAttrs("action-row"))`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  min-width: 0;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const SnapshotRow = styled(ActionRow)`
  grid-template-columns: 1fr;
`;

const SnapshotActions = styled(UiToolbar).attrs(agentRegionAttrs("toolbar"))`
  justify-content: flex-start;
`;

const RowTitle = styled.div.attrs(agentRegionAttrs("row-title"))`
  font-size: var(--wtf-type-body, 15px);
  font-weight: 800;
  overflow-wrap: anywhere;
`;

const RowMeta = styled.div.attrs(agentRegionAttrs("row-meta"))`
  margin-top: 2px;
  color: var(--wtf-app-muted-text, #384352);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

const PermissionGrid = styled.div.attrs(agentRegionAttrs("permission-grid"))`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const PermissionRow = styled.label.attrs(agentRegionAttrs("permission-row"))`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 8px;
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
`;

const CapabilityGrid = styled.div.attrs(agentRegionAttrs("capability-grid"))`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;

const CapabilityOption = styled.label.attrs(agentRegionAttrs("capability-option"))<{ $enabled: boolean }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 8px;
  border: 1px solid
    ${(p) =>
      p.$enabled
        ? "var(--wtf-app-success, #176b38)"
        : "var(--wtf-app-border, #808080)"};
  background: var(--wtf-app-surface-raised, #ffffff);
  min-width: 0;
`;

const MemoryGrid = styled.div.attrs(agentRegionAttrs("memory-grid"))`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 880px) {
    grid-template-columns: 1fr;
  }
`;

const ImagePreview = styled.div.attrs(agentRegionAttrs("image-preview"))`
  min-height: 190px;
  display: grid;
  place-items: center;
  border: 1px solid var(--wtf-app-border, #808080);
  background:
    linear-gradient(45deg, rgba(31, 118, 110, 0.22) 25%, transparent 25% 50%, rgba(246, 196, 69, 0.24) 50% 75%, transparent 75%),
    linear-gradient(135deg, #111827, #334155);
  background-size: 32px 32px, auto;
  color: #ffffff;
  font-weight: 800;
`;

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readWorkspace(): AgentWorkspaceState {
  if (typeof window === "undefined") return createDefaultAgentWorkspace();
  try {
    return normalizeAgentWorkspace(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null"));
  } catch {
    return createDefaultAgentWorkspace();
  }
}

function readCredentialState(): SessionCredentialState {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(CREDENTIAL_SESSION_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeCredentialState(state: SessionCredentialState) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CREDENTIAL_SESSION_KEY, JSON.stringify(state));
}

function markdownPreview(content: string) {
  const lines = content.split("\n");
  return lines.map((line, index) => {
    if (line.startsWith("# ")) return <h2 key={index}>{line.slice(2)}</h2>;
    if (line.startsWith("## ")) return <h3 key={index}>{line.slice(3)}</h3>;
    if (line.startsWith("- ")) return <p key={index}>• {line.slice(2)}</p>;
    if (!line.trim()) return <br key={index} />;
    return <p key={index}>{line}</p>;
  });
}

function renderFileIcon(kind: string) {
  if (kind === "markdown") return <FileText size={16} aria-hidden />;
  if (kind === "image") return <ImageIcon size={16} aria-hidden />;
  return <FileCode2 size={16} aria-hidden />;
}

function buildDiffText(file: AgentWorkspaceState["files"][number] | undefined) {
  if (!file) return "No file selected.";
  if (file.content === file.baselineContent) return "No local changes.";
  return [
    `--- ${file.path}`,
    `+++ ${file.path}`,
    ...file.baselineContent.split("\n").slice(0, 10).map((line) => `- ${line}`),
    ...file.content.split("\n").slice(0, 16).map((line) => `+ ${line}`),
  ].join("\n");
}

function displayAgentFilePath(workspace: AgentWorkspaceState, path: string) {
  return path.startsWith(`${workspace.projectPath}/`)
    ? path.replace(`${workspace.projectPath}/`, "")
    : path;
}

function editorOffsetForLine(content: string, line: number) {
  const targetLine = Math.max(1, Math.floor(line));
  if (targetLine <= 1) return 0;
  const lines = content.split("\n");
  const offset = lines.slice(0, targetLine - 1).join("\n").length + 1;
  return Math.min(content.length, offset);
}

function runSafeTerminalCommand(command: string, workspace: AgentWorkspaceState) {
  const normalized = command.trim().toLowerCase();
  if (!normalized) return "$";
  if (normalized === "pwd") return `${workspace.projectPath}`;
  if (normalized === "ls") return workspace.files.map((file) => file.path.replace(`${workspace.projectPath}/`, "")).join("\n");
  if (normalized === "git status") {
    const changed = getAgentGitStatus(workspace);
    const stagedCount = changed.filter((file) => file.staged).length;
    const unstagedCount = changed.length - stagedCount;
    return [
      `On branch ${workspace.git.currentBranch}`,
      changed.length ? `${stagedCount} staged, ${unstagedCount} unstaged` : "nothing to commit, working tree clean",
      ...changed.map((file) => `  ${file.staged ? "staged" : "unstaged"} ${file.status}: ${file.relativePath}`),
    ].join("\n");
  }
  if (normalized === "npm test") return "Policy tests queued in Agent workspace: provider adapters, permissions, memory, route wiring.";
  if (normalized === "agent diagnostics") {
    const diagnostics = analyzeAgentWorkspace(workspace);
    return diagnostics.length
      ? diagnostics
          .map((diagnostic) =>
            [
              diagnostic.severity.toUpperCase(),
              diagnostic.rule,
              diagnostic.filePath ? displayAgentFilePath(workspace, diagnostic.filePath) : "workspace",
              diagnostic.line ? `line ${diagnostic.line}` : "",
              diagnostic.message,
            ]
              .filter(Boolean)
              .join(" - ")
          )
          .join("\n")
      : "No Agent diagnostics found.";
  }
  if (normalized === "wtfos mcp") return "MCP endpoint is /mcp. Browser cookies are ignored; use scoped paired bearer tokens.";
  return `Command '${command}' is not in the safe Agent terminal allowlist.`;
}

function snapshotFilename(snapshot: AgentProjectSnapshot) {
  return `${snapshot.id || "agent-project"}.agent-workspace.json`;
}

function downloadTextFile(filename: string, content: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function providerAuthMethods(providerId: AgentProviderId): AgentAuthMethod[] {
  return getAgentProviderAdapter(providerId).authMethods;
}

export function Agent() {
  const queryClient = useQueryClient();
  const presentation = usePresentationShell();
  const snapshotImportRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const [workspace, setWorkspace] = useState<AgentWorkspaceState>(() => readWorkspace());
  const [activeTab, setActiveTab] = useState<AgentTab>("chat");
  const [credentialSession, setCredentialSession] = useState<SessionCredentialState>(() =>
    readCredentialState()
  );
  const [snapshots, setSnapshots] = useState<AgentProjectSnapshot[]>(() =>
    readAgentProjectSnapshots()
  );
  const [filesystemNotice, setFilesystemNotice] = useState<string | null>(null);
  const [credentialDraft, setCredentialDraft] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [fileQuery, setFileQuery] = useState("");
  const [codeSearchQuery, setCodeSearchQuery] = useState("mcp");
  const [newFilePath, setNewFilePath] = useState("src/new-file.ts");
  const [newFileContent, setNewFileContent] = useState("");
  const [renameFilePath, setRenameFilePath] = useState("");
  const [fileActionNotice, setFileActionNotice] = useState<string | null>(null);
  const [newPlanTitle, setNewPlanTitle] = useState("Review generated edits");
  const [newPlanDetails, setNewPlanDetails] = useState("");
  const [actionDraft, setActionDraft] = useState("");
  const [workflowNotice, setWorkflowNotice] = useState<string | null>(null);
  const [extensionManifestDraft, setExtensionManifestDraft] = useState(DEFAULT_EXTENSION_MANIFEST_DRAFT);
  const [extensionNotice, setExtensionNotice] = useState<string | null>(null);
  const [selectedEditorLine, setSelectedEditorLine] = useState<number | null>(null);
  const [terminalCommand, setTerminalCommand] = useState("git status");
  const [terminalOutput, setTerminalOutput] = useState<string[]>(["> Agent terminal ready"]);
  const [commitMessage, setCommitMessage] = useState("Update Agent project");
  const [newBranchName, setNewBranchName] = useState("agent/next-change");
  const [gitNotice, setGitNotice] = useState<string | null>(null);
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);
  const [companionQuestion, setCompanionQuestion] = useState("How does MCP permission work?");
  const [companionAnswer, setCompanionAnswer] = useState(() =>
    answerAgentCompanionQuestionFromKnowledge("How does MCP permission work?")
  );

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  }, [workspace]);

  useEffect(() => {
    logClientSystemEvent({ eventType: "agent.viewed" });
  }, []);

  const activeConnection = workspace.providers[workspace.activeProviderId];
  const activeAdapter = getAgentProviderAdapter(workspace.activeProviderId);
  const activeCredentialRecord = credentialSession[workspace.activeProviderId];
  const activeCredential = activeCredentialRecord?.secret ?? "";
  const activeLocalEndpoint =
    activeAdapter.localRuntime ||
    activeConnection.authMethod === "local-endpoint" ||
    isLocalAgentEndpoint(activeConnection.endpoint);
  const activeRuntimeReady =
    activeConnection.connected && (activeLocalEndpoint || Boolean(activeCredential.trim()));
  const activeCapabilities = detectAgentProviderCapabilities(activeConnection);
  const activeCapabilityProfile = useMemo(
    () => buildAgentProviderCapabilityProfile(activeConnection),
    [activeConnection]
  );
  const selectedFile = workspace.files.find((file) => file.path === workspace.selectedFilePath) ?? workspace.files[0];
  const changedFiles = changedAgentFiles(workspace);
  const mcpScopes = agentMcpScopesForPermissions(workspace.permissions);
  const mcpAccessPreview = useMemo(
    () => buildAgentMcpAccessPreview(workspace.permissions),
    [workspace.permissions]
  );
  const prioritizedMcpAllowedTools = useMemo(
    () =>
      [...mcpAccessPreview.allowedTools].sort(
        (left, right) =>
          AGENT_MCP_ACCESS_WEIGHT[right.accessLevel] -
            AGENT_MCP_ACCESS_WEIGHT[left.accessLevel] ||
          left.label.localeCompare(right.label)
      ),
    [mcpAccessPreview.allowedTools]
  );
  const prioritizedMcpBlockedTools = useMemo(
    () =>
      [...mcpAccessPreview.blockedTools].sort(
        (left, right) =>
          AGENT_MCP_ACCESS_WEIGHT[right.accessLevel] -
            AGENT_MCP_ACCESS_WEIGHT[left.accessLevel] ||
          left.label.localeCompare(right.label)
      ),
    [mcpAccessPreview.blockedTools]
  );
  const snapshotStats = useMemo(() => agentFilesystemStats(snapshots), [snapshots]);
  const canManageFiles = useMemo(
    () =>
      workspace.permissions.some((permission) => permission.key === "write" && permission.enabled) &&
      workspace.permissions.some((permission) => permission.key === "filesystem" && permission.enabled),
    [workspace.permissions]
  );
  const canRunTerminalActions = useMemo(
    () =>
      workspace.permissions.some((permission) => permission.key === "execute" && permission.enabled) &&
      workspace.permissions.some((permission) => permission.key === "terminal" && permission.enabled),
    [workspace.permissions]
  );
  const canManageGit = useMemo(
    () =>
      workspace.permissions.some((permission) => permission.key === "write" && permission.enabled) &&
      workspace.permissions.some((permission) => permission.key === "project" && permission.enabled),
    [workspace.permissions]
  );
  const gitStatus = useMemo(() => getAgentGitStatus(workspace), [workspace]);
  const stagedGitFiles = useMemo(
    () => gitStatus.filter((status) => status.staged),
    [gitStatus]
  );
  const unstagedGitFiles = useMemo(
    () => gitStatus.filter((status) => !status.staged),
    [gitStatus]
  );
  const proposedActions = useMemo(
    () => workspace.codeActions.filter((action) => action.status === "proposed"),
    [workspace.codeActions]
  );
  const planCounts = useMemo(() => {
    return workspace.plan.reduce(
      (counts, item) => ({
        ...counts,
        [item.status]: counts[item.status] + 1,
      }),
      { todo: 0, doing: 0, done: 0, blocked: 0 } as Record<AgentPlanStatus, number>
    );
  }, [workspace.plan]);
  const actionCounts = useMemo(() => {
    return workspace.codeActions.reduce(
      (counts, action) => ({
        ...counts,
        [action.status]: counts[action.status] + 1,
      }),
      { proposed: 0, applied: 0, dismissed: 0 }
    );
  }, [workspace.codeActions]);
  const repoSummary = useMemo(() => summarizeAgentRepository(workspace), [workspace]);
  const codeSearchMatches = useMemo(
    () => searchAgentWorkspaceFiles(workspace, codeSearchQuery, 8),
    [codeSearchQuery, workspace]
  );
  const selectedFileSymbols = useMemo(
    () => extractAgentCodeSymbols(workspace, selectedFile.path, 24),
    [selectedFile.path, workspace]
  );
  const projectSymbols = useMemo(
    () => extractAgentCodeSymbols(workspace, undefined, 80),
    [workspace]
  );
  const codeOutlineSymbols = selectedFileSymbols.length
    ? selectedFileSymbols
    : projectSymbols.slice(0, 12);
  const diagnosticCounts = useMemo(() => {
    return repoSummary.diagnostics.reduce(
      (counts, diagnostic) => ({
        ...counts,
        [diagnostic.severity]: counts[diagnostic.severity] + 1,
      }),
      { error: 0, warning: 0, info: 0 } as Record<AgentFileDiagnosticSeverity, number>
    );
  }, [repoSummary.diagnostics]);
  const agentKnowledgeBase = useMemo(() => buildAgentKnowledgeBase(), []);
  const agentExtensionCatalog = useMemo(() => buildAgentExtensionCatalog(), []);
  const companionKnowledgeMatches = useMemo(
    () => searchAgentKnowledgeBase(companionQuestion, agentKnowledgeBase, 5),
    [agentKnowledgeBase, companionQuestion]
  );
  const extensionCountsByPoint = useMemo(() => {
    return workspace.extensions.reduce(
      (counts, extension) => ({
        ...counts,
        [extension.extensionPoint]: counts[extension.extensionPoint] + 1,
      }),
      {
        provider: 0,
        "mcp-server": 0,
        tool: 0,
        personality: 0,
        theme: 0,
        "knowledge-pack": 0,
      } as Record<AgentExtensionPoint, number>
    );
  }, [workspace.extensions]);
  const enabledExtensionCount = useMemo(
    () => workspace.extensions.filter((extension) => extension.enabled).length,
    [workspace.extensions]
  );
  const userExtensionCount = useMemo(
    () => workspace.extensions.filter((extension) => extension.source === "user").length,
    [workspace.extensions]
  );

  const mcpTokensQuery = useQuery({
    queryKey: ["agent", "mcp", "tokens"],
    queryFn: () => api.get<McpTokensResponse>("/api/mcp/tokens"),
    staleTime: 20_000,
  });
  const mcpTokenRecords = Array.isArray(mcpTokensQuery.data?.tokens)
    ? mcpTokensQuery.data.tokens
    : [];
  const activeMcpTokenCount = mcpTokenRecords.filter((token) => !token.revokedAt).length;

  useEffect(() => {
    setRenameFilePath(displayAgentFilePath(workspace, selectedFile.path));
  }, [selectedFile.path, workspace.projectPath]);

  useEffect(() => {
    if (!selectedEditorLine || selectedFile.kind === "image") return;
    const editor = editorRef.current;
    if (!editor) return;
    const offset = editorOffsetForLine(selectedFile.content, selectedEditorLine);
    editor.focus();
    editor.setSelectionRange(offset, offset);
    const lineCount = Math.max(1, selectedFile.content.split("\n").length);
    const selectedLine = Math.min(selectedEditorLine, lineCount);
    editor.scrollTop = Math.max(
      0,
      (selectedLine / lineCount) * editor.scrollHeight - editor.clientHeight / 2
    );
    editor.dataset.agentSelectedLine = String(Math.min(selectedEditorLine, lineCount));
  }, [selectedEditorLine, selectedFile.content, selectedFile.kind, selectedFile.path]);

  const createMcpTokenMutation = useMutation({
    mutationFn: () =>
      api.post<McpTokenCreateResponse>("/api/mcp/tokens", {
        name: "Agent Workspace",
        scopes: mcpScopes,
      }),
    onSuccess: (result) => {
      setOneTimeToken(result.token);
      void queryClient.invalidateQueries({ queryKey: ["agent", "mcp", "tokens"] });
      logClientSystemEvent({ eventType: "mcp.token.created", metadata: { surface: "agent" } });
    },
  });

  const revokeMcpTokenMutation = useMutation({
    mutationFn: (id: number) => api.delete<{ ok: boolean }>(`/api/mcp/tokens/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agent", "mcp", "tokens"] });
      logClientSystemEvent({ eventType: "mcp.token.revoked", metadata: { surface: "agent" } });
    },
  });

  const filteredFiles = useMemo(() => {
    const query = fileQuery.trim().toLowerCase();
    if (!query) return workspace.files;
    return workspace.files.filter((file) => file.path.toLowerCase().includes(query));
  }, [fileQuery, workspace.files]);

  const updateActiveProvider = useCallback(
    (patch: Partial<typeof activeConnection>) => {
      setWorkspace((current) => {
        const connection = current.providers[current.activeProviderId];
        return {
          ...current,
          providers: {
            ...current.providers,
            [current.activeProviderId]: {
              ...connection,
              ...patch,
              updatedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date().toISOString(),
        };
      });
    },
    []
  );

  const saveProviderConnection = useCallback(() => {
    const adapter = getAgentProviderAdapter(workspace.activeProviderId);
    const secret = credentialDraft.trim();
    const localEndpoint =
      adapter.localRuntime ||
      activeConnection.authMethod === "local-endpoint" ||
      isLocalAgentEndpoint(activeConnection.endpoint);
    const credentialPresent = localEndpoint || secret.length > 0;
    const credentialState = { ...credentialSession };
    if (credentialPresent) {
      credentialState[workspace.activeProviderId] = {
        secretPresent: secret.length > 0,
        secret: secret || undefined,
        updatedAt: new Date().toISOString(),
      };
    } else {
      delete credentialState[workspace.activeProviderId];
    }
    writeCredentialState(credentialState);
    setCredentialSession(credentialState);
    updateActiveProvider({
      connected: credentialPresent,
      credentialPresent,
    });
    setProviderNotice(
      credentialPresent
        ? `Saved ${adapter.label} with ${localEndpoint ? "local endpoint" : "user-owned credential"} access.`
        : `Saved ${adapter.label}; add a credential before sending.`
    );
    setCredentialDraft("");
    setProviderError(null);
    logClientSystemEvent({
      eventType: "agent.provider.updated",
      metadata: {
        providerId: workspace.activeProviderId,
        action: "saved",
        authMethod: activeConnection.authMethod,
        credentialPresent,
        localEndpoint,
      },
    });
  }, [
    activeConnection.authMethod,
    activeConnection.endpoint,
    credentialDraft,
    credentialSession,
    updateActiveProvider,
    workspace.activeProviderId,
  ]);

  const clearProviderCredential = useCallback(() => {
    const localEndpoint =
      activeAdapter.localRuntime ||
      activeConnection.authMethod === "local-endpoint" ||
      isLocalAgentEndpoint(activeConnection.endpoint);
    const credentialState = { ...credentialSession };
    delete credentialState[workspace.activeProviderId];
    writeCredentialState(credentialState);
    setCredentialSession(credentialState);
    updateActiveProvider({
      connected: localEndpoint,
      credentialPresent: localEndpoint,
    });
    setCredentialDraft("");
    setProviderError(null);
    setProviderNotice(
      localEndpoint
        ? `${activeAdapter.label} now uses endpoint-only local access.`
        : `Cleared ${activeAdapter.label} credential from this browser session.`
    );
    logClientSystemEvent({
      eventType: "agent.provider.updated",
      metadata: {
        providerId: workspace.activeProviderId,
        action: "credential-cleared",
        localEndpoint,
      },
    });
  }, [
    activeAdapter.localRuntime,
    activeAdapter.label,
    activeConnection.authMethod,
    activeConnection.endpoint,
    credentialSession,
    updateActiveProvider,
    workspace.activeProviderId,
  ]);

  const updateProviderCapability = useCallback(
    (capability: AgentCapability, enabled: boolean) => {
      if (capability === "chat") {
        setProviderNotice("Chat stays on because every Agent provider profile needs conversation support.");
        return;
      }
      const capabilityLabel =
        activeCapabilityProfile.items.find((item) => item.capability === capability)?.label ?? capability;
      setWorkspace((current) => {
        const connection = current.providers[current.activeProviderId];
        const profile = buildAgentProviderCapabilityProfile(connection);
        const nextCapabilities = new Set<AgentCapability>(
          profile.items
            .filter((item) => item.enabled)
            .map((item) => item.capability)
        );
        if (enabled) {
          nextCapabilities.add(capability);
        } else {
          nextCapabilities.delete(capability);
        }
        nextCapabilities.add("chat");
        return setAgentProviderCapabilityOverrides(
          current,
          current.activeProviderId,
          [...nextCapabilities]
        );
      });
      setProviderNotice(`${enabled ? "Enabled" : "Disabled"} ${capabilityLabel} for ${activeAdapter.label}.`);
      logClientSystemEvent({
        eventType: "agent.provider.updated",
        metadata: {
          providerId: workspace.activeProviderId,
          action: "capability",
          capability,
          enabled,
        },
      });
    },
    [activeAdapter.label, activeCapabilityProfile.items, workspace.activeProviderId]
  );

  const resetProviderCapabilities = useCallback(() => {
    setWorkspace((current) =>
      setAgentProviderCapabilityOverrides(current, current.activeProviderId, null)
    );
    setProviderNotice(`Reset ${activeAdapter.label} to automatic capability detection.`);
    logClientSystemEvent({
      eventType: "agent.provider.updated",
      metadata: {
        providerId: workspace.activeProviderId,
        action: "capabilities-reset",
      },
    });
  }, [activeAdapter.label, workspace.activeProviderId]);

  const submitChat = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const content = chatDraft.trim();
      if (!content || sendStatus === "sending") return;
      const now = new Date().toISOString();
      const providerId = workspace.activeProviderId;
      const connection = workspace.providers[providerId];
      const credential = credentialSession[providerId]?.secret;
      const userMessage: AgentChatMessage = {
        id: createId("user"),
        role: "user",
        content,
        providerId,
        createdAt: now,
      };
      const requestWorkspace: AgentWorkspaceState = {
        ...workspace,
        messages: [...workspace.messages, userMessage].slice(-80),
        memory: {
          ...workspace.memory,
          priorConversations: `${workspace.memory.priorConversations}\n\n${now} ${content}`,
        },
        updatedAt: now,
      };

      setWorkspace(requestWorkspace);
      setChatDraft("");
      setSendStatus("sending");
      setProviderError(null);

      try {
        const result = await sendAgentProviderMessage({
          connection,
          workspace: requestWorkspace,
          credential,
        });
        const finishedAt = new Date().toISOString();
        const assistantMessage: AgentChatMessage = {
          id: createId("assistant"),
          role: "assistant",
          content: result.content,
          providerId,
          createdAt: finishedAt,
        };
        const parsedActions = parseAgentActionsFromText(requestWorkspace, result.content, {
          sourceMessageId: assistantMessage.id,
          createdAt: finishedAt,
        });
        setWorkspace((current) => ({
          ...addAgentCodeActions(
            {
              ...current,
              messages: [...current.messages, assistantMessage].slice(-80),
              memory: {
                ...current.memory,
                priorConversations: `${current.memory.priorConversations}\n${finishedAt} Agent: ${result.content.slice(0, 900)}`,
              },
              updatedAt: finishedAt,
            },
            parsedActions,
            finishedAt
          ),
        }));
        if (parsedActions.length) {
          setWorkflowNotice(`Queued ${parsedActions.length} proposed Agent action(s).`);
          logClientSystemEvent({
            eventType: "agent.action.proposed",
            metadata: { count: parsedActions.length, source: "provider" },
          });
        }
        setSendStatus("idle");
        logClientSystemEvent({
          eventType: "agent.chat.sent",
          metadata: { providerId, transport: result.transport, ok: true },
        });
      } catch (error) {
        const message =
          error instanceof AgentProviderError
            ? error.message
            : "Provider request failed. Check the endpoint, browser CORS, local runtime, network, or user-owned credential.";
        const finishedAt = new Date().toISOString();
        const assistantMessage: AgentChatMessage = {
          id: createId("assistant-error"),
          role: "assistant",
          content: [
            "I could not complete the provider request.",
            "",
            message,
            "",
            "No credential was sent to a wtfOS server; this attempt used the browser-direct/local endpoint boundary.",
          ].join("\n"),
          providerId,
          createdAt: finishedAt,
        };
        setProviderError(message);
        setSendStatus("error");
        setWorkspace((current) => ({
          ...current,
          messages: [...current.messages, assistantMessage].slice(-80),
          updatedAt: finishedAt,
        }));
        logClientSystemEvent({
          eventType: "agent.chat.sent",
          metadata: { providerId, transport: "browser-direct", ok: false },
        });
      }
    },
    [chatDraft, credentialSession, sendStatus, workspace]
  );

  const updateMemory = useCallback((key: keyof AgentMemory, value: string) => {
    setWorkspace((current) => ({
      ...current,
      memory: { ...current.memory, [key]: value },
      updatedAt: new Date().toISOString(),
    }));
    logClientSystemEvent({ eventType: "agent.memory.updated", metadata: { key } });
  }, []);

  const installExtensionManifest = useCallback(() => {
    try {
      const manifest = JSON.parse(extensionManifestDraft);
      const manifestLabel =
        manifest && typeof manifest.label === "string" && manifest.label.trim()
          ? manifest.label.trim()
          : "extension";
      const manifestId =
        manifest && typeof manifest.id === "string" && manifest.id.trim()
          ? manifest.id.trim()
          : "";
      setWorkspace((current) => installAgentExtension(current, manifest));
      setExtensionNotice(`Installed ${manifestLabel}. Enable it after reviewing its permissions.`);
      logClientSystemEvent({
        eventType: "agent.extension.installed",
        metadata: { extensionId: manifestId },
      });
    } catch (error) {
      setExtensionNotice(error instanceof Error ? error.message : "Could not install extension manifest.");
    }
  }, [extensionManifestDraft]);

  const toggleExtension = useCallback((id: string, enabled: boolean) => {
    try {
      setWorkspace((current) => setAgentExtensionEnabled(current, id, enabled));
      setExtensionNotice(`${enabled ? "Enabled" : "Disabled"} ${id}.`);
      logClientSystemEvent({
        eventType: "agent.extension.updated",
        metadata: { extensionId: id, enabled },
      });
    } catch (error) {
      setExtensionNotice(error instanceof Error ? error.message : "Could not update extension.");
    }
  }, []);

  const removeExtension = useCallback((id: string) => {
    try {
      setWorkspace((current) => removeAgentExtension(current, id));
      setExtensionNotice(`Removed ${id}.`);
      logClientSystemEvent({
        eventType: "agent.extension.removed",
        metadata: { extensionId: id },
      });
    } catch (error) {
      setExtensionNotice(error instanceof Error ? error.message : "Could not remove extension.");
    }
  }, []);

  const runTerminal = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const output = runSafeTerminalCommand(terminalCommand, workspace);
      setTerminalOutput((entries) => [...entries.slice(-12), `$ ${terminalCommand}`, output]);
      logClientSystemEvent({ eventType: "agent.terminal.command", metadata: { command: terminalCommand } });
    },
    [terminalCommand, workspace]
  );

  const createWorkspaceFile = useCallback(() => {
    if (!canManageFiles) {
      setFileActionNotice("Enable write and filesystem grants before creating files.");
      return;
    }
    try {
      const next = addAgentWorkspaceFile(workspace, newFilePath, newFileContent);
      setWorkspace(next);
      setSelectedEditorLine(null);
      setNewFileContent("");
      setRenameFilePath(displayAgentFilePath(next, next.selectedFilePath));
      setFileActionNotice(`Created ${displayAgentFilePath(next, next.selectedFilePath)}`);
      logClientSystemEvent({
        eventType: "agent.file.created",
        metadata: { path: next.selectedFilePath },
      });
    } catch (error) {
      setFileActionNotice(error instanceof Error ? error.message : "Could not create file.");
    }
  }, [canManageFiles, newFileContent, newFilePath, workspace]);

  const renameWorkspaceFile = useCallback(() => {
    if (!canManageFiles) {
      setFileActionNotice("Enable write and filesystem grants before renaming files.");
      return;
    }
    try {
      const previousPath = selectedFile.path;
      const next = renameAgentWorkspaceFile(workspace, previousPath, renameFilePath);
      setWorkspace(next);
      setSelectedEditorLine(null);
      setFileActionNotice(
        `Renamed ${displayAgentFilePath(workspace, previousPath)} to ${displayAgentFilePath(
          next,
          next.selectedFilePath
        )}`
      );
      logClientSystemEvent({
        eventType: "agent.file.renamed",
        metadata: { previousPath, path: next.selectedFilePath },
      });
    } catch (error) {
      setFileActionNotice(error instanceof Error ? error.message : "Could not rename file.");
    }
  }, [canManageFiles, renameFilePath, selectedFile.path, workspace]);

  const deleteWorkspaceFile = useCallback(() => {
    if (!canManageFiles) {
      setFileActionNotice("Enable write and filesystem grants before deleting files.");
      return;
    }
    const deletedPath = selectedFile.path;
    const deletedName = displayAgentFilePath(workspace, deletedPath);
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete ${deletedName} from this Agent workspace?`)
    ) {
      return;
    }
    try {
      const next = deleteAgentWorkspaceFile(workspace, deletedPath);
      setWorkspace(next);
      setSelectedEditorLine(null);
      setFileActionNotice(`Deleted ${deletedName}`);
      logClientSystemEvent({
        eventType: "agent.file.deleted",
        metadata: { path: deletedPath },
      });
    } catch (error) {
      setFileActionNotice(error instanceof Error ? error.message : "Could not delete file.");
    }
  }, [canManageFiles, selectedFile.path, workspace]);

  const runWorkspaceDiagnostics = useCallback(() => {
    setTerminalCommand("agent diagnostics");
    setTerminalOutput((entries) => [
      ...entries.slice(-12),
      "$ agent diagnostics",
      runSafeTerminalCommand("agent diagnostics", workspace),
    ]);
    setFileActionNotice(
      `Diagnostics: ${diagnosticCounts.error} error(s), ${diagnosticCounts.warning} warning(s), ${diagnosticCounts.info} info`
    );
    logClientSystemEvent({
      eventType: "agent.diagnostics.ran",
      metadata: diagnosticCounts,
    });
  }, [diagnosticCounts, workspace]);

  const openWorkbenchLine = useCallback(
    (
      filePath: string,
      line: number,
      source: "search" | "diagnostic" | "symbol",
      symbol?: AgentCodeSymbol
    ) => {
      const targetLine = Math.max(1, Math.floor(line || 1));
      setActiveTab("workbench");
      setSelectedEditorLine(targetLine);
      setWorkspace((current) => ({
        ...current,
        selectedFilePath: current.files.some((file) => file.path === filePath)
          ? filePath
          : current.selectedFilePath,
        updatedAt: new Date().toISOString(),
      }));
      setFileActionNotice(
        `Opened ${displayAgentFilePath(workspace, filePath)} at line ${targetLine}.`
      );
      logClientSystemEvent({
        eventType: "agent.code_navigation.opened",
        metadata: {
          path: filePath,
          line: targetLine,
          source,
          symbol: symbol?.name,
          kind: symbol?.kind,
        },
      });
    },
    [workspace]
  );

  const stageGitFile = useCallback(
    (status: AgentGitFileStatus) => {
      if (!canManageGit) {
        setGitNotice("Enable write and project grants before staging Agent changes.");
        return;
      }
      setWorkspace((current) => stageAgentGitPaths(current, [status.path]));
      setGitNotice(`Staged ${status.relativePath}`);
      logClientSystemEvent({
        eventType: "agent.git.staged",
        metadata: { path: status.path },
      });
    },
    [canManageGit]
  );

  const unstageGitFile = useCallback(
    (status: AgentGitFileStatus) => {
      if (!canManageGit) {
        setGitNotice("Enable write and project grants before unstaging Agent changes.");
        return;
      }
      setWorkspace((current) => unstageAgentGitPaths(current, [status.path]));
      setGitNotice(`Unstaged ${status.relativePath}`);
      logClientSystemEvent({
        eventType: "agent.git.unstaged",
        metadata: { path: status.path },
      });
    },
    [canManageGit]
  );

  const stageAllGitFiles = useCallback(() => {
    if (!canManageGit) {
      setGitNotice("Enable write and project grants before staging Agent changes.");
      return;
    }
    setWorkspace((current) => stageAllAgentGitChanges(current));
    setGitNotice(`Staged ${unstagedGitFiles.length} Agent change(s).`);
    logClientSystemEvent({
      eventType: "agent.git.staged",
      metadata: { count: unstagedGitFiles.length, scope: "all" },
    });
  }, [canManageGit, unstagedGitFiles.length]);

  const commitGitFiles = useCallback(() => {
    if (!canManageGit) {
      setGitNotice("Enable write and project grants before committing Agent changes.");
      return;
    }
    try {
      const next = commitAgentGitChanges(workspace, commitMessage);
      const commit = next.git.commits.at(-1);
      setWorkspace(next);
      setCommitMessage("");
      setGitNotice(commit ? `Committed ${commit.filePaths.length} file(s): ${commit.message}` : "Committed staged changes.");
      logClientSystemEvent({
        eventType: "agent.git.committed",
        metadata: {
          commitId: commit?.id,
          branch: next.git.currentBranch,
          fileCount: commit?.filePaths.length ?? stagedGitFiles.length,
        },
      });
    } catch (error) {
      setGitNotice(error instanceof Error ? error.message : "Could not commit Agent changes.");
    }
  }, [canManageGit, commitMessage, stagedGitFiles.length, workspace]);

  const createGitBranch = useCallback(() => {
    if (!canManageGit) {
      setGitNotice("Enable write and project grants before creating Agent branches.");
      return;
    }
    try {
      const next = createAgentGitBranch(workspace, newBranchName);
      setWorkspace(next);
      setNewBranchName("");
      setGitNotice(`Created and switched to ${next.git.currentBranch}`);
      logClientSystemEvent({
        eventType: "agent.git.branch.created",
        metadata: { branch: next.git.currentBranch },
      });
    } catch (error) {
      setGitNotice(error instanceof Error ? error.message : "Could not create Agent branch.");
    }
  }, [canManageGit, newBranchName, workspace]);

  const switchGitBranch = useCallback(
    (branch: string) => {
      if (!canManageGit) {
        setGitNotice("Enable write and project grants before switching Agent branches.");
        return;
      }
      try {
        const next = switchAgentGitBranch(workspace, branch);
        setWorkspace(next);
        setGitNotice(`Switched to ${next.git.currentBranch}`);
        logClientSystemEvent({
          eventType: "agent.git.branch.switched",
          metadata: { branch: next.git.currentBranch },
        });
      } catch (error) {
        setGitNotice(error instanceof Error ? error.message : "Could not switch Agent branch.");
      }
    },
    [canManageGit, workspace]
  );

  const addPlanTask = useCallback(() => {
    const title = newPlanTitle.trim();
    if (!title) {
      setWorkflowNotice("Enter a task title before adding it to the plan.");
      return;
    }
    const next = addAgentPlanItem(workspace, title, newPlanDetails);
    setWorkspace(next);
    setNewPlanTitle("");
    setNewPlanDetails("");
    setWorkflowNotice(`Added plan task: ${title}`);
    logClientSystemEvent({ eventType: "agent.plan.updated", metadata: { action: "created" } });
  }, [newPlanDetails, newPlanTitle, workspace]);

  const changePlanStatus = useCallback(
    (id: string, status: AgentPlanStatus) => {
      setWorkspace((current) => updateAgentPlanItemStatus(current, id, status));
      logClientSystemEvent({
        eventType: "agent.plan.updated",
        metadata: { action: "status", status },
      });
    },
    []
  );

  const queueDraftActions = useCallback(() => {
    const actions = parseAgentActionsFromText(workspace, actionDraft, {
      createdAt: new Date().toISOString(),
    });
    if (!actions.length) {
      setWorkflowNotice("No Agent actions found in the draft.");
      return;
    }
    setWorkspace((current) => addAgentCodeActions(current, actions));
    setActionDraft("");
    setWorkflowNotice(`Queued ${actions.length} proposed Agent action(s).`);
    logClientSystemEvent({
      eventType: "agent.action.proposed",
      metadata: { count: actions.length, source: "draft" },
    });
  }, [actionDraft, workspace]);

  const actionHasPermission = useCallback(
    (action: AgentCodeAction) => {
      if (action.kind === "run-command") return canRunTerminalActions;
      return canManageFiles;
    },
    [canManageFiles, canRunTerminalActions]
  );

  const applyQueuedAction = useCallback(
    (action: AgentCodeAction) => {
      if (!actionHasPermission(action)) {
        setWorkflowNotice(
          action.kind === "run-command"
            ? "Enable execute and terminal grants before applying command actions."
            : "Enable write and filesystem grants before applying file actions."
        );
        return;
      }
      try {
        if (action.kind === "run-command" && action.command) {
          const output = runSafeTerminalCommand(action.command, workspace);
          setTerminalCommand(action.command);
          setTerminalOutput((entries) => [...entries.slice(-12), `$ ${action.command}`, output]);
        }
        const next = applyAgentCodeAction(workspace, action.id);
        setWorkspace(next);
        setWorkflowNotice(`Applied ${action.title}`);
        logClientSystemEvent({
          eventType: "agent.action.applied",
          metadata: { actionId: action.id, kind: action.kind },
        });
      } catch (error) {
        setWorkflowNotice(error instanceof Error ? error.message : "Could not apply action.");
      }
    },
    [actionHasPermission, workspace]
  );

  const dismissQueuedAction = useCallback(
    (action: AgentCodeAction) => {
      setWorkspace((current) => dismissAgentCodeAction(current, action.id));
      setWorkflowNotice(`Dismissed ${action.title}`);
      logClientSystemEvent({
        eventType: "agent.action.dismissed",
        metadata: { actionId: action.id, kind: action.kind },
      });
    },
    []
  );

  const resetWorkspace = useCallback(() => {
    setWorkspace(createDefaultAgentWorkspace());
    writeCredentialState({});
    setCredentialSession({});
    setCredentialDraft("");
    setOneTimeToken(null);
    setProviderError(null);
    setSendStatus("idle");
  }, []);

  const refreshSnapshots = useCallback(() => {
    setSnapshots(readAgentProjectSnapshots());
  }, []);

  const saveFilesystemSnapshot = useCallback(() => {
    const snapshot = saveAgentProjectSnapshot(workspace);
    refreshSnapshots();
    setFilesystemNotice(`Saved ${snapshot.name} to ${snapshot.filesystemPath}`);
    logClientSystemEvent({
      eventType: "agent.filesystem.saved",
      metadata: {
        snapshotId: snapshot.id,
        filesystemPath: snapshot.filesystemPath,
        fileCount: snapshot.files.length,
      },
    });
  }, [refreshSnapshots, workspace]);

  const restoreFilesystemSnapshot = useCallback((snapshot: AgentProjectSnapshot) => {
    setWorkspace(restoreAgentProjectSnapshot(snapshot));
    setActiveTab("workbench");
    setProviderError(null);
    setSendStatus("idle");
    setFilesystemNotice(`Restored ${snapshot.name} from ${snapshot.filesystemPath}`);
    logClientSystemEvent({
      eventType: "agent.filesystem.restored",
      metadata: {
        snapshotId: snapshot.id,
        filesystemPath: snapshot.filesystemPath,
        fileCount: snapshot.files.length,
      },
    });
  }, []);

  const exportFilesystemSnapshot = useCallback((snapshot: AgentProjectSnapshot) => {
    downloadTextFile(snapshotFilename(snapshot), exportAgentProjectSnapshot(snapshot));
    setFilesystemNotice(`Exported ${snapshot.name}`);
    logClientSystemEvent({
      eventType: "agent.filesystem.exported",
      metadata: {
        snapshotId: snapshot.id,
        filesystemPath: snapshot.filesystemPath,
      },
    });
  }, []);

  const importFilesystemSnapshot = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;
      try {
        const snapshot = persistAgentProjectSnapshot(
          importAgentProjectSnapshot(await file.text())
        );
        refreshSnapshots();
        setFilesystemNotice(`Imported ${snapshot.name} into ${snapshot.filesystemPath}`);
        logClientSystemEvent({
          eventType: "agent.filesystem.imported",
          metadata: {
            snapshotId: snapshot.id,
            filesystemPath: snapshot.filesystemPath,
            fileCount: snapshot.files.length,
          },
        });
      } catch (error) {
        setFilesystemNotice(
          error instanceof Error ? `Import failed: ${error.message}` : "Import failed."
        );
      } finally {
        input.value = "";
      }
    },
    [refreshSnapshots]
  );

  const renderProviderPanel = () => (
    <UiPanel title="Provider" tone={activeConnection.connected ? "success" : "warning"}>
      <ProviderGrid>
        <Field>
          Provider
          <Select
            value={workspace.activeProviderId}
            onChange={(event) => {
              const providerId = event.target.value as AgentProviderId;
              if (!AGENT_PROVIDER_IDS.includes(providerId)) return;
              setWorkspace((current) => ({
                ...current,
                activeProviderId: providerId,
                updatedAt: new Date().toISOString(),
              }));
              setCredentialDraft("");
            }}
          >
            {AGENT_PROVIDER_ADAPTERS.map((adapter) => (
              <option key={adapter.id} value={adapter.id}>
                {adapter.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          Auth
          <Select
            value={activeConnection.authMethod}
            onChange={(event) =>
              updateActiveProvider({ authMethod: event.target.value as AgentAuthMethod })
            }
          >
            {providerAuthMethods(workspace.activeProviderId).map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          Endpoint
          <Input
            value={activeConnection.endpoint}
            onChange={(event) => updateActiveProvider({ endpoint: event.target.value })}
          />
        </Field>
        <Field>
          Model
          <Input
            value={activeConnection.model}
            onChange={(event) => updateActiveProvider({ model: event.target.value })}
          />
        </Field>
        <Field>
          User credential
          <Input
            type="password"
            value={credentialDraft}
            placeholder={
              activeCredentialRecord?.secretPresent
                ? "Stored in this browser session"
                : activeLocalEndpoint
                  ? "Optional local token"
                  : "API key, OAuth proof, or enterprise token"
            }
            onChange={(event) => setCredentialDraft(event.target.value)}
          />
        </Field>
        <Field>
          Connection
          <BadgeRow>
            <Badge $tone={activeRuntimeReady ? "ok" : "warn"}>
              {activeRuntimeReady ? <CheckCircle2 size={14} aria-hidden /> : <CircleSlash size={14} aria-hidden />}
              {activeRuntimeReady ? "ready" : "credential needed"}
            </Badge>
            <Badge $tone="info">client-owned</Badge>
            <Badge $tone="info">browser-direct</Badge>
            <Badge $tone={activeAdapter.localRuntime ? "ok" : "idle"}>
              {activeAdapter.localRuntime ? "local runtime" : "remote provider"}
            </Badge>
          </BadgeRow>
        </Field>
      </ProviderGrid>
      <Separator />
      <BadgeRow>
        {activeCapabilities.map((capability) => (
          <Badge key={capability} $tone="info">
            {capability}
          </Badge>
        ))}
      </BadgeRow>
      <Separator />
      <UiToolbar>
        <strong>Capability Profile</strong>
        <Badge $tone={activeCapabilityProfile.overrideActive ? "warn" : "ok"}>
          {activeCapabilityProfile.overrideActive ? "manual" : "auto-detected"}
        </Badge>
      </UiToolbar>
      <CapabilityGrid data-agent-provider-capabilities={workspace.activeProviderId}>
        {activeCapabilityProfile.items.map((item) => (
          <CapabilityOption
            key={item.capability}
            $enabled={item.enabled}
            data-agent-provider-capability={item.capability}
          >
            <input
              type="checkbox"
              checked={item.enabled}
              disabled={!item.configurable}
              aria-label={`Enable Agent capability ${item.label}`}
              onChange={(event) => updateProviderCapability(item.capability, event.currentTarget.checked)}
            />
            <span>
              <RowTitle>{item.label}</RowTitle>
              <RowMeta>{item.description}</RowMeta>
              <BadgeRow>
                <Badge $tone={item.enabled ? "ok" : "idle"}>
                  {item.enabled ? "available" : "off"}
                </Badge>
                <Badge $tone="info">{item.source}</Badge>
                {!item.configurable ? <Badge $tone="idle">fixed</Badge> : null}
              </BadgeRow>
            </span>
          </CapabilityOption>
        ))}
      </CapabilityGrid>
      {providerNotice ? (
        <NoticePane role="status" data-agent-provider-notice>
          {providerNotice}
        </NoticePane>
      ) : null}
      {activeCapabilityProfile.warnings.length ? (
        <NoticePane data-agent-provider-profile-notes>
          {activeCapabilityProfile.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </NoticePane>
      ) : null}
      <UiToolbar>
        <UiButton type="button" uiVariant="primary" onClick={saveProviderConnection}>
          <PlugZap size={16} aria-hidden />
          Save Provider
        </UiButton>
        <UiButton type="button" onClick={resetProviderCapabilities}>
          <ListChecks size={16} aria-hidden />
          Reset Capabilities
        </UiButton>
        <UiButton type="button" onClick={clearProviderCredential}>
          <Trash2 size={16} aria-hidden />
          Clear Credential
        </UiButton>
      </UiToolbar>
    </UiPanel>
  );

  const renderChat = () => (
    <SplitLayout>
      <SideColumn>
        {renderProviderPanel()}
        <UiPanel title="Project State">
          <StatusGrid>
            <StatusCell>
              <StatusLabel>Files</StatusLabel>
              <StatusValue>{workspace.files.length}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Changed</StatusLabel>
              <StatusValue>{changedFiles.length}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Branch</StatusLabel>
              <StatusValue>{workspace.branch}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Path</StatusLabel>
              <StatusValue>{workspace.projectPath}</StatusValue>
            </StatusCell>
          </StatusGrid>
        </UiPanel>
      </SideColumn>
      <UiPanel
        title="Conversation"
        actions={
          <Badge $tone={sendStatus === "sending" ? "warn" : providerError ? "warn" : "info"}>
            {sendStatus === "sending" ? "sending" : activeAdapter.label}
          </Badge>
        }
      >
        <ChatLog>
          {workspace.messages.map((message) => (
            <ChatBubble key={message.id} $role={message.role}>
              <strong>{message.role}</strong>
              {"\n"}
              {message.content}
            </ChatBubble>
          ))}
        </ChatLog>
        <Separator />
        {providerError ? (
          <PreviewPane role="alert">
            <strong>Provider request needs attention.</strong>
            <p>{providerError}</p>
          </PreviewPane>
        ) : null}
        <Composer onSubmit={submitChat}>
          <TextArea
            value={chatDraft}
            rows={3}
            placeholder="Ask Agent to plan, edit, debug, refactor, or explain this project."
            onChange={(event) => setChatDraft(event.target.value)}
          />
          <UiButton type="submit" uiVariant="primary" disabled={sendStatus === "sending" || !chatDraft.trim()}>
            <MessageSquareText size={16} aria-hidden />
            {sendStatus === "sending" ? "Sending" : "Send"}
          </UiButton>
        </Composer>
      </UiPanel>
      <SideColumn>
        <UiPanel title="Plan">
          <StatusGrid>
            <StatusCell>
              <StatusLabel>Doing</StatusLabel>
              <StatusValue>{planCounts.doing}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Queued</StatusLabel>
              <StatusValue>{planCounts.todo}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Actions</StatusLabel>
              <StatusValue>{actionCounts.proposed}</StatusValue>
            </StatusCell>
          </StatusGrid>
          <RowList>
            {workspace.plan.slice(0, 5).map((step, index) => (
              <ActionRow key={step.id}>
                <div>
                  <RowTitle>{step.title}</RowTitle>
                  <RowMeta>{step.details || `${step.status} in the local Agent project plan`}</RowMeta>
                </div>
                <Badge $tone={step.status === "doing" ? "ok" : step.status === "blocked" ? "warn" : "idle"}>{index + 1}</Badge>
              </ActionRow>
            ))}
          </RowList>
          <UiToolbar>
            <UiButton type="button" onClick={() => setActiveTab("plan")}>
              <ListChecks size={16} aria-hidden />
              Open Plan
            </UiButton>
          </UiToolbar>
        </UiPanel>
      </SideColumn>
    </SplitLayout>
  );

  const renderFilesystemPanel = () => (
    <UiPanel title="wtfOS Filesystem" actions={<Badge $tone="info">{snapshotStats.snapshotCount}</Badge>}>
      <input
        ref={snapshotImportRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={importFilesystemSnapshot}
      />
      <RowMeta>Root: WTF/Projects/Agent</RowMeta>
      <StatusGrid>
        <StatusCell>
          <StatusLabel>Snapshots</StatusLabel>
          <StatusValue>{snapshotStats.snapshotCount}</StatusValue>
        </StatusCell>
        <StatusCell>
          <StatusLabel>Files</StatusLabel>
          <StatusValue>{snapshotStats.fileCount}</StatusValue>
        </StatusCell>
        <StatusCell>
          <StatusLabel>Messages</StatusLabel>
          <StatusValue>{snapshotStats.messageCount}</StatusValue>
        </StatusCell>
      </StatusGrid>
      <UiToolbar>
        <UiButton type="button" uiVariant="primary" onClick={saveFilesystemSnapshot}>
          <Save size={16} aria-hidden />
          Save Snapshot
        </UiButton>
        <UiButton type="button" onClick={() => snapshotImportRef.current?.click()}>
          <Upload size={16} aria-hidden />
          Import
        </UiButton>
      </UiToolbar>
      {filesystemNotice ? <RowMeta role="status">{filesystemNotice}</RowMeta> : null}
      <RowList>
        {snapshots.length ? (
          snapshots.map((snapshot) => (
            <SnapshotRow key={snapshot.id}>
              <div>
                <RowTitle>{snapshot.name}</RowTitle>
                <RowMeta>
                  {snapshot.filesystemPath} - {snapshot.files.length} files -{" "}
                  {new Date(snapshot.updatedAt).toLocaleString()}
                </RowMeta>
              </div>
              <SnapshotActions>
                <UiButton
                  type="button"
                  onClick={() => restoreFilesystemSnapshot(snapshot)}
                >
                  <FolderOpen size={16} aria-hidden />
                  Restore
                </UiButton>
                <UiButton
                  type="button"
                  onClick={() => exportFilesystemSnapshot(snapshot)}
                >
                  <Download size={16} aria-hidden />
                  Export
                </UiButton>
              </SnapshotActions>
            </SnapshotRow>
          ))
        ) : (
          <RowMeta>No Agent snapshots saved yet.</RowMeta>
        )}
      </RowList>
    </UiPanel>
  );

  const renderPlan = () => (
    <SplitLayout>
      <SideColumn>
        <UiPanel title="Project Plan" actions={<Badge $tone="info">{workspace.plan.length}</Badge>}>
          <StatusGrid>
            <StatusCell>
              <StatusLabel>Doing</StatusLabel>
              <StatusValue>{planCounts.doing}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Todo</StatusLabel>
              <StatusValue>{planCounts.todo}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Done</StatusLabel>
              <StatusValue>{planCounts.done}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Blocked</StatusLabel>
              <StatusValue>{planCounts.blocked}</StatusValue>
            </StatusCell>
          </StatusGrid>
          <RowList>
            {workspace.plan.map((item) => (
              <ActionRow key={item.id}>
                <div>
                  <RowTitle>{item.title}</RowTitle>
                  <RowMeta>{item.details || `Updated ${new Date(item.updatedAt).toLocaleString()}`}</RowMeta>
                </div>
                <Select
                  value={item.status}
                  aria-label={`Status for ${item.title}`}
                  onChange={(event) =>
                    changePlanStatus(item.id, event.target.value as AgentPlanStatus)
                  }
                >
                  {(["todo", "doing", "done", "blocked"] as const).map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </Select>
              </ActionRow>
            ))}
          </RowList>
        </UiPanel>

        <UiPanel title="Add Task">
          <Field>
            Task title
            <Input
              value={newPlanTitle}
              onChange={(event) => setNewPlanTitle(event.target.value)}
            />
          </Field>
          <Field>
            Task details
            <TextArea
              value={newPlanDetails}
              rows={3}
              onChange={(event) => setNewPlanDetails(event.target.value)}
            />
          </Field>
          <UiToolbar>
            <UiButton type="button" uiVariant="primary" onClick={addPlanTask}>
              <ListChecks size={16} aria-hidden />
              Add Task
            </UiButton>
          </UiToolbar>
        </UiPanel>
      </SideColumn>

      <UiPanel
        title="Review Actions"
        tone={proposedActions.length ? "warning" : "info"}
        actions={<Badge $tone={proposedActions.length ? "warn" : "ok"}>{proposedActions.length} proposed</Badge>}
      >
        <StatusGrid>
          <StatusCell>
            <StatusLabel>Proposed</StatusLabel>
            <StatusValue>{actionCounts.proposed}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Applied</StatusLabel>
            <StatusValue>{actionCounts.applied}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Dismissed</StatusLabel>
            <StatusValue>{actionCounts.dismissed}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Permissions</StatusLabel>
            <StatusValue>{canManageFiles ? "files ready" : "grant needed"}</StatusValue>
          </StatusCell>
        </StatusGrid>
        <RowList>
          {workspace.codeActions.length ? (
            workspace.codeActions.map((action) => (
              <SnapshotRow key={action.id}>
                <div>
                  <RowTitle>{action.title}</RowTitle>
                  <RowMeta>
                    {action.kind} - {action.targetPath ? displayAgentFilePath(workspace, action.targetPath) : action.command}
                    {action.nextPath ? ` -> ${displayAgentFilePath(workspace, action.nextPath)}` : ""} - {action.status}
                  </RowMeta>
                  {action.content ? (
                    <RowMeta>{action.content.split("\n").slice(0, 2).join(" ").slice(0, 180)}</RowMeta>
                  ) : null}
                </div>
                <SnapshotActions>
                  <UiButton
                    type="button"
                    disabled={action.status !== "proposed" || !actionHasPermission(action)}
                    aria-label={`Apply ${action.title}`}
                    onClick={() => applyQueuedAction(action)}
                  >
                    <Play size={16} aria-hidden />
                    Apply
                  </UiButton>
                  <UiButton
                    type="button"
                    disabled={action.status !== "proposed"}
                    aria-label={`Dismiss ${action.title}`}
                    onClick={() => dismissQueuedAction(action)}
                  >
                    <Trash2 size={16} aria-hidden />
                    Dismiss
                  </UiButton>
                </SnapshotActions>
              </SnapshotRow>
            ))
          ) : (
            <RowMeta>No proposed Agent actions yet.</RowMeta>
          )}
        </RowList>
        {workflowNotice ? <RowMeta role="status">{workflowNotice}</RowMeta> : null}
      </UiPanel>

      <SideColumn>
        <UiPanel title="Action Intake">
          <Field>
            Provider action draft
            <TextArea
              value={actionDraft}
              rows={8}
              placeholder={"```typescript file=src/example.ts\nexport const example = true;\n```"}
              onChange={(event) => setActionDraft(event.target.value)}
            />
          </Field>
          <UiToolbar>
            <UiButton
              type="button"
              uiVariant="primary"
              disabled={!actionDraft.trim()}
              onClick={queueDraftActions}
            >
              <Code2 size={16} aria-hidden />
              Queue Actions
            </UiButton>
          </UiToolbar>
        </UiPanel>

        <UiPanel title="Action Gates" tone={canManageFiles && canRunTerminalActions ? "success" : "warning"}>
          <RowList>
            <ActionRow>
              <div>
                <RowTitle>File actions</RowTitle>
                <RowMeta>write + filesystem</RowMeta>
              </div>
              <Badge $tone={canManageFiles ? "ok" : "warn"}>{canManageFiles ? "ready" : "grant"}</Badge>
            </ActionRow>
            <ActionRow>
              <div>
                <RowTitle>Command actions</RowTitle>
                <RowMeta>execute + terminal</RowMeta>
              </div>
              <Badge $tone={canRunTerminalActions ? "ok" : "warn"}>{canRunTerminalActions ? "ready" : "grant"}</Badge>
            </ActionRow>
          </RowList>
        </UiPanel>

        <UiPanel title="Current Diff" actions={<Split size={16} aria-hidden />}>
          <DiffPane>{buildDiffText(selectedFile)}</DiffPane>
        </UiPanel>
      </SideColumn>
    </SplitLayout>
  );

  const renderWorkbench = () => (
    <SplitLayout>
      <SideColumn>
        <UiPanel title="Files" actions={<Badge $tone="info">{filteredFiles.length}</Badge>}>
          <FileSearch>
            <Search size={17} aria-hidden />
            <Input
              value={fileQuery}
              aria-label="Search Agent files"
              placeholder="Search files"
              onChange={(event) => setFileQuery(event.target.value)}
            />
          </FileSearch>
          <FileList>
            {filteredFiles.map((file) => (
              <FileButton
                key={file.path}
                type="button"
                $active={file.path === selectedFile.path}
                onClick={() => {
                  setSelectedEditorLine(null);
                  setWorkspace((current) => ({
                    ...current,
                    selectedFilePath: file.path,
                    updatedAt: new Date().toISOString(),
                  }));
                }}
                onDoubleClick={() => setSelectedEditorLine(1)}
              >
                {renderFileIcon(file.kind)}
                <FilePath>{displayAgentFilePath(workspace, file.path)}</FilePath>
              </FileButton>
            ))}
          </FileList>
        </UiPanel>

        <UiPanel
          title="Native File Management"
          tone={canManageFiles ? "success" : "warning"}
          actions={<Badge $tone={canManageFiles ? "ok" : "warn"}>{canManageFiles ? "write enabled" : "grant needed"}</Badge>}
        >
          <Field>
            New file path
            <Input
              value={newFilePath}
              placeholder="src/new-file.ts"
              onChange={(event) => setNewFilePath(event.target.value)}
            />
          </Field>
          <Field>
            Initial content
            <TextArea
              value={newFileContent}
              rows={4}
              placeholder="Optional starter content"
              onChange={(event) => setNewFileContent(event.target.value)}
            />
          </Field>
          <UiToolbar>
            <UiButton
              type="button"
              uiVariant="primary"
              disabled={!canManageFiles || !newFilePath.trim()}
              onClick={createWorkspaceFile}
            >
              <FileCode2 size={16} aria-hidden />
              Create File
            </UiButton>
          </UiToolbar>
          <Separator />
          <Field>
            Rename selected
            <Input
              value={renameFilePath}
              onChange={(event) => setRenameFilePath(event.target.value)}
            />
          </Field>
          <UiToolbar>
            <UiButton
              type="button"
              disabled={!canManageFiles || !renameFilePath.trim()}
              onClick={renameWorkspaceFile}
            >
              <Save size={16} aria-hidden />
              Rename
            </UiButton>
            <UiButton
              type="button"
              disabled={!canManageFiles || workspace.files.length <= 1}
              onClick={deleteWorkspaceFile}
            >
              <Trash2 size={16} aria-hidden />
              Delete Selected
            </UiButton>
          </UiToolbar>
          {fileActionNotice ? <RowMeta role="status">{fileActionNotice}</RowMeta> : null}
        </UiPanel>

        <UiPanel title="Code Search" actions={<Badge $tone="info">{codeSearchMatches.length}</Badge>}>
          <FileSearch>
            <Search size={17} aria-hidden />
            <Input
              value={codeSearchQuery}
              aria-label="Search Agent file contents"
              placeholder="Search content"
              onChange={(event) => setCodeSearchQuery(event.target.value)}
            />
          </FileSearch>
          <RowList>
            {codeSearchMatches.length ? (
              codeSearchMatches.map((match) => (
                <SnapshotRow key={`${match.filePath}:${match.line}:${match.excerpt}`}>
                  <div>
                    <RowTitle>
                      {displayAgentFilePath(workspace, match.filePath)}:{match.line}
                    </RowTitle>
                    <RowMeta>{match.excerpt}</RowMeta>
                  </div>
                  <SnapshotActions>
                    <UiButton
                      type="button"
                      aria-label={`Open ${displayAgentFilePath(workspace, match.filePath)} at line ${match.line}`}
                      onClick={() => openWorkbenchLine(match.filePath, match.line, "search")}
                    >
                      <FolderOpen size={16} aria-hidden />
                      Open Line
                    </UiButton>
                  </SnapshotActions>
                </SnapshotRow>
              ))
            ) : (
              <RowMeta>No content matches.</RowMeta>
            )}
          </RowList>
        </UiPanel>
      </SideColumn>

      <UiPanel title="Editor" actions={<Badge $tone={selectedFile.content === selectedFile.baselineContent ? "idle" : "warn"}>{selectedFile.language}</Badge>}>
        <EditorFrame>
          {selectedFile.kind === "image" ? (
            <ImagePreview>
              <div>
                <ImageIcon size={32} aria-hidden />
                <div>{selectedFile.path.replace(`${workspace.projectPath}/`, "")}</div>
              </div>
            </ImagePreview>
          ) : (
            <EditorTextArea
              ref={editorRef}
              value={selectedFile.content}
              aria-label={`Agent editor for ${displayAgentFilePath(workspace, selectedFile.path)}`}
              data-agent-editor={displayAgentFilePath(workspace, selectedFile.path)}
              data-agent-editor-selected-line={selectedEditorLine ?? undefined}
              spellCheck={false}
              onChange={(event) => {
                setWorkspace((current) =>
                  updateAgentFileContent(
                    current,
                    selectedFile.path,
                    event.target.value
                  )
                );
                logClientSystemEvent({
                  eventType: "agent.file.edited",
                  metadata: { path: selectedFile.path },
                });
              }}
            />
          )}
          {selectedEditorLine ? (
            <RowMeta role="status" data-agent-editor-line-status>
              Line {selectedEditorLine} selected in {displayAgentFilePath(workspace, selectedFile.path)}.
            </RowMeta>
          ) : null}
          <UiToolbar>
            <UiButton type="button" onClick={() => setActiveTab("chat")}>
              <Bot size={16} aria-hidden />
              Ask Agent
            </UiButton>
            <UiButton
              type="button"
              onClick={() => {
                setWorkspace((current) => ({
                  ...current,
                  files: current.files.map((file) =>
                    file.path === selectedFile.path
                      ? { ...file, baselineContent: file.content }
                      : file
                  ),
                  updatedAt: new Date().toISOString(),
                }));
                logClientSystemEvent({
                  eventType: "agent.file.edited",
                  metadata: { path: selectedFile.path, saved: true },
                });
              }}
            >
              <Save size={16} aria-hidden />
              Save File
            </UiButton>
          </UiToolbar>
        </EditorFrame>
      </UiPanel>

      <SideColumn>
        <UiPanel
          title="Code Outline"
          actions={<Badge $tone="info">{codeOutlineSymbols.length}</Badge>}
        >
          <RowList data-agent-code-outline={displayAgentFilePath(workspace, selectedFile.path)}>
            {codeOutlineSymbols.length ? (
              codeOutlineSymbols.map((symbol) => (
                <SnapshotRow
                  key={`${symbol.filePath}:${symbol.kind}:${symbol.name}:${symbol.line}`}
                  data-agent-code-symbol={symbol.name}
                >
                  <div>
                    <RowTitle>{symbol.name}</RowTitle>
                    <RowMeta>
                      {displayAgentFilePath(workspace, symbol.filePath)}:{symbol.line} - {symbol.signature}
                    </RowMeta>
                  </div>
                  <SnapshotActions>
                    <Badge $tone="info">{symbol.kind}</Badge>
                    <UiButton
                      type="button"
                      aria-label={`Open ${symbol.name} at line ${symbol.line}`}
                      onClick={() =>
                        openWorkbenchLine(symbol.filePath, symbol.line, "symbol", symbol)
                      }
                    >
                      <FolderOpen size={16} aria-hidden />
                      Open Line
                    </UiButton>
                  </SnapshotActions>
                </SnapshotRow>
              ))
            ) : (
              <RowMeta>No symbols found in this file.</RowMeta>
            )}
          </RowList>
        </UiPanel>

        <UiPanel
          title="Repository"
          actions={<Badge $tone={diagnosticCounts.error ? "warn" : "ok"}>{repoSummary.fileCount} files</Badge>}
        >
          <StatusGrid>
            <StatusCell>
              <StatusLabel>Changed</StatusLabel>
              <StatusValue>{repoSummary.changedCount}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Folders</StatusLabel>
              <StatusValue>{repoSummary.directories.length}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Errors</StatusLabel>
              <StatusValue>{diagnosticCounts.error}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Warnings</StatusLabel>
              <StatusValue>{diagnosticCounts.warning}</StatusValue>
            </StatusCell>
          </StatusGrid>
          <BadgeRow>
            {repoSummary.languageCounts.map((entry) => (
              <Badge key={entry.language} $tone="info">
                {entry.language} {entry.count}
              </Badge>
            ))}
          </BadgeRow>
          <Separator />
          <RowList>
            {repoSummary.diagnostics.length ? (
              repoSummary.diagnostics.slice(0, 5).map((diagnostic) => {
                const diagnosticPath = diagnostic.filePath;
                return (
                  <ActionRow key={diagnostic.id}>
                    <div>
                      <RowTitle>{diagnostic.rule}</RowTitle>
                      <RowMeta>
                        {diagnosticPath ? displayAgentFilePath(workspace, diagnosticPath) : "workspace"}
                        {diagnostic.line ? `:${diagnostic.line}` : ""} - {diagnostic.message}
                      </RowMeta>
                    </div>
                    <SnapshotActions>
                      <Badge $tone={diagnostic.severity === "info" ? "info" : "warn"}>
                        {diagnostic.severity}
                      </Badge>
                      {diagnosticPath ? (
                        <UiButton
                          type="button"
                          aria-label={`Open diagnostic ${diagnostic.rule} at line ${diagnostic.line ?? 1}`}
                          onClick={() =>
                            openWorkbenchLine(
                              diagnosticPath,
                              diagnostic.line ?? 1,
                              "diagnostic"
                            )
                          }
                        >
                          <FolderOpen size={16} aria-hidden />
                          Open Line
                        </UiButton>
                      ) : null}
                    </SnapshotActions>
                  </ActionRow>
                );
              })
            ) : (
              <RowMeta>No diagnostics found.</RowMeta>
            )}
          </RowList>
          <UiToolbar>
            <UiButton type="button" onClick={runWorkspaceDiagnostics}>
              <Play size={16} aria-hidden />
              Run Diagnostics
            </UiButton>
          </UiToolbar>
        </UiPanel>
        <UiPanel title="Preview" actions={<FileText size={16} aria-hidden />}>
          <PreviewPane>
            {selectedFile.kind === "markdown" ? (
              markdownPreview(selectedFile.content)
            ) : selectedFile.kind === "image" ? (
              <ImagePreview>Image preview</ImagePreview>
            ) : (
              <pre>{selectedFile.content.split("\n").slice(0, 16).join("\n")}</pre>
            )}
          </PreviewPane>
        </UiPanel>
        <UiPanel title="Diff" actions={<Split size={16} aria-hidden />}>
          <DiffPane>{buildDiffText(selectedFile)}</DiffPane>
        </UiPanel>
        <UiPanel title="Terminal" actions={<TerminalSquare size={16} aria-hidden />}>
          <form onSubmit={runTerminal}>
            <ProviderGrid>
              <Input
                value={terminalCommand}
                aria-label="Agent terminal command"
                onChange={(event) => setTerminalCommand(event.target.value)}
              />
              <UiButton type="submit">
                <Play size={16} aria-hidden />
                Run
              </UiButton>
            </ProviderGrid>
          </form>
          <TerminalPane>{terminalOutput.join("\n")}</TerminalPane>
        </UiPanel>
        {renderFilesystemPanel()}
      </SideColumn>
    </SplitLayout>
  );

  const renderGit = () => (
    <SplitLayout>
      <SideColumn>
        <UiPanel
          title="Working Tree"
          tone={gitStatus.length ? "warning" : "success"}
          actions={<Badge $tone={gitStatus.length ? "warn" : "ok"}>{gitStatus.length} changed</Badge>}
        >
          <StatusGrid>
            <StatusCell>
              <StatusLabel>Branch</StatusLabel>
              <StatusValue>{workspace.git.currentBranch}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Staged</StatusLabel>
              <StatusValue>{stagedGitFiles.length}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Unstaged</StatusLabel>
              <StatusValue>{unstagedGitFiles.length}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Grant</StatusLabel>
              <StatusValue>{canManageGit ? "write+project" : "needed"}</StatusValue>
            </StatusCell>
          </StatusGrid>
          <UiToolbar>
            <UiButton
              type="button"
              uiVariant="primary"
              disabled={!canManageGit || !unstagedGitFiles.length}
              onClick={stageAllGitFiles}
            >
              <Save size={16} aria-hidden />
              Stage All Changes
            </UiButton>
          </UiToolbar>
          <RowList>
            {gitStatus.length ? (
              gitStatus.map((status) => (
                <SnapshotRow key={status.path}>
                  <div>
                    <RowTitle>{status.relativePath}</RowTitle>
                    <RowMeta>
                      {status.status} - +{status.additions} / -{status.deletions} - {status.staged ? "staged" : "unstaged"}
                    </RowMeta>
                  </div>
                  <SnapshotActions>
                    {status.staged ? (
                      <UiButton
                        type="button"
                        disabled={!canManageGit}
                        aria-label={`Unstage ${status.relativePath}`}
                        onClick={() => unstageGitFile(status)}
                      >
                        <Trash2 size={16} aria-hidden />
                        Unstage
                      </UiButton>
                    ) : (
                      <UiButton
                        type="button"
                        disabled={!canManageGit}
                        aria-label={`Stage ${status.relativePath}`}
                        onClick={() => stageGitFile(status)}
                      >
                        <Save size={16} aria-hidden />
                        Stage
                      </UiButton>
                    )}
                  </SnapshotActions>
                </SnapshotRow>
              ))
            ) : (
              <RowMeta>Working tree clean.</RowMeta>
            )}
          </RowList>
          {gitNotice ? <RowMeta role="status">{gitNotice}</RowMeta> : null}
        </UiPanel>
      </SideColumn>

      <UiPanel title="Commit" tone={stagedGitFiles.length ? "success" : "info"}>
        <StatusGrid>
          <StatusCell>
            <StatusLabel>Ready</StatusLabel>
            <StatusValue>{stagedGitFiles.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>History</StatusLabel>
            <StatusValue>{workspace.git.commits.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Project</StatusLabel>
            <StatusValue>{workspace.projectPath}</StatusValue>
          </StatusCell>
        </StatusGrid>
        <Field>
          Commit message
          <TextArea
            value={commitMessage}
            rows={3}
            onChange={(event) => setCommitMessage(event.target.value)}
          />
        </Field>
        <UiToolbar>
          <UiButton
            type="button"
            uiVariant="primary"
            disabled={!canManageGit || !stagedGitFiles.length || !commitMessage.trim()}
            onClick={commitGitFiles}
          >
            <CheckCircle2 size={16} aria-hidden />
            Commit Staged Files
          </UiButton>
          <UiButton type="button" onClick={() => setTerminalCommand("git status")}>
            <TerminalSquare size={16} aria-hidden />
            Queue git status
          </UiButton>
        </UiToolbar>
        <DiffPane>{runSafeTerminalCommand("git status", workspace)}</DiffPane>
      </UiPanel>

      <SideColumn>
        <UiPanel title="Branches">
          <Field>
            Current branch
            <Select
              value={workspace.git.currentBranch}
              aria-label="Switch Agent branch"
              disabled={!canManageGit}
              onChange={(event) => switchGitBranch(event.target.value)}
            >
              {workspace.git.branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            New branch
            <Input
              value={newBranchName}
              placeholder="agent/feature-name"
              onChange={(event) => setNewBranchName(event.target.value)}
            />
          </Field>
          <UiToolbar>
            <UiButton
              type="button"
              disabled={!canManageGit || !newBranchName.trim()}
              onClick={createGitBranch}
            >
              <GitBranch size={16} aria-hidden />
              Create Branch
            </UiButton>
          </UiToolbar>
        </UiPanel>

        <UiPanel title="Commit History" actions={<Badge $tone="info">{workspace.git.commits.length}</Badge>}>
          <RowList>
            {workspace.git.commits.length ? (
              [...workspace.git.commits].reverse().map((commit) => (
                <ActionRow key={commit.id}>
                  <div>
                    <RowTitle>{commit.message}</RowTitle>
                    <RowMeta>
                      {commit.branch} - {commit.filePaths.length} file(s) - {new Date(commit.createdAt).toLocaleString()}
                    </RowMeta>
                    <RowMeta>{commit.summary}</RowMeta>
                  </div>
                  <Badge $tone="info">{commit.id.slice(0, 12)}</Badge>
                </ActionRow>
              ))
            ) : (
              <RowMeta>No local Agent commits yet.</RowMeta>
            )}
          </RowList>
        </UiPanel>
      </SideColumn>
    </SplitLayout>
  );

  const renderPermissions = () => (
    <PanelGrid>
      <UiPanel title="MCP Boundary" tone="info">
        <StatusGrid>
          <StatusCell>
            <StatusLabel>Endpoint</StatusLabel>
            <StatusValue>{mcpTokensQuery.data?.endpoint ?? "/mcp"}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Active Tokens</StatusLabel>
            <StatusValue>{activeMcpTokenCount}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Scopes</StatusLabel>
            <StatusValue>{mcpScopes.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Allowed Tools</StatusLabel>
            <StatusValue>{mcpAccessPreview.allowedTools.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Credentials</StatusLabel>
            <StatusValue>user-owned</StatusValue>
          </StatusCell>
        </StatusGrid>
        {oneTimeToken ? (
          <PreviewPane>
            <strong>Copy-once token</strong>
            <pre>{oneTimeToken}</pre>
          </PreviewPane>
        ) : null}
        <UiToolbar>
          <UiButton
            type="button"
            uiVariant="primary"
            disabled={createMcpTokenMutation.isPending}
            onClick={() => createMcpTokenMutation.mutate()}
          >
            <KeyRound size={16} aria-hidden />
            Create Agent Token
          </UiButton>
          <Badge $tone="info">{mcpScopes.join(", ") || "no scopes"}</Badge>
        </UiToolbar>
      </UiPanel>

      <UiPanel title="MCP Access Preview" tone={mcpAccessPreview.blockedTools.length ? "warning" : "success"}>
        <div data-agent-mcp-preview>
          <StatusGrid>
            <StatusCell>
              <StatusLabel>Resources</StatusLabel>
              <StatusValue>{mcpAccessPreview.resources.length}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Allowed</StatusLabel>
              <StatusValue>{mcpAccessPreview.allowedTools.length}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Blocked</StatusLabel>
              <StatusValue>{mcpAccessPreview.blockedTools.length}</StatusValue>
            </StatusCell>
            <StatusCell>
              <StatusLabel>Owner</StatusLabel>
              <StatusValue>paired user</StatusValue>
            </StatusCell>
          </StatusGrid>
          <RowList>
            {mcpAccessPreview.resources.slice(0, 8).map((resource) => (
              <SnapshotRow key={resource.id}>
                <div>
                  <RowTitle>{resource.label}</RowTitle>
                  <RowMeta>{resource.description}</RowMeta>
                </div>
                <Badge $tone={resource.accessLevel === "read" ? "info" : "warn"}>{resource.scope}</Badge>
              </SnapshotRow>
            ))}
            {mcpAccessPreview.resources.length > 8 ? (
              <RowMeta>{mcpAccessPreview.resources.length - 8} more resource scope(s) included.</RowMeta>
            ) : null}
          </RowList>
          <Separator />
          <RowList>
            {prioritizedMcpAllowedTools.slice(0, 8).map((tool) => (
              <ActionRow key={tool.name}>
                <div>
                  <RowTitle>{tool.label}</RowTitle>
                  <RowMeta>{tool.name} - {tool.description}</RowMeta>
                </div>
                <Badge $tone={tool.accessLevel === "read" ? "ok" : "warn"}>{tool.accessLevel}</Badge>
              </ActionRow>
            ))}
            {prioritizedMcpAllowedTools.length > 8 ? (
              <RowMeta>{prioritizedMcpAllowedTools.length - 8} more MCP tool(s) currently allowed.</RowMeta>
            ) : null}
          </RowList>
          <Separator />
          <RowList>
            {prioritizedMcpBlockedTools.slice(0, 5).map((tool) => (
              <ActionRow key={tool.name}>
                <div>
                  <RowTitle>{tool.label}</RowTitle>
                  <RowMeta>
                    Blocked until {tool.requiredPermissions.join(" + ")} grant(s) and {tool.scope} are enabled.
                  </RowMeta>
                </div>
                <Badge $tone="idle">blocked</Badge>
              </ActionRow>
            ))}
            {prioritizedMcpBlockedTools.length > 5 ? (
              <RowMeta>{prioritizedMcpBlockedTools.length - 5} more MCP tool(s) blocked by current grants.</RowMeta>
            ) : null}
          </RowList>
          {mcpAccessPreview.warnings.length ? (
            <>
              <Separator />
              <RowList>
                {mcpAccessPreview.warnings.map((warning) => (
                  <RowMeta key={warning}>{warning}</RowMeta>
                ))}
              </RowList>
            </>
          ) : null}
        </div>
      </UiPanel>

      <UiPanel title="Visible Grants">
        <PermissionGrid>
          {workspace.permissions.map((permission) => (
            <PermissionRow key={permission.key}>
              <input
                type="checkbox"
                aria-label={`Toggle Agent ${permission.label} grant`}
                checked={permission.enabled}
                onChange={(event) => {
                  setWorkspace((current) => ({
                    ...current,
                    permissions: current.permissions.map((entry) =>
                      entry.key === permission.key
                        ? { ...entry, enabled: event.target.checked }
                        : entry
                    ),
                    updatedAt: new Date().toISOString(),
                  }));
                  logClientSystemEvent({
                    eventType: "agent.permission.updated",
                    metadata: { permission: permission.key, enabled: event.target.checked },
                  });
                }}
              />
              <div>
                <RowTitle>{permission.label}</RowTitle>
                <RowMeta>{permission.description}</RowMeta>
                <Badge $tone={permission.scope === "temporary" ? "warn" : "info"}>
                  {permission.scope}
                </Badge>
              </div>
            </PermissionRow>
          ))}
        </PermissionGrid>
      </UiPanel>

      <UiPanel title="Paired Tokens">
        <RowList>
          {mcpTokenRecords.length ? (
            mcpTokenRecords.map((token) => (
              <ActionRow key={token.id}>
                <div>
                  <RowTitle>{token.name}</RowTitle>
                  <RowMeta>
                    {token.tokenPrefix} - {token.revokedAt ? "revoked" : "active"} - {token.scopes.join(", ")}
                  </RowMeta>
                </div>
                <UiButton
                  type="button"
                  disabled={Boolean(token.revokedAt) || revokeMcpTokenMutation.isPending}
                  onClick={() => revokeMcpTokenMutation.mutate(token.id)}
                >
                  <Trash2 size={16} aria-hidden />
                  Revoke
                </UiButton>
              </ActionRow>
            ))
          ) : (
            <RowMeta>No paired Agent tokens yet.</RowMeta>
          )}
        </RowList>
      </UiPanel>
    </PanelGrid>
  );

  const renderMemory = () => (
    <PanelGrid>
      <UiPanel title="Project Memory" tone="success">
        <MemoryGrid>
          {([
            ["architecture", "Architecture"],
            ["conventions", "Coding Conventions"],
            ["goals", "Goals"],
            ["notes", "Notes"],
            ["priorConversations", "Prior Conversations"],
          ] as const).map(([key, label]) => (
            <Field key={key}>
              {label}
              <TextArea
                value={workspace.memory[key]}
                onChange={(event) => updateMemory(key, event.target.value)}
              />
            </Field>
          ))}
        </MemoryGrid>
      </UiPanel>
      <UiPanel title="Persistence">
        <StatusGrid>
          <StatusCell>
            <StatusLabel>Workspace</StatusLabel>
            <StatusValue>{STORAGE_KEY}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Project</StatusLabel>
            <StatusValue>{workspace.projectPath}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Updated</StatusLabel>
            <StatusValue>{new Date(workspace.updatedAt).toLocaleString()}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Messages</StatusLabel>
            <StatusValue>{workspace.messages.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Plan</StatusLabel>
            <StatusValue>{workspace.plan.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Actions</StatusLabel>
            <StatusValue>{workspace.codeActions.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Commits</StatusLabel>
            <StatusValue>{workspace.git.commits.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Snapshots</StatusLabel>
            <StatusValue>{snapshotStats.snapshotCount}</StatusValue>
          </StatusCell>
        </StatusGrid>
      </UiPanel>
      {renderFilesystemPanel()}
    </PanelGrid>
  );

  const renderExtensions = () => (
    <PanelGrid>
      <UiPanel title="Extension Platform" tone="info">
        <StatusGrid>
          <StatusCell>
            <StatusLabel>Extension Points</StatusLabel>
            <StatusValue>{agentExtensionCatalog.extensionPoints.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Installed</StatusLabel>
            <StatusValue>{workspace.extensions.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Enabled</StatusLabel>
            <StatusValue>{enabledExtensionCount}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>User-Owned</StatusLabel>
            <StatusValue>{userExtensionCount}</StatusValue>
          </StatusCell>
        </StatusGrid>
        <Separator />
        <RowList data-agent-extension-points>
          {agentExtensionCatalog.extensionPoints.map((point) => (
            <ActionRow key={point}>
              <div>
                <RowTitle>{AGENT_EXTENSION_POINT_LABELS[point]}</RowTitle>
                <RowMeta>
                  {extensionCountsByPoint[point]} installed manifest(s) can attach at this extension point.
                </RowMeta>
              </div>
              <Badge $tone="info">{point}</Badge>
            </ActionRow>
          ))}
        </RowList>
      </UiPanel>

      <UiPanel title="Installed Manifests">
        <RowList data-agent-extension-catalog>
          {workspace.extensions.map((extension) => (
            <ActionRow key={extension.id} data-agent-extension-manifest={extension.id}>
              <div>
                <RowTitle>{extension.label}</RowTitle>
                <RowMeta>
                  {extension.id} - {extension.owner} - v{extension.version} - {extension.description}
                </RowMeta>
                <BadgeRow>
                  <Badge $tone={extension.enabled ? "ok" : "idle"}>
                    {extension.enabled ? "enabled" : "disabled"}
                  </Badge>
                  <Badge $tone={extension.source === "core" ? "info" : "warn"}>{extension.source}</Badge>
                  <Badge $tone="info">{extension.extensionPoint}</Badge>
                  {extension.permissions.map((permission) => (
                    <Badge key={permission}>{permission}</Badge>
                  ))}
                </BadgeRow>
              </div>
              <SnapshotActions>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Enable Agent extension ${extension.label}`}
                    checked={extension.enabled}
                    onChange={(event) => toggleExtension(extension.id, event.target.checked)}
                  />{" "}
                  Enabled
                </label>
                <UiButton
                  type="button"
                  aria-label={`Remove Agent extension ${extension.label}`}
                  disabled={extension.source === "core"}
                  onClick={() => removeExtension(extension.id)}
                >
                  <Trash2 size={16} aria-hidden />
                  Remove Manifest
                </UiButton>
              </SnapshotActions>
            </ActionRow>
          ))}
        </RowList>
      </UiPanel>

      <UiPanel title="Install User Manifest">
        <Field>
          Extension manifest JSON
          <TextArea
            aria-label="Agent extension manifest JSON"
            value={extensionManifestDraft}
            onChange={(event) => setExtensionManifestDraft(event.target.value)}
          />
        </Field>
        <UiToolbar>
          <UiButton type="button" onClick={installExtensionManifest}>
            <Upload size={16} aria-hidden />
            Install Manifest
          </UiButton>
          <UiButton
            type="button"
            onClick={() => {
              setExtensionManifestDraft(DEFAULT_EXTENSION_MANIFEST_DRAFT);
              setExtensionNotice("Restored the example extension manifest.");
            }}
          >
            <FileText size={16} aria-hidden />
            Restore Example
          </UiButton>
        </UiToolbar>
        {extensionNotice ? <RowMeta>{extensionNotice}</RowMeta> : null}
        <RowMeta>
          User manifests register capabilities and permission needs only. Enabling a manifest does not bypass visible Agent grants, MCP scopes, app gates, wallet review, or provider credentials.
        </RowMeta>
      </UiPanel>
    </PanelGrid>
  );

  const renderCompanion = () => (
    <SplitLayout>
      <UiPanel title="Companion">
        <PermissionRow>
          <input
            type="checkbox"
            checked={workspace.companionEnabled}
            onChange={(event) =>
              setWorkspace((current) => ({
                ...current,
                companionEnabled: event.target.checked,
                updatedAt: new Date().toISOString(),
              }))
            }
          />
          <div>
            <RowTitle>{workspace.companionEnabled ? "Enabled" : "Disabled"}</RowTitle>
            <RowMeta>Answers from the local wtfOS knowledge pack in this workspace.</RowMeta>
          </div>
        </PermissionRow>
        <Separator />
        <Field>
          Ask
          <TextArea
            value={companionQuestion}
            onChange={(event) => setCompanionQuestion(event.target.value)}
          />
        </Field>
        <UiButton
          type="button"
          uiVariant="primary"
          disabled={!workspace.companionEnabled}
          onClick={() =>
            setCompanionAnswer(
              answerAgentCompanionQuestionFromKnowledge(
                companionQuestion,
                agentKnowledgeBase
              )
            )
          }
        >
          <Bot size={16} aria-hidden />
          Answer
        </UiButton>
      </UiPanel>
      <UiPanel title="Answer" tone="info">
        <PreviewPane>{companionAnswer}</PreviewPane>
      </UiPanel>
      <UiPanel title="Knowledge Pack">
        <StatusGrid>
          <StatusCell>
            <StatusLabel>Entries</StatusLabel>
            <StatusValue>{agentKnowledgeBase.entries.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Extensions</StatusLabel>
            <StatusValue>{agentExtensionCatalog.manifests.length}</StatusValue>
          </StatusCell>
          <StatusCell>
            <StatusLabel>Points</StatusLabel>
            <StatusValue>{agentExtensionCatalog.extensionPoints.length}</StatusValue>
          </StatusCell>
        </StatusGrid>
        <RowList>
          {companionKnowledgeMatches.map((entry) => (
            <ActionRow key={entry.id}>
              <div>
                <RowTitle>{entry.title}</RowTitle>
                <RowMeta>
                  {entry.kind} - {entry.summary}
                </RowMeta>
              </div>
              <Badge $tone="info">{entry.source}</Badge>
            </ActionRow>
          ))}
        </RowList>
      </UiPanel>
    </SplitLayout>
  );

  const tabContent = {
    chat: renderChat,
    plan: renderPlan,
    workbench: renderWorkbench,
    git: renderGit,
    permissions: renderPermissions,
    memory: renderMemory,
    extensions: renderExtensions,
    companion: renderCompanion,
  }[activeTab]();

  return (
    <AppWindow title="Agent">
      <Shell
        data-testid="wtfos-agent"
        data-agent-surface="workspace"
        data-agent-presentation-host={presentation.host}
        data-agent-provider={workspace.activeProviderId}
      >
        <HeaderBar>
          <HeaderIdentity>
            <AgentMark>AI</AgentMark>
            <div>
              <HeaderTitle>Agent</HeaderTitle>
              <HeaderMeta>
                {activeRuntimeReady
                  ? summarizeProviderConnection(activeConnection)
                  : activeLocalEndpoint
                    ? "Local endpoint can run without a provider proxy; save the provider to mark it ready."
                    : "Save a user-owned credential in this browser session; wtfOS will not proxy it."}
              </HeaderMeta>
            </div>
          </HeaderIdentity>
          <HeaderControls>
            <Badge $tone={activeRuntimeReady ? "ok" : "warn"}>
              {activeRuntimeReady ? "provider ready" : "provider setup"}
            </Badge>
            <Badge $tone="info">{workspace.projectPath}</Badge>
            <UiButton type="button" onClick={resetWorkspace}>
              <Trash2 size={16} aria-hidden />
              Reset Local
            </UiButton>
          </HeaderControls>
        </HeaderBar>

        <Tabs role="tablist" aria-label="Agent workspace views">
          {([
            ["chat", MessageSquareText, "Chat"],
            ["plan", ListChecks, "Plan"],
            ["workbench", Code2, "Workbench"],
            ["git", GitBranch, "Git"],
            ["permissions", KeyRound, "Permissions"],
            ["memory", Braces, "Memory"],
            ["extensions", PlugZap, "Extensions"],
            ["companion", Bot, "Companion"],
          ] as const).map(([tab, Icon, label]) => (
            <TabButton
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-pressed={activeTab === tab}
              data-agent-tab={tab}
              $active={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              <Icon size={16} aria-hidden />
              {label}
            </TabButton>
          ))}
        </Tabs>

        {tabContent}

        <UiToolbar>
          <Badge $tone="info">
            <GitBranch size={14} aria-hidden />
            {workspace.git.currentBranch}
          </Badge>
          <Badge $tone={changedFiles.length ? "warn" : "ok"}>
            {changedFiles.length} changed file(s)
          </Badge>
          <Badge $tone={proposedActions.length ? "warn" : "info"}>
            {proposedActions.length} proposed action(s)
          </Badge>
          <Badge $tone="info">{activeCapabilities.length} provider capability flags</Badge>
          <Badge $tone="info">{enabledExtensionCount} enabled extension(s)</Badge>
        </UiToolbar>
      </Shell>
    </AppWindow>
  );
}
