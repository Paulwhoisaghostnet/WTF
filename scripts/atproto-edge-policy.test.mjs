import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const caddy = readFileSync("infra/atproto-edge/Caddyfile", "utf8");

test("AT edge keeps public PDS routes while forwarding only private pages to the verified kernel", () => {
  const wildcard = caddy.slice(caddy.indexOf("\n*.wtfos.me {"), caddy.indexOf("\n# Indigo relay"));
  assert.match(wildcard, /handle \/_private\/\*\s*\{/);
  assert.match(wildcard, /reverse_proxy https:\/\/10\.0\.0\.2:443/);
  assert.match(wildcard, /header_up Host \{host\}/);
  assert.match(wildcard, /header_up X-Forwarded-Host \{host\}/);
  assert.match(wildcard, /tls_server_name wtfos\.app/);
  assert.match(wildcard, /import wtfos_pds_site 10\.0\.0\.3:3000/);
  assert.doesNotMatch(caddy, /tls_insecure_skip_verify/);
  assert.match(caddy, /ask http:\/\/127\.0\.0\.1:9119\/allow/);
  for (const [host, port] of [["pds", 3000], ["social", 3001], ["commerce", 3002], ["media", 3003], ["arcade", 3004], ["tezos", 3005], ["ops", 3006], ["os", 3007], ["users", 3008], ["private", 3009], ["plc", 3010]]) {
    assert.ok(caddy.includes(`${host}.wtfos.me {\n\timport wtfos_pds_site 10.0.0.3:${port}\n}`), `${host} preserves its PDS/PLC upstream`);
  }
  assert.match(caddy, /reverse_proxy @ws 127\.0\.0\.1:2470/);
});

test("AT edge TLS gate preserves PDS authority and fails closed for unknown or unverifiable kernel sites", () => {
  const result = spawnSync("python3", ["-B", "infra/atproto-edge/tls_gate_test.py"], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
});
