import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

test("WTFIAP packaged files match their release manifest and load in the ESM host", () => {
  execFileSync(process.execPath, ["scripts/vendor-wtfiap.mjs"], { stdio: "pipe" });
  const require = createRequire(import.meta.url);
  const engine = require("../server/features/wtfiap/runtime/source/engine.js");
  const server = require("../server/features/wtfiap/runtime/game/server/party-server.cjs");
  assert(engine.ROSTER.length > 0);
  assert.equal(typeof server.createServer, "function");
});
