import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const phase5 = readFileSync("docs/phase-closeouts/phase-5-kernel-grafts.md", "utf8");
const wtfOs = readFileSync("docs/domains/wtf-os.md", "utf8");

test("Phase 5 closeout records all canonical substeps and gates", () => {
  for (const step of [
    "P5.UP1/12",
    "P5.TZ2/12",
    "P5.CA3/12",
    "P5.IP4/12",
    "P5.MK5/12",
    "P5.TD6/12",
    "P5.HL7/12",
    "P5.JV8/12",
    "P5.WC9/12",
    "P5.E2E10/12",
    "P5.RB11/12",
    "P5.CL12/12",
  ]) {
    assert.match(phase5, new RegExp(step.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(phase5, /22 tests passed/);
  assert.match(phase5, /233 passed/);
  assert.match(phase5, /https:\/\/api\.tzkt\.io\/v1/);
  assert.match(phase5, /https:\/\/rpc\.tzkt\.io\/mainnet/);
});

test("WTF OS domain doc points to the Phase 5 closeout", () => {
  assert.match(wtfOs, /phase-5-kernel-grafts\.md/);
});
