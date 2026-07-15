import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compose = readFileSync("docker-compose.yml", "utf8");
const mailCompose = readFileSync("infra/wtfos-mail/docker-compose.yml", "utf8");
const dockerfile = readFileSync("Dockerfile", "utf8");
const relayDockerfile = readFileSync("Dockerfile.relay", "utf8");
const dockerignore = readFileSync(".dockerignore", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

test("all checked-in container inputs are immutable", () => {
  const sources = [compose, mailCompose, dockerfile, relayDockerfile];
  for (const source of sources) {
    assert.doesNotMatch(source, /:latest(?:\s|$|})/m);
  }

  for (const source of [compose, mailCompose]) {
    for (const match of source.matchAll(/^\s*image:\s*([^\s#]+).*$/gm)) {
      assert.match(match[1], /@sha256:[0-9a-f]{64}$/, `mutable image input: ${match[1]}`);
    }
  }
  for (const source of [dockerfile, relayDockerfile]) {
    for (const match of source.matchAll(/^FROM\s+([^\s]+)(?:\s+AS\s+\S+)?$/gmi)) {
      assert.match(match[1], /@sha256:[0-9a-f]{64}$/, `mutable base image: ${match[1]}`);
    }
  }
});

test("the disconnected PLC placeholder is absent until a public immutable image exists", () => {
  assert.doesNotMatch(compose, /^\s{2}wtfos-plc:/m);
  assert.doesNotMatch(compose, /WTFOS_PLC_IMAGE/);
});

test("CycloneDX SBOM generation is reproducible and CI-addressable", () => {
  assert.equal(
    packageJson.scripts["security:sbom"],
    "cyclonedx-npm --output-file artifacts/sbom.cdx.json --output-format JSON --spec-version 1.6 --omit dev",
  );
  assert.equal(packageJson.devDependencies["@cyclonedx/cyclonedx-npm"], "6.0.0");
});

test("production build context excludes local evidence and test detritus", () => {
  for (const pattern of [
    ".agents",
    ".codex",
    "artifacts",
    "tests",
    "**/*.test.*",
    "**/*.spec.*",
    "test-results",
    "playwright-report",
    "e2e-puppets*.json",
    "*.puppet-credentials.json",
  ]) {
    assert.match(
      dockerignore,
      new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"),
      `${pattern} is not excluded from the production build context`,
    );
  }
});
