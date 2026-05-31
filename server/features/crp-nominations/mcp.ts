import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CRP_CATEGORIES } from "@shared/crp-categories";
import { isTezosAddress } from "@shared/tezos-identity";
import { getDesktopAppConfig } from "../../lib/desktop-apps";
import { hasMcpScope, isMcpFeatureEnabled } from "../../lib/wtf-mcp";
import type { McpAgentAuthContext } from "../../lib/mcp-agent-auth";
import { resolveSpineIdentity } from "../atproto-spine/identity-resolve";
import { resolveNomineeIdentity } from "./identity-resolver";
import { listCrpNominationsForUser, crpRepoStatus, publishCrpNomination } from "./publish";
import { countAnonymousNominationCredits } from "./reward-credits";
import { buildCrpShareIntents } from "./share-intents";
import { emitCrpNominationEvent } from "./events";

const RESPONSE_FORMATS = ["markdown", "json"] as const;
const ResponseFormatSchema = z.enum(RESPONSE_FORMATS).default("markdown");
type ResponseFormat = (typeof RESPONSE_FORMATS)[number];

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const CRP_MCP_READ_LIMIT = Number(process.env.MCP_CRP_READ_RATE_LIMIT_PER_MINUTE || 60);
const CRP_MCP_WRITE_LIMIT = Number(process.env.MCP_CRP_WRITE_RATE_LIMIT_PER_MINUTE || 20);
const crpMcpReadHits = new Map<string, number[]>();
const crpMcpWriteHits = new Map<string, number[]>();

function checkCrpMcpRateLimit(input: {
  userId: number;
  tokenPrefix: string;
  kind: "read" | "write";
}): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const windowMs = 60_000;
  const max = input.kind === "write" ? CRP_MCP_WRITE_LIMIT : CRP_MCP_READ_LIMIT;
  const store = input.kind === "write" ? crpMcpWriteHits : crpMcpReadHits;
  const key = `${input.kind}:${input.userId}:${input.tokenPrefix}`;
  const now = Date.now();
  const recent = (store.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= max) {
    const retryAfterMs = Math.max(0, windowMs - (now - recent[0]!));
    store.set(key, recent);
    return { allowed: false, retryAfterMs };
  }
  recent.push(now);
  store.set(key, recent);
  return { allowed: true };
}

function asText(output: unknown, responseFormat: ResponseFormat, markdown?: string): string {
  if (responseFormat === "json") {
    return JSON.stringify(output, null, 2);
  }
  return markdown || JSON.stringify(output, null, 2);
}

function toolResult(
  output: Record<string, unknown>,
  responseFormat: ResponseFormat,
  markdown?: string
): ToolResult {
  return {
    content: [{ type: "text", text: asText(output, responseFormat, markdown) }],
    structuredContent: output,
  };
}

function toolError(message: string, responseFormat: ResponseFormat, details?: unknown): ToolResult {
  return {
    content: [{ type: "text", text: asText({ ok: false, error: message, details }, responseFormat) }],
    structuredContent: { ok: false, error: message, details: details ?? null },
    isError: true,
  };
}

function requireMcpScopes(
  auth: McpAgentAuthContext,
  requiredScopes: string[],
  toolName: string,
  responseFormat: ResponseFormat
): ToolResult | null {
  const missing = requiredScopes.filter((scope) => !hasMcpScope(auth.scopes, scope));
  if (missing.length === 0) return null;
  return toolError(
    `${toolName} requires MCP scope${missing.length === 1 ? "" : "s"} ${missing.join(", ")}.`,
    responseFormat,
    { requiredScopes, pairedScopes: auth.scopes }
  );
}

async function requireCrpMcpFeature(toolName: string, responseFormat: ResponseFormat) {
  const apps = await getDesktopAppConfig();
  if (isMcpFeatureEnabled(apps, "crp-nominations")) {
    return { ok: true as const, apps };
  }
  return {
    ok: false as const,
    error: toolError(
      `${toolName} is disabled because the admin control panel has disabled the crp-nominations sub app.`,
      responseFormat,
      { gate: "crp-nominations", apps }
    ),
  };
}

