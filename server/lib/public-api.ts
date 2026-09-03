import type { NextFunction, Request, Response } from "express";
import { isAdmin } from "@shared/types";
import { WTFOS_PUBLIC_API_ROUTES } from "@shared/wtfos-public-api-routes.generated";
import { getUserById } from "../auth/storage";
import {
  authenticateMcpBearer,
  safeTokenHashFromBearer,
  type McpAgentAuthContext,
} from "./mcp-agent-auth";
import { getDesktopAppConfig } from "./desktop-apps";
import { WTF_STANDARD_API_ROUTES } from "./wtf-access";

export const WTFOS_PUBLIC_API_VERSION = "v1" as const;
export const WTFOS_PUBLIC_API_PREFIX = `/api/${WTFOS_PUBLIC_API_VERSION}` as const;

const PUBLIC_DISCOVERY_TARGETS = new Set([
  "/api/public",
  "/api/public/capabilities",
  "/api/public/docs",
  "/api/public/openapi.json",
]);

export interface WtfOsPublicApiContext {
  version: typeof WTFOS_PUBLIC_API_VERSION;
  versionedPath: string;
  targetPath: string;
  auth: McpAgentAuthContext | null;
}

type PublicApiRequest = Request & {
  wtfosPublicApi?: WtfOsPublicApiContext;
};

function requestPath(req: Request): string {
  const raw = String(req.originalUrl || req.url || req.path || "");
  return raw.split("?", 1)[0] || "/";
}

function targetForVersionedPath(versionedPath: string): string {
  const suffix = versionedPath.slice(WTFOS_PUBLIC_API_PREFIX.length);
  if (!suffix || suffix === "/") return "/api/public";
  if (suffix === "/openapi.json") return "/api/public/openapi.json";
  if (suffix === "/capabilities") return "/api/public/capabilities";
  if (suffix === "/docs") return "/api/public/docs";
  if (suffix === "/me") return "/api/auth/user";
  if (suffix === "/tokens") return "/api/mcp/tokens";
  if (suffix.startsWith("/tokens/")) return `/api/mcp/tokens/${suffix.slice("/tokens/".length)}`;
  if (suffix.startsWith("/message-threads/")) return `/api/messages/threads/${suffix.slice("/message-threads/".length)}`;
  if (suffix.startsWith("/tv/dials/")) return `/api/tv/channels/by-dial/${suffix.slice("/tv/dials/".length)}`;
  return `/api${suffix}`;
}

export function rewritePublicApiVersion(req: Request, _res: Response, next: NextFunction): void {
  const rawUrl = String(req.url || "");
  const [pathname, query = ""] = rawUrl.split("?", 2);
  if (pathname !== WTFOS_PUBLIC_API_PREFIX && !pathname.startsWith(`${WTFOS_PUBLIC_API_PREFIX}/`)) {
    next();
    return;
  }

  const targetPath = targetForVersionedPath(pathname);
  (req as PublicApiRequest).wtfosPublicApi = {
    version: WTFOS_PUBLIC_API_VERSION,
    versionedPath: pathname,
    targetPath,
    auth: null,
  };
  req.url = `${targetPath}${query ? `?${query}` : ""}`;
  next();
}

export function publicApiContext(req: Request): WtfOsPublicApiContext | null {
  return (req as PublicApiRequest).wtfosPublicApi ?? null;
}

export function isPublicApiRequest(req: Request): boolean {
  return publicApiContext(req) !== null;
}

export function isPublicApiDiscoveryRequest(req: Request): boolean {
  const context = publicApiContext(req);
  return Boolean(context && PUBLIC_DISCOVERY_TARGETS.has(context.targetPath));
}

export function publicApiRateLimitKey(req: Request): string | null {
  if (!isPublicApiRequest(req)) return null;
  const tokenHash = safeTokenHashFromBearer(req.headers.authorization);
  return tokenHash === "anonymous" ? null : `public-api:${tokenHash}`;
}

