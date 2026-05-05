import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { mcpAgentTokens, users } from "@shared/schema";
import type { UserRole } from "@shared/types";

const TOKEN_PREFIX = "wtf_mcp";
const TOKEN_BYTES = 32;

export interface GeneratedMcpToken {
  token: string;
  tokenHash: string;
  tokenPrefix: string;
}

export interface McpAgentAuthContext {
  tokenId: number;
  tokenName: string;
  tokenPrefix: string;
  scopes: string[];
  user: {
    id: number;
    username: string;
    displayName: string | null;
    role: UserRole;
  };
}

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateMcpToken(): GeneratedMcpToken {
  const token = `${TOKEN_PREFIX}_${randomBytes(TOKEN_BYTES).toString("base64url")}`;
  return {
    token,
    tokenHash: hashMcpToken(token),
    tokenPrefix: token.slice(0, 18),
  };
}

export function extractBearerToken(header: unknown): string | null {
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token || token.length > 256) return null;
  return token;
}

export function safeTokenHashFromBearer(header: unknown): string {
  const token = extractBearerToken(header);
  return token ? hashMcpToken(token) : "anonymous";
}

function timingSafeHexEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) {
    return false;
  }
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeScopes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .slice(0, 50);
}

export async function authenticateMcpBearer(
  authorizationHeader: unknown
): Promise<McpAgentAuthContext | null> {
  const token = extractBearerToken(authorizationHeader);
  if (!token) return null;

  const tokenHash = hashMcpToken(token);
  const [row] = await db
    .select({
      tokenId: mcpAgentTokens.id,
      tokenHash: mcpAgentTokens.tokenHash,
      tokenName: mcpAgentTokens.name,
      tokenPrefix: mcpAgentTokens.tokenPrefix,
      scopes: mcpAgentTokens.scopes,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
    })
    .from(mcpAgentTokens)
    .innerJoin(users, eq(users.id, mcpAgentTokens.userId))
    .where(and(eq(mcpAgentTokens.tokenHash, tokenHash), isNull(mcpAgentTokens.revokedAt)))
    .limit(1);

  if (!row || !timingSafeHexEqual(row.tokenHash, tokenHash)) {
    return null;
  }

  await db
    .update(mcpAgentTokens)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(mcpAgentTokens.id, row.tokenId));

  return {
    tokenId: row.tokenId,
    tokenName: row.tokenName,
    tokenPrefix: row.tokenPrefix,
    scopes: normalizeScopes(row.scopes),
    user: {
      id: row.userId,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
    },
  };
}
