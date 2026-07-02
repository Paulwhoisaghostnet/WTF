import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mapLabSource = readFileSync(new URL("./WtfMapLab.tsx", import.meta.url), "utf8");

test("Map Lab workspace exposes Gamma presentation ownership without forking graph logic", () => {
  assert.match(mapLabSource, /usePresentationShell/);
  assert.match(mapLabSource, /const presentation = usePresentationShell\(\)/);
  assert.match(mapLabSource, /data-map-lab-surface="workspace"/);
  assert.match(mapLabSource, /data-map-lab-presentation-host=\{presentation\.host\}/);
  assert.match(mapLabSource, /data-map-lab-shell="true"/);
  assert.match(mapLabSource, /data-map-lab-mode=\{mapMode\}/);
  assert.match(mapLabSource, /data-map-lab-readonly=\{isDemoMap \? "true" : "false"\}/);
});

test("Map Lab marks the graph regions the Gamma harness measures", () => {
  for (const region of [
    "surface",
    "panel",
    "workspace",
    "toolbar",
    "viewport",
    "board",
    "wire-svg",
    "route-path",
    "node-card",
    "port",
    "template-button",
    "route-list-item",
    "run-metric",
    "minimap",
    "pending-badge",
    "status-pill",
  ]) {
    assert.match(
      mapLabSource,
      new RegExp(`data-map-lab-region": "${region}"|data-map-lab-region="${region}"|mapLabRegionAttrs\\("${region}"\\)`),
      `missing Map Lab region marker: ${region}`
    );
  }
});

test("Map Lab Gamma chrome follows the presentation style budget", () => {
  assert.match(mapLabSource, /\[data-map-lab-presentation-host="gamma"\]/);
  assert.match(mapLabSource, /background:\s*#070706/);
  assert.match(mapLabSource, /background:\s*#11110f\s*!important/);
  assert.match(mapLabSource, /color:\s*#f2ead9/);
  assert.match(mapLabSource, /color:\s*#00d2ff/);
  assert.match(mapLabSource, /color:\s*#d6ff3f/);
  assert.match(mapLabSource, /background-image:\s*none\s*!important/);
  assert.match(mapLabSource, /box-shadow:\s*none\s*!important/);
  assert.match(mapLabSource, /text-shadow:\s*none\s*!important/);
  assert.match(mapLabSource, /filter:\s*none\s*!important/);
  assert.match(mapLabSource, /border-radius:\s*6px\s*!important/);
  assert.match(mapLabSource, /border:\s*1px solid rgba\(242,\s*234,\s*217,\s*0\.16\)\s*!important/);
});

test("Map Lab keeps shared storage, route, graph, and event behavior raw", () => {
  for (const preserved of [
    "wtfos.map-lab.repo-draft.v1",
    "map_lab.viewed",
    "map_lab.demo.opened",
    "map_lab.node.created",
    "map_lab.node.moved",
    "map_lab.wire.created",
    "map_lab.route.created",
    "map_lab.pipeline.ran",
    "map_lab.ingest.previewed",
    "map_lab.repo.saved",
    "map_lab.repo.restored",
    "map_lab.viewport.changed",
    "WTFOS_DEMO_DOC",
    "SEED_DOC",
    "portsCompatible",
    "routePath",
  ]) {
    assert.match(mapLabSource, new RegExp(preserved.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(mapLabSource, /\/api\/gamma/i, "Gamma must not introduce Map Lab presentation APIs");
  assert.doesNotMatch(mapLabSource, /gamma\/api/i, "Gamma must not rewrite shared API paths");
});