function scopeAllows(scopes: readonly string[], required: string): boolean {
  if (scopes.includes("*")) return true;
  if (scopes.includes(required)) return true;
  const separator = required.indexOf(":");
  return separator > 0 && scopes.includes(`${required.slice(0, separator)}:*`);
}

export function publicApiRequiredScopes(method: string, pathname: string, declaredAccess = ""): string[] {
  const normalizedMethod = method.toUpperCase();
  const scopes = [normalizedMethod === "GET" || normalizedMethod === "HEAD" || normalizedMethod === "OPTIONS"
    ? "api:read"
    : "api:write"];
  if (pathname.startsWith(`${WTFOS_PUBLIC_API_PREFIX}/admin/`) || declaredAccess === "Admin") {
    scopes.push("api:admin");
  }
  return scopes;
}

function routePatternMatches(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, index) => part.startsWith(":") || part === pathParts[index]);
}

function registeredPublicApiRoute(method: string, targetPath: string) {
  return WTFOS_PUBLIC_API_ROUTES.find(
    (candidate) =>
      (candidate.method === method || candidate.method === "ALL") &&
      routePatternMatches(candidate.path, targetPath),
  );
}

async function publicApiAppGateAllows(
  method: string,
  targetPath: string,
  loadApps: typeof getDesktopAppConfig,
): Promise<boolean> {
  const exactRoute = WTF_STANDARD_API_ROUTES.find(
    (candidate) =>
      candidate.method === method && routePatternMatches(candidate.path, targetPath),
  );
  const targetDomain = targetPath.split("/").filter(Boolean)[1];
  const route = exactRoute ?? (
    targetDomain && targetDomain !== "admin"
      ? WTF_STANDARD_API_ROUTES.find((candidate) => {
          if (!candidate.appGate) return false;
          const candidateDomain = candidate.path.split("/").filter(Boolean)[1];
          return candidateDomain === targetDomain;
        })
      : undefined
  );
  if (!route?.appGate) return true;
  const apps = await loadApps();
  return apps[route.appGate] !== false;
}

function suppressSetCookie(res: Response): void {
  const originalSetHeader = res.setHeader.bind(res);
  res.setHeader = ((name: string, value: number | string | readonly string[]) => {
    if (String(name).toLowerCase() === "set-cookie") return res;
    return originalSetHeader(name, value);
  }) as typeof res.setHeader;
}

function projectPublicApiResponse(targetPath: string, res: Response): void {
  if (targetPath !== "/api/crp-nominations/status") return;
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (!body || typeof body !== "object" || Array.isArray(body)) return originalJson(body);
    const status = body as Record<string, unknown>;
    return originalJson({
      configured: Boolean(status.configured),
      bskyCollection: status.bskyCollection ?? null,
      nominationCollection: status.nominationCollection ?? null,
    });
  }) as typeof res.json;
}

export function createPublicApiAuthenticator(dependencies: {
  authenticateBearer?: typeof authenticateMcpBearer;
  findUserById?: typeof getUserById;
  loadApps?: typeof getDesktopAppConfig;
} = {}) {
  const authenticateBearer = dependencies.authenticateBearer || authenticateMcpBearer;
  const findUserById = dependencies.findUserById || getUserById;
  const loadApps = dependencies.loadApps || getDesktopAppConfig;

  return async function publicApiAuthenticator(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const context = publicApiContext(req);
    if (!context) {
      next();
      return;
    }

    res.setHeader("X-WTFOS-API-Version", WTFOS_PUBLIC_API_VERSION);
    suppressSetCookie(res);
    if (PUBLIC_DISCOVERY_TARGETS.has(context.targetPath)) {
      next();
      return;
    }

    const auth = await authenticateBearer(req.headers.authorization);
    if (!auth) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="wtfOS API", error="invalid_token"');
      res.status(401).json({
        error: "Missing or invalid wtfOS access token",
        documentation: `${WTFOS_PUBLIC_API_PREFIX}/openapi.json`,
      });
      return;
    }

    const method = String(req.method || "GET").toUpperCase();
    const requiredScope = method === "GET" || method === "HEAD" || method === "OPTIONS"
      ? "api:read"
      : "api:write";
    if (!scopeAllows(auth.scopes, requiredScope)) {
      res.status(403).json({ error: `Token requires ${requiredScope} scope` });
      return;
    }
    const registeredRoute = registeredPublicApiRoute(method, context.targetPath);
    if (context.targetPath.startsWith("/api/admin/") || registeredRoute?.declaredAccess === "Admin") {
      if (!isAdmin(auth.user.role) || !scopeAllows(auth.scopes, "api:admin")) {
        res.status(403).json({ error: "Admin API access requires an admin account and api:admin scope" });
        return;
      }
    }
    if (!(await publicApiAppGateAllows(method, context.targetPath, loadApps))) {
      res.status(404).json({ error: "API capability is disabled" });
      return;
    }

    const fullUser = await findUserById(auth.user.id);
    if (!fullUser) {
      res.status(401).json({ error: "Paired token owner no longer exists" });
      return;
    }
    context.auth = auth;
    req.user = fullUser as Express.User;
    projectPublicApiResponse(context.targetPath, res);
    next();
  };
}

export const authenticatePublicApi = createPublicApiAuthenticator();

