import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import pg from "pg";
import {
  assertRestoreTargetIsNotSource,
  buildPgRestoreArgs,
  buildRestoreDrillProof,
  writeRestoreDrillProof,
} from "../server/lib/backup/restore-drill";
import { defaultBackupRestoreProofPath } from "../server/lib/backup/restore-proof";

const execFileAsync = promisify(execFile);
const { Client } = pg;

type Options = {
  dumpPath: string;
  sourceDatabaseUrl: string;
  restoreDatabaseUrl: string;
  proofPath: string;
  confirmed: boolean;
  skipRestore: boolean;
};

function valueAfter(flag: string, argv: string[]): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

function parseOptions(argv = process.argv.slice(2)): Options {
  return {
    dumpPath: valueAfter("--dump", argv) || process.env.BACKUP_DUMP_PATH || "",
    sourceDatabaseUrl:
      valueAfter("--source-database-url", argv) || process.env.DATABASE_URL || "",
    restoreDatabaseUrl:
      valueAfter("--restore-database-url", argv) ||
      process.env.RESTORE_DATABASE_URL ||
      "",
    proofPath:
      valueAfter("--proof-path", argv) ||
      process.env.BACKUP_RESTORE_PROOF_PATH ||
      defaultBackupRestoreProofPath(),
    confirmed:
      argv.includes("--i-understand-restore-db-will-be-overwritten") ||
      process.env.RESTORE_DRILL_CONFIRM === "overwrite",
    skipRestore: argv.includes("--skip-restore"),
  };
}

function assertOptions(options: Options): void {
  if (!options.dumpPath) {
    throw new Error("Missing --dump or BACKUP_DUMP_PATH");
  }
  if (!existsSync(options.dumpPath)) {
    throw new Error(`Backup dump does not exist: ${options.dumpPath}`);
  }
  if (!options.sourceDatabaseUrl) {
    throw new Error("Missing --source-database-url or DATABASE_URL");
  }
  if (!options.restoreDatabaseUrl) {
    throw new Error("Missing --restore-database-url or RESTORE_DATABASE_URL");
  }
  assertRestoreTargetIsNotSource(options.sourceDatabaseUrl, options.restoreDatabaseUrl);
  if (!options.confirmed) {
    throw new Error(
      "Restore drill overwrites the restore target. Pass --i-understand-restore-db-will-be-overwritten or set RESTORE_DRILL_CONFIRM=overwrite."
    );
  }
}

async function withClient<T>(databaseUrl: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function restoreDump(options: Options): Promise<void> {
  if (options.skipRestore) return;
  const args = buildPgRestoreArgs(options.dumpPath, options.restoreDatabaseUrl);
  await execFileAsync("pg_restore", args, {
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PGCONNECTTIMEOUT: "15" },
  });
}

async function main(): Promise<void> {
  const options = parseOptions();
  assertOptions(options);

  console.log(`[restore-drill] restoring ${options.dumpPath}`);
  await restoreDump(options);

  const proof = await withClient(options.sourceDatabaseUrl, (sourceDb) =>
    withClient(options.restoreDatabaseUrl, (restoredDb) =>
      buildRestoreDrillProof(sourceDb, restoredDb)
    )
  );
  const proofPath = await writeRestoreDrillProof(proof, options.proofPath);

  console.log(
    `[restore-drill] ${proof.status}; wrote ${proofPath}; row checks ${proof.rowCounts?.length ?? 0}; media ${proof.mediaManifest?.status ?? "missing"}`
  );
  if (proof.status !== "passed") {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error("[restore-drill] failed:", error);
  process.exit(1);
});
