#!/usr/bin/env -S node --import=tsx
import { pool } from "../server/db";
import { runObjectStorageUsageCheck } from "../server/lib/storage/object-storage-usage";
import { flushSystemLog } from "../server/lib/system-log";

runObjectStorageUsageCheck()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error("[object-storage-usage-check] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await flushSystemLog().catch(() => undefined);
    await pool.end().catch(() => undefined);
  });
