#!/usr/bin/env -S node --import=tsx
import { pool } from "../server/db";
import { runMediaHotCacheEviction } from "../server/lib/storage/cache-manager";
import { runTvCacheEviction } from "../server/routes/tv";

const apply = process.argv.includes("--apply");
const includeTv = process.argv.includes("--include-tv");

async function main() {
  const media = await runMediaHotCacheEviction({ dryRun: !apply });
  const result: Record<string, unknown> = { mediaHotCache: media };
  if (includeTv) {
    if (!apply) {
      result.tvCache = { dryRun: true, note: "TV cache eviction requires --apply" };
    } else {
      result.tvCache = await runTvCacheEviction();
    }
  }
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error("[cache-evict] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });

