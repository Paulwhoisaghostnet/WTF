import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://wtf:wtf@localhost:5432/wtf_test";

test("generateMcpToken creates a bearer-safe token and stores only a hashable prefix", async () => {
  const { generateMcpToken, hashMcpToken, extractBearerToken, safeTokenHashFromBearer } =
    await import("./mcp-agent-auth");

  const generated = generateMcpToken();
  assert.match(generated.token, /^wtf_mcp_[A-Za-z0-9_-]+$/);
  assert.equal(generated.tokenHash, hashMcpToken(generated.token));
  assert.equal(generated.tokenPrefix, generated.token.slice(0, 18));
  assert.equal(extractBearerToken(`Bearer ${generated.token}`), generated.token);
  assert.equal(safeTokenHashFromBearer(`Bearer ${generated.token}`), generated.tokenHash);
});

test("extractBearerToken rejects malformed and oversized bearer headers", async () => {
  const { extractBearerToken, safeTokenHashFromBearer } = await import("./mcp-agent-auth");

  assert.equal(extractBearerToken("Basic abc"), null);
  assert.equal(extractBearerToken(`Bearer ${"x".repeat(300)}`), null);
  assert.equal(safeTokenHashFromBearer("Basic abc"), "anonymous");
});
