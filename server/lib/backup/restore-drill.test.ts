import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertRestoreTargetIsNotSource,
  buildPgRestoreArgs,
  buildRestoreDrillProof,
  buildRestoreDrillRowCounts,
  writeRestoreDrillProof,
  type RestoreDrillDb,
} from "./restore-drill";

function fakeDb(tables: Record<string, number>, mediaRows: Record<string, unknown>[]): RestoreDrillDb {
  return {
    async query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string) {
      const table = sql.match(/FROM "([a-z_][a-z0-9_]*)"/)?.[1];
      if (table) {
        return { rows: [{ count: tables[table] ?? 0 } as unknown as T] };
      }
      if (sql.includes("FROM user_media_library")) {
        return { rows: mediaRows as T[] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

const mediaRow = {
  id: 1,
  owner_user_id: 7,
  source_type: "upload",
  source_url: "storage://media/a.mp4",
  playback_url: null,
  object_storage_bucket: "wtf-media",
  object_storage_key: "media/a.mp4",
  checksum_sha256: "a".repeat(64),
  status: "ready",
  media_category: "video",
  file_size_bytes: 1024,
};

test("restore drill refuses to target the source database", () => {
  assert.throws(
    () =>
      assertRestoreTargetIsNotSource(
        "postgresql://user:one@localhost:5432/wtf",
        "postgresql://other:two@LOCALHOST/wtf"
      ),
    /must be different/
  );
  assert.doesNotThrow(() =>
    assertRestoreTargetIsNotSource(
      "postgresql://user:one@localhost:5432/wtf",
      "postgresql://user:one@localhost:5432/wtf_restore"
    )
  );
});

test("pg_restore args keep database URLs and dump paths as isolated argv entries", () => {
  assert.deepEqual(
    buildPgRestoreArgs("/tmp/wtf backup.dump", "postgresql://restore@localhost/wtf_restore"),
    [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--dbname",
      "postgresql://restore@localhost/wtf_restore",
      "/tmp/wtf backup.dump",
    ]
  );
});

test("restore drill compares source and restored row counts", async () => {
  const rowCounts = await buildRestoreDrillRowCounts(
    fakeDb({ users: 2 }, []),
    fakeDb({ users: 2 }, []),
    ["users"]
  );
  assert.deepEqual(rowCounts, [{ table: "users", backupRows: 2, restoredRows: 2 }]);
});

test("restore drill proof passes only when rows and media manifest match", async () => {
  const source = fakeDb({ users: 2, user_media_library: 1 }, [mediaRow]);
  const restored = fakeDb({ users: 2, user_media_library: 1 }, [mediaRow]);
  const proof = await buildRestoreDrillProof(source, restored);

  assert.equal(proof.status, "passed");
  assert.equal(proof.mediaManifest?.status, "passed");
  assert.equal(proof.mediaManifest?.missingObjects, 0);
});

test("restore drill proof fails on mismatched restored media manifest", async () => {
  const source = fakeDb({ users: 2, user_media_library: 1 }, [mediaRow]);
  const restored = fakeDb(
    { users: 2, user_media_library: 1 },
    [{ ...mediaRow, object_storage_key: "media/different.mp4" }]
  );
  const proof = await buildRestoreDrillProof(source, restored);

  assert.equal(proof.status, "failed");
  assert.equal(proof.mediaManifest?.status, "failed");
  assert.equal(proof.mediaManifest?.missingObjects, 1);
});

test("restore drill proof writer creates the operator proof artifact", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wtf-restore-drill-"));
  const filepath = path.join(dir, "restore-drill-proof.json");
  await writeRestoreDrillProof({ status: "missing", source: "test" }, filepath);

  const raw = await fs.readFile(filepath, "utf8");
  assert.match(raw, /"source": "test"/);
});
