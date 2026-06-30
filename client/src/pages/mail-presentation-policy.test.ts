import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mailSource = readFileSync(new URL("./Mail.tsx", import.meta.url), "utf8");

test("WTF Mail app chrome is presentation-host aware", () => {
  assert.match(mailSource, /usePresentationShell/);
  assert.match(mailSource, /data-mail-presentation-host=\{presentation\.host\}/);
  assert.match(mailSource, /data-mail-surface="mail"/);
  assert.match(mailSource, /data-mail-region="surface"/);
  assert.match(mailSource, /data-mail-region="mailbox-panel"/);
  assert.match(mailSource, /data-mail-region="messages-panel"/);
  assert.match(mailSource, /data-mail-region="message-row"/);
  assert.match(mailSource, /data-mail-region="compose-panel"/);
  assert.match(mailSource, /data-mail-region="selected-panel"/);
  assert.match(mailSource, /data-mail-region="reader"/);
  assert.match(mailSource, /data-mail-region="send-button"/);
});

test("WTF Mail Gamma chrome is scoped to presentation styling only", () => {
  assert.match(mailSource, /data-mail-presentation-host="gamma"/);
  assert.match(mailSource, /background-image:\s*none\s*!important/);
  assert.match(mailSource, /box-shadow:\s*none\s*!important/);
  assert.match(mailSource, /border-width:\s*1px\s*!important/);
  assert.match(mailSource, /border-radius:\s*6px\s*!important/);
  assert.match(mailSource, /letter-spacing:\s*0\s*!important/);
  assert.match(mailSource, /#070706/);
  assert.match(mailSource, /#11110f/);
  assert.match(mailSource, /#00d2ff/);
  assert.match(mailSource, /#f2ead9/);
});

test("WTF Mail keeps shared mailbox APIs and comms invalidation unchanged", () => {
  assert.match(mailSource, /api\.get<MailStatus>\("\/api\/mail\/status"\)/);
  assert.match(mailSource, /api\.get<\{ messages: MailMessage\[\] \}>\("\/api\/mail\/messages"\)/);
  assert.match(mailSource, /api\.post\("\/api\/mail\/send"/);
  assert.match(mailSource, /qc\.invalidateQueries\(\{ queryKey: \["mail", "messages"\] \}\)/);
  assert.match(mailSource, /qc\.invalidateQueries\(\{ queryKey: \["comms"\] \}\)/);
  assert.doesNotMatch(mailSource, /\/api\/gamma/);
});
