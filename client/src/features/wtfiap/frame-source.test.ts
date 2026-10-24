import assert from "node:assert/strict";
import test from "node:test";
import { wtfIapEntryPath, wtfIapFrameSource } from "./frame-source";

test("WTFIAP captures search only from its own active route", () => {
  assert.equal(wtfIapEntryPath("/wtfiap", "/wtfiap", "room=AB12CD"), "/wtfiap?room=AB12CD");
  assert.equal(wtfIapEntryPath("/wtfiap", "/console", "room=another-app"), "/wtfiap");
  assert.equal(wtfIapEntryPath("/wtfiap?room=AB12CD", "/console", "room=another-app"), "/wtfiap?room=AB12CD");
});

test("WTFIAP uses its own window path and retains invitation parameters", () => {
  assert.equal(wtfIapFrameSource(null), "/games/installed/wtfiap/welcome.html");
  assert.equal(wtfIapFrameSource("/wtfiap?seed=board-1"), "/games/installed/wtfiap/welcome.html?seed=board-1");
  assert.equal(wtfIapFrameSource("/wtfiap?mode=practice&seed=board-1"), "/games/installed/wtfiap/index.html?mode=practice&seed=board-1");
  assert.equal(wtfIapFrameSource("/wtfiap?mode=learn"), "/games/installed/wtfiap/learn.html?mode=learn");
  assert.equal(wtfIapFrameSource("/wtfiap?mode=team-builder"), "/games/installed/wtfiap/team-builder.html?mode=team-builder");
  assert.equal(wtfIapFrameSource("/wtfiap?room=AB12CD&board=standard"), "/games/installed/wtfiap/party.html?room=AB12CD&board=standard");
  assert.equal(wtfIapFrameSource("/wtfiap?mode=party"), "/games/installed/wtfiap/party.html?mode=party");
});
