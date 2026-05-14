import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runbookIndex = readFileSync("docs/runbooks/README.md", "utf8");
const deployRunbook = readFileSync("docs/runbooks/production-deployment.md", "utf8");
const tzktRunbook = readFileSync("docs/runbooks/tzkt-upstream.md", "utf8");
const operationsDomain = readFileSync("docs/domains/operations.md", "utf8");
const tezosDomain = readFileSync("docs/domains/tezos-platform.md", "utf8");

test("deployment and upstream runbooks are linked from domain docs", () => {
  assert.match(runbookIndex, /Production Deployment/);
  assert.match(runbookIndex, /TzKT Upstream/);
  assert.match(runbookIndex, /Wallet Connect Boundary/);
  assert.match(operationsDomain, /production-deployment\.md/);
  assert.match(tezosDomain, /tzkt-upstream\.md/);
});

test("production deployment runbook names deploy and live verification gates", () => {
  assert.match(deployRunbook, /git push origin HEAD:main/);
  assert.match(deployRunbook, /gh run watch <quality-run-id> --exit-status/);
  assert.match(deployRunbook, /curl -fsS https:\/\/wtfgameshow\.app\/api\/health/);
  assert.match(deployRunbook, /chain\.tezosRpcUrl`: `https:\/\/rpc\.tzkt\.io\/mainnet/);
  assert.match(deployRunbook, /git reset --hard/);
});

test("TzKT runbook forbids ECAD drift and requires shared upstream helpers", () => {
  assert.match(tzktRunbook, /https:\/\/api\.tzkt\.io\/v1/);
  assert.match(tzktRunbook, /https:\/\/rpc\.tzkt\.io\/mainnet/);
  assert.match(tzktRunbook, /ECAD RPC endpoints must not be reintroduced/);
  assert.match(tzktRunbook, /server\/lib\/upstream\.ts/);
  assert.match(tzktRunbook, /must use shared upstream helpers/);
});
