import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const apps = [
  "pasta-suite",
  "ch-ease",
  "macaroni",
  "spaghetti",
  "gnocchi",
  "ravioli",
  "rotini",
  "penne",
  "lasagna",
];
const palettes = ["sugo", "night-market", "paper-archive"];
const staticPages = [
  ["ch-ease", "public/creation-tools/ch-ease/index.html"],
  ["macaroni", "public/creation-tools/macaroni/index.html"],
  ["macaroni", "public/creation-tools/macaroni/studio.html"],
  ["macaroni", "public/creation-tools/macaroni/drop.html"],
  ["spaghetti", "public/creation-tools/spaghetti/index.html"],
  ["spaghetti", "public/creation-tools/spaghetti/site.html"],
  ["gnocchi", "public/creation-tools/gnocchi/index.html"],
  ["gnocchi", "public/creation-tools/gnocchi/site.html"],
  ["ravioli", "public/creation-tools/ravioli/index.html"],
  ["ravioli", "public/creation-tools/ravioli/site.html"],
  ["rotini", "public/creation-tools/rotini/index.html"],
  ["rotini", "public/creation-tools/rotini/site.html"],
  ["penne", "public/creation-tools/penne/index.html"],
  ["penne", "public/creation-tools/penne/site.html"],
  ["lasagna", "public/creation-tools/lasagna/index.html"],
  ["lasagna", "public/creation-tools/lasagna/site.html"],
];
const nativeRoots = {
  "pasta-suite": "apps/pasta-suite-desktop/pasta",
  "ch-ease": "apps/ch-ease-desktop/pasta",
  macaroni: "apps/macaroni-desktop/macaroni",
  spaghetti: "apps/spaghetti-desktop/spaghetti",
  gnocchi: "apps/gnocchi-desktop/gnocchi",
  ravioli: "apps/ravioli-desktop/ravioli",
  rotini: "apps/rotini-desktop/rotini",
  penne: "apps/penne-desktop/penne",
  lasagna: "apps/lasagna-desktop/lasagna",
};

test("Pasta icon manifest contains the active set and review palettes", () => {
  const manifest = JSON.parse(readFileSync("public/pasta-icons/manifest.json", "utf8"));
  assert.equal(manifest.activePalette, "sugo");
  assert.deepEqual(Object.keys(manifest.palettes).sort(), [...palettes].sort());
  assert.deepEqual(Object.keys(manifest.apps).sort(), [...apps].sort());
  for (const id of apps) {
    assert.equal(manifest.apps[id].favicon, `/pasta-icons/sugo/${id}.svg`);
    assert.deepEqual(Object.keys(manifest.apps[id].options).sort(), [...palettes].sort());
  }
});

test("Every palette has a vector icon for every Pasta app", () => {
  for (const palette of palettes) {
    for (const id of apps) {
      const asset = `public/pasta-icons/${palette}/${id}.svg`;
      assert.ok(existsSync(asset), `${asset} should exist`);
      assert.match(readFileSync(asset, "utf8"), /^<\?xml[\s\S]*<svg /);
    }
  }
});

test("Static Pasta pages point at their matching Sugo favicon", () => {
  for (const [id, page] of staticPages) {
    const source = readFileSync(page, "utf8");
    assert.match(source, new RegExp(`rel="icon"[^>]+${id}\\.svg`), `${page} should use ${id} favicon`);
  }
});

test("Electron packages use the canonical Sugo PNG and ICO assets", () => {
  for (const id of apps) {
    const packageJson = JSON.parse(readFileSync(`apps/${id}-desktop/package.json`, "utf8"));
    assert.equal(packageJson.build.directories.buildResources, "build", `${id} build resources should be explicit`);
    assert.equal(packageJson.build.mac.icon, "build/icon.png", `${id} mac icon should use the canonical PNG`);
    assert.equal(packageJson.build.win.icon, "build/icon.ico", `${id} Windows icon should use the ICO`);
    assert.equal(packageJson.build.linux.icon, "build/icon.png", `${id} Linux icon should use the PNG`);
    assert.equal(packageJson.build.nsis.installerIcon, "build/icon.ico", `${id} NSIS installer icon should use the ICO`);
    for (const extension of ["svg", "png", "ico"]) {
      const asset = `apps/${id}-desktop/build/icon.${extension}`;
      assert.ok(existsSync(asset), `${asset} should exist`);
      assert.ok(statSync(asset).size > 0, `${asset} should not be empty`);
    }
    const preparedFavicon = `${nativeRoots[id]}/pasta-icons/sugo/${id}.svg`;
    assert.ok(existsSync(preparedFavicon), `${preparedFavicon} should be copied into the native bundle`);
  }
});
