import { isAdmin, type UserRole } from "@shared/types";

export const DEFAULT_MCP_SCOPES = [
  "desktop:read",
  "desktop:write",
  "pet:read",
  "pet:write",
  "public-data:read",
  "arcade:read",
  "arcade:write",
  "console:read",
  "console:write",
  "game-studio:read",
  "game-studio:write",
  "map-lab:write",
  "crp-nominations:read",
  "crp-nominations:write",
  "market:write",
  "trade-board:write",
] as const;

export const ADMIN_MCP_SCOPES = [
  "arcade:admin",
  "console:admin",
] as const;

const USER_ALLOWED_SCOPES = new Set<string>(DEFAULT_MCP_SCOPES);
const ADMIN_ALLOWED_SCOPES = new Set<string>([
  ...DEFAULT_MCP_SCOPES,
  ...ADMIN_MCP_SCOPES,
  "*",
  "arcade:*",
  "console:*",
  "desktop:*",
  "pet:*",
  "game-studio:*",
  "map-lab:*",
  "crp-nominations:*",
  "market:*",
  "trade-board:*",
  "public-data:*",
]);

function rawScopes(value: unknown): { scopes: string[]; explicit: boolean } {
  if (!Array.isArray(value)) {
    return { scopes: [...DEFAULT_MCP_SCOPES], explicit: false };
  }
  return {
    scopes: value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean)
      .slice(0, 50),
    explicit: true,
  };
}

export function normalizeMcpScopes(value: unknown, userRole: UserRole | string | null): string[] {
  const { scopes, explicit } = rawScopes(value);
  const allowed = isAdmin(String(userRole || "witness") as UserRole)
    ? ADMIN_ALLOWED_SCOPES
    : USER_ALLOWED_SCOPES;
  const filtered = scopes.filter((scope, index) => allowed.has(scope) && scopes.indexOf(scope) === index);

  if (filtered.length > 0) return filtered;
  return explicit ? [] : [...DEFAULT_MCP_SCOPES];
}
