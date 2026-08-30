import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { CREATION_TOOLS } from "./tool-registry";

const frameSource = readFileSync("client/src/features/creation-tools/CreationToolFrame.tsx", "utf8");

test("creation tool iframe shell is presentation-host aware", () => {
  assert.match(frameSource, /usePresentationShell/);
  assert.match(frameSource, /data-creation-tool-surface="iframe-shell"/);
  assert.match(frameSource, /data-creation-tool-presentation-host=\{presentation\.host\}/);
  assert.match(frameSource, /data-creation-tool-id=\{tool\.id\}/);
  assert.match(frameSource, /data-creation-tool-region="header"/);
  assert.match(frameSource, /data-creation-tool-region="title-block"/);
  assert.match(frameSource, /data-creation-tool-region="iframe"/);
});

test("creation tool Gamma shell overrides wrapper chrome without changing iframe apps", () => {
  assert.match(frameSource, /\[data-creation-tool-presentation-host="gamma"\]/);
  assert.match(frameSource, /\[data-creation-tool-presentation-host="gamma"\][\s\S]*?background-image:\s*none/);
  assert.match(frameSource, /\[data-creation-tool-presentation-host="gamma"\][\s\S]*?box-shadow:\s*none/);
  assert.match(frameSource, /\[data-creation-tool-presentation-host="gamma"\][\s\S]*?border-radius:\s*6px/);
  assert.match(frameSource, /src=\{frameSrc\}/);
  assert.match(frameSource, /sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox"/);
});

test("creation tool iframe receives route query context for package handoffs", () => {
  assert.match(frameSource, /const routeSearch = typeof window !== "undefined" \? window\.location\.search : ""/);
  assert.match(frameSource, /routeSearch\s*\?\s*`\$\{tool\.src\}\$\{tool\.src\.includes\("\?"\) \? "&" : "\?"\}\$\{routeSearch\.slice\(1\)\}`/);
  assert.doesNotMatch(frameSource, /tool\.id === "macaroni"/);
});

test("creation tool presentation shell keeps shared static and external behavior raw", () => {
  assert.doesNotMatch(frameSource, /\/api\/gamma/);
  assert.doesNotMatch(frameSource, /presentationRouteHref/);
  assert.match(frameSource, /target="_blank"/);
  assert.match(frameSource, /rel="noopener noreferrer"/);
});

test("the outcome-led catalog names all sixteen tools and an honest export before launch", () => {
  assert.equal(CREATION_TOOLS.length, 16);
  assert.equal(new Set(CREATION_TOOLS.map((tool) => tool.id)).size, 16);
  for (const tool of CREATION_TOOLS) {
    assert.ok(tool.makes.trim(), `${tool.id} must describe what it makes`);
    assert.ok(tool.exportDestinations.length > 0, `${tool.id} must declare an export`);
    assert.ok(tool.exportDestinations.every((destination) => destination.trim()), `${tool.id} has an empty export label`);
  }
});
