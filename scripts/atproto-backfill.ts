/**
 * AT Protocol identity-social backfill runner (S4.1). Replays existing canonical board data
 * (channels, posts, reactions) through the flag-gated spine emitters so historical content
 * lands in the AT repos + AppView. Idempotent (deterministic rkeys) and bounded per pass, so
 * it is safe to run repeatedly / resume.
 *
 * Usage:
 *   ATPROTO_SPINE_ENABLED=true npx tsx scripts/atproto-backfill.ts           # uses DATABASE_URL
 *   ATPROTO_SPINE_ENABLED=true npx tsx scripts/atproto-backfill.ts --limit 500
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

function argValue(flag: string, fallback: number): number {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) {
    const n = Number(process.argv[idx + 1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[atproto-backfill] DATABASE_URL is not set");
    process.exit(1);
  }
  if (process.env.ATPROTO_SPINE_ENABLED !== "true" && process.env.ATPROTO_SPINE_ENABLED !== "1") {
    console.error(
      "[atproto-backfill] ATPROTO_SPINE_ENABLED is not enabled; refusing to run (nothing would publish).",
    );
    process.exit(1);
  }

  const limit = argValue("--limit", 200);
  const { backfillBoardChannels, backfillBoardPosts, backfillBoardReactions } = await import(
    "../server/features/atproto-spine/backfill/social.ts"
  );

  async function drain(
    label: string,
    fn: (o: { limit: number; afterId: number }) => Promise<{ processed: number; lastId: number }>,
  ): Promise<number> {
    let afterId = 0;
    let total = 0;
    for (;;) {
      const { processed, lastId } = await fn({ limit, afterId });
      total += processed;
      afterId = lastId;
      if (processed < limit) break; // fewer than a full page => exhausted
    }
    console.log(`[atproto-backfill] ${label}: ${total} records`);
    return total;
  }

  await drain("channels", backfillBoardChannels);
  await drain("posts", backfillBoardPosts);
  await drain("reactions", backfillBoardReactions);
  console.log("[atproto-backfill] done");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
