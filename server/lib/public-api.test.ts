import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { WTFOS_PUBLIC_API_ROUTES } from "@shared/wtfos-public-api-routes.generated";
import {
  authenticatePublicApi,
  buildWtfOsOpenApiDocument,
  createPublicApiAuthenticator,
  apiOperationAllowedForAgent,
  listWtfOsApiOperations,
  openApiPath,
  publicApiRateLimitKey,
  renderWtfOsApiDocs,
  resolveWtfOsApiOperationCall,
  rewritePublicApiVersion,
} from "./public-api";
import { DEFAULT_DESKTOP_APP_CONFIG } from "@shared/desktop-apps";

process.env.DATABASE_URL ||= "postgresql://wtf:wtf@127.0.0.1:1/wtf";

async function listen(app: express.Express): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test("OpenAPI 3.1 contract has stable versioned paths, security, and unique operation ids", () => {
  const document = buildWtfOsOpenApiDocument("https://wtfos.app") as any;
  assert.equal(document.openapi, "3.1.0");
  assert.equal(document.jsonSchemaDialect, "https://json-schema.org/draft/2020-12/schema");
  assert.deepEqual(document.servers, [{ url: "https://wtfos.app", description: "Canonical wtfOS origin" }]);
  assert.ok(document.paths["/api/v1/health"]?.get);
  assert.ok(document.paths["/api/v1/me"]?.get);
  assert.ok(document.paths["/api/v1/tokens"]?.post);
  assert.ok(document.paths["/api/v1/docs"]?.get);
  assert.equal(document.paths["/api/v1/openapi.json"].get.security.length, 0);
  assert.equal(document.paths["/api/v1/health"].get.security[0].bearerAuth.length, 0);
  assert.deepEqual(document.paths["/api/v1/admin-inbox/messages"].get["x-wtfos-required-scopes"], ["api:read", "api:admin"]);
  assert.equal(document.paths["/api/v1/admin-inbox/messages"].get["x-wtfos-required-role"], "admin");
  assert.equal(document.components.securitySchemes.bearerAuth.scheme, "bearer");
  assert.equal(document.components.schemas.Error.required[0], "error");

  const operationIds: string[] = [];
  for (const [pathname, pathItem] of Object.entries(document.paths) as Array<[string, any]>) {
    assert.ok(pathname.startsWith("/api/v1"), `unversioned OpenAPI path: ${pathname}`);
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const operation = pathItem[method];
      if (!operation) continue;
      assert.ok(operation.operationId, `${method.toUpperCase()} ${pathname} needs an operationId`);
      operationIds.push(operation.operationId);
      const success = operation.responses?.["200"] || operation.responses?.["201"];
      assert.ok(success);
      assert.ok(success.content, `${method.toUpperCase()} ${pathname} should describe successful response content`);
      if (operation.security?.length) {
        assert.ok(operation["x-wtfos-required-scopes"]?.length, `${method.toUpperCase()} ${pathname} needs explicit scopes`);
        assert.ok(operation["x-wtfos-required-role"], `${method.toUpperCase()} ${pathname} needs an explicit role`);
      }
    }
  }
  assert.equal(new Set(operationIds).size, operationIds.length, "operation ids must be unique");
  for (const route of WTFOS_PUBLIC_API_ROUTES) {
    if (!route.path.startsWith("/api/") || route.path.startsWith("/^\\/api") || route.path.startsWith("/api/public")) continue;
    const pathname = openApiPath(route.path);
    assert.ok(pathname, `missing canonical public path for ${route.path}`);
    const methods = route.method === "ALL"
      ? ["get", "post", "put", "patch", "delete"]
      : [route.method.toLowerCase()];
    for (const method of methods) {
      assert.ok(document.paths[pathname]?.[method], `missing ${method.toUpperCase()} ${pathname}`);
    }
  }
});

test("agent API catalog filters by token scopes and account role and safely resolves path parameters", () => {
  const operations = listWtfOsApiOperations("https://wtfos.app");
  const health = operations.find((operation) => operation.path === "/api/v1/health" && operation.method === "GET");
  const admin = operations.find((operation) => operation.path.startsWith("/api/v1/admin/") && operation.method === "GET");
  const parameterized = operations.find((operation) => operation.path.includes("{id}"));
  assert.ok(health);
  assert.ok(admin);
  assert.ok(parameterized);

  const reader = {
    scopes: ["api:read"],
    user: { id: 1, username: "reader", displayName: "Reader", role: "user" },
  } as any;
  const administrator = {
    scopes: ["api:read", "api:admin"],
    user: { id: 2, username: "admin", displayName: "Admin", role: "admin" },
  } as any;
  assert.equal(apiOperationAllowedForAgent(health!, reader), true);
  assert.equal(apiOperationAllowedForAgent(admin!, reader), false);
  assert.equal(apiOperationAllowedForAgent(admin!, administrator), true);

  const parameterName = String(parameterized!.path.match(/\{([^}]+)\}/)?.[1]);
  const resolved = resolveWtfOsApiOperationCall(parameterized!, { [parameterName]: "a/b c" });
  assert.equal(resolved.path.includes("a%2Fb%20c"), true);
  assert.throws(() => resolveWtfOsApiOperationCall(parameterized!), /Missing path parameter/);
});

