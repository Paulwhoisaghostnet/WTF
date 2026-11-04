import assert from "node:assert/strict";
import test from "node:test";
import { horfApiErrorMessage } from "./api";

test("Horf rate limits tell riders to hold their horses without repeating the title", () => {
  assert.equal(horfApiErrorMessage(429, "Hold Your Horses. Try again in a minute."),
    "Error 429: Hold Your Horses. Try again in a minute.");
});

test("Horf API errors retain the actionable server detail", () => {
  assert.equal(horfApiErrorMessage(403, "HORF MARSHAL role required"),
    "Error 403: No Passage, Pardner — HORF MARSHAL role required");
  assert.equal(horfApiErrorMessage(418, "This horse is still in inspection"),
    "Error 418: Whoa There — This horse is still in inspection");
});
