import assert from "node:assert/strict";
import test from "node:test";
import { parseHorfTraderStatus, safeHorfEvidenceUrl } from "./trader-status-model";

test("Horf trader status keeps blacklist evidence on a safe web link", () => {
  assert.equal(safeHorfEvidenceUrl("https://example.org/report/1"), "https://example.org/report/1");
  assert.equal(safeHorfEvidenceUrl("javascript:alert(1)"), null);
  assert.equal(safeHorfEvidenceUrl("https://user:secret@example.org/report"), null);
  assert.deepEqual(parseHorfTraderStatus({
    address: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
    blacklisted: false, reason: null, evidenceUrl: null, listedAt: null,
  }).blacklisted, false);
  assert.throws(() => parseHorfTraderStatus({ address: "tz1", blacklisted: "yes" }), /could not be read/);
});
