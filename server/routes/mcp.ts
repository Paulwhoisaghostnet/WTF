import { Router, type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../auth/passport";
import { createInMemoryRateLimit } from "../lib/in-memory-rate-limit";
import {
  authenticateMcpBearer,
  generateMcpToken,
  safeTokenHashFromBearer,
} from "../lib/mcp-agent-auth";
import { createWtfMcpServer } from "../lib/wtf-mcp";
import { mcpAgentTokens } from "@shared/schema";

const router = Router();

const DEFAULT_MCP_SCOPES = [
  "desktop:read",
  "desktop:write",
  "pet:read",
  "pet:write",
  "public-data:read",
  "trade-board:write",
];

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

function normalizeScopes(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_MCP_SCOPES];
  const scopes = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .slice(0, 50);
  return scopes.length > 0 ? scopes : [...DEFAULT_MCP_SCOPES];
}

function mcpEndpointForRequest(req: Request): string {
  const configured = String(process.env.MCP_PUBLIC_ENDPOINT || "").trim();
  if (configured) return configured;
  const proto = req.protocol || "https";
  const host = req.get("host") || "wtfgameshow.app";
  return `${proto}://${host}/mcp`;
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
        scopes: normalizeScopes(req.body?.scopes),
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
  if (!["GET", "POST", "DELETE"].includes(req.method.toUpperCase())) {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed for MCP endpoint" });
  }

  try {
    const auth = await authenticateMcpBearer(req.headers.authorization);
    if (!auth) {
      return res.status(401).json({
        error: "Missing or invalid MCP bearer token. Generate one in WTF settings first.",
      });
    }

    const mcpServer = createWtfMcpServer(auth);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
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