export function openApiPath(pathname: string): string | null {
  if (!pathname.startsWith("/api/")) return null;
  if (pathname.startsWith("/^")) return null;
  if (pathname === "/api/messages/threads/:id") return `${WTFOS_PUBLIC_API_PREFIX}/message-threads/{id}`;
  if (pathname === "/api/tv/channels/by-dial/:dial") return `${WTFOS_PUBLIC_API_PREFIX}/tv/dials/{dial}`;
  return pathname.replace(/^\/api/, WTFOS_PUBLIC_API_PREFIX).replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function operationId(method: string, pathname: string): string {
  return `wtfos_${method.toLowerCase()}_${pathname}`
    .replace(/[{}:]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function tagForPath(pathname: string): string {
  return pathname.split("/").filter(Boolean)[2] || "platform";
}

function discoveryOperation(operationId: string, summary: string, contentType = "application/json") {
  return {
    operationId,
    summary,
    tags: ["platform"],
    security: [],
    responses: {
      "200": {
        description: "Successful response",
        headers: { "X-WTFOS-API-Version": { $ref: "#/components/headers/ApiVersion" } },
        content: { [contentType]: { schema: contentType === "application/json" ? { $ref: "#/components/schemas/JsonValue" } : { type: "string" } } },
      },
      "429": { $ref: "#/components/responses/RateLimited" },
    },
  };
}

function genericSuccessResponse(description: string) {
  return {
    description,
    headers: { "X-WTFOS-API-Version": { $ref: "#/components/headers/ApiVersion" } },
    content: {
      "application/json": { schema: { $ref: "#/components/schemas/JsonValue" } },
      "text/plain": { schema: { type: "string" } },
      "application/octet-stream": { schema: { type: "string", format: "binary" } },
    },
  };
}

export function buildWtfOsOpenApiDocument(origin: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  const regexpRoutes: Array<{ method: string; expression: string; purpose: string }> = [];
  for (const route of WTFOS_PUBLIC_API_ROUTES) {
    if (route.path.startsWith("/api/public")) continue;
    const pathname = openApiPath(route.path);
    if (!pathname) {
      if (route.path.includes("/api")) {
        regexpRoutes.push({ method: route.method, expression: route.path, purpose: route.purpose });
      }
      continue;
    }
    const methods = route.method === "ALL"
      ? ["get", "post", "put", "patch", "delete"]
      : [route.method.toLowerCase()];
    const pathParameters = [...pathname.matchAll(/\{([^}]+)\}/g)].map((match) => ({
      name: match[1],
      in: "path",
      required: true,
      schema: { type: "string" },
    }));
    paths[pathname] ||= {};
    for (const method of methods) {
      if (paths[pathname]![method]) continue;
      const requiredScopes = publicApiRequiredScopes(method, pathname, route.declaredAccess);
      const requiredRole = route.declaredAccess === "Admin" || pathname.startsWith(`${WTFOS_PUBLIC_API_PREFIX}/admin/`)
        ? "admin"
        : String(route.declaredAccess) === "App key"
          ? "application-credential"
          : route.declaredAccess === "Permission"
            ? "token-owner-permission"
            : "token-owner";
      paths[pathname]![method] = {
        operationId: operationId(method, pathname),
        summary: route.purpose,
        description: `${route.purpose} This versioned operation delegates to the established wtfOS handler, so its resource ownership, account-role, validation, and enabled-app checks remain authoritative.`,
        tags: [tagForPath(pathname)],
        security: [{ bearerAuth: [] }],
        parameters: pathParameters.map((parameter) => ({
          ...parameter,
          description: `Route identifier for ${parameter.name}.`,
        })),
        ...(method === "post" || method === "put" || method === "patch"
          ? {
              requestBody: {
                required: false,
                description: "JSON payload accepted by the underlying wtfOS domain handler. Consult handler validation errors for domain-specific fields.",
                content: { "application/json": { schema: { $ref: "#/components/schemas/JsonObject" } } },
              },
            }
          : {}),
        responses: {
          "200": genericSuccessResponse("Successful response from the underlying wtfOS domain handler"),
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
        "x-wtfos-required-scopes": requiredScopes,
        "x-wtfos-required-role": requiredRole,
        "x-wtfos-declared-access": route.declaredAccess,
        "x-wtfos-source": route.sources,
      };
    }
  }

  paths[WTFOS_PUBLIC_API_PREFIX] = {
    get: discoveryOperation("wtfos_discover_api", "Discover the wtfOS Platform API"),
  };
  paths[`${WTFOS_PUBLIC_API_PREFIX}/capabilities`] = {
    get: discoveryOperation("wtfos_get_api_capabilities", "Read API capabilities, authentication, and operation counts"),
  };
  paths[`${WTFOS_PUBLIC_API_PREFIX}/openapi.json`] = {
    get: discoveryOperation("wtfos_get_openapi_contract", "Download the OpenAPI 3.1 contract"),
  };
  paths[`${WTFOS_PUBLIC_API_PREFIX}/docs`] = {
    get: discoveryOperation("wtfos_browse_api_docs", "Browse the human-friendly API reference", "text/html"),
  };
  paths[`${WTFOS_PUBLIC_API_PREFIX}/me`] = {
    get: {
      operationId: "wtfos_get_current_user",
      summary: "Read the user who owns the bearer token",
      tags: ["identity"],
      security: [{ bearerAuth: [] }],
      responses: {
        "200": genericSuccessResponse("Current user"),
        "401": { $ref: "#/components/responses/Unauthorized" },
      },
      "x-wtfos-required-scopes": ["api:read"],
      "x-wtfos-required-role": "token-owner",
    },
  };
  paths[`${WTFOS_PUBLIC_API_PREFIX}/tokens`] = {
    get: {
      operationId: "wtfos_list_access_tokens",
      summary: "List access-token records owned by the current user",
      tags: ["identity"],
      security: [{ bearerAuth: [] }],
      responses: { "200": genericSuccessResponse("Access-token records"), "401": { $ref: "#/components/responses/Unauthorized" } },
      "x-wtfos-required-scopes": ["api:read"],
      "x-wtfos-required-role": "token-owner",
    },
    post: {
      operationId: "wtfos_create_access_token",
      summary: "Create a new scoped access token",
      tags: ["identity"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                scopes: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      responses: { "201": genericSuccessResponse("One-time-visible access token"), "401": { $ref: "#/components/responses/Unauthorized" } },
      "x-wtfos-required-scopes": ["api:write"],
      "x-wtfos-required-role": "token-owner",
    },
  };
  paths[`${WTFOS_PUBLIC_API_PREFIX}/tokens/{id}`] = {
    delete: {
      operationId: "wtfos_revoke_access_token",
      summary: "Revoke one access token owned by the current user",
      tags: ["identity"],
      security: [{ bearerAuth: [] }],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      responses: { "200": genericSuccessResponse("Revoked token record"), "401": { $ref: "#/components/responses/Unauthorized" }, "404": { $ref: "#/components/responses/NotFound" } },
      "x-wtfos-required-scopes": ["api:write"],
      "x-wtfos-required-role": "token-owner",
    },
  };

  const tags = [...new Set(Object.keys(paths).map(tagForPath))]
    .sort()
    .map((name) => ({ name, description: `wtfOS ${name.replace(/-/g, " ")} operations.` }));

  const errorResponse = (description: string) => ({
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  });

  return {
    openapi: "3.1.0",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: {
      title: "wtfOS Platform API",
      version: "1.0.0",
      description: "Bearer-authenticated, versioned access to wtfOS. Every operation delegates to the same domain handler used by the application, preserving resource ownership, role checks, app gates, and validation while leaving existing /api/* routes unchanged.",
    },
    externalDocs: { url: `${origin}${WTFOS_PUBLIC_API_PREFIX}/docs`, description: "Human-readable API reference" },
    servers: [{ url: origin, description: "Canonical wtfOS origin" }],
    tags,
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "wtf_mcp_* paired access token",
          description: "Create and revoke access tokens in wtfOS Settings. Tokens are stored only as hashes.",
        },
      },
      schemas: {
        JsonValue: {
          oneOf: [
            { $ref: "#/components/schemas/JsonObject" },
            { type: "array", items: { $ref: "#/components/schemas/JsonValue" } },
            { type: "string" },
            { type: "number" },
            { type: "boolean" },
            { type: "null" },
          ],
        },
        JsonObject: {
          type: "object",
          additionalProperties: { $ref: "#/components/schemas/JsonValue" },
        },
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: { type: "string" },
            code: { type: "string" },
            details: { type: ["object", "array", "string", "null"] },
            requestId: { type: "string" },
          },
          additionalProperties: true,
        },
      },
      headers: {
        ApiVersion: {
          description: "Version of the public wtfOS API facade that handled the request.",
          schema: { type: "string", const: WTFOS_PUBLIC_API_VERSION },
        },
      },
      responses: {
        BadRequest: errorResponse("Invalid request"),
        Unauthorized: errorResponse("Missing or invalid bearer token"),
        Forbidden: errorResponse("Token scope, role, ownership, or capability gate denied"),
        NotFound: errorResponse("Resource or disabled capability not found"),
        RateLimited: {
          ...errorResponse("Rate limit exceeded"),
          headers: {
            "Retry-After": { schema: { type: "integer" }, description: "Seconds until retry is allowed." },
          },
        },
      },
    },
    "x-wtfos-regexp-routes": regexpRoutes,
    "x-wtfos-websockets": ["/ws", "/ws/wtf-live", "/ws/dedrooms", "/ws/apphost"],
  };
}

