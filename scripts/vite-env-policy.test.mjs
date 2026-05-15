import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

function read(path) {
  return readFileSync(path, "utf8");
}

function trackedEnvTemplates() {
  const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .map((path) => path.trim())
    .filter(Boolean);

  return tracked.filter((path) => {
    const name = basename(path);
    return (
      name === ".env.example" ||
      name === "wtf-app.env" ||
      name.endsWith(".env.example") ||
      name.endsWith(".env.sample") ||
      name.endsWith(".env.template")
    );
  });
}

test("WTF-BB-009 Vite env templates do not set production NODE_ENV", () => {
  const offenders = [];
  for (const file of trackedEnvTemplates()) {
    const lines = read(file).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/^\s*NODE_ENV\s*=\s*production\s*(?:#.*)?$/i.test(line)) {
        offenders.push(`${file}:${index + 1}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `Vite-readable env templates must not set NODE_ENV=production: ${offenders.join(", ")}`
  );
});

test("WTF-BB-009 runtime production mode stays outside Vite env templates", () => {
  assert.match(read("package.json"), /"start":\s*"NODE_ENV=production node dist\/index\.cjs"/);
  assert.match(read("Dockerfile"), /\nENV NODE_ENV=production\n/);
  assert.match(read("docker-compose.yml"), /\n\s+NODE_ENV: production\n/);
});

test("WTF-BB-009 local env files stay outside git and Docker build context", () => {
  const gitignore = read(".gitignore");
  const dockerignore = read(".dockerignore");

  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.match(dockerignore, /^\.env$/m);
  assert.match(dockerignore, /^\.env\.\*$/m);
});
