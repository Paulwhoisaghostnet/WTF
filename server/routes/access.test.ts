import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";

import { mcpEndpointForOrigin, originForRequest } from "./access";

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(values)) {
    previous.set(key, process.env[key]);
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }

  try {
    fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function requestFor(host: string, protocol = "https"): Request {
  return {
    protocol,
    get(name: string) {
      return name.toLowerCase() === "host" ? host : undefined;
    },
  } as unknown as Request;
}

test("access manifest origin and MCP endpoint canonicalize legacy platform env", () => {
  withEnv(
    {
      PUBLIC_SITE_URL: "https://wtfgameshow.app",
      MCP_PUBLIC_ENDPOINT: "https://wtfgameshow.app/mcp",
      WTFOS_PUBLIC_BASE_URL: undefined,
      CANONICAL_PUBLIC_ORIGIN: undefined,
    },
    () => {
      const req = requestFor("wtfos.app");
      const origin = originForRequest(req);

      assert.equal(origin, "https://wtfos.app");
      assert.equal(mcpEndpointForOrigin(req, origin), "https://wtfos.app/mcp");
    }
  );
});

test("access manifest origin keeps non-WTF preview host fallback", () => {
  withEnv(
    {
      PUBLIC_SITE_URL: undefined,
      MCP_PUBLIC_ENDPOINT: undefined,
      WTFOS_PUBLIC_BASE_URL: undefined,
      CANONICAL_PUBLIC_ORIGIN: undefined,
      NODE_ENV: "development",
    },
    () => {
      const req = requestFor("preview.example.test", "https");
      const origin = originForRequest(req);

      assert.equal(origin, "https://preview.example.test");
      assert.equal(mcpEndpointForOrigin(req, origin), "https://preview.example.test/mcp");
    }
  );
});
