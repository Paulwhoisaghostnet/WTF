import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../..");
const source = path.join(directory, "HorfRoomsV3.py");
const test = path.join(directory, "test_rooms_v3.py");
const artifacts = path.join(directory, "artifacts");
const wrapper = process.env.SMARTPY_BIN || path.join(root, "scripts/smartpy-cli-wrapper.sh");
const environment = { ...process.env, SMARTPY_PYTHON: process.env.SMARTPY_PYTHON || "python3" };
const temporary = mkdtempSync(path.join(tmpdir(), "horf-rooms-v3-"));

function run(command, args) {
  execFileSync(command, args, { cwd: root, env: environment, stdio: "inherit" });
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function artifact(directoryName, suffix) {
  const files = readdirSync(directoryName).filter((file) => file.endsWith(suffix));
  assert.equal(files.length, 1, `Expected exactly one ${suffix} in ${directoryName}`);
  return path.join(directoryName, files[0]);
}

try {
  const installed = execFileSync(environment.SMARTPY_PYTHON, [
    "-c", "import importlib.metadata; print(importlib.metadata.version('smartpy-tezos'))",
  ], { cwd: root, env: environment, encoding: "utf8" }).trim();
  assert.equal(installed, "0.24.1", "Use contracts/horf-rooms-v3/requirements.txt");
  run(wrapper, ["test", test, path.join(temporary, "tests"), "--purge"]);
  run(wrapper, ["compile", source, path.join(temporary, "compile"), "--purge"]);
  const scenario = path.join(temporary, "compile", "deploy_horf_rooms_v3_template");
  run(process.execPath, [path.join(root, "scripts/pasta-protocol/check-smartpy-origination-size.mjs"), scenario]);
  const contractJson = artifact(scenario, "_contract.json");
  const contractTz = artifact(scenario, "_contract.tz");
  const storageFixture = artifact(scenario, "_storage.json");
  const compiled = JSON.parse(readFileSync(contractJson, "utf8"));
  assert.ok(Array.isArray(compiled) && compiled.some((item) => item.prim === "parameter") &&
    compiled.some((item) => item.prim === "storage"), "SmartPy did not emit a Michelson contract");
  mkdirSync(artifacts, { recursive: true });
  copyFileSync(contractJson, path.join(artifacts, "contract.json"));
  copyFileSync(contractTz, path.join(artifacts, "contract.tz"));
  copyFileSync(storageFixture, path.join(artifacts, "storage.fixture.json"));
  writeFileSync(path.join(artifacts, "build-manifest.json"), JSON.stringify({
    chain: "tezos-l1",
    network: "mainnet",
    protocol: "tallinn",
    smartpy: "0.24.1",
    sourceSha256: sha256(source),
    contractJsonSha256: sha256(contractJson),
    contractTzSha256: sha256(contractTz),
    storageFixtureSha256: sha256(storageFixture),
    storage: "storage.fixture.json contains public test-account identifiers and is not deployable configuration.",
  }, null, 2) + "\n");
  console.log(`HORF Rooms V3 tests passed; compiled Michelson is in ${artifacts}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
