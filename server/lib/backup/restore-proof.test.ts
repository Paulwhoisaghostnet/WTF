import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  BACKUP_RESTORE_PROOF_REQUIREMENTS,
  buildBackupRestoreProof,
  normalizeBackupRestoreProof,
  readBackupRestoreDrillProof,
} from "./restore-proof";

const successfulBackup = {
  filename: "wtf_2026-05-11T09-00-00Z.dump",
  bytes: 4096,
  sha256: "a".repeat(64),
  createdAt: "2026-05-11T09:00:00.000Z",
};

test("backup restore proof refuses safety claims without a restore drill", () => {
  const proof = buildBackupRestoreProof({
    backup: successfulBackup,
    targets: [{ name: "local", status: "ok", bytes: 4096, sha256Match: true }],
  });

  assert.equal(proof.status, "not_proven");
  assert.equal(proof.canClaimSafety, false);
  assert.deepEqual(
    proof.requirements.map((requirement) => requirement.key),
    BACKUP_RESTORE_PROOF_REQUIREMENTS
  );
  assert.equal(
    proof.requirements.find((requirement) => requirement.key === "restore_drill_passed")?.ok,
    false
  );
});

test("backup restore proof requires matching row counts and a checked media manifest", () => {
  const proof = buildBackupRestoreProof({
    backup: successfulBackup,
    targets: [
      { name: "local", status: "ok", bytes: 4096, sha256Match: true },
      { name: "supabase", status: "ok", bytes: 512, sha256Match: true },
    ],
    restoreDrill: {
      status: "passed",
      restoredAt: "2026-05-11T09:20:00.000Z",
      source: "local-restore-drill",
      rowCounts: [
        { table: "users", backupRows: 12, restoredRows: 12 },
        { table: "user_media_library", backupRows: 4, restoredRows: 4 },
      ],
      mediaManifest: {
        status: "passed",
        expectedRows: 4,
        restoredRows: 4,
        checksumSha256: "b".repeat(64),
        checkedObjects: 4,
        missingObjects: 0,
      },
    },
  });

  assert.equal(proof.status, "safe_to_claim");
  assert.equal(proof.canClaimSafety, true);
  assert.equal(proof.requirements.every((requirement) => requirement.ok), true);
});

test("backup restore proof pinpoints row-count and media-manifest failures", () => {
  const proof = buildBackupRestoreProof({
    backup: successfulBackup,
    targets: [{ name: "local", status: "ok", bytes: 4096, sha256Match: true }],
    restoreDrill: {
      status: "passed",
      restoredAt: "2026-05-11T09:20:00.000Z",
      source: "local-restore-drill",
      rowCounts: [{ table: "users", backupRows: 12, restoredRows: 11 }],
      mediaManifest: {
        status: "failed",
        expectedRows: 4,
        restoredRows: 3,
        checksumSha256: null,
        checkedObjects: 4,
        missingObjects: 1,
      },
    },
  });

  assert.equal(proof.status, "not_proven");
  assert.equal(proof.canClaimSafety, false);
  assert.equal(
    proof.requirements.find((requirement) => requirement.key === "row_counts_match")?.ok,
    false
  );
  assert.equal(
    proof.requirements.find((requirement) => requirement.key === "media_manifest_checked")?.ok,
    false
  );
});

test("stored restore proof is re-derived instead of trusting a canClaimSafety flag", () => {
  const proof = normalizeBackupRestoreProof({
    status: "safe_to_claim",
    canClaimSafety: true,
    backup: successfulBackup,
    targets: [{ name: "local", status: "ok", bytes: 4096, sha256Match: true }],
    restoreDrill: {
      status: "passed",
      rowCounts: [{ table: "users", backupRows: 12, restoredRows: 11 }],
      mediaManifest: {
        status: "failed",
        expectedRows: 4,
        restoredRows: 3,
        checksumSha256: null,
        checkedObjects: 4,
        missingObjects: 1,
      },
    },
  });

  assert.equal(proof?.status, "not_proven");
  assert.equal(proof?.canClaimSafety, false);
});

test("stored restore proof remains safe only when all evidence revalidates", () => {
  const proof = normalizeBackupRestoreProof({
    backup: successfulBackup,
    targets: [{ name: "local", status: "ok", bytes: 4096, sha256Match: true }],
    restoreDrill: {
      status: "passed",
      restoredAt: "2026-05-11T09:20:00.000Z",
      rowCounts: [{ table: "users", backupRows: 12, restoredRows: 12 }],
      mediaManifest: {
        status: "passed",
        expectedRows: 4,
        restoredRows: 4,
        checksumSha256: "b".repeat(64),
        checkedObjects: 4,
        missingObjects: 0,
      },
    },
  });

  assert.equal(proof?.status, "safe_to_claim");
  assert.equal(proof?.canClaimSafety, true);
});

test("restore drill proof reader fails closed when the operator proof file is missing", async () => {
  const proof = await readBackupRestoreDrillProof(
    path.join(os.tmpdir(), `missing-wtf-restore-proof-${Date.now()}.json`)
  );

  assert.equal(proof.status, "missing");
});

test("restore drill proof reader loads the operator proof file", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wtf-restore-proof-"));
  const filepath = path.join(dir, "restore-proof.json");
  await fs.writeFile(
    filepath,
    JSON.stringify({
      status: "passed",
      restoredAt: "2026-05-11T09:20:00.000Z",
      source: "local-restore-drill",
      rowCounts: [{ table: "users", backupRows: 1, restoredRows: 1 }],
      mediaManifest: {
        status: "passed",
        expectedRows: 1,
        restoredRows: 1,
        checksumSha256: "c".repeat(64),
        checkedObjects: 1,
        missingObjects: 0,
      },
    })
  );

  const proof = await readBackupRestoreDrillProof(filepath);

  assert.equal(proof.status, "passed");
  assert.equal(proof.rowCounts?.[0]?.table, "users");
});
