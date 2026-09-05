import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const cheaseSource = readFileSync("client/src/pages/MacaroniPackager.tsx", "utf8");

test("CH-EASE exposes Gamma presentation ownership without forking package logic", () => {
  assert.match(cheaseSource, /usePresentationShell/);
  assert.match(cheaseSource, /presentationRouteHref/);
  assert.match(cheaseSource, /data-chease-surface="packager"/);
  assert.match(cheaseSource, /data-chease-presentation-host=\{presentation\.host\}/);
  assert.match(cheaseSource, /data-chease-region="header"/);
  assert.match(cheaseSource, /data-chease-region="target-strip"/);
  assert.match(cheaseSource, /data-chease-region="handoff-strip"/);
  assert.match(cheaseSource, /data-chease-region="pasta-toolbar"/);
  assert.match(cheaseSource, /data-chease-region="panel"/);
  assert.match(cheaseSource, /data-chease-region="drop-preview"/);
  assert.match(cheaseSource, /data-chease-region="status"/);
});

test("CH-EASE Gamma handoffs preserve shell routes while keeping exports raw", () => {
  assert.match(cheaseSource, /window\.open\(presentationRouteHref\(path,\s*presentation\.host\)/);
  assert.match(cheaseSource, /window\.open\(presentationRouteHref\(path,\s*presentation\.host\), "_blank", "noopener"\)/);
  assert.match(cheaseSource, /new URLSearchParams\(\{ handoff: "chease-package", handoffKey: key \}\)/);
  assert.match(cheaseSource, /const path = `\/tools\/\$\{pastaTarget\}\?\$\{params\.toString\(\)\}`/);
  assert.match(cheaseSource, /new URLSearchParams\(\{ source: "wtfos-package", packageId: String\(activePackage\.id\) \}\)/);
  assert.match(cheaseSource, /const path = `\/tools\/macaroni\?\$\{params\.toString\(\)\}`/);
  assert.equal(
    cheaseSource.includes(
      "const path = `/api/macaroni/packages/${activePackage.id}/export.csv?target=${dropConfig.exportTarget}`"
    ),
    true
  );
  assert.match(cheaseSource, /window\.open\(path, "_blank", "noopener"\)/);
  assert.doesNotMatch(cheaseSource, /\/api\/gamma/i);
  assert.doesNotMatch(cheaseSource, /gamma\.wtfos\.app/);
});

test("CH-EASE Gamma chrome follows the presentation style budget", () => {
  assert.match(cheaseSource, /\[data-chease-presentation-host="gamma"\]/);
  assert.match(cheaseSource, /\[data-chease-presentation-host="gamma"\][\s\S]*?background-image:\s*none/);
  assert.match(cheaseSource, /\[data-chease-presentation-host="gamma"\][\s\S]*?box-shadow:\s*none/);
  assert.match(cheaseSource, /\[data-chease-presentation-host="gamma"\][\s\S]*?text-shadow:\s*none/);
  assert.match(cheaseSource, /border-radius:\s*6px/);
  assert.doesNotMatch(cheaseSource, /linear-gradient\(180deg,[\s\S]*?\[data-chease-presentation-host="gamma"\]/);
});

test("CH-EASE package previews use shared FileShip-first media recovery", () => {
  assert.match(cheaseSource, /RecoverableIpfsImage/);
  assert.match(cheaseSource, /resolveArtifactUri/);
  assert.doesNotMatch(cheaseSource, /https:\/\/ipfs\.fileship\.xyz\/\$\{cid\}/);
});
