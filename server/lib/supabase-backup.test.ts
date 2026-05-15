import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPgDumpArgs } from "./backup-command";

const containerBackupScript = readFileSync("scripts/backup-db.sh", "utf8");
const hostBackupScript = readFileSync("scripts/backup-database.sh", "utf8");

test("buildPgDumpArgs passes filepath and database URL as isolated arguments", () => {
  const dbUrl = `postgresql://user:pa"ss;touch /tmp/owned@db.example.com:5432/wtf?sslmode=require`;
  const filepath = `/tmp/wtf backup";rm -rf /.dump`;

  assert.deepEqual(buildPgDumpArgs(filepath, dbUrl), [
    "--format=custom",
    "--no-owner",
    `--file=${filepath}`,
    dbUrl,
  ]);
});

test("backup shell retention keeps env-controlled days inside a numeric argv boundary", () => {
  for (const source of [containerBackupScript, hostBackupScript]) {
    assert.match(
      source,
      /\[\[ "\$KEEP_DAYS" =~ \^\[0-9\]\+\$ \]\]/,
      "retention days must be validated before reaching find"
    );
    assert.match(
      source,
      /find "\$BACKUP_(?:DIR|ROOT)"[\s\S]*-mtime \+"\$KEEP_DAYS"/,
      "retention days must be quoted as a single find -mtime argument"
    );
  }
});
