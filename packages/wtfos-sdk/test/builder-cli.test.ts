import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import {
  WTFOS_CLI_BUILDER_OBLIGATIONS,
  cliOpenHandlesForBrowserRoutes,
} from "../src/builder-cli.ts";

test("WTFOS_CLI_BUILDER_OBLIGATIONS references existing docs and kernel paths", () => {
  for (const docPath of WTFOS_CLI_BUILDER_OBLIGATIONS.documentation) {
    assert.equal(existsSync(docPath), true, `missing doc: ${docPath}`);
  }
  for (const item of WTFOS_CLI_BUILDER_OBLIGATIONS.checklist) {
    for (const path of item.paths) {
      assert.equal(existsSync(path), true, `${item.id} missing path: ${path}`);
    }
  }
  assert.equal(existsSync(WTFOS_CLI_BUILDER_OBLIGATIONS.nativeCliPackage), true);
});

test("cliOpenHandlesForBrowserRoutes builds open handles for static routes", () => {
  assert.deepEqual(cliOpenHandlesForBrowserRoutes(["/crp-nominate", "/rounds/:id"]), [
    "open /crp-nominate",
  ]);
});
