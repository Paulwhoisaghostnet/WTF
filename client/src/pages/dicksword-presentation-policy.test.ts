import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dickswordSource = readFileSync("client/src/pages/Dicksword.tsx", "utf8");

test("Dicksword custom chrome is presentation-host aware", () => {
  assert.match(dickswordSource, /usePresentationShell/);
  assert.match(dickswordSource, /data-dicksword-surface="true"/);
  assert.match(dickswordSource, /data-dicksword-presentation-host=\{presentation\.host\}/);
  assert.match(dickswordSource, /\[data-dicksword-presentation-host="gamma"\]/);
  assert.match(dickswordSource, /background-image:\s*none/);
  assert.match(dickswordSource, /box-shadow:\s*none/);
  assert.match(dickswordSource, /border-radius:\s*6px/);
  assert.match(dickswordSource, /letter-spacing:\s*0/);
});

test("Dicksword keeps external and API exits outside presentation rewriting", () => {
  assert.match(dickswordSource, /window\.location\.assign\("\/api\/auth\/discord"\)/);
  assert.match(dickswordSource, /window\.open\(config\.inviteUrl!, "_blank"\)/);
});
