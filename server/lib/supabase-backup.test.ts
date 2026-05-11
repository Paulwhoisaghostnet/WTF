import assert from "node:assert/strict";
import test from "node:test";
import { buildPgDumpArgs } from "./backup-command";

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
