/**
 * One-shot backfill for `contract_metadata`.  Drains every distinct
 * contract missing or stale in a single pass instead of waiting for
 * the 15-min scheduler ticks.  Invoked from the
 * "Backfill Contract Metadata" GitHub workflow (`docker compose exec
 * app node dist/backfill-contract-metadata.cjs`) or locally via `node
 * --import tsx/esm scripts/backfill-contract-metadata.ts`.
 *
 * Paces itself at ~8 req/s to stay under TzKT's anonymous ceiling
 * (10 req/s), re-running `runContractMetadataSync` with a large batch
 * until no more rows are due.  Progress is printed every 50 upserts.
 *
 * Exits 0 on full drain, 1 on unrecoverable error.
 */

import { runContractMetadataSync } from "../server/lib/contract-metadata-sync";

async function main(): Promise<void> {
  const started = Date.now();
  const batchSize = Number(process.env.BACKFILL_BATCH_SIZE ?? 500);
  let totalUpserted = 0;
  let totalFetched = 0;
  let totalSkipped = 0;
  let pass = 0;

  console.log(
    `[backfill-contract-metadata] starting (batch=${batchSize})…`
  );

  while (true) {
    pass += 1;
    const r = await runContractMetadataSync({
      batchSize,
      onProgress: ({ done, total, address, alias }) => {
        if (done === 1 || done % 50 === 0 || done === total) {
          console.log(
            `  [pass ${pass}] ${done}/${total} — ${address} ${
              alias ? `→ ${alias}` : ""
            }`.trimEnd()
          );
        }
      },
    });
    totalFetched += r.fetched;
    totalUpserted += r.itemsOut;
    totalSkipped += r.skipped;

    console.log(
      `[pass ${pass}] fetched=${r.fetched} upserted=${r.itemsOut} ` +
        `skipped=${r.skipped} remaining=${r.remaining}`
    );

    if (r.itemsIn === 0 || r.remaining === 0) break;
    // Hard safety: never run more than 25 passes (≈12,500 contracts)
    // so a misbehaving TzKT never produces a runaway.
    if (pass >= 25) {
      console.warn(
        `[backfill-contract-metadata] hit 25-pass safety cap; stopping.`
      );
      break;
    }
  }

  const ms = Date.now() - started;
  console.log(
    `[backfill-contract-metadata] done in ${(ms / 1000).toFixed(1)}s. ` +
      `fetched=${totalFetched} upserted=${totalUpserted} skipped=${totalSkipped}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill-contract-metadata] fatal:", err);
  process.exit(1);
});
