import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const entrypoint = readFileSync("docker-entrypoint.sh", "utf8");
const dockerfile = readFileSync("Dockerfile", "utf8");

test("Docker entrypoint repairs writable volume ownership once, then skips recursive chown", () => {
  assert.match(entrypoint, /OWNERSHIP_MARKER="\.node-owner-ok"/);
  assert.match(entrypoint, /marker="\$d\/\$OWNERSHIP_MARKER"/);
  assert.match(entrypoint, /dir_owner="\$\(stat -c '%u:%g' "\$d"/);
  assert.match(
    entrypoint,
    /if \[ "\$dir_owner" = "1000:1000" \] && \[ -f "\$marker" \]; then[\s\S]*continue[\s\S]*fi/
  );
  assert.match(entrypoint, /if chown -R node:node "\$d"/);
  assert.match(entrypoint, /touch "\$marker"/);
  assert.match(entrypoint, /chown node:node "\$marker"/);
});

test("Docker image pre-creates writable mount points with node ownership", () => {
  for (const dir of [
    "/app/cache",
    "/app/uploads",
    "/app/uploads-staging",
    "/app/tmp-processing",
    "/app/backups",
  ]) {
    assert.match(dockerfile, new RegExp(dir.replaceAll("/", "\\/")));
  }
  assert.match(dockerfile, /chown -R node:node \/app/);
  assert.match(dockerfile, /gosu/);
  assert.match(entrypoint, /gosu node "\$@"/);
});
