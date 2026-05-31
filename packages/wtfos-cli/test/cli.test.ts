import assert from "node:assert/strict";
import test from "node:test";
import { summarizeWtfOsHealth } from "../../../shared/wtfos-cli/commands.ts";

test("summarizeWtfOsHealth formats kernel snapshot", () => {
  const summary = summarizeWtfOsHealth({
    ok: true,
    version: { commitRef: "abc123" },
    db: { ok: true },
    chain: { ok: true, network: "ghostnet", tezosRpcUrl: "https://rpc.example" },
    jobs: { registered: 3, running: 1, recentErrors: 0, jobs: [] },
  });
  assert.match(summary, /ok=true/);
  assert.match(summary, /commit=abc123/);
  assert.match(summary, /ghostnet/);
});
