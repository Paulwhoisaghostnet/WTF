import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMailLocalPart,
  splitEmailAddress,
  validateMailLocalPart,
} from "./address";
import { getMailConfig, userEligibleForMail } from "./config";

test("mail local parts follow WTF username-safe policy", () => {
  assert.equal(normalizeMailLocalPart("WTF Wizard!!"), "wtf-wizard");
  assert.deepEqual(validateMailLocalPart("admin"), {
    ok: false,
    error: "That mailbox name is reserved",
  });
  assert.equal(validateMailLocalPart("valid-name").ok, true);
});

test("mail config defaults to staff alpha on mail.wtfgameshow.app", () => {
  const config = getMailConfig({});
  assert.equal(config.domain, "mail.wtfgameshow.app");
  assert.equal(config.rolloutMode, "staff_alpha");
  assert.equal(config.provider, "resend");
});

test("staff alpha eligibility is role bounded", () => {
  assert.equal(userEligibleForMail({ role: "admin" }), true);
  assert.equal(userEligibleForMail({ role: "host" }), true);
  assert.equal(userEligibleForMail({ role: "witness" }), false);
});

test("email splitter rejects malformed routes", () => {
  assert.equal(splitEmailAddress("user@mail.wtfgameshow.app").ok, true);
  assert.equal(splitEmailAddress("user@@mail.wtfgameshow.app").ok, false);
});
