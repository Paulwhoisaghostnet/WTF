import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { Request, Response } from "express";
import {
  buildAdminMutationAuditInput,
  createAdminMutationAuditMiddleware,
  isAdminMutationAuditCandidate,
} from "./admin-mutation-audit";

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: "PUT",
    originalUrl: "/api/admin/users/7/role?debug=1",
    path: "/api/admin/users/7/role",
    ip: "127.0.0.1",
    headers: { "user-agent": "node-test" },
    params: { id: "7" },
    query: { debug: "1" },
    body: { role: "staff", password: "must-be-sanitized-downstream" },
    user: { id: 3, username: "admin", role: "admin" },
    route: { path: "/api/admin/users/:id/role" },
    ...overrides,
  } as unknown as Request;
}

function mockRes(statusCode = 200): Response & EventEmitter {
  const res = new EventEmitter() as Response & EventEmitter;
  res.statusCode = statusCode;
  return res;
}

test("admin mutation audit candidates are only admin writes", () => {
  assert.equal(isAdminMutationAuditCandidate(mockReq()), true);
  assert.equal(
    isAdminMutationAuditCandidate(mockReq({ method: "GET" })),
    false
  );
  assert.equal(
    isAdminMutationAuditCandidate(mockReq({ originalUrl: "/api/profile/account" })),
    false
  );
  assert.equal(
    isAdminMutationAuditCandidate(mockReq({ originalUrl: "/api/admin" })),
    true
  );
});

test("admin mutation audit input records actor, route, request, and Phase 6 rule", () => {
  const input = buildAdminMutationAuditInput(mockReq(), mockRes(204));

  assert.equal(input.source, "admin");
  assert.equal(input.eventType, "admin_mutation");
  assert.equal(input.userId, 3);
  assert.equal(input.method, "PUT");
  assert.equal(input.path, "/api/admin/users/7/role");
  assert.equal(input.statusCode, 204);
  assert.equal(input.message, "PUT /api/admin/users/7/role -> 204");
  assert.deepEqual(input.metadata, {
    phaseRule: "P6.CA2/08",
    routePath: "/api/admin/users/:id/role",
    params: { id: "7" },
    query: { debug: "1" },
    body: { role: "staff", password: "must-be-sanitized-downstream" },
    actor: {
      id: 3,
      username: "admin",
      role: "admin",
    },
  });
});

test("admin mutation middleware writes only successful mutation audits", () => {
  const writes: unknown[] = [];
  const middleware = createAdminMutationAuditMiddleware({
    logSystemEvent: (input) => writes.push(input),
  });

  const successRes = mockRes(200);
  middleware(mockReq(), successRes, () => undefined);
  successRes.emit("finish");

  const rejectedRes = mockRes(403);
  middleware(mockReq({ method: "POST" }), rejectedRes, () => undefined);
  rejectedRes.emit("finish");

  const readRes = mockRes(200);
  middleware(mockReq({ method: "GET" }), readRes, () => undefined);
  readRes.emit("finish");

  assert.equal(writes.length, 1);
  assert.equal((writes[0] as { eventType?: string }).eventType, "admin_mutation");
});
