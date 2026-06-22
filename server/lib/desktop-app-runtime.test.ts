import assert from "node:assert/strict";
import test from "node:test";
import { isDesktopAppRuntimeAvailable } from "./desktop-app-runtime";

test("stale documentation does not hide enabled production app launchers", () => {
  assert.equal(isDesktopAppRuntimeAvailable({ enabled: true }), true);
});

test("disabled apps stay hidden regardless of registration health", () => {
  assert.equal(isDesktopAppRuntimeAvailable({ enabled: false }), false);
});
