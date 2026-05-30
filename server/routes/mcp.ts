import { Router, type Request, type Response } from "express";
import { defaultPublicSiteHost } from "@shared/platform-branding";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../auth/passport";
import { createInMemoryRateLimit } from "../lib/in-memory-rate-limit";
import {
  authenticateMcpBearer,
  generateMcpToken,
  safeTokenHashFromBearer,
  type McpAgentAuthContext,
} from "../lib/mcp-agent-auth";
import { normalizeMcpScopes } from "../lib/mcp-scope-policy";
import { createWtfMcpServer } from "../lib/wtf-mcp";
import { ingestSystemEvent } from "../challenges/events/ingest";
import { logSystemEvent } from "../lib/system-log";
import { mcpAgentTokens } from "@shared/schema";

const router = Router();

const mcpAgentRateLimit = createInMemoryRateLimit({
  windowMs: 60 * 1000,
  max: Math.max(1, Number(process.env.MCP_AGENT_RATE_LIMIT_PER_MINUTE || 60)),
  message: { error: "Too many MCP agent requests, please try again later" },
  keyGenerator: (req) => {
    const bearerHash = safeTokenHashFromBearer(req.headers.authorization);
    return bearerHash === "anonymous" ? `ip:${req.ip || "unknown"}` : `token:${bearerHash}`;
  },
  maxEntries: 10_000,
});

function normalizeTokenName(value: unknown): string {
  if (typeof value !== "string") return "Paired Agent";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 100) : "Paired Agent";
}

function mcpEndpointForRequest(req: Request): string {
  const configured = String(process.env.MCP_PUBLIC_ENDPOINT || "").trim();
  if (configured) return configured;
  const proto = req.protocol || "https";
  const host = req.get("host") || defaultPublicSiteHost();
  return `${proto}://${host}/mcp`;
}

function accessOriginForRequest(req: Request): string {
  const configured = String(process.env.PUBLIC_SITE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const proto = req.protocol || "https";
  const host = req.get("host") || defaultPublicSiteHost();
  return `${proto}://${host}`;
}

function mcpRequestSummary(body: unknown): {
  method: string | null;
  toolName: string | null;
  batchSize: number;
} {
  const messages = Array.isArray(body) ? body : [body];
  const first = messages.find(
    (message) => message && typeof message === "object"
  ) as Record<string, unknown> | undefined;
  const method = typeof first?.method === "string" ? first.method : null;
  const params =
    first?.params && typeof first.params === "object" && !Array.isArray(first.params)
      ? (first.params as Record<string, unknown>)
      : {};
  const toolName = method === "tools/call" && typeof params.name === "string"
    ? params.name
    : null;
  return { method, toolName, batchSize: messages.length };
}

function mcpInventoryEventsForTool(toolName: string | null): string[] {
  if (!toolName) return [];
  const events = ["mcp.tool.called"];
  if (
    toolName.includes("public") ||
    toolName.includes("token") ||
    toolName.includes("tv_channels") ||
    toolName.includes("inventory")
  ) {
    events.push("mcp.public_data.read");
    if (toolName.includes("inventory")) {
      events.push("mcp.inventory.read");
    }
  }
  if (toolName.includes("arcade")) {
    events.push(toolName.includes("create_arcade_play_intent")
      ? "mcp.arcade.intent_created"
      : "mcp.arcade.read");
  }
  if (toolName.includes("console")) events.push("mcp.console.read");
  if (toolName.includes("game_studio")) {
    events.push(
      toolName.includes("create_") ||
        toolName.includes("update_") ||
        toolName.includes("build_") ||
        toolName.includes("submit_")
        ? "mcp.game_studio.project_mutated"
        : "mcp.game_studio.read"
    );
  }
  if (toolName.includes("trade_board") && toolName.includes("set_")) {
    events.push("mcp.trade_board.updated");
  }
  if (toolName.includes("desktop")) {
    events.push(toolName.includes("set_") ? "mcp.desktop.updated" : "mcp.desktop.read");
  }
  if (toolName.includes("pet")) {
    events.push(toolName.includes("keep_") ? "mcp.pet.action_applied" : "mcp.pet.read");
  }
  if (toolName.includes("trusted_creator_market_item")) {
    events.push("mcp.market.creator_item_created");
  }
  return [...new Set(events)];
}

export function suppressMcpSetCookieHeader(res: Response) {
  const originalSetHeader = res.setHeader.bind(res);
  res.setHeader = ((name: string, value: number | string | readonly string[]) => {
    if (String(name).toLowerCase() === "set-cookie") {
      return res;
    }
    return originalSetHeader(name, value);
  }) as typeof res.setHeader;
}

function emitMcpInventoryEvents(input: {
  auth: McpAgentAuthContext;
  eventTypes: string[];
  toolName: string | null;
  method: string | null;
  statusCode?: number;
}) {
  for (const eventType of input.eventTypes) {
    void ingestSystemEvent({
      eventType,
      userId: input.auth.user.id,
      source: "mcp",
      sourceModule: "wtf-mcp",
      rawRefType: input.toolName ? "mcp_tool" : "mcp_method",
      rawRefId: input.toolName || input.method || "unknown",
      metadata: {
        toolName: input.toolName,
        method: input.method,
        tokenPrefix: input.auth.tokenPrefix,
        statusCode: input.statusCode ?? null,
      },
    }).catch((err) => {
      console.warn("[mcp] failed to emit inventory event:", err);
    });
  }
}

router.get("/api/mcp/tokens", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const rows = await db
      .select({
        id: mcpAgentTokens.id,
        name: mcpAgentTokens.name,
        tokenPrefix: mcpAgentTokens.tokenPrefix,
        scopes: mcpAgentTokens.scopes,
        lastUsedAt: mcpAgentTokens.lastUsedAt,
        revokedAt: mcpAgentTokens.revokedAt,
        createdAt: mcpAgentTokens.createdAt,
      })
      .from(mcpAgentTokens)
      .where(eq(mcpAgentTokens.userId, user.id))
      .orderBy(desc(mcpAgentTokens.createdAt));

    res.json({
      endpoint: mcpEndpointForRequest(req),
      tokens: rows,
    });
  } catch (err) {
    console.error("[mcp] failed to list tokens:", err);
    res.status(500).json({ error: "Failed to list MCP pairing tokens" });
  }
});

