import assert from "node:assert/strict";
import test from "node:test";
import { mailSendErrorStatus } from "./mail";

test("mail send maps user eligibility denials to forbidden", () => {
  for (const code of [
    "missing_tezos_wallet",
    "missing_identity",
    "wtfos_identity_incomplete",
    "guest_not_registered",
  ]) {
    assert.equal(mailSendErrorStatus(code), 403, code);
  }
});

test("mail send preserves validation, provider, and unknown error classes", () => {
  assert.equal(mailSendErrorStatus("mailbox_not_active"), 400);
  assert.equal(mailSendErrorStatus("recipient_required"), 400);
  assert.equal(mailSendErrorStatus("resend_not_configured"), 503);
  assert.equal(mailSendErrorStatus("mail_outbound_disabled"), 503);
  assert.equal(mailSendErrorStatus("database exploded"), 500);
});
