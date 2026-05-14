import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const acceptance = readFileSync("docs/constitutional-acceptance.md", "utf8");
const wtfOs = readFileSync("docs/domains/wtf-os.md", "utf8");

test("constitutional acceptance records Phase 6 board posture without private paths", () => {
  assert.match(acceptance, /P6\.CA1\/08/);
  assert.match(acceptance, /\| Immediate \| 0 \|/);
  assert.match(acceptance, /\| Urgent \| 36 \|/);
  assert.match(acceptance, /\| Walking Wounded \| 25 \|/);
  assert.match(acceptance, /\| Verified Healthy \| 0 \|/);
  assert.match(acceptance, /\| Archived Completed \| 78 \|/);
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
