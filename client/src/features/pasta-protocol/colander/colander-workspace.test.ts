import assert from "node:assert/strict";
import test from "node:test";
import {
  attachContract,
  archivePastaProject,
  COLANDER_PROJECT_SCHEMA,
  createPastaProject,
  duplicatePastaProject,
  forgetPastaProjectArtifact,
  parsePastaProjects,
  pastaToolHandoffPath,
  renamePastaProject,
  restorePastaProject,
  toolIdForContractKind,
} from "./colander-workspace";

test("Colander projects are portable, versioned, and recover safely", () => {
  const project = createPastaProject("Forever OE", "gnocchi", "shadownet");
  assert.equal(project.schema, COLANDER_PROJECT_SCHEMA);
  assert.equal(project.title, "Forever OE");
  assert.equal(project.toolId, "gnocchi");
  assert.deepEqual(project.artifacts, []);
  assert.deepEqual(project.drafts, []);
  assert.deepEqual(project.contractRecords, []);
  assert.deepEqual(parsePastaProjects(JSON.stringify(project)), [project]);
  assert.deepEqual(parsePastaProjects("not-json"), []);
});

test("Colander project lifecycle is reversible until deliberate deletion", () => {
  const project = attachContract(createPastaProject("Forever OE", "gnocchi", "shadownet"), "KT1Example");
  const renamed = renamePastaProject(project, "Forever OE release");
  assert.equal(renamed.title, "Forever OE release");
  const archived = archivePastaProject(renamed);
  assert.equal(archived.stage, "archived");
  assert.equal(archived.archivedFromStage, "deployed");
  const restored = restorePastaProject(archived);
  assert.equal(restored.stage, "deployed");
  assert.equal(restored.archivedFromStage, undefined);
  assert.deepEqual(restored.contracts, ["KT1Example"]);
});

test("duplicating starts an independent project without sharing lifecycle ledgers", () => {
  const source = attachContract(createPastaProject("Fixed sale", "spaghetti", "mainnet"), "KT1Example");
  source.drafts.push({ schema: "pasta-studio-draft-ref@1", toolId: "spaghetti", storageKey: "source-draft", savedAt: new Date().toISOString(), summary: "Source" });
  const copy = duplicatePastaProject(source);
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.title, "Fixed sale copy");
  assert.equal(copy.stage, "planning");
  assert.deepEqual(copy.contracts, []);
  assert.deepEqual(copy.contractRecords, []);
  assert.deepEqual(copy.drafts, []);
  assert.deepEqual(copy.artifacts, []);
});

test("legacy archived projects infer a safe restore stage", () => {
  const prepared = createPastaProject("Prepared", "ch-ease", "mainnet");
  const legacy = { ...prepared, stage: "archived" as const };
  assert.equal(restorePastaProject(legacy).stage, "preparing");
  const deployed = { ...legacy, toolId: "gnocchi" as const, contracts: ["KT1Example"] };
  assert.equal(restorePastaProject(deployed).stage, "deployed");
});

test("Colander forgets only the selected site record and sanitizes imported local URLs", () => {
  const project = createPastaProject("Sites", "gnocchi", "mainnet");
  const now = new Date().toISOString();
  project.artifacts = [
    { id: "safe", kind: "self_hosted_site", toolId: "gnocchi", contract: "KT1Example", fileName: "gnocchi-site.zip", localUrl: "/sites/gnocchi-safe/", createdAt: now },
    { id: "unsafe", kind: "self_hosted_site", toolId: "gnocchi", contract: "KT1Example", fileName: "unsafe.zip", localUrl: "https://evil.example/", createdAt: now },
  ];
  const imported = parsePastaProjects(JSON.stringify(project))[0];
  assert.equal(imported?.artifacts[0].localUrl, "/sites/gnocchi-safe/");
  assert.equal(imported?.artifacts[1].localUrl, undefined);
  const forgotten = forgetPastaProjectArtifact(imported!, "safe");
  assert.deepEqual(forgotten.artifacts.map((artifact) => artifact.id), ["unsafe"]);
  assert.equal(forgetPastaProjectArtifact(forgotten, "missing"), forgotten);
});

test("older project manifests gain empty artifact and draft ledgers on import", () => {
  const project = createPastaProject("Old project", "spaghetti", "mainnet");
  const { artifacts: _artifacts, drafts: _drafts, contractRecords: _contractRecords, ...legacy } = project;
  assert.deepEqual(parsePastaProjects(JSON.stringify(legacy))[0]?.artifacts, []);
  assert.deepEqual(parsePastaProjects(JSON.stringify(legacy))[0]?.drafts, []);
  assert.deepEqual(parsePastaProjects(JSON.stringify(legacy))[0]?.contractRecords, []);
});

test("import drops malformed structured contract references", () => {
  const project = createPastaProject("Imported project", "spaghetti", "mainnet");
  const imported = parsePastaProjects(JSON.stringify({
    ...project,
    contractRecords: [{ schema: "pasta-contract-ref@1", address: "not-a-contract", toolId: "unknown" }],
  }))[0];
  assert.deepEqual(imported?.contractRecords, []);
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
  assert.match(pastaToolHandoffPath("penne", project, "shadownet", "KT1Override"), /contract=KT1Override/);
});

test("contract kinds recover into their matching owner apps", () => {
  assert.equal(toolIdForContractKind("blind_mint_collection"), "macaroni");
  assert.equal(toolIdForContractKind("open_edition_collection"), "gnocchi");
  assert.equal(toolIdForContractKind("bundle_collection"), "ravioli");
  assert.equal(toolIdForContractKind("generative_collection"), "rotini");
  assert.equal(toolIdForContractKind("distribution"), "penne");
  assert.equal(toolIdForContractKind("exhibition"), "lasagna");
  assert.equal(toolIdForContractKind("generic_fa2"), "spaghetti");
});
