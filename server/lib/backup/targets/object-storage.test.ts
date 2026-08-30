import assert from "node:assert/strict";
import test from "node:test";
import {
  buildImmutableBackupObjectKey,
  runImmutableObjectStorageTarget,
  type ImmutableBackupObjectAdapter,
} from "./object-storage";
import type { BackupProducer } from "./base";

const artifact: BackupProducer = {
  kind: "pg_dump",
  status: "ok",
  filename: "wtf_2026-08-30T19-00-00Z.dump",
  filepath: "/tmp/wtf backup.dump",
  bytes: 4096,
  sha256: "a".repeat(64),
  createdAt: "2026-08-30T19:00:00.000Z",
};

test("immutable backup object keys are bounded to the configured prefix and artifact name", () => {
  assert.equal(
    buildImmutableBackupObjectKey("database-backups/", artifact),
    "database-backups/2026/08/wtf_2026-08-30T19-00-00Z.dump",
  );
  assert.throws(() => buildImmutableBackupObjectKey("../escape", artifact), /invalid backup object prefix/u);
});

test("immutable object target skips cleanly until a dedicated locked bucket is configured", async () => {
  const adapter: ImmutableBackupObjectAdapter = {
    configuration: () => null,
    upload: async () => assert.fail("upload must not run"),
    inspect: async () => assert.fail("inspect must not run"),
  };
  const result = await runImmutableObjectStorageTarget(artifact, adapter);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "missing_immutable_backup_object_storage");
});

test("immutable object target proves exact bytes, digest, and retention lock", async () => {
  const retainedUntil = new Date("2026-09-29T19:00:00.000Z");
  const adapter: ImmutableBackupObjectAdapter = {
    configuration: () => ({ bucket: "wtf-db-backups", prefix: "database-backups", retentionDays: 30 }),
    upload: async (input) => {
      assert.equal(input.filepath, artifact.filepath);
      assert.equal(input.bytes, artifact.bytes);
      assert.equal(input.sha256, artifact.sha256);
      assert.equal(input.retainedUntil.toISOString(), retainedUntil.toISOString());
      return { key: input.key };
    },
    inspect: async () => ({
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      objectLockMode: "GOVERNANCE",
      retainedUntil,
    }),
  };
  const result = await runImmutableObjectStorageTarget(artifact, adapter);
  assert.equal(result.status, "ok");
  assert.equal(result.sha256Match, true);
  assert.deepEqual(result.metadata, {
    bucket: "wtf-db-backups",
    key: "database-backups/2026/08/wtf_2026-08-30T19-00-00Z.dump",
    durableDump: true,
    immutable: true,
    objectLockMode: "GOVERNANCE",
    retainedUntil: retainedUntil.toISOString(),
  });
});

test("immutable object target fails closed when remote proof differs", async () => {
  const adapter: ImmutableBackupObjectAdapter = {
    configuration: () => ({ bucket: "wtf-db-backups", prefix: "database-backups", retentionDays: 30 }),
    upload: async ({ key }) => ({ key }),
    inspect: async () => ({
      bytes: artifact.bytes,
      sha256: "b".repeat(64),
      objectLockMode: "GOVERNANCE",
      retainedUntil: new Date("2026-09-29T19:00:00.000Z"),
    }),
  };
  const result = await runImmutableObjectStorageTarget(artifact, adapter);
  assert.equal(result.status, "error");
  assert.equal(result.sha256Match, false);
  assert.equal(result.reason, "immutable_remote_verification_failed");
});
