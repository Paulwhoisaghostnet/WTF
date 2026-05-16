import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPsqlArgs,
  resolveOptions,
} from "./run-db-health-completion.mjs";

test("db health completion runner builds a redaction-friendly psql invocation", () => {
  const options = resolveOptions(
    {
      DATABASE_URL: "postgresql://user:secret@example.com:5432/wtf",
      DB_HEALTH_TOP_N: "12",
      PSQL_BIN: "psql-custom",
    },
    []
  );

  assert.equal(options.databaseUrl, "postgresql://user:secret@example.com:5432/wtf");
  assert.equal(options.psqlBin, "psql-custom");
  assert.equal(options.topN, 12);
  assert.match(options.sqlFile, /scripts\/db-health-completion\.sql$/);

  assert.deepEqual(buildPsqlArgs(options), [
    "postgresql://user:secret@example.com:5432/wtf",
    "-v",
    "TOP_N=12",
    "-f",
    options.sqlFile,
  ]);
});

test("db health completion runner clamps invalid TOP_N to the safe default", () => {
  const options = resolveOptions(
    { DATABASE_URL: "postgresql://user:secret@example.com:5432/wtf" },
    ["--top=0"]
  );

  assert.equal(options.topN, 25);
});
