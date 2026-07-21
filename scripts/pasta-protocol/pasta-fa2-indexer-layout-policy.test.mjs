import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const CANONICAL = "public/creation-tools/spaghetti/contract/pasta-standard-collection.contract.json";
const FA2_ARTIFACTS = [
  ["Macaroni V2", "public/creation-tools/macaroni/contract/macaroni-v2.contract.json"],
  ["Spaghetti", CANONICAL],
  ["Gnocchi", "public/creation-tools/gnocchi/contract/pasta-open-edition.contract.json"],
  ["Ravioli", "public/creation-tools/ravioli/contract/pasta-bundle.contract.json"],
  ["Rotini", "public/creation-tools/rotini/contract/pasta-generative-collection.contract.json"],
  ["Penne", "public/creation-tools/penne/contract/pasta-distribution.contract.json"],
];
const REQUIRED_FA2_ENTRYPOINTS = ["balance_of", "transfer", "update_operators"];

function readContract(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  assert.ok(Array.isArray(value), `${path} must contain Micheline contract code`);
  return value;
}

function parameterSchema(contract, path) {
  const parameter = contract.find((node) => node?.prim === "parameter");
  assert.ok(parameter?.args?.[0], `${path} is missing its parameter schema`);
  return parameter.args[0];
}

function findAnnotatedNodes(value, annotation, output = []) {
  if (Array.isArray(value)) {
    for (const entry of value) findAnnotatedNodes(entry, annotation, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value.annots) && value.annots.includes(annotation)) output.push(value);
  for (const entry of Object.values(value)) findAnnotatedNodes(entry, annotation, output);
  return output;
}

function entrypointSchema(contract, path, entrypoint) {
  const matches = findAnnotatedNodes(parameterSchema(contract, path), `%${entrypoint}`);
  assert.equal(matches.length, 1, `${path} must expose exactly one %${entrypoint} parameter branch`);
  return matches[0];
}

test("every token-producing Pasta artifact uses the canonical TZIP-12 FA2 parameter layouts", () => {
  const canonicalContract = readContract(CANONICAL);
  const canonicalSchemas = Object.fromEntries(
    REQUIRED_FA2_ENTRYPOINTS.map((entrypoint) => [
      entrypoint,
      entrypointSchema(canonicalContract, CANONICAL, entrypoint),
    ]),
  );

  for (const [app, path] of FA2_ARTIFACTS) {
    const contract = readContract(path);
    for (const entrypoint of REQUIRED_FA2_ENTRYPOINTS) {
      assert.deepEqual(
        entrypointSchema(contract, path, entrypoint),
        canonicalSchemas[entrypoint],
        `${app} ${entrypoint} layout drift would prevent strict FA2/indexer recognition`,
      );
    }
  }
});
