import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const apps = ["spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"];

for (const app of apps) {
  test(`${app} serves its entry document at the root on Windows and POSIX`, () => {
    const source = readFileSync(`apps/${app}-desktop/src/main.cjs`, "utf8");
    const functionSource = source.match(/function safeStaticPath\(urlPath\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(functionSource, `${app} should expose its static request resolver`);
    const rootFunction = functionSource.match(/const root = (\w+)\(\);/)?.[1];
    assert.ok(rootFunction);

    for (const pathApi of [path.win32, path.posix]) {
      const root = pathApi.resolve("desktop", "assets");
      const resolve = vm.runInNewContext(`${functionSource}\nsafeStaticPath`, {
        path: pathApi,
        [rootFunction]: () => root,
      });
      assert.equal(resolve("/"), pathApi.join(root, "index.html"));
      assert.equal(resolve("/?native=1"), pathApi.join(root, "index.html"));
      assert.equal(resolve("/js/app.js"), pathApi.join(root, "js", "app.js"));
    }
  });
}
