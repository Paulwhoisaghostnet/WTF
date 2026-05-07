import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyConsoleDependencyUrl,
  collectConsoleDependencyDecisions,
  normalizeConsoleDependencyUrl,
  rewriteConsoleDependencyUrls,
} from "./dependency-proxy";

test("rewrites Google Fonts URLs with semicolon weight ranges intact", () => {
  const source =
    "@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700;900&family=Share+Tech+Mono&display=swap');";
  const out = rewriteConsoleDependencyUrls(source);
  assert.match(out, /\/api\/console\/dependency\?url=/);
  assert.match(out, /400%3B500%3B700%3B900%26family%3DShare%2BTech%2BMono/);
  assert.doesNotMatch(out, /&family=Share/);
});

test("rejects private network dependency targets", () => {
  assert.equal(normalizeConsoleDependencyUrl("http://localhost:3000/api/health"), null);
  assert.equal(normalizeConsoleDependencyUrl("http://127.0.0.1:3000/api/health"), null);
  assert.equal(normalizeConsoleDependencyUrl("http://192.168.0.20/asset.js"), null);
});

test("classifies known-safe and unknown external hosts for import audits", () => {
  assert.equal(
    classifyConsoleDependencyUrl("https://fonts.googleapis.com/css2?family=Orbitron").status,
    "cacheable"
  );
  const blocked = classifyConsoleDependencyUrl("https://example.com/game-runtime.js");
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.reason, "host_not_allowlisted");
});

test("collects cacheable and blocked dependencies from cartridge source", () => {
  const deps = collectConsoleDependencyDecisions(`
    <script src="https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js"></script>
    <script src="https://example.com/nope.js"></script>
  `);
  assert.equal(deps.some((dep) => dep.status === "cacheable"), true);
  assert.equal(
    deps.some((dep) => dep.status === "blocked" && dep.reason === "host_not_allowlisted"),
    true
  );
});
