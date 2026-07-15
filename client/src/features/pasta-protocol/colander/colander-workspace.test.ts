import assert from "node:assert/strict";
import test from "node:test";
import {
  attachContract,
  COLANDER_PROJECT_SCHEMA,
  createPastaProject,
  parsePastaProjects,
  pastaToolHandoffPath,
  toolIdForContractKind,
} from "./colander-workspace";

test("Colander projects are portable, versioned, and recover safely", () => {
  const project = createPastaProject("Forever OE", "gnocchi", "shadownet");
  assert.equal(project.schema, COLANDER_PROJECT_SCHEMA);
  assert.equal(project.title, "Forever OE");
  assert.equal(project.toolId, "gnocchi");
  assert.deepEqual(project.artifacts, []);
  assert.deepEqual(parsePastaProjects(JSON.stringify(project)), [project]);
  assert.deepEqual(parsePastaProjects("not-json"), []);
});

test("older project manifests gain an empty artifact ledger on import", () => {
  const project = createPastaProject("Old project", "spaghetti", "mainnet");
  const { artifacts: _artifacts, ...legacy } = project;
  assert.deepEqual(parsePastaProjects(JSON.stringify(legacy))[0]?.artifacts, []);
});

test("attaching a contract advances the project without duplicates", () => {
  const project = createPastaProject("Recovered work", "spaghetti", "mainnet");
  const deployed = attachContract(project, "KT1Example");
  assert.equal(deployed.stage, "deployed");
  assert.deepEqual(deployed.contracts, ["KT1Example"]);
  assert.equal(attachContract(deployed, "KT1Example"), deployed);
});

test("tool handoffs carry durable Colander project context", () => {
  const project = attachContract(createPastaProject("Claim", "penne", "shadownet"), "KT1Example");
  const path = pastaToolHandoffPath("penne", project, "shadownet");
  assert.match(path, /^\/tools\/penne\?/);
  assert.match(path, /handoff=colander-workspace/);
  assert.match(path, new RegExp(`projectId=${project.id}`));
  assert.match(path, /contract=KT1Example/);
});

test("contract kinds recover into their matching owner apps", () => {
  assert.equal(toolIdForContractKind("open_edition_collection"), "gnocchi");
  assert.equal(toolIdForContractKind("bundle_collection"), "ravioli");
  assert.equal(toolIdForContractKind("distribution"), "penne");
  assert.equal(toolIdForContractKind("exhibition"), "lasagna");
  assert.equal(toolIdForContractKind("generic_fa2"), "spaghetti");
});
