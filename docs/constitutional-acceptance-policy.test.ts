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
  assert.match(acceptance, /\| Immediate \| 0 \|/);
  assert.match(acceptance, /\| Urgent \| 34 \|/);
  assert.match(acceptance, /\| Walking Wounded \| 25 \|/);
  assert.match(acceptance, /\| Verified Healthy \| 0 \|/);
  assert.match(acceptance, /\| Archived Completed \| 80 \|/);
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
