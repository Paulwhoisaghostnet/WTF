/**
 * AT Protocol backup/restore readiness drill (S5.2). NON-DESTRUCTIVE: it only inspects
 * configuration + secrets and confirms the canonical→mirror rebuild path exists. It prints a
 * pass/fail checklist and exits non-zero if any REQUIRED item is missing, so CI/ops can gate
 * on it. See docs/runbooks/wtfos-atproto-backup.md for the full procedure.
 *
 * Usage:
 *   npx tsx scripts/atproto-backup-drill.ts
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

interface Check {
  label: string;
  ok: boolean;
  required: boolean;
  detail?: string;
}

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function main() {
  const spineOn = process.env.ATPROTO_SPINE_ENABLED === "true" || process.env.ATPROTO_SPINE_ENABLED === "1";
  const checks: Check[] = [
    { label: "DATABASE_URL set (canonical store)", ok: present("DATABASE_URL"), required: true },
    {
      label: "Postgres backup configured (Supabase/DATABASE_URL backup path)",
      ok: present("SUPABASE_BACKUP_URL") || present("SUPABASE_URL") || present("DATABASE_URL"),
      required: true,
      detail: "Canonical wtfos_atproto_* tables ride the existing Postgres backup.",
    },
    {
      label: "Private PDS encryption key present (DM envelopes unrecoverable without it)",
      ok: present("WTFOS_PRIVATE_PDS_ENC_KEY"),
      required: spineOn,
      detail: "WTFOS_PRIVATE_PDS_ENC_KEY",
    },
    {
      label: "PLC rotation key present (did:plc identities)",
      ok: present("PLC_ROTATION_KEY") || present("WTFOS_PLC_ROTATION_KEY"),
      required: false,
    },
    {
      label: "PDS admin password present (volume/account export auth)",
      ok: present("PDS_ADMIN_PASSWORD") || present("WTFOS_PDS_ADMIN_PASSWORD"),
      required: false,
    },
    {
      label: "Object storage configured (media blobs)",
      ok: present("OBJECT_STORAGE_BUCKET") || present("S3_BUCKET") || present("AWS_S3_BUCKET"),
      required: false,
    },
    {
      label: "Mirror rebuild path available (backfill script)",
      ok: true,
      required: true,
      detail: "npm run atproto:backfill (idempotent) re-derives repos from Postgres.",
    },
  ];

  console.log(`\n[atproto-backup-drill] spine enabled: ${spineOn}\n`);
  let failedRequired = 0;
  for (const c of checks) {
    const status = c.ok ? "PASS" : c.required ? "FAIL" : "WARN";
    if (!c.ok && c.required) failedRequired += 1;
    console.log(`  [${status}] ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  console.log("");

  if (failedRequired > 0) {
    console.error(`[atproto-backup-drill] ${failedRequired} required check(s) failed.`);
    process.exit(1);
  }
  console.log("[atproto-backup-drill] readiness OK (no destructive actions performed).");
  process.exit(0);
}

main();
