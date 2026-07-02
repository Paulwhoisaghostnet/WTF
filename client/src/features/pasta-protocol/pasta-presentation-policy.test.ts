import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const colanderSource = readFileSync("client/src/features/pasta-protocol/colander/ColanderApp.tsx", "utf8");
const frameSource = readFileSync("client/src/features/creation-tools/CreationToolFrame.tsx", "utf8");
const registrySource = readFileSync("client/src/features/creation-tools/tool-registry.ts", "utf8");

const PASTA_IFRAME_APPS = ["spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"] as const;

test("Pasta Protocol iframe publishers stay in the shared Gamma creation-tool wrapper", () => {
  for (const app of PASTA_IFRAME_APPS) {
    assert.match(registrySource, new RegExp(`id:\\s*"${app}"[\\s\\S]*?domain:\\s*"pasta-protocol"`));
    assert.match(registrySource, new RegExp(`routePath:\\s*"/tools/${app}"`));
    assert.match(registrySource, new RegExp(`src:\\s*"/creation-tools/${app}/index\\.html"`));
  }

  assert.match(frameSource, /data-creation-tool-surface="iframe-shell"/);
  assert.match(frameSource, /data-creation-tool-presentation-host=\{presentation\.host\}/);
  assert.match(frameSource, /data-tool-domain=\{tool\.domain\}/);
  assert.match(frameSource, /src=\{frameSrc\}/);
  assert.match(frameSource, /sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox"/);
});

test("Colander exposes Gamma presentation ownership and route-preserving handoffs", () => {
  assert.match(colanderSource, /usePresentationShell/);
  assert.match(colanderSource, /presentationRouteHref/);
  assert.match(colanderSource, /const presentation = usePresentationShell\(\)/);
  assert.match(colanderSource, /data-colander-surface="control-panel"/);
  assert.match(colanderSource, /data-colander-presentation-host=\{presentation\.host\}/);
  assert.match(colanderSource, /window\.open\(presentationRouteHref\(path,\s*presentation\.host\),\s*"_blank",\s*"noopener"\)/);
});

test("Colander marks the regions the Gamma harness measures", () => {
  for (const region of [
    "header",
    "brand",
    "wallet",
    "toolbar",
    "field",
    "input",
    "button",
    "primary-button",
    "empty",
    "status",
    "panel",
    "panel-header",
    "body",
    "scroll",
    "fact-row",
    "graph",
    "graph-node",
    "action-card",
    "action-form",
    "chip",
  ]) {
    assert.match(colanderSource, new RegExp(`colanderRegionAttrs\\("${region}"\\)`), `missing Colander marker: ${region}`);
  }
});

test("Colander Gamma chrome follows the presentation style budget", () => {
  assert.match(colanderSource, /\[data-colander-presentation-host="gamma"\]/);
  assert.match(colanderSource, /background:\s*#070706/);
  assert.match(colanderSource, /background:\s*#11110f/);
  assert.match(colanderSource, /color:\s*#f2ead9/);
  assert.match(colanderSource, /color:\s*#00d2ff/);
  assert.match(colanderSource, /#d6ff3f/);
  assert.match(colanderSource, /background-image:\s*none/);
  assert.match(colanderSource, /box-shadow:\s*none/);
  assert.match(colanderSource, /text-shadow:\s*none/);
  assert.match(colanderSource, /border-radius:\s*6px/);
  assert.match(colanderSource, /border:\s*1px solid rgba\(242,\s*234,\s*217,\s*0\.16\)/);
});

test("Pasta Protocol presentation work keeps shared contract wallet and event behavior raw", () => {
  for (const preserved of [
    "connectWallet",
    "getActiveAccount",
    "getTezos",
    "detectPastaContract",
    "availableActions",
    "colander.contract_opened",
    "colander.graph_viewed",
    "colander.handoff_opened",
    "colander.transfer_submitted",
    "colander.role_updated",
  ]) {
    assert.match(colanderSource, new RegExp(preserved.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(colanderSource, /\/api\/gamma/i, "Gamma must not introduce Colander presentation APIs");
  assert.doesNotMatch(colanderSource, /gamma\/api/i, "Gamma must not rewrite shared Pasta API paths");
  assert.doesNotMatch(frameSource, /\/api\/gamma/i, "Gamma must not introduce creation-tool presentation APIs");
  assert.doesNotMatch(registrySource, /gamma\/api/i, "Gamma must not rewrite Pasta static asset paths");
});
