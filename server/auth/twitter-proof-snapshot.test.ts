import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { xProofUnchangedLinkWhere } from "./twitter-proof-snapshot";

const dialect = new PgDialect();

test("a first X link writes only while the account remains unlinked", () => {
  const predicate = xProofUnchangedLinkWhere(7, {
    twitterId: null,
    twitterHandle: null,
    twitterVerified: false,
  });
  const query = dialect.sqlToQuery(predicate!);
  assert.match(query.sql, /"twitter_id" is null/);
  assert.match(query.sql, /"twitter_handle" is null/);
  assert.match(query.sql, /"twitter_verified" = \$2/);
  assert.deepEqual(query.params, [7, false]);
});

test("X reverify or change cannot overwrite a link changed by another session", () => {
  const predicate = xProofUnchangedLinkWhere(7, {
    twitterId: "123",
    twitterHandle: "alice",
    twitterVerified: true,
  });
  const query = dialect.sqlToQuery(predicate!);
  assert.match(query.sql, /"twitter_id" = \$2/);
  assert.match(query.sql, /"twitter_handle" = \$3/);
  assert.match(query.sql, /"twitter_verified" = \$4/);
  assert.deepEqual(query.params, [7, "123", "alice", true]);
});
