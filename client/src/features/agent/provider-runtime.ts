import {
  getAgentProviderAdapter,
  type AgentChatMessage,
  type AgentProviderConnection,
  type AgentWorkspaceState,
} from "./agent-model";

export type AgentProviderRequest = {
  connection: AgentProviderConnection;
  workspace: AgentWorkspaceState;
  credential?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

export type AgentProviderResponse = {
  content: string;
  providerId: AgentProviderConnection["providerId"];
  model: string;
  endpoint: string;
  transport: "browser-direct";
};

export class AgentProviderError extends Error {
  code: "missing-credential" | "network" | "provider" | "parse";
  status?: number;

  constructor(
    message: string,
    code: AgentProviderError["code"],
    status?: number
  ) {
    super(message);
    this.name = "AgentProviderError";
    this.code = code;
    this.status = status;
  }
}

export function isLocalAgentEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return /(^|\.)localhost(?::|\/|$)|127\.0\.0\.1|0\.0\.0\.0|::1/.test(endpoint);
  }
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function joinEndpoint(endpoint: string, path: string) {
  return `${trimSlash(endpoint)}${path.startsWith("/") ? path : `/${path}`}`;
}

function textLimit(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit)}\n...[truncated]` : value;
}

function needsCredential(connection: AgentProviderConnection): boolean {
  const adapter = getAgentProviderAdapter(connection.providerId);
  if (adapter.localRuntime) return false;
  if (connection.authMethod === "local-endpoint") return false;
  if (isLocalAgentEndpoint(connection.endpoint)) return false;
  return true;
}

function assertRunnableCredential(connection: AgentProviderConnection, credential?: string) {
  if (needsCredential(connection) && !credential?.trim()) {
    throw new AgentProviderError(
      "Save a user-owned provider credential in this browser session before sending. wtfOS will not proxy or store it server-side.",
      "missing-credential"
    );
  }
}

export function buildAgentSystemPrompt(workspace: AgentWorkspaceState): string {
  const selectedFile =
    workspace.files.find((file) => file.path === workspace.selectedFilePath) ??
    workspace.files[0];
  const changed = workspace.files
    .filter((file) => file.content !== file.baselineContent)
    .map((file) => file.path.replace(`${workspace.projectPath}/`, ""));

  return [
    "You are Agent, the native AI workspace built into wtfOS.",
    "Act like an OS-integrated coding assistant: plan clearly, edit deliberately, explain tradeoffs, and keep credentials user-owned.",
    "Never ask wtfOS to proxy provider credentials. You are running through a browser-direct or local endpoint transport chosen by the user.",
    "",
    `Project: ${workspace.projectPath}`,
    `Branch: ${workspace.branch}`,
    `Changed files: ${changed.length ? changed.join(", ") : "none"}`,
    "",
    "Persistent project memory:",
    `Architecture: ${workspace.memory.architecture}`,
    `Conventions: ${workspace.memory.conventions}`,
    `Goals: ${workspace.memory.goals}`,
    `Notes: ${workspace.memory.notes}`,
    "",
    selectedFile
      ? [
          "Selected file context:",
          `Path: ${selectedFile.path}`,
          `Language: ${selectedFile.language}`,
          textLimit(selectedFile.content, 6500),
        ].join("\n")
      : "No file selected.",
  ].join("\n");
}

function conversationMessages(workspace: AgentWorkspaceState): AgentChatMessage[] {
  return workspace.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-20);
}

function openAiCompatibleUrl(connection: AgentProviderConnection) {
  const base = trimSlash(connection.endpoint);
  if (base.endsWith("/chat/completions")) return base;
  return joinEndpoint(base, "/chat/completions");
}

function anthropicUrl(connection: AgentProviderConnection) {
  const base = trimSlash(connection.endpoint);
  if (base.endsWith("/messages")) return base;
  return base.endsWith("/v1") ? joinEndpoint(base, "/messages") : joinEndpoint(base, "/v1/messages");
}

function googleUrl(connection: AgentProviderConnection, credential?: string) {
  const base = trimSlash(connection.endpoint);
  const root = base.includes("/v1") ? base : joinEndpoint(base, "/v1beta");
  const url = new URL(joinEndpoint(root, `/models/${encodeURIComponent(connection.model)}:generateContent`));
  if (connection.authMethod === "api-key" && credential?.trim()) {
    url.searchParams.set("key", credential.trim());
  }
  return url.toString();
}

function ollamaUrl(connection: AgentProviderConnection) {
  const base = trimSlash(connection.endpoint);
  if (base.endsWith("/api/chat")) return base;
  return joinEndpoint(base, "/api/chat");
}

function providerErrorText(providerId: AgentProviderConnection["providerId"], status: number, body: string) {
  const detail = body ? ` ${textLimit(body, 460)}` : "";
  return `${providerId} returned HTTP ${status}.${detail}`;
}

async function readProviderJson(response: Response, providerId: AgentProviderConnection["providerId"]) {
  const text = await response.text();
  if (!response.ok) {
    throw new AgentProviderError(providerErrorText(providerId, response.status, text), "provider", response.status);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new AgentProviderError(`${providerId} returned non-JSON output.`, "parse", response.status);
  }
}

function extractTextParts(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) return String((part as { text: unknown }).text ?? "");
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function parseOpenAiCompatible(data: unknown): string {
  const body = data as {
    output_text?: string;
    choices?: Array<{ message?: { content?: unknown }; text?: string }>;
    output?: Array<{ content?: unknown }>;
  };
  if (body.output_text) return body.output_text;
  const choice = body.choices?.[0];
  const messageContent = choice?.message?.content;
  const content = extractTextParts(messageContent);
  if (content) return content;
  if (choice?.text) return choice.text;
  const outputText = body.output?.map((entry) => extractTextParts(entry.content)).filter(Boolean).join("\n");
  return outputText || "";
}

function parseAnthropic(data: unknown): string {
  const body = data as { content?: Array<{ text?: string; type?: string }> };
  return body.content?.map((entry) => entry.text || "").filter(Boolean).join("\n") || "";
}

function parseGoogle(data: unknown): string {
  const body = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (
    body.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .filter(Boolean)
      .join("\n") || ""
  );
}

function parseOllama(data: unknown): string {
  const body = data as { message?: { content?: string }; response?: string };
  return body.message?.content || body.response || "";
}

function ensureParsedContent(content: string, providerId: AgentProviderConnection["providerId"]) {
  if (content.trim()) return content.trim();
  throw new AgentProviderError(`${providerId} returned an empty response.`, "parse");
}

function authHeaders(connection: AgentProviderConnection, credential?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = credential?.trim();
  if (!secret) return headers;

  if (connection.providerId === "anthropic") {
    headers["x-api-key"] = secret;
    return headers;
  }

  if (connection.providerId === "google" && connection.authMethod === "api-key") {
    return headers;
  }

  headers.Authorization = `Bearer ${secret}`;
  return headers;
}

async function sendOpenAiCompatible(request: AgentProviderRequest): Promise<AgentProviderResponse> {
  const fetcher = request.fetchImpl ?? fetch;
  const url = openAiCompatibleUrl(request.connection);
  const system = buildAgentSystemPrompt(request.workspace);
  const messages = [
    { role: "system", content: system },
    ...conversationMessages(request.workspace).map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      ...authHeaders(request.connection, request.credential),
      ...(request.connection.providerId === "openrouter"
        ? {
            "HTTP-Referer": typeof location !== "undefined" ? location.origin : "https://wtfos.app",
            "X-Title": "wtfOS Agent",
          }
        : {}),
    },
    body: JSON.stringify({
      model: request.connection.model,
      messages,
      temperature: 0.2,
    }),
    signal: request.signal,
  });
  const data = await readProviderJson(response, request.connection.providerId);
  return {
    content: ensureParsedContent(parseOpenAiCompatible(data), request.connection.providerId),
    providerId: request.connection.providerId,
    model: request.connection.model,
    endpoint: url,
    transport: "browser-direct",
  };
}

async function sendAnthropic(request: AgentProviderRequest): Promise<AgentProviderResponse> {
  const fetcher = request.fetchImpl ?? fetch;
  const url = anthropicUrl(request.connection);
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      ...authHeaders(request.connection, request.credential),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: request.connection.model,
      max_tokens: 2048,
      system: buildAgentSystemPrompt(request.workspace),
      messages: conversationMessages(request.workspace).map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
    }),
    signal: request.signal,
  });
  const data = await readProviderJson(response, request.connection.providerId);
  return {
    content: ensureParsedContent(parseAnthropic(data), request.connection.providerId),
    providerId: request.connection.providerId,
    model: request.connection.model,
    endpoint: url,
    transport: "browser-direct",
  };
}

async function sendGoogle(request: AgentProviderRequest): Promise<AgentProviderResponse> {
  const fetcher = request.fetchImpl ?? fetch;
  const url = googleUrl(request.connection, request.credential);
  const response = await fetcher(url, {
    method: "POST",
    headers: authHeaders(request.connection, request.credential),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildAgentSystemPrompt(request.workspace) }] },
      contents: conversationMessages(request.workspace).map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      generationConfig: { temperature: 0.2 },
    }),
    signal: request.signal,
  });
  const data = await readProviderJson(response, request.connection.providerId);
  return {
    content: ensureParsedContent(parseGoogle(data), request.connection.providerId),
    providerId: request.connection.providerId,
    model: request.connection.model,
    endpoint: url,
    transport: "browser-direct",
  };
}

async function sendOllama(request: AgentProviderRequest): Promise<AgentProviderResponse> {
  const fetcher = request.fetchImpl ?? fetch;
  const url = ollamaUrl(request.connection);
  const response = await fetcher(url, {
    method: "POST",
    headers: authHeaders(request.connection, request.credential),
    body: JSON.stringify({
      model: request.connection.model,
      stream: false,
      messages: [
        { role: "system", content: buildAgentSystemPrompt(request.workspace) },
        ...conversationMessages(request.workspace).map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
    }),
    signal: request.signal,
  });
  const data = await readProviderJson(response, request.connection.providerId);
  return {
    content: ensureParsedContent(parseOllama(data), request.connection.providerId),
    providerId: request.connection.providerId,
    model: request.connection.model,
    endpoint: url,
    transport: "browser-direct",
  };
}

export async function sendAgentProviderMessage(
  request: AgentProviderRequest
): Promise<AgentProviderResponse> {
  assertRunnableCredential(request.connection, request.credential);
  try {
    if (
      request.connection.providerId === "openai" ||
      request.connection.providerId === "openrouter" ||
      request.connection.providerId === "lm-studio" ||
      request.connection.providerId === "openai-compatible"
    ) {
      return await sendOpenAiCompatible(request);
    }
    if (request.connection.providerId === "anthropic") return await sendAnthropic(request);
    if (request.connection.providerId === "google") return await sendGoogle(request);
    if (request.connection.providerId === "ollama") return await sendOllama(request);
    throw new AgentProviderError(
      `Unsupported Agent provider: ${request.connection.providerId}`,
      "provider"
    );
  } catch (error) {
    if (error instanceof AgentProviderError) throw error;
    throw new AgentProviderError(
      "Provider request failed in the browser-direct transport. Check the endpoint, CORS policy, local runtime, network access, or user-owned credential; wtfOS did not proxy this request.",
      "network"
    );
  }
}