export interface WtfOsApiOperationDescriptor {
  operationId: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  description: string;
  tags: string[];
  public: boolean;
  requiredScopes: string[];
  requiredRole: string;
  declaredAccess: string;
  parameters: unknown[];
  requestBody?: unknown;
  responses: unknown;
}

export function listWtfOsApiOperations(origin: string): WtfOsApiOperationDescriptor[] {
  const document = buildWtfOsOpenApiDocument(origin) as any;
  const operations: WtfOsApiOperationDescriptor[] = [];
  for (const [pathname, pathItem] of Object.entries(document.paths) as Array<[string, any]>) {
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      const operation = pathItem[method];
      if (!operation) continue;
      operations.push({
        operationId: operation.operationId,
        method: method.toUpperCase() as WtfOsApiOperationDescriptor["method"],
        path: pathname,
        summary: operation.summary || `${method.toUpperCase()} ${pathname}`,
        description: operation.description || operation.summary || "",
        tags: operation.tags || [],
        public: Array.isArray(operation.security) && operation.security.length === 0,
        requiredScopes: operation["x-wtfos-required-scopes"] || [],
        requiredRole: operation["x-wtfos-required-role"] || "public",
        declaredAccess: operation["x-wtfos-declared-access"] || (operation.security?.length === 0 ? "public" : "token"),
        parameters: operation.parameters || [],
        requestBody: operation.requestBody,
        responses: operation.responses,
      });
    }
  }
  return operations.sort((a, b) => a.operationId.localeCompare(b.operationId));
}