function mcpActorMetadata(auth: McpAgentAuthContext, toolName: string) {
  return {
    actor: "mcp" as const,
    mcpTokenPrefix: auth.tokenPrefix,
    mcpToolName: toolName,
  };
}

function enforceCrpMcpRateLimit(
  auth: McpAgentAuthContext,
  kind: "read" | "write",
  toolName: string,
  responseFormat: ResponseFormat
): ToolResult | null {
  const result = checkCrpMcpRateLimit({
    userId: auth.user.id,
    tokenPrefix: auth.tokenPrefix,
    kind,
  });
  if (result.allowed) return null;
  emitCrpNominationEvent({
    eventType: "crp.nomination.mcp.rate_limited",
    userId: auth.user.id,
    ...mcpActorMetadata(auth, toolName),
    metadata: { kind, retryAfterMs: result.retryAfterMs },
  });
  return toolError(
    `CRP MCP ${kind} rate limit exceeded for the paired token. Agents act on behalf of the token owner; repeated abuse may lead to token revocation.`,
    responseFormat,
    { kind, retryAfterMs: result.retryAfterMs }
  );
}

export function registerCrpNominationMcpTools(server: McpServer, auth: McpAgentAuthContext): void {
  server.registerTool(
    "wtf_list_crp_categories",
    {
      title: "List CRP nomination categories",
      description:
        "Return official Tezos Commons CRP categories for the paired user's CRP Nominations app. Requires crp-nominations:read.",
      inputSchema: z.object({ response_format: ResponseFormatSchema }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ response_format }) => {
      const responseFormat = response_format as ResponseFormat;
      const gate = await requireCrpMcpFeature("wtf_list_crp_categories", responseFormat);
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(auth, ["crp-nominations:read"], "wtf_list_crp_categories", responseFormat);
      if (scopeError) return scopeError;
      const rateError = enforceCrpMcpRateLimit(auth, "read", "wtf_list_crp_categories", responseFormat);
      if (rateError) return rateError;
      emitCrpNominationEvent({
        eventType: "crp.nomination.mcp.categories_listed",
        userId: auth.user.id,
        ...mcpActorMetadata(auth, "wtf_list_crp_categories"),
      });
      return toolResult(
        { ok: true, categories: CRP_CATEGORIES, liabilityNotice: CRP_MCP_LIABILITY_NOTICE },
        responseFormat,
        `Listed ${CRP_CATEGORIES.length} official CRP categories.`
      );
    }
  );

  server.registerTool(
    "wtf_get_crp_nomination_status",
    {
      title: "Get CRP nominations repo status",
      description:
        "Probe whether the dedicated CRP nominations AT repo is configured. Requires crp-nominations:read.",
      inputSchema: z.object({ response_format: ResponseFormatSchema }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ response_format }) => {
      const responseFormat = response_format as ResponseFormat;
      const gate = await requireCrpMcpFeature("wtf_get_crp_nomination_status", responseFormat);
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["crp-nominations:read"],
        "wtf_get_crp_nomination_status",
        responseFormat
      );
      if (scopeError) return scopeError;
      const rateError = enforceCrpMcpRateLimit(auth, "read", "wtf_get_crp_nomination_status", responseFormat);
      if (rateError) return rateError;
      const status = crpRepoStatus();
      emitCrpNominationEvent({
        eventType: "crp.nomination.mcp.status_read",
        userId: auth.user.id,
        ...mcpActorMetadata(auth, "wtf_get_crp_nomination_status"),
        metadata: { configured: status.configured },
      });
      return toolResult({ ok: true, status, liabilityNotice: CRP_MCP_LIABILITY_NOTICE }, responseFormat);
    }
  );

  server.registerTool(
    "wtf_resolve_crp_nominee",
    {
      title: "Resolve CRP nominee identity",
      description:
        "Merge Tezos wallet, .tez domain, X handle, or Bluesky handle into nominee bundles for the paired user. Requires crp-nominations:read.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(320),
        response_format: ResponseFormatSchema,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ query, response_format }) => {
      const responseFormat = response_format as ResponseFormat;
      const gate = await requireCrpMcpFeature("wtf_resolve_crp_nominee", responseFormat);
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(auth, ["crp-nominations:read"], "wtf_resolve_crp_nominee", responseFormat);
      if (scopeError) return scopeError;
      const rateError = enforceCrpMcpRateLimit(auth, "read", "wtf_resolve_crp_nominee", responseFormat);
      if (rateError) return rateError;
      try {
        const resolution = await resolveNomineeIdentity(query);
        emitCrpNominationEvent({
          eventType: "crp.nomination.resolve",
          userId: auth.user.id,
          ...mcpActorMetadata(auth, "wtf_resolve_crp_nominee"),
          metadata: { kind: resolution.kind, bundleCount: resolution.bundles.length },
        });
        return toolResult({ ok: true, resolution, liabilityNotice: CRP_MCP_LIABILITY_NOTICE }, responseFormat);
      } catch (err) {
        return toolError(
          err instanceof Error ? err.message : "resolve_failed",
          responseFormat
        );
      }
    }
  );

  server.registerTool(
    "wtf_list_my_crp_nominations",
    {
      title: "List my attributed CRP nominations",
      description:
        "List attributed nominations for the paired user plus anonymous nomination credit count. Requires crp-nominations:read.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(50),
        response_format: ResponseFormatSchema,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, response_format }) => {
      const responseFormat = response_format as ResponseFormat;
      const gate = await requireCrpMcpFeature("wtf_list_my_crp_nominations", responseFormat);
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["crp-nominations:read"],
        "wtf_list_my_crp_nominations",
        responseFormat
      );
      if (scopeError) return scopeError;
      const rateError = enforceCrpMcpRateLimit(auth, "read", "wtf_list_my_crp_nominations", responseFormat);
      if (rateError) return rateError;
      const [nominations, anonymousNominationCredits] = await Promise.all([
        listCrpNominationsForUser(auth.user.id, limit),
        countAnonymousNominationCredits(auth.user.id),
      ]);
      emitCrpNominationEvent({
        eventType: "crp.nomination.mcp.mine_listed",
        userId: auth.user.id,
        ...mcpActorMetadata(auth, "wtf_list_my_crp_nominations"),
        metadata: { nominationCount: nominations.length, anonymousNominationCredits },
      });
      return toolResult(
        { ok: true, nominations, anonymousNominationCredits, liabilityNotice: CRP_MCP_LIABILITY_NOTICE },
        responseFormat
      );
    }
  );

  server.registerTool(
    "wtf_get_crp_nomination_credits",
    {
      title: "Get anonymous CRP nomination credits",
      description:
        "Return the privacy-preserving anonymous nomination credit count for the paired user. Requires crp-nominations:read.",
      inputSchema: z.object({ response_format: ResponseFormatSchema }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ response_format }) => {
      const responseFormat = response_format as ResponseFormat;
      const gate = await requireCrpMcpFeature("wtf_get_crp_nomination_credits", responseFormat);
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["crp-nominations:read"],
        "wtf_get_crp_nomination_credits",
        responseFormat
      );
      if (scopeError) return scopeError;
      const rateError = enforceCrpMcpRateLimit(auth, "read", "wtf_get_crp_nomination_credits", responseFormat);
      if (rateError) return rateError;
      const anonymousNominationCredits = await countAnonymousNominationCredits(auth.user.id);
      emitCrpNominationEvent({
        eventType: "crp.nomination.mcp.credits_read",
        userId: auth.user.id,
        ...mcpActorMetadata(auth, "wtf_get_crp_nomination_credits"),
        metadata: { anonymousNominationCredits },
      });
      return toolResult(
        { ok: true, anonymousNominationCredits, liabilityNotice: CRP_MCP_LIABILITY_NOTICE },
        responseFormat
      );
    }
  );

  server.registerTool(
    "wtf_submit_crp_nomination",
    {
      title: "Submit CRP nomination",
      description:
        "Publish a CRP nomination for the paired user. Anonymous submissions omit nominator identity from the CRP repo. Requires crp-nominations:write. Agents act on behalf of the MCP token owner, who remains liable for abuse.",
      inputSchema: z.object({
        anonymous: z.boolean().optional(),
        nominee: z.object({
          tezosAddress: z.string().trim(),
          tezosDomain: z.string().trim().max(120).optional().nullable(),
          displayName: z.string().trim().max(320).optional().nullable(),
          xHandle: z.string().trim().max(64).optional().nullable(),
          bskyHandle: z.string().trim().max(320).optional().nullable(),
          identitySources: z.array(z.string().trim().max(64)).max(32).optional(),
        }),
        category_id: z.string().trim().min(1).max(64),
        justification: z
          .object({
            summary: z.string().trim().max(2000).optional().nullable(),
            links: z.array(z.string().trim().max(2048)).max(12).optional(),
          })
          .optional(),
        response_format: ResponseFormatSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ anonymous, nominee, category_id, justification, response_format }) => {
      const responseFormat = response_format as ResponseFormat;
      const gate = await requireCrpMcpFeature("wtf_submit_crp_nomination", responseFormat);
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(auth, ["crp-nominations:write"], "wtf_submit_crp_nomination", responseFormat);
      if (scopeError) return scopeError;
      const rateError = enforceCrpMcpRateLimit(auth, "write", "wtf_submit_crp_nomination", responseFormat);
      if (rateError) return rateError;
      if (!isTezosAddress(nominee.tezosAddress)) {
        return toolError("invalid_tezos_address", responseFormat);
      }
      if (!CRP_CATEGORIES.some((category) => category.id === category_id)) {
        return toolError("invalid_category", responseFormat);
      }
      const identity = await resolveSpineIdentity(auth.user.id);
      try {
        const published = await publishCrpNomination({
          nominatorUserId: auth.user.id,
          nominatorDid: identity?.repoDid || identity?.canonicalDid || `wtfos:user:${auth.user.id}`,
          nominatorHandle: identity?.handle ?? null,
          nominee,
          categoryId: category_id,
          justification: justification ?? undefined,
          anonymous: anonymous === true,
        });
        emitCrpNominationEvent({
          eventType: published.anonymous ? "crp.nomination.submitted.anonymous" : "crp.nomination.submitted",
          userId: auth.user.id,
          rawRefType: published.anonymous ? "crp_nomination_anonymous" : "crp_nomination",
          rawRefId: published.nomination.nominationId,
          ...mcpActorMetadata(auth, "wtf_submit_crp_nomination"),
          metadata: published.anonymous
            ? { anonymous: true }
            : {
                categoryId: category_id,
                nominationUri: published.nominationUri,
                bskyPostUrl: published.bskyPostUrl,
              },
        });
        return toolResult(
          {
            ok: true,
            ...published,
            share: buildCrpShareIntents(published.nomination, published.bskyPostUrl),
            liabilityNotice: CRP_MCP_LIABILITY_NOTICE,
          },
          responseFormat,
          published.anonymous
            ? "Anonymous CRP nomination queued for the paired user."
            : `CRP nomination queued for ${published.nomination.nominee.displayName || published.nomination.nominee.tezosAddress}.`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === "crp_nominations_repo_not_configured") {
          return toolError("crp_repo_not_configured", responseFormat);
        }
        return toolError(message || "submit_failed", responseFormat);
      }
    }
  );
}

export const CRP_MCP_LIABILITY_NOTICE =
  "MCP agents act on behalf of the WTF user who issued the paired token. That user remains responsible for agent behavior and may be held liable for attempts to abuse CRP nominations, rate limits, or platform policy.";

export const CRP_MCP_TOOL_NAMES = [
  "wtf_list_crp_categories",
  "wtf_get_crp_nomination_status",
  "wtf_resolve_crp_nominee",
  "wtf_list_my_crp_nominations",
  "wtf_get_crp_nomination_credits",
  "wtf_submit_crp_nomination",
] as const;