test("canonical public aliases remove ambiguous OpenAPI paths without disabling legacy versioned aliases", () => {
  const document = buildWtfOsOpenApiDocument("https://wtfos.app") as any;
  assert.ok(document.paths["/api/v1/message-threads/{id}"]?.get || document.paths["/api/v1/message-threads/{id}"]?.patch);
  assert.ok(document.paths["/api/v1/tv/dials/{dial}"]?.get);
  assert.equal(document.paths["/api/v1/messages/threads/{id}"], undefined);
  assert.equal(document.paths["/api/v1/tv/channels/by-dial/{dial}"], undefined);
});

test("human API docs provide familiar discovery, auth, curl, and grouped endpoints", () => {
  const html = renderWtfOsApiDocs("https://wtfos.app");
  assert.match(html, /wtfOS Platform API/);
  assert.match(html, /OpenAPI 3\.1 JSON/);
  assert.match(html, /Authorization: Bearer/);
  assert.match(html, /curl -H/);
  assert.match(html, /\/api\/v1\/me/);
  assert.match(html, /<details>/);
});

test("public API rate-limit keys hash bearer tokens and leave anonymous traffic to the IP key", () => {
  const request = { headers: {}, url: "/api/v1", originalUrl: "/api/v1" } as any;
  rewritePublicApiVersion(request, {} as any, () => {});
  assert.equal(publicApiRateLimitKey(request), null);
  request.headers.authorization = "Bearer wtf_mcp_secret-value";
  const key = publicApiRateLimitKey(request);
  assert.match(key || "", /^public-api:[a-f0-9]{64}$/);
  assert.equal(key?.includes("secret-value"), false);
});

test("versioned discovery works, requires no token, and legacy routing stays unchanged", async (t) => {
  const { registerRoutes } = await import("../routes");
  const app = express();
  app.use(rewritePublicApiVersion);
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => Boolean(req.user);
    next();
  });
  app.use(authenticatePublicApi);
  registerRoutes(app);
  const server = await listen(app);
  t.after(server.close);

  const discovery = await fetch(`${server.baseUrl}/api/v1`);
  assert.equal(discovery.status, 200);
  assert.equal(discovery.headers.get("x-wtfos-api-version"), "v1");
  assert.equal((await discovery.json()).version, "v1");

  const openapi = await fetch(`${server.baseUrl}/api/v1/openapi.json`);
  assert.equal(openapi.status, 200);
  assert.equal((await openapi.json()).openapi, "3.1.0");

  const docs = await fetch(`${server.baseUrl}/api/v1/docs`);
  assert.equal(docs.status, 200);
  assert.match(docs.headers.get("content-type") || "", /text\/html/);

  const protectedVersioned = await fetch(`${server.baseUrl}/api/v1/health`);
  assert.equal(protectedVersioned.status, 401);
  assert.match(protectedVersioned.headers.get("www-authenticate") || "", /Bearer/);

  const legacy = await fetch(`${server.baseUrl}/api/health`);
  assert.equal(legacy.status, 200);
  assert.equal((await legacy.json()).status, "alive");

  const internalDiscoveryAlias = await fetch(`${server.baseUrl}/api/public`);
  assert.equal(internalDiscoveryAlias.status, 404);
});

