import assert from "node:assert/strict";
import test from "node:test";
import { selectUniqueConnectedWtfUsersByTwitterId } from "./message-identity";

test("W peer enrichment omits ambiguous duplicate X identities", () => {
  const byTwitterId = selectUniqueConnectedWtfUsersByTwitterId([
    {
      id: 10,
      username: "alice",
      displayName: "Alice",
      twitterId: "111",
      twitterHandle: "alice_x",
    },
    {
      id: 11,
      username: "alice_clone",
      displayName: "Alice Clone",
      twitterId: "111",
      twitterHandle: "alice_clone_x",
    },
    {
      id: 12,
      username: "bert",
      displayName: "Bert",
      twitterId: "222",
      twitterHandle: "bert_x",
    },
    {
      id: 13,
      username: "bad",
      displayName: "Bad",
      twitterId: "not-a-twitter-id",
      twitterHandle: "bad_x",
    },
  ]);

  assert.equal(byTwitterId.has("111"), false);
  assert.equal(byTwitterId.get("222")?.username, "bert");
  assert.equal(byTwitterId.has("not-a-twitter-id"), false);
});
