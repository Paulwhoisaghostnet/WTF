#!/usr/bin/env node

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appDir, "../..");
const sourceRoot = path.join(repoRoot, "public/creation-tools");
const outDir = path.join(appDir, "pasta");
const outToolsDir = path.join(outDir, "creation-tools");

const tools = [
  {
    id: "macaroni",
    title: "Macaroni",
    summary: "Blind-mint drop studio and exported mint-site builder.",
    entry: "/creation-tools/macaroni/studio.html",
    required: [
      "studio.html",
      "drop.html",
      "css/theme.css",
      "js/common.js",
      "js/studio.js",
      "js/drop.js",
      "vendor/tezos.js",
      "vendor/octez-connect.js",
      "contract/mydrop.contract.json",
    ],
  },
  {
    id: "spaghetti",
    title: "Spaghetti",
    summary: "Standard collection and token-product publisher.",
    entry: "/creation-tools/spaghetti/index.html",
    required: [
      "index.html",
      "css/theme.css",
      "js/common.js",
      "js/studio.js",
      "js/pasta-foundation.js",
      "vendor/tezos.js",
      "vendor/octez-connect.js",
      "contract/pasta-standard-collection.contract.json",
    ],
  },
  {
    id: "gnocchi",
    title: "Gnocchi",
    summary: "Open-edition publisher with timed, capped, and curve pricing.",
    entry: "/creation-tools/gnocchi/index.html",
    required: [
      "index.html",
      "css/theme.css",
      "js/common.js",
      "js/studio.js",
      "js/pasta-foundation.js",
      "vendor/tezos.js",
      "vendor/octez-connect.js",
      "contract/pasta-open-edition.contract.json",
    ],
  },
  {
    id: "ravioli",
    title: "Ravioli",
    summary: "Bundle, mystery, redeemable, and wrapped-set publisher.",
    entry: "/creation-tools/ravioli/index.html",
    required: [
      "index.html",
      "css/theme.css",
      "js/common.js",
      "js/studio.js",
      "js/pasta-foundation.js",
      "vendor/tezos.js",
      "vendor/octez-connect.js",
      "contract/pasta-bundle.contract.json",
    ],
  },
  {
    id: "rotini",
    title: "Rotini",
    summary: "Generative edition builder and standard-collection handoff.",
    entry: "/creation-tools/rotini/index.html",
    required: [
      "index.html",
      "css/theme.css",
      "js/common.js",
      "js/studio.js",
      "js/pasta-foundation.js",
      "vendor/tezos.js",
      "vendor/octez-connect.js",
      "contract/pasta-standard-collection.contract.json",
    ],
  },
  {
    id: "penne",
    title: "Penne",
    summary: "Airdrop, split, claim, and allocation distribution publisher.",
    entry: "/creation-tools/penne/index.html",
    required: [
      "index.html",
      "css/theme.css",
      "js/common.js",
      "js/studio.js",
      "js/pasta-foundation.js",
      "vendor/tezos.js",
      "vendor/octez-connect.js",
      "contract/pasta-distribution.contract.json",
    ],
  },
  {
    id: "lasagna",
    title: "Lasagna",
    summary: "Curated exhibition and revision-registry publisher.",
    entry: "/creation-tools/lasagna/index.html",
    required: [
      "index.html",
      "css/theme.css",
      "js/common.js",
      "js/studio.js",
      "js/pasta-foundation.js",
      "vendor/tezos.js",
      "vendor/octez-connect.js",
      "contract/pasta-exhibition.contract.json",
    ],
  },
];

if (!existsSync(sourceRoot)) {
  console.error(`Pasta source assets not found: ${sourceRoot}`);
  process.exit(1);
}

for (const tool of tools) {
  const sourceDir = path.join(sourceRoot, tool.id);
  if (!existsSync(sourceDir)) {
    console.error(`Pasta suite source tool not found: ${tool.id}`);
    process.exit(1);
  }
  for (const rel of tool.required) {
    const target = path.join(sourceDir, rel);
    if (!existsSync(target) || statSync(target).size === 0) {
      console.error(`Missing Pasta suite asset for ${tool.id}: ${rel}`);
      process.exit(1);
    }
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outToolsDir, { recursive: true });

for (const tool of tools) {
  const sourceDir = path.join(sourceRoot, tool.id);
  const targetDir = path.join(outToolsDir, tool.id);
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    const from = path.join(sourceDir, entry);
    const to = path.join(targetDir, entry);
    const stats = statSync(from);
    if (stats.isDirectory()) cpSync(from, to, { recursive: true });
    else if (stats.isFile()) copyFileSync(from, to);
  }
}

writeFileSync(path.join(outDir, "index.html"), suiteIndexHtml(), "utf8");
writeFileSync(path.join(outDir, "suite-manifest.json"), JSON.stringify({ version: "1.0.0", tools }, null, 2), "utf8");

console.log(`Prepared Pasta suite assets in ${path.relative(repoRoot, outDir)}`);

function suiteIndexHtml() {
  const cards = tools
    .map(
      (tool) => `
        <a class="tool-card" href="${tool.entry}">
          <span>${tool.title}</span>
          <small>${tool.summary}</small>
        </a>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pasta Suite</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #111315;
        --panel: #1b1f23;
        --line: #3e454c;
        --ink: #f6f3e8;
        --muted: #b8c2ca;
        --accent: #4fd6a7;
        --accent-2: #f1c15d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: var(--bg);
        color: var(--ink);
      }
      main {
        width: min(1180px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 34px 0 42px;
      }
      header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 20px;
        align-items: end;
        padding-bottom: 18px;
        border-bottom: 1px solid var(--line);
      }
      h1 {
        margin: 0;
        font-size: clamp(34px, 7vw, 76px);
        line-height: .9;
        letter-spacing: 0;
      }
      p {
        max-width: 740px;
        color: var(--muted);
        font-size: 16px;
        line-height: 1.55;
      }
      .badge {
        border: 1px solid var(--line);
        padding: 8px 10px;
        color: var(--accent-2);
        font-size: 13px;
        text-transform: uppercase;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
        gap: 12px;
        margin-top: 22px;
      }
      .tool-card {
        min-height: 150px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 24px;
        padding: 18px;
        border: 1px solid var(--line);
        background: var(--panel);
        color: var(--ink);
        text-decoration: none;
      }
      .tool-card:hover,
      .tool-card:focus-visible {
        border-color: var(--accent);
        outline: none;
      }
      .tool-card span {
        font-size: 22px;
        font-weight: 800;
      }
      .tool-card small {
        color: var(--muted);
        font-size: 14px;
        line-height: 1.45;
      }
      .note {
        margin-top: 22px;
        border-top: 1px solid var(--line);
        padding-top: 16px;
        color: var(--muted);
      }
      @media (max-width: 720px) {
        header { grid-template-columns: 1fr; }
        .badge { width: fit-content; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Pasta Suite</h1>
          <p>Local-first Tezos publishing tools bundled as one desktop app. Use Shadownet for rehearsal, bring your own Pinata or IPFS node for standalone pinning, and keep wtfOS-hosted services on wtfos.app.</p>
        </div>
        <div class="badge">Native bundle</div>
      </header>
      <section class="grid" aria-label="Pasta tools">${cards}
      </section>
      <p class="note">The suite preserves production-style <code>/creation-tools/&lt;tool&gt;</code> paths so wallet and RPC code runs with the same assumptions as wtfOS. Hosted wtfOS pinning, publishing, and authenticated package records are intentionally disabled in this desktop bundle.</p>
    </main>
  </body>
</html>
`;
}
