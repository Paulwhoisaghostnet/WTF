import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const acceptance = readFileSync("docs/constitutional-acceptance.md", "utf8");
const wtfOs = readFileSync("docs/domains/wtf-os.md", "utf8");

const acceptanceMatrixColumns = [
  "Domain",
  "Shell placement",
  "Event output",
  "Permissions",
  "User feedback and admin observability",
  "Cache/scheduler policy",
  "Wallet/value policy",
  "Backup/restore/provenance",
];

const acceptanceMatrixDomains = [
  { label: "WTF OS", path: "domains/wtf-os.md" },
  { label: "Identity And Social", path: "domains/identity-and-social.md" },
  { label: "Arcade, Console, And Game Studio", path: "domains/arcade-console-game-studio.md" },
  { label: "Commerce And Wallets", path: "domains/commerce-and-wallets.md" },
  { label: "Wallet Connect Boundary", path: "domains/wallet-connect-boundary.md" },
  { label: "Media, TV, And Studio", path: "domains/media-tv-studio.md" },
  { label: "Tezos Platform", path: "domains/tezos-platform.md" },
  { label: "Operations", path: "domains/operations.md" },
];

function parseMarkdownTableAfterHeading(source: string, heading: string): string[][] {
  const start = source.indexOf(heading);
  assert.notEqual(start, -1, `missing heading ${heading}`);
  const lines = source.slice(start).split("\n");
  const tableLines = lines.filter((line) => line.startsWith("|"));
  return tableLines.map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim())
  );
}

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
  assert.match(acceptance, /\| Urgent \| 2 \|/);
  assert.match(acceptance, /\| Walking Wounded \| 2 \|/);
  assert.match(acceptance, /\| Verified Healthy \| 0 \|/);
  assert.match(acceptance, /\| Archived Completed \| 135 \|/);
  assert.match(acceptance, /WTF-BB-070.*storage, balance, and big-map assertion evidence/s);
  assert.match(acceptance, /WTF-BB-068.*multi-contract evidence.*storage, balance, and big-map assertions passing/s);
  assert.match(acceptance, /WTF-BB-071.*local executable adapter proof/s);
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
  for (const { label: domain } of acceptanceMatrixDomains) {
    assert.match(acceptance, new RegExp(`\\[${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`));
  }

  assert.match(acceptance, /shell placement/i);
  assert.match(acceptance, /event output/i);
  assert.match(acceptance, /permissions/i);
  assert.match(acceptance, /cache\/scheduler policy/i);
  assert.match(acceptance, /wallet\/value policy/i);
  assert.match(acceptance, /backup\/restore\/provenance/i);
});

test("feature acceptance matrix is structured and linked to real domain guides", () => {
  assert.match(acceptance, /LAW\.FA1\/02/);
  assert.match(acceptance, /LAW\.FA2\/02/);
  const rows = parseMarkdownTableAfterHeading(acceptance, "## Feature Acceptance Matrix");
  assert(rows.length >= 3, "feature acceptance matrix must contain header, divider, and rows");
  assert.deepEqual(rows[0], acceptanceMatrixColumns);

  const dataRows = rows.slice(2, 2 + acceptanceMatrixDomains.length);
  assert.equal(dataRows.length, acceptanceMatrixDomains.length);

  for (const [index, row] of dataRows.entries()) {
    assert.equal(row.length, acceptanceMatrixColumns.length, `${row[0]} must cover every acceptance column`);
    const domain = acceptanceMatrixDomains[index];
    assert.match(row[0], new RegExp(`^\\[${domain.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\(${domain.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)$`));
    assert.equal(existsSync(`docs/${domain.path}`), true, `${domain.path} must exist`);
    for (const cell of row.slice(1)) {
      assert(cell.length > 12, `${domain.label} has an underspecified acceptance cell`);
    }
  }
});

test("domain guides keep the required doctrine skeleton", () => {
  for (const domain of acceptanceMatrixDomains) {
    const body = readFileSync(`docs/${domain.path}`, "utf8");
    assert.match(body, /^# /m, `${domain.label} needs a title`);
    assert.match(body, /^## Purpose/m, `${domain.label} needs purpose`);
    assert.match(body, /^## WTF OS Connection/m, `${domain.label} needs OS connection`);
    assert.match(body, /^## Main Code/m, `${domain.label} needs main code map`);
    assert.match(body, /^## Notes/m, `${domain.label} needs notes`);
  }
});

test("WTF OS domain doc links Phase 6 constitutional acceptance", () => {
  assert.match(wtfOs, /constitutional-acceptance\.md/);
});

test("constitutional acceptance records the admin mutation audit contract", () => {
  assert.match(acceptance, /admin mutation audit rule/i);
  assert.match(acceptance, /admin_mutation/);
  assert.match(acceptance, /POST.*PUT.*PATCH.*DELETE/);
});

test("constitutional acceptance records the admin observability doctrine gate", () => {
  assert.match(acceptance, /LAW\.AO1\/01/);
  assert.match(acceptance, /Admin OS surface registry/i);
  assert.match(acceptance, /constitutional domain guide/i);
  assert.match(acceptance, /getAdminSurfaceDoctrineDomain/);
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
  assert.match(acceptance, /disabled-by-default/i);
  assert.match(acceptance, /app\/package\/plugin acceptance manifests now name their doctrine domain/i);
});

test("constitutional acceptance records the fixed to verified audit contract", () => {
  assert.match(acceptance, /active `Fixed`\/`Verified` boundary/i);
  assert.match(acceptance, /without completed verification evidence/i);
  assert.match(acceptance, /aggregate posture only/i);
});

test("constitutional acceptance records the blocked tooling proof contract", () => {
  assert.match(acceptance, /blocked tooling rows/i);
  assert.match(acceptance, /exact missing artifact or host action/i);
  assert.match(acceptance, /Local executable proof/i);
  assert.match(acceptance, /mock providers/i);
  assert.match(acceptance, /stale reference repos/i);
});

test("constitutional acceptance records phase-level verification and live closeout", () => {
  assert.match(acceptance, /phase-level verification gates/i);
  assert.match(acceptance, /npm run build/i);
  assert.match(acceptance, /npm audit --omit=dev --audit-level=high/i);
  assert.match(acceptance, /GitHub Quality Gates/i);
  assert.match(acceptance, /commit `676a6b7`/);
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
  assert.match(acceptance, /npx playwright test tests\/playwright\/law-test-plan\.spec\.mjs/i);
  assert.match(acceptance, /TV shell and no-signal\/offline recovery message passed/i);
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