test("bearer scopes dispatch through legacy handlers while app gates and admin gates fail closed", async (t) => {
  const authByToken: Record<string, any> = {
    read: {
      tokenId: 1, tokenName: "read", tokenPrefix: "read", scopes: ["api:read"],
      user: { id: 7, username: "reader", displayName: "Reader", role: "user" },
    },
    write: {
      tokenId: 2, tokenName: "write", tokenPrefix: "write", scopes: ["api:write"],
      user: { id: 8, username: "writer", displayName: "Writer", role: "user" },
    },
    admin: {
      tokenId: 3, tokenName: "admin", tokenPrefix: "admin", scopes: ["api:read", "api:write", "api:admin"],
      user: { id: 9, username: "admin", displayName: "Admin", role: "admin" },
    },
    adminRead: {
      tokenId: 4, tokenName: "admin-read", tokenPrefix: "admin-read", scopes: ["api:read"],
      user: { id: 9, username: "admin", displayName: "Admin", role: "admin" },
    },
  };
  const authenticator = createPublicApiAuthenticator({
    authenticateBearer: (async (header: unknown) => {
      const token = String(header || "").replace(/^Bearer\s+/i, "");
      return authByToken[token] || null;
    }) as any,
    findUserById: (async (id: number) => ({ id, username: `user-${id}`, role: id === 9 ? "admin" : "user" })) as any,
    loadApps: async () => ({ ...DEFAULT_DESKTOP_APP_CONFIG, arcade: false }),
  });

  const app = express();
  app.use(rewritePublicApiVersion);
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => Boolean(req.user);
    next();
  });
  app.use(authenticator);
  app.get("/api/test-resource", (req, res) => res.json({ userId: (req.user as any)?.id || null }));
  app.post("/api/test-resource", (req, res) => res.json({ userId: (req.user as any)?.id || null, body: req.body }));
  app.get("/api/admin/test-resource", (_req, res) => res.json({ admin: true }));
  app.get("/api/admin-inbox/messages", (_req, res) => res.json({ adminInbox: true }));
  app.get("/api/messages/threads/:id", (req, res) => res.json({ threadId: req.params.id }));
  app.get("/api/tv/channels/by-dial/:dial", (req, res) => res.json({ dial: req.params.dial }));
  app.get("/api/arcade/games", (_req, res) => res.json({ shouldNotReach: true }));
  app.get("/api/arcade/unlisted-test-route", (_req, res) => res.json({ shouldNotReach: true }));
  app.get("/api/crp-nominations/status", (_req, res) => res.json({
    configured: true,
    did: "did:plc:internal",
    handle: "internal.example",
    pdsUrl: "https://private-pds.example",
    bskyCollection: "app.bsky.feed.post",
    nominationCollection: "wtfos.crp.nomination",
  }));
  const server = await listen(app);
  t.after(server.close);

  const read = await fetch(`${server.baseUrl}/api/v1/test-resource`, { headers: { Authorization: "Bearer read" } });
  assert.equal(read.status, 200);
  assert.equal((await read.json()).userId, 7);

  const writeDenied = await fetch(`${server.baseUrl}/api/v1/test-resource`, {
    method: "POST", headers: { Authorization: "Bearer read", "Content-Type": "application/json" }, body: JSON.stringify({ value: 1 }),
  });
  assert.equal(writeDenied.status, 403);

  const write = await fetch(`${server.baseUrl}/api/v1/test-resource`, {
    method: "POST", headers: { Authorization: "Bearer write", "Content-Type": "application/json" }, body: JSON.stringify({ value: 2 }),
  });
  assert.equal(write.status, 200);
  assert.deepEqual((await write.json()).body, { value: 2 });

  const nonAdmin = await fetch(`${server.baseUrl}/api/v1/admin/test-resource`, { headers: { Authorization: "Bearer read" } });
  assert.equal(nonAdmin.status, 403);
  const admin = await fetch(`${server.baseUrl}/api/v1/admin/test-resource`, { headers: { Authorization: "Bearer admin" } });
  assert.equal(admin.status, 200);
  const adminScopeDeniedOutsideAdminPrefix = await fetch(`${server.baseUrl}/api/v1/admin-inbox/messages`, { headers: { Authorization: "Bearer adminRead" } });
  assert.equal(adminScopeDeniedOutsideAdminPrefix.status, 403);
  const adminOutsideAdminPrefix = await fetch(`${server.baseUrl}/api/v1/admin-inbox/messages`, { headers: { Authorization: "Bearer admin" } });
  assert.equal(adminOutsideAdminPrefix.status, 200);

  const canonicalThread = await fetch(`${server.baseUrl}/api/v1/message-threads/abc`, { headers: { Authorization: "Bearer read" } });
  assert.deepEqual(await canonicalThread.json(), { threadId: "abc" });
  const canonicalDial = await fetch(`${server.baseUrl}/api/v1/tv/dials/7`, { headers: { Authorization: "Bearer read" } });
  assert.deepEqual(await canonicalDial.json(), { dial: "7" });

  const disabledApp = await fetch(`${server.baseUrl}/api/v1/arcade/games`, { headers: { Authorization: "Bearer read" } });
  assert.equal(disabledApp.status, 404);
  const disabledAppDomain = await fetch(`${server.baseUrl}/api/v1/arcade/unlisted-test-route`, { headers: { Authorization: "Bearer read" } });
  assert.equal(disabledAppDomain.status, 404);

  const redactedStatus = await fetch(`${server.baseUrl}/api/v1/crp-nominations/status`, { headers: { Authorization: "Bearer read" } });
  assert.equal(redactedStatus.status, 200);
  assert.deepEqual(await redactedStatus.json(), {
    configured: true,
    bskyCollection: "app.bsky.feed.post",
    nominationCollection: "wtfos.crp.nomination",
  });

  const legacy = await fetch(`${server.baseUrl}/api/test-resource`);
  assert.equal(legacy.status, 200);
  assert.equal((await legacy.json()).userId, null);
  const legacyStatus = await fetch(`${server.baseUrl}/api/crp-nominations/status`);
  assert.equal((await legacyStatus.json()).pdsUrl, "https://private-pds.example");
});
