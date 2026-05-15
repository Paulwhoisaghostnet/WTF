import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const acceptance = readFileSync("docs/constitutional-acceptance.md", "utf8");
const wtfOs = readFileSync("docs/domains/wtf-os.md", "utf8");

test("constitutional acceptance records Phase 6 board posture without private paths", () => {
  assert.match(acceptance, /P6\.CA1\/08/);
  assert.match(acceptance, /P6\.CA2\/08/);
  assert.match(acceptance, /P6\.CA3\/08/);
  assert.match(acceptance, /P6\.CA4\/08/);
  assert.match(acceptance, /P6\.CA5\/08/);
  assert.match(acceptance, /P6\.CA6\/08/);
  assert.match(acceptance, /P6\.CA7\/08/);
  assert.match(acceptance, /P6\.CA8\/08/);
  assert.match(acceptance, /\| Immediate \| 0 \|/);
  assert.match(acceptance, /\| Urgent \| 34 \|/);
  assert.match(acceptance, /\| Walking Wounded \| 23 \|/);
  assert.match(acceptance, /\| Verified Healthy \| 0 \|/);
  assert.match(acceptance, /\| Archived Completed \| 82 \|/);
  assert.doesNotMatch(acceptance, /\/Users\//);
  assert.doesNotMatch(acceptance, /BUG_BOUNTY_TRIAGE/);
});

test("constitutional acceptance maps active concern classes to doctrine rules", () => {
  for (const concern of [
    "Dependencies, secrets, auth, CSRF, CORS, public agents",
    "Wallets, Tezos, market, rewards, settlement, recapture",
    "Media, TV, Studio, Gallery, filesystem",
    "Kernel jobs, caches, backfills, repo doctor, deploy",
    "Desktop shell, app gates, admin surfaces, settings",
    "Kiln, jstz, Shadowbox, integrations, plugins",
  ]) {
    assert.match(acceptance, new RegExp(concern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("constitutional acceptance covers every current domain guide", () => {
  for (const domain of [
    "WTF OS",
    "Identity And Social",
    "Arcade, Console, And Game Studio",
    "Commerce And Wallets",
    "Wallet Connect Boundary",
    "Media, TV, And Studio",
    "Tezos Platform",
    "Operations",
  ]) {
    assert.match(acceptance, new RegExp(`\\[${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`));
  }

  assert.match(acceptance, /shell placement/i);
  assert.match(acceptance, /event output/i);
  assert.match(acceptance, /permissions/i);
  assert.match(acceptance, /cache\/scheduler policy/i);
  assert.match(acceptance, /wallet\/value policy/i);
  assert.match(acceptance, /backup\/restore\/provenance/i);
});

test("WTF OS domain doc links Phase 6 constitutional acceptance", () => {
  assert.match(wtfOs, /constitutional-acceptance\.md/);
});

test("constitutional acceptance records the admin mutation audit contract", () => {
  assert.match(acceptance, /admin mutation audit rule/i);
  assert.match(acceptance, /admin_mutation/);
  assert.match(acceptance, /POST.*PUT.*PATCH.*DELETE/);
});

test("constitutional acceptance records the reward and inventory traceability contract", () => {
  assert.match(acceptance, /reward and inventory traceability rule/i);
  assert.match(acceptance, /owner, source, source id, domain, state, visibility/i);
  assert.match(acceptance, /EXP deductions/);
});

test("constitutional acceptance records the app package acceptance contract", () => {
  assert.match(acceptance, /app\/package\/plugin acceptance rule/i);
  assert.match(acceptance, /provenance, permission summary, rollback method/i);
  assert.match(acceptance, /non-destructive uninstall\/disable/i);
  assert.match(acceptance, /Blocked integrations stay explicitly blocked/i);
});

test("constitutional acceptance records the fixed to verified audit contract", () => {
  assert.match(acceptance, /active `Fixed`\/`Verified` boundary/i);
  assert.match(acceptance, /without completed verification evidence/i);
  assert.match(acceptance, /aggregate posture only/i);
});

test("constitutional acceptance records the blocked tooling proof contract", () => {
  assert.match(acceptance, /blocked tooling rows/i);
  assert.match(acceptance, /exact missing artifact or host action/i);
  assert.match(acceptance, /mock providers/i);
  assert.match(acceptance, /stale reference repos/i);
});

test("constitutional acceptance records phase-level verification and live closeout", () => {
  assert.match(acceptance, /phase-level verification gates/i);
  assert.match(acceptance, /npm run build/i);
  assert.match(acceptance, /npm audit --omit=dev --audit-level=high/i);
  assert.match(acceptance, /GitHub Quality Gates/i);
  assert.match(acceptance, /commit `195d907`/);
  assert.match(acceptance, /tezosRpcUrl` `https:\/\/rpc\.tzkt\.io\/mainnet/);
  assert.match(acceptance, /zero recent job errors/i);
});

test("constitutional acceptance records the Law Test Plan chapter", () => {
  assert.match(acceptance, /The Law does not define a Phase 7/i);
  for (const id of [
    "LAW.TP1/07",
    "LAW.TP2/07",
    "LAW.TP3/07",
    "LAW.TP4/07",
    "LAW.TP5/07",
    "LAW.TP6/07",
    "LAW.TP7/07",
  ]) {
    assert.match(acceptance, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(acceptance, /Playwright smoke asserts the TV shell/i);
  assert.match(acceptance, /strict-admin visibility/i);
});

test("constitutional acceptance records the Law Targeted Test Plan chapter", () => {
  for (const id of [
    "LAW.TT1/10",
    "LAW.TT2/10",
    "LAW.TT3/10",
    "LAW.TT4/10",
    "LAW.TT5/10",
    "LAW.TT6/10",
    "LAW.TT7/10",
    "LAW.TT8/10",
    "LAW.TT9/10",
    "LAW.TT10/10",
  ]) {
    assert.match(acceptance, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(acceptance, /Migration fail-closed behavior/i);
  assert.match(acceptance, /Operator-wallet reconciliation/i);
  assert.match(acceptance, /unbound send preflights/i);
  assert.match(acceptance, /manual challenge reward source checks/i);
  assert.match(acceptance, /non-market inventory grants/i);
  assert.match(acceptance, /personal TV bumper media/i);
  assert.match(acceptance, /schedule overlap checks/i);
  assert.match(acceptance, /installer timer visibility/i);
  assert.match(acceptance, /shell backup retention/i);
  assert.match(acceptance, /Restore proof/i);
  assert.match(acceptance, /Stored cursor proof is normalized/i);
});

test("constitutional acceptance records the Law Abuse Test Plan chapter", () => {
  for (const id of [
    "LAW.AB1/05",
    "LAW.AB2/05",
    "LAW.AB3/05",
    "LAW.AB4/05",
    "LAW.AB5/05",
  ]) {
    assert.match(acceptance, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(acceptance, /Board webhook keyspace/i);
  assert.match(acceptance, /Client diagnostics/i);
  assert.match(acceptance, /TV telemetry/i);
  assert.match(acceptance, /Generic in-memory primitives/i);
  assert.match(acceptance, /Persistent hot-route caches/i);
});

test("constitutional acceptance records the Law Deploy Dry-Run Evidence chapter", () => {
  for (const id of [
    "LAW.DR1/04",
    "LAW.DR2/04",
    "LAW.DR3/04",
    "LAW.DR4/04",
  ]) {
    assert.match(acceptance, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(acceptance, /Migration failure behavior/i);
  assert.match(acceptance, /No interactive prompts/i);
  assert.match(acceptance, /Schema readiness before app start/i);
  assert.match(acceptance, /Health readiness fields/i);
});
