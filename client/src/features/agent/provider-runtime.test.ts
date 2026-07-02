import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultAgentWorkspace } from "./agent-model";
import {
  AgentProviderError,
  buildAgentSystemPrompt,
  isLocalAgentEndpoint,
  sendAgentProviderMessage,
} from "./provider-runtime";

type FetchCall = {
  url: string;
  init: RequestInit;
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function createFetchMock(body: unknown) {
  const calls: FetchCall[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return jsonResponse(body);
  };
  return { calls, fetchImpl: fetchImpl as typeof fetch };
}

test("Agent provider runtime builds project-aware system prompts without credentials", () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const prompt = buildAgentSystemPrompt(workspace);

  assert.match(prompt, /native AI workspace built into wtfOS/);
  assert.match(prompt, /Project: wtfos:\/\/Agent\/Projects\/native-agent/);
  assert.match(prompt, /Never ask wtfOS to proxy provider credentials/);
  assert.doesNotMatch(prompt, /sk-/);
});

test("OpenAI-compatible providers use browser-direct chat completions with bearer credentials", async () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const { calls, fetchImpl } = createFetchMock({
    choices: [{ message: { content: "direct reply" } }],
  });

  const result = await sendAgentProviderMessage({
    workspace,
    connection: workspace.providers.openai,
    credential: "sk-user-owned",
    fetchImpl,
  });

  assert.equal(result.content, "direct reply");
  assert.equal(result.transport, "browser-direct");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer sk-user-owned");
  assert.equal(calls[0].url.startsWith("/api/"), false);

  const payload = JSON.parse(String(calls[0].init.body));
  assert.equal(payload.model, "gpt-4.1");
  assert.equal(payload.messages[0].role, "system");
});

test("remote providers require a user-owned browser credential before sending", async () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");

  await assert.rejects(
    () =>
      sendAgentProviderMessage({
        workspace,
        connection: workspace.providers.anthropic,
        fetchImpl: async () => jsonResponse({}) as Response,
      }),
    (error) => {
      assert(error instanceof AgentProviderError);
      assert.equal(error.code, "missing-credential");
      assert.match(error.message, /will not proxy/);
      return true;
    }
  );
});

test("Anthropic requests use x-api-key and parse content blocks", async () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const { calls, fetchImpl } = createFetchMock({
    content: [{ type: "text", text: "claude reply" }],
  });

  const result = await sendAgentProviderMessage({
    workspace,
    connection: workspace.providers.anthropic,
    credential: "anthropic-user-key",
    fetchImpl,
  });

  assert.equal(result.content, "claude reply");
  assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], "anthropic-user-key");
  assert.equal(headers.Authorization, undefined);
  assert.equal(headers["anthropic-version"], "2023-06-01");
});

test("Google API-key requests keep the key in the provider URL and parse candidates", async () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const google = { ...workspace.providers.google, authMethod: "api-key" as const };
  const { calls, fetchImpl } = createFetchMock({
    candidates: [{ content: { parts: [{ text: "gemini reply" }] } }],
  });

  const result = await sendAgentProviderMessage({
    workspace,
    connection: google,
    credential: "google-user-key",
    fetchImpl,
  });

  assert.equal(result.content, "gemini reply");
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-1\.5-pro:generateContent/);
  assert.match(calls[0].url, /key=google-user-key/);
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, undefined);
});

test("Ollama local endpoint sends without credentials", async () => {
  const workspace = createDefaultAgentWorkspace("2026-06-29T00:00:00.000Z");
  const { calls, fetchImpl } = createFetchMock({
    message: { content: "local reply" },
  });

  const result = await sendAgentProviderMessage({
    workspace,
    connection: workspace.providers.ollama,
    fetchImpl,
  });

  assert.equal(result.content, "local reply");
  assert.equal(calls[0].url, "http://127.0.0.1:11434/api/chat");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, undefined);
});

test("local endpoint detection covers localhost variants", () => {
  assert.equal(isLocalAgentEndpoint("http://127.0.0.1:11434"), true);
  assert.equal(isLocalAgentEndpoint("http://localhost:1234/v1"), true);
  assert.equal(isLocalAgentEndpoint("https://api.openai.com/v1"), false);
});