router.post("/api/mcp/tokens", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mcpAgentTokens)
      .where(and(eq(mcpAgentTokens.userId, user.id), isNull(mcpAgentTokens.revokedAt)));

    const maxActive = Math.max(1, Number(process.env.MCP_MAX_ACTIVE_TOKENS_PER_USER || 20));
    if (count >= maxActive) {
      return res.status(429).json({
        error: `You already have ${count} active MCP token(s). Revoke one before creating another.`,
      });
    }

    const generated = generateMcpToken();
    const [row] = await db
      .insert(mcpAgentTokens)
      .values({
        userId: user.id,
        name: normalizeTokenName(req.body?.name),
        tokenHash: generated.tokenHash,
        tokenPrefix: generated.tokenPrefix,
        scopes: normalizeMcpScopes(req.body?.scopes, user.role),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({
        id: mcpAgentTokens.id,
        name: mcpAgentTokens.name,
        tokenPrefix: mcpAgentTokens.tokenPrefix,
        scopes: mcpAgentTokens.scopes,
        lastUsedAt: mcpAgentTokens.lastUsedAt,
        revokedAt: mcpAgentTokens.revokedAt,
        createdAt: mcpAgentTokens.createdAt,
      });

    res.status(201).json({
      endpoint: mcpEndpointForRequest(req),
      token: generated.token,
      tokenRecord: row,
      warning: "Copy this token now. WTF stores only a hash and cannot show it again.",
    });
  } catch (err) {
    console.error("[mcp] failed to create token:", err);
    res.status(500).json({ error: "Failed to create MCP pairing token" });
  }
});

router.delete("/api/mcp/tokens/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const tokenId = Number(req.params.id);
    if (!Number.isInteger(tokenId) || tokenId <= 0) {
      return res.status(400).json({ error: "Invalid MCP token id" });
    }

    const [row] = await db
      .update(mcpAgentTokens)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(mcpAgentTokens.id, tokenId), eq(mcpAgentTokens.userId, user.id)))
      .returning({
        id: mcpAgentTokens.id,
        name: mcpAgentTokens.name,
        tokenPrefix: mcpAgentTokens.tokenPrefix,
        revokedAt: mcpAgentTokens.revokedAt,
      });

    if (!row) return res.status(404).json({ error: "MCP token not found" });
    res.json({ ok: true, token: row });
  } catch (err) {
    console.error("[mcp] failed to revoke token:", err);
    res.status(500).json({ error: "Failed to revoke MCP pairing token" });
  }
});