export function apiOperationAllowedForAgent(
  operation: WtfOsApiOperationDescriptor,
  auth: Pick<McpAgentAuthContext, "scopes" | "user">,
): boolean {
  if (operation.public) return true;
  if (operation.requiredRole === "admin" && !isAdmin(auth.user.role)) return false;
  if (operation.requiredRole === "application-credential") return false;
  return operation.requiredScopes.every((scope) => scopeAllows(auth.scopes, scope));
}

export function resolveWtfOsApiOperationCall(
  operation: WtfOsApiOperationDescriptor,
  pathParameters: Record<string, string | number | boolean> = {},
): { method: WtfOsApiOperationDescriptor["method"]; path: string } {
  const required = [...operation.path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  const missing = required.filter((name) => pathParameters[name] === undefined);
  if (missing.length) throw new Error(`Missing path parameter${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`);
  const path = operation.path.replace(/\{([^}]+)\}/g, (_match, name: string) =>
    encodeURIComponent(String(pathParameters[name])),
  );
  return { method: operation.method, path };
}

export function publicApiSummary(origin: string) {
  const methods = WTFOS_PUBLIC_API_ROUTES.reduce<Record<string, number>>((counts, route) => {
    counts[route.method] = (counts[route.method] || 0) + 1;
    return counts;
  }, {});
  return {
    ok: true,
    service: "wtfos-platform-api",
    version: WTFOS_PUBLIC_API_VERSION,
    baseUrl: `${origin}${WTFOS_PUBLIC_API_PREFIX}`,
    openapi: `${origin}${WTFOS_PUBLIC_API_PREFIX}/openapi.json`,
    documentation: `${origin}${WTFOS_PUBLIC_API_PREFIX}/docs`,
    authentication: "Authorization: Bearer wtf_mcp_...",
    tokenManagement: `${WTFOS_PUBLIC_API_PREFIX}/tokens`,
    scopes: ["api:read", "api:write", "api:admin"],
    operations: WTFOS_PUBLIC_API_ROUTES.length,
    methods,
    compatibility: "Existing /api/* browser and internal routes remain unchanged.",
  };
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderWtfOsApiDocs(origin: string): string {
  const specification = buildWtfOsOpenApiDocument(origin) as {
    paths: Record<string, Record<string, {
      operationId?: string;
      summary?: string;
      tags?: string[];
      security?: unknown[];
      "x-wtfos-required-scopes"?: string[];
      "x-wtfos-required-role"?: string;
    }>>;
  };
  const groups = new Map<string, Array<{
    operationId: string;
    method: string;
    path: string;
    summary: string;
    public: boolean;
    scopes: string[];
    role: string;
  }>>();
  for (const [pathname, operations] of Object.entries(specification.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
      const tag = operation.tags?.[0] || "platform";
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag)!.push({
        operationId: operation.operationId || `${method}-${pathname}`,
        method: method.toUpperCase(),
        path: pathname,
        summary: operation.summary || `${method.toUpperCase()} ${pathname}`,
        public: Array.isArray(operation.security) && operation.security.length === 0,
        scopes: operation["x-wtfos-required-scopes"] || [],
        role: operation["x-wtfos-required-role"] || "public",
      });
    }
  }
  const sections = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([tag, operations]) => `
    <details>
      <summary><strong>${escapeHtml(tag)}</strong> <span>${operations.length} operations</span></summary>
      <div class="operations">${operations.map((operation) => `
        <article class="operation" id="${escapeHtml(operation.operationId)}">
          <code class="method ${operation.method.toLowerCase()}">${operation.method}</code>
          <code class="path">${escapeHtml(operation.path)}</code>
          ${operation.public ? '<span class="public">public discovery</span>' : ""}
          <p>${escapeHtml(operation.summary)}</p>
          <p class="contract"><a href="#${escapeHtml(operation.operationId)}">${escapeHtml(operation.operationId)}</a> · ${operation.scopes.length ? `scopes: <code>${escapeHtml(operation.scopes.join(", "))}</code>` : "no token required"} · role: <code>${escapeHtml(operation.role)}</code></p>
        </article>`).join("")}
      </div>
    </details>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>wtfOS Platform API</title>
<style>body{margin:0;background:#0d1117;color:#e6edf3;font:15px/1.5 ui-sans-serif,system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:40px 20px 80px}a{color:#58a6ff}code{font-family:ui-monospace,SFMono-Regular,monospace}.hero,.quick,details{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:20px;margin:0 0 16px}.hero h1{margin:0 0 8px;font-size:32px}.hero p{max-width:780px;color:#b1bac4}.quick pre{overflow:auto;background:#0d1117;padding:14px;border-radius:6px}summary{cursor:pointer;display:flex;justify-content:space-between;gap:20px}.operations{margin-top:16px}.operation{display:grid;grid-template-columns:72px minmax(260px,1fr) auto;gap:10px;align-items:center;border-top:1px solid #30363d;padding:12px 0;scroll-margin-top:20px}.operation p{grid-column:2/-1;margin:0;color:#b1bac4}.operation .contract{font-size:12px;color:#8b949e}.method{font-weight:700}.get{color:#3fb950}.post{color:#58a6ff}.put,.patch{color:#d29922}.delete{color:#f85149}.public{font-size:12px;color:#a5d6ff;border:1px solid #388bfd;border-radius:12px;padding:1px 8px}@media(max-width:700px){.operation{grid-template-columns:60px 1fr}.public{display:none}}</style>
</head><body><main>
<section class="hero"><h1>wtfOS Platform API</h1><p>Versioned access to wtfOS through the same domain handlers used by the application, with bearer-token scopes layered on top. Existing <code>/api/*</code> browser routes remain unchanged.</p><p><a href="${WTFOS_PUBLIC_API_PREFIX}/openapi.json">Download OpenAPI 3.1 JSON</a> · <a href="${WTFOS_PUBLIC_API_PREFIX}/capabilities">Capabilities</a></p></section>
<section class="quick"><h2>Quick start</h2><p>Create a paired access token in wtfOS Settings, then send it as a bearer token:</p><pre>curl -H 'Authorization: Bearer wtf_mcp_…' \\
  '${escapeHtml(origin)}${WTFOS_PUBLIC_API_PREFIX}/me'</pre><p>Reads require <code>api:read</code>; mutations require <code>api:write</code>; admin operations also require an admin account and <code>api:admin</code>.</p></section>
<h2>Endpoints</h2>${sections}
</main></body></html>`;
}

export function originalPublicApiPath(req: Request): string {
  return publicApiContext(req)?.versionedPath || requestPath(req);
}
