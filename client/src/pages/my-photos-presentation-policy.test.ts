import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const myPhotosSource = readFileSync(new URL("./MyPhotos.tsx", import.meta.url), "utf8");

test("MyPhotos exposes Gamma host markers for app-owned media chrome", () => {
  assert.match(myPhotosSource, /usePresentationShell/);
  assert.match(myPhotosSource, /data-my-photos-presentation-host=\{presentation\.host\}/);
  assert.match(myPhotosSource, /\[data-my-photos-presentation-host="gamma"\]/);
  assert.match(myPhotosSource, /data-my-photos-region="library-grid"/);
  assert.match(myPhotosSource, /data-my-photos-region="photo-card"/);
  assert.match(myPhotosSource, /data-my-photos-region="photo-thumb"/);
  assert.match(myPhotosSource, /data-my-photos-region="upload-area"/);
  assert.match(myPhotosSource, /\[data-my-photos-presentation-host="gamma"\][\s\S]*?background-image:\s*none/);
  assert.match(myPhotosSource, /\[data-my-photos-presentation-host="gamma"\][\s\S]*?box-shadow:\s*none/);
  assert.match(myPhotosSource, /\[data-my-photos-presentation-host="gamma"\][\s\S]*?border-radius:\s*6px/);
  assert.match(myPhotosSource, /#00d2ff/);
});

test("MyPhotos keeps media and token behavior on shared APIs", () => {
  assert.match(myPhotosSource, /api\.post\("\/api\/media\/import-token"/);
  assert.match(myPhotosSource, /api\.post\("\/api\/media\/upload"/);
  assert.match(myPhotosSource, /api\.delete\(`\/api\/media\/\$\{id\}`\)/);
  assert.match(myPhotosSource, /confirm\("Remove from library\?"\)/);
  assert.doesNotMatch(myPhotosSource, /presentationRouteHref/);
});
