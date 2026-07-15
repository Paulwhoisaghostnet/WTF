import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  checkDockerContext,
  findMissingDockerContextExclusions,
  parseDockerignore,
  REQUIRED_DOCKER_CONTEXT_EXCLUSIONS,
} from "./check-docker-context.mjs";

test("Docker context parser ignores comments, blanks, and negated includes", () => {
  assert.deepEqual(
    [...parseDockerignore("# comment\n\n.env\n!public/example.env\nnode_modules\n")],
    [".env", "node_modules"],
  );
});

test("Docker context policy reports every missing required exclusion", () => {
  const source = REQUIRED_DOCKER_CONTEXT_EXCLUSIONS.slice(2).join("\n");
  assert.deepEqual(findMissingDockerContextExclusions(source), [".git", ".github"]);
  assert.throws(() => checkDockerContext(source), /- \.git\n- \.github/u);
});

test("checked-in Docker context excludes secrets, tests, evidence, and local state", () => {
  const source = readFileSync(".dockerignore", "utf8");
  assert.equal(checkDockerContext(source), REQUIRED_DOCKER_CONTEXT_EXCLUSIONS.length);
});
