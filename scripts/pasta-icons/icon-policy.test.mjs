import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

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
  ["gnocchi", "public/creation-tools/gnocchi/index.html"],
  ["ravioli", "public/creation-tools/ravioli/index.html"],
  ["rotini", "public/creation-tools/rotini/index.html"],
  ["penne", "public/creation-tools/penne/index.html"],
  ["lasagna", "public/creation-tools/lasagna/index.html"],
];
const portablePublisherApps = ["spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"];
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

function runPortableFavicon(runtime, app) {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) {
      nodes.set(id, {
        addEventListener() {},
        dataset: {},
        disabled: false,
        hidden: false,
        href: "",
        textContent: "",
        value: "",
      });
    }
    return nodes.get(id);
  };
  const document = { getElementById: node, title: "" };

  runInNewContext(runtime, {
    document,
    MD: { isAddress: () => false },
    URL,
    window: {
      PASTA_SITE_CONFIG: {
        app,
        contract: "",
        label: app,
        network: "mainnet",
        title: `${app} collector`,
        tokenId: 0,
      },
    },
  });

  return node("pastaFavicon").href;
}

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

test("Portable Pasta collectors derive the Sugo favicon from app config", () => {
  const canonicalHtml = readFileSync("scripts/pasta-protocol/site-kit/site.html", "utf8");
  const canonicalRuntime = readFileSync("scripts/pasta-protocol/site-kit/site.js", "utf8");

  assert.match(canonicalHtml, /id="pastaFavicon"[^>]+rel="icon"/);
  assert.match(canonicalRuntime, /PASTA_SUGO_FAVICONS\[config\.app\]/);
  assert.match(canonicalRuntime, /data:image\/svg\+xml/);

  for (const id of portablePublisherApps) {
    const sugoIcon = readFileSync(`public/pasta-icons/sugo/${id}.svg`, "utf8").trim();
    const vectorElements = sugoIcon.match(/<(?:rect|path|circle|ellipse)\b[^>]*\/>/g) || [];
    assert.ok(vectorElements.length > 2, `${id} Sugo icon should contain a distinctive vector drawing`);
    const faviconHref = runPortableFavicon(canonicalRuntime, id);
    assert.match(faviconHref, /^data:image\/svg\+xml,/);
    const renderedIcon = decodeURIComponent(faviconHref.slice("data:image/svg+xml,".length));
    for (const element of vectorElements) {
      assert.ok(renderedIcon.includes(element), `portable runtime should render ${id} Sugo vector ${element}`);
    }
    assert.equal(
      readFileSync(`public/creation-tools/${id}/site.html`, "utf8"),
      canonicalHtml,
      `${id} portable HTML should come from the canonical site kit`,
    );
    assert.equal(
      readFileSync(`public/creation-tools/${id}/js/site.js`, "utf8"),
      canonicalRuntime,
      `${id} portable runtime should come from the canonical site kit`,
    );
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
