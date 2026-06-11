import test from "node:test";
import assert from "node:assert/strict";
import { suggestWtfosPdsHandle } from "./wtfos-pds-handle";

test("WTFOS PDS handle suggestion prefers the wtfOS username site host", () => {
  const suggestion = suggestWtfosPdsHandle({
    username: "MacaroniMaker",
    canonicalHandle: "totally-different.bsky.social",
    handleDomain: "wtfos.me",
  });

  assert.equal(suggestion.handle, "macaronimaker.wtfos.me");
  assert.equal(suggestion.source, "wtfos_username");
  assert.equal(suggestion.invalidUsernameReason, null);
});

test("WTFOS PDS handle suggestion falls back to the canonical AT handle only when username is not site-safe", () => {
  const suggestion = suggestWtfosPdsHandle({
    username: "bad.name",
    canonicalHandle: "macaroni-drop.bsky.social",
    handleDomain: "wtfos.me",
  });

  assert.equal(suggestion.handle, "macaroni-drop.wtfos.me");
  assert.equal(suggestion.source, "canonical_atproto_handle");
  assert.equal(suggestion.invalidUsernameReason, "username must be a valid DNS label");
});

test("WTFOS PDS handle suggestion reports no handle when neither username nor canonical handle can issue one", () => {
  const suggestion = suggestWtfosPdsHandle({
    username: "api",
    canonicalHandle: "",
    handleDomain: "wtfos.me",
  });

  assert.equal(suggestion.handle, null);
  assert.equal(suggestion.source, "none");
  assert.equal(suggestion.invalidUsernameReason, "username label is reserved");
});
