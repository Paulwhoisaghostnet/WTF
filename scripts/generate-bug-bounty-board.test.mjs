import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseGeneratedBountyBoard,
  renderBountyBoard,
  validateBountyRecords,
} from "./generate-bug-bounty-board.mjs";

const records = [
  {
    id: "WTF-BB-001",
    status: "Open",
    owner: "-",
    lastTouched: "2026-08-30",
    category: "Quality / fixture",
    priority: "P1",
    points: 9,
    rank: 1,
    complexity: 2,
    functionalityDanger: 3,
    securityDanger: 0,
    title: "Open fixture",
    body: "- Evidence:\n  - Reproduction exists.",
  },
  {
    id: "WTF-BB-002",
    status: "Verified",
    owner: "Codex fixture",
    lastTouched: "2026-08-30",
    category: "Quality / fixture",
    priority: "P2",
    points: 6,
    rank: 2,
    complexity: 1,
    functionalityDanger: 2,
    securityDanger: 0,
    title: "Verified fixture",
    body: "- Verification:\n  - The focused proof passes.",
  },
];

test("canonical bounty records reject duplicate IDs and unsupported statuses", () => {
  assert.throws(
    () => validateBountyRecords([...records, { ...records[1], title: "collision" }]),
    /duplicate bounty ID WTF-BB-002/u,
  );
  assert.throws(
    () => validateBountyRecords([{ ...records[0], status: "Mostly fixed" }]),
    /unsupported status Mostly fixed/u,
  );
  assert.throws(
    () => validateBountyRecords([{ ...records[0], rank: 2 }, records[1]]),
    /rank 2 does not match derived rank 1/u,
  );
});

test("generated summary and details have one-to-one field parity", () => {
  const markdown = renderBountyBoard(records);
  const parsed = parseGeneratedBountyBoard(markdown);
  assert.deepEqual(parsed.summary.map(({ id, status }) => ({ id, status })), [
    { id: "WTF-BB-001", status: "Open" },
    { id: "WTF-BB-002", status: "Verified" },
  ]);
  assert.equal(parsed.details.length, 2);

  assert.throws(
    () => parseGeneratedBountyBoard(markdown.replace("- Status: Open", "- Status: Fixed")),
    /status disagreement for WTF-BB-001/u,
  );
  assert.throws(
    () => parseGeneratedBountyBoard(markdown.replace(/### WTF-BB-002[\s\S]*$/u, "")),
    /missing detail record for WTF-BB-002/u,
  );
  assert.throws(
    () => parseGeneratedBountyBoard(markdown.replace("| WTF-BB-002 |", "| WTF-BB-001 |")),
    /duplicate summary record WTF-BB-001/u,
  );
  assert.throws(
    () => parseGeneratedBountyBoard(markdown.replace("### WTF-BB-002", "### WTF-BB-001")),
    /duplicate detail record WTF-BB-001/u,
  );

  const disagreements = [
    [(value) => value.replace("- Owner/Session: -", "- Owner/Session: Different owner"), /owner disagreement/u],
    [(value) => value.replace("- Last touched: 2026-08-30", "- Last touched: 2026-08-31"), /lastTouched disagreement/u],
    [(value) => value.replace("- Category: Quality / fixture", "- Category: Different category"), /category disagreement/u],
    [(value) => value.replace("- Priority: P1", "- Priority: P0"), /priority disagreement/u],
    [(value) => value.replace("- Score: C2", "- Score: C3"), /complexity disagreement/u],
    [(value) => value.replace(" + F3", " + F4"), /functionalityDanger disagreement/u],
    [(value) => value.replace(" + S0", " + S1"), /securityDanger disagreement/u],
    [(value) => value.replace(" = 9", " = 10"), /points disagreement/u],
    [(value) => value.replace("### WTF-BB-001 - Open fixture", "### WTF-BB-001 - Different title"), /title disagreement/u],
  ];
  for (const [mutate, expected] of disagreements) {
    assert.throws(
      () => parseGeneratedBountyBoard(mutate(markdown)),
      expected,
    );
  }
});

test("checked-in bounty board is the deterministic canonical view", async () => {
  const canonical = JSON.parse(await readFile("docs/reference/bug-bounty-records.json", "utf8"));
  const markdown = await readFile(".agents/docs/live/BUG_BOUNTY_BOARD.md", "utf8");
  validateBountyRecords(canonical.records);
  assert.equal(markdown, renderBountyBoard(canonical.records));
  parseGeneratedBountyBoard(markdown);
});