async function closeMcpServerOnce(server: ReturnType<typeof createWtfMcpServer>) {
  try {
    await server.close();
  } catch {
    // The transport may already be closed by the time Express emits finish.
  }
}

router.all("/mcp", mcpAgentRateLimit, async (req: Request, res: Response) => {
  suppressMcpSetCookieHeader(res);

  if (!["GET", "POST", "DELETE"].includes(req.method.toUpperCase())) {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed for MCP endpoint" });
  }

  try {
    const requestSummary = mcpRequestSummary(req.body);
    const auth = await authenticateMcpBearer(req.headers.authorization);
    if (!auth) {
      logSystemEvent({
        source: "mcp",
        eventType: "mcp.authz.denied",
        severity: "warn",
        message: "Missing or invalid MCP bearer token",
        method: req.method,
        path: req.originalUrl,
        statusCode: 401,
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || ""),
        metadata: requestSummary,
      });
      return res.status(401).json({
        error:
          "Missing or invalid MCP bearer token. Browser session cookies are not accepted on /mcp; generate a paired token in WTF settings first.",
      });
    }

    const browserSessionUser = req.user as { id?: number } | undefined;
    if (
      browserSessionUser?.id &&
      Number(browserSessionUser.id) !== Number(auth.user.id)
    ) {
      logSystemEvent({
        source: "mcp",
        eventType: "mcp.browser_session_ignored",
        severity: "info",
        message:
          "Ignoring browser session identity on MCP request; paired bearer token remains authoritative.",
        userId: auth.user.id,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || ""),
        metadata: {
          browserSessionUserId: browserSessionUser.id,
          pairedUserId: auth.user.id,
          tokenPrefix: auth.tokenPrefix,
          ...requestSummary,
        },
      });
    }

    const accessOrigin = accessOriginForRequest(req);
    const mcpServer = createWtfMcpServer(auth, {
      accessOrigin,
      mcpEndpoint: mcpEndpointForRequest(req),
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    let closed = false;
    const startedAt = Date.now();
    const toolEvents = mcpInventoryEventsForTool(requestSummary.toolName);
    if (requestSummary.method === "initialize") {
      emitMcpInventoryEvents({
        auth,
        eventTypes: ["mcp.connected"],
        toolName: null,
        method: requestSummary.method,
      });
    } else if (toolEvents.length > 0) {
      emitMcpInventoryEvents({
        auth,
        eventTypes: toolEvents,
        toolName: requestSummary.toolName,
        method: requestSummary.method,
      });
    }
    logSystemEvent({
      source: "mcp",
      eventType: requestSummary.toolName ? "mcp.tool.called" : "mcp.request",
      severity: "info",
      message: requestSummary.toolName
        ? `MCP tool called: ${requestSummary.toolName}`
        : `MCP request: ${requestSummary.method || "unknown"}`,
      userId: auth.user.id,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      userAgent: String(req.headers["user-agent"] || ""),
      metadata: {
        ...requestSummary,
        tokenPrefix: auth.tokenPrefix,
      },
    });
    const close = () => {
      if (closed) return;
      closed = true;
      const statusCode = res.statusCode;
      if (requestSummary.toolName) {
        const eventType = statusCode >= 400 ? "mcp.tool.failed" : "mcp.tool.succeeded";
        emitMcpInventoryEvents({
          auth,
          eventTypes: [eventType],
          toolName: requestSummary.toolName,
          method: requestSummary.method,
          statusCode,
        });
        logSystemEvent({
          source: "mcp",
          eventType,
          severity: statusCode >= 400 ? "warn" : "info",
          message: `${requestSummary.toolName} ${statusCode >= 400 ? "failed" : "succeeded"}`,
          userId: auth.user.id,
          method: req.method,
          path: req.originalUrl,
          statusCode,
          durationMs: Date.now() - startedAt,
          ip: req.ip,
          userAgent: String(req.headers["user-agent"] || ""),
          metadata: {
            ...requestSummary,
            tokenPrefix: auth.tokenPrefix,
          },
        });
      }
      void closeMcpServerOnce(mcpServer);
    };
    res.once("finish", close);
    res.once("close", close);

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[mcp] request failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP request failed" });
    }
  }
});

export default router;
