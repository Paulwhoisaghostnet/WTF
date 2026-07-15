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
      "site.html",
      "css/site.css",
      "js/site.js",
      "js/site-bundle.js",
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
      "site.html",
      "css/site.css",
      "js/site.js",
      "js/site-bundle.js",
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
      "site.html",
      "css/site.css",
      "js/site.js",
      "js/site-bundle.js",
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
      "site.html",
      "css/site.css",
      "js/site.js",
      "js/site-bundle.js",
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
      "site.html",
      "css/site.css",
      "js/site.js",
      "js/site-bundle.js",
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
      "site.html",
      "css/site.css",
      "js/site.js",
      "js/site-bundle.js",
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
        <article class="tool-card" data-tool="${tool.id}" data-entry="${tool.entry}">
          <span>${tool.title}</span>
          <small>${tool.summary}</small>
          <button type="button">Start with ${tool.title} ↗</button>
        </article>`,
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
      .workspace {
        display: grid;
        grid-template-columns: minmax(220px, 290px) minmax(0, 1fr);
        gap: 18px;
        margin-top: 22px;
      }
      .projects {
        display: grid;
        align-content: start;
        gap: 10px;
        padding-right: 18px;
        border-right: 1px solid var(--line);
      }
      label { display: grid; gap: 5px; color: var(--muted); font-size: 13px; }
      input, select, button {
        min-height: 38px;
        border: 1px solid var(--line);
        background: #111315;
        color: var(--ink);
        padding: 7px 9px;
        font: inherit;
      }
      button { cursor: pointer; }
      button:hover, button:focus-visible { border-color: var(--accent); outline: none; }
      #project-list { display: grid; gap: 6px; max-height: 320px; overflow: auto; }
      .project { text-align: left; display: grid; gap: 2px; }
      .project[aria-current="true"] { border-left: 4px solid var(--accent); }
      .project small { color: var(--muted); }
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
      .tool-card button { width: 100%; color: var(--accent); }
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
      .manager {
        margin-top: 22px;
        padding: 18px;
        border: 1px solid var(--line);
        background: var(--panel);
      }
      .manager-head, .manager-row, .action-fields { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
      .manager-head { justify-content: space-between; align-items: center; }
      .manager-row { margin-top: 14px; }
      .manager-row label { flex: 1 1 180px; }
      #contract-address { flex: 2 1 320px; }
      #contract-facts { margin: 14px 0 0; color: var(--muted); white-space: pre-wrap; }
      #contract-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px; margin-top: 14px; }
      #local-sites { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-top: 14px; }
      .local-site { display: grid; gap: 7px; border: 1px solid var(--line); padding: 12px; }
      .local-site small { color: var(--muted); overflow-wrap: anywhere; }
      .local-site button { color: var(--accent); }
      .contract-action { border: 1px solid var(--line); padding: 12px; }
      .contract-action h3 { margin: 0 0 8px; font-size: 16px; }
      .action-fields label { flex: 1 1 130px; }
      .action-fields input, .action-fields select { width: 100%; }
      .contract-action button { width: 100%; margin-top: 10px; color: var(--accent); }
      @media (max-width: 720px) {
        header { grid-template-columns: 1fr; }
        .workspace { grid-template-columns: 1fr; }
        .projects { padding-right: 0; border-right: 0; }
        .badge { width: fit-content; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Colander</h1>
          <p>Your local-first Pasta Protocol workspace. Keep projects and deployed contracts on your computer, then open the specialized tool that owns each publishing job.</p>
        </div>
        <div class="badge">Native bundle</div>
      </header>
      <section class="workspace" aria-label="Colander project workspace">
        <aside class="projects">
          <label>Project name <input id="project-title" placeholder="My next release" /></label>
          <label>Starting workflow <select id="project-tool">${tools.map((tool) => `<option value="${tool.id}">${tool.title}</option>`).join("")}</select></label>
          <button id="create-project" type="button">Create project</button>
          <button id="export-project" type="button">Export active manifest</button>
          <label>Import manifest <input id="import-project" type="file" accept="application/json,.json" /></label>
          <div id="project-list"><small>No projects yet.</small></div>
        </aside>
        <section class="grid" aria-label="Pasta tools">${cards}
        </section>
      </section>
      <section class="manager" aria-label="Colander contract manager">
        <div class="manager-head">
          <div><h2>Contract manager</h2><small>Read and control Pasta contracts directly from this computer.</small></div>
          <button id="connect-wallet" type="button">Connect wallet</button>
        </div>
        <div class="manager-row">
          <label>Network <select id="contract-network"><option value="mainnet">Mainnet</option><option value="shadownet">Shadownet</option></select></label>
          <label id="contract-address">Contract address <input id="contract-kt" placeholder="KT1…" /></label>
          <button id="open-contract" type="button">Open contract</button>
        </div>
        <pre id="contract-facts" role="status" aria-live="polite">Open a KT1 contract to detect its Pasta features.</pre>
        <div id="contract-actions"></div>
      </section>
      <section class="manager" aria-label="Self-hosted pages">
        <div class="manager-head">
          <div><h2>Self-hosted pages</h2><small>Pages exported by a bundled Pasta app are installed here and served only from this computer.</small></div>
          <button id="refresh-sites" type="button">Refresh pages</button>
        </div>
        <div id="local-sites" aria-live="polite"><small>No locally installed pages yet. Export one from a Pasta app to inject it here.</small></div>
      </section>
      <p class="note" id="suite-status">The suite preserves production-style <code>/creation-tools/&lt;tool&gt;</code> paths so wallet and RPC code runs with the same assumptions as wtfOS. Hosted wtfOS pinning, publishing, and authenticated package records are intentionally disabled in this desktop bundle.</p>
    </main>
    <script src="/creation-tools/spaghetti/vendor/tezos.js"></script>
    <script src="/creation-tools/spaghetti/vendor/octez-connect.js"></script>
    <script src="/creation-tools/spaghetti/js/octez-wallet.js"></script>
    <script src="/creation-tools/spaghetti/js/common.js"></script>
    <script>
      (() => {
        const KEY = "wtfos.pasta.colander.workspace.v1";
        const SCHEMA = "pasta-project@1";
        let projects = [];
        let activeId = "";
        try { projects = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (_) { projects = []; }
        const byId = (id) => document.getElementById(id);
        let openedContract = null;
        let openedEntrypoints = new Set();
        let walletAddress = "";
        const save = () => localStorage.setItem(KEY, JSON.stringify(projects));
        const active = () => projects.find((project) => project.id === activeId) || projects[0];
        function render() {
          const list = byId("project-list");
          list.innerHTML = "";
          if (!projects.length) list.innerHTML = "<small>No projects yet.</small>";
          projects.forEach((project) => {
            const button = document.createElement("button");
            button.className = "project";
            button.setAttribute("aria-current", String(project.id === active()?.id));
            button.innerHTML = "<strong>" + project.title.replace(/[<>&]/g, "") + "</strong><small>" + project.stage + " · " + (project.contracts || []).length + " contracts · " + (project.artifacts || []).length + " site exports</small>";
            button.onclick = () => { activeId = project.id; render(); };
            list.appendChild(button);
          });
          document.querySelectorAll(".tool-card").forEach((card) => {
            card.querySelector("button").textContent = active() ? "Open for " + active().title + " ↗" : "Start with " + card.querySelector("span").textContent + " ↗";
          });
        }
        function createProject(toolId) {
          const now = new Date().toISOString();
          const project = { schema: SCHEMA, id: crypto.randomUUID(), title: byId("project-title").value.trim() || "Untitled Pasta project", toolId, stage: "planning", network: localStorage.getItem("wtf:network") || "mainnet", contracts: [], artifacts: [], createdAt: now, updatedAt: now };
          projects.unshift(project); activeId = project.id; byId("project-title").value = ""; save(); render(); return project;
        }
        byId("create-project").onclick = () => createProject(byId("project-tool").value);
        document.querySelectorAll(".tool-card").forEach((card) => card.querySelector("button").onclick = () => {
          const project = active() || createProject(card.dataset.tool);
          const query = new URLSearchParams({ handoff: "colander-workspace", projectId: project.id, projectTitle: project.title, network: project.network, kind: card.dataset.tool });
          if (project.contracts?.[0]) query.set("contract", project.contracts[0]);
          window.open(card.dataset.entry + "?" + query, "_blank", "noopener");
        });
        byId("export-project").onclick = () => {
          const project = active(); if (!project) return;
          const anchor = document.createElement("a");
          anchor.href = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }));
          anchor.download = "pasta-project.pasta.json"; anchor.click(); URL.revokeObjectURL(anchor.href);
        };
        byId("import-project").onchange = async (event) => {
          const file = event.target.files?.[0]; if (!file) return;
          try { const project = JSON.parse(await file.text()); if (project.schema !== SCHEMA || !project.id) throw new Error(); projects = [project, ...projects.filter((item) => item.id !== project.id)]; activeId = project.id; save(); render(); byId("suite-status").textContent = "Imported " + project.title + "."; } catch (_) { byId("suite-status").textContent = "That file is not a Pasta Project manifest."; }
        };

        async function refreshSites() {
          const root = byId("local-sites");
          try {
            const response = await fetch("/api/pasta/sites", { cache: "no-store" });
            const payload = await response.json();
            if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not read local pages.");
            root.innerHTML = "";
            if (!payload.sites.length) root.innerHTML = "<small>No locally installed pages yet. Export one from a Pasta app to inject it here.</small>";
            payload.sites.forEach((site) => {
              const card = document.createElement("article"); card.className = "local-site";
              const title = document.createElement("strong"); title.textContent = site.title || site.app || "Pasta page"; card.appendChild(title);
              const detail = document.createElement("small"); detail.textContent = site.url + " · " + site.fileCount + " files"; card.appendChild(detail);
              const open = document.createElement("button"); open.type = "button"; open.textContent = "Open local page ↗"; open.onclick = () => window.open(site.url, "_blank", "noopener"); card.appendChild(open);
              root.appendChild(card);
            });
          } catch (error) {
            root.textContent = "Could not load local pages: " + (error.message || error);
          }
        }
        byId("refresh-sites").onclick = refreshSites;

        const ACTIONS = [
          { id: "transfer", label: "Transfer token", entrypoint: "transfer", fields: [["to_", "Recipient", "text"], ["token_id", "Token id", "number"], ["amount", "Amount", "number"]] },
          { id: "mint", label: "Mint more", entrypoint: "mint", fields: [["to_", "Recipient", "text"], ["token_id", "Token id", "number"], ["amount", "Amount", "number"]] },
          { id: "set_sale", label: "Configure direct sale", entrypoint: "set_sale", fixedSale: true, fields: [["token_id", "Token id", "number"], ["price", "Price (mutez)", "number"], ["remaining", "Quantity", "number"], ["active", "Active", "bool"]] },
          { id: "set_sale_active", label: "Pause / resume sale", entrypoint: "set_sale_active", fields: [["token_id", "Token id", "number"], ["active", "Active", "bool"]] },
          { id: "redeem", label: "Redeem bundle", entrypoint: "redeem", fields: [["token_id", "Token id", "number"], ["amount", "Amount", "number"]] },
          { id: "set_bundle_contents", label: "Reveal bundle contents", entrypoint: "set_bundle_contents", fields: [["token_id", "Token id", "number"], ["contents_uri", "Contents URI", "text"]] },
          { id: "open_claim", label: "Open / close claim", entrypoint: "open_claim", fields: [["active", "Active", "bool"]] },
          { id: "add_minter", label: "Add minter", entrypoint: "add_minter", fields: [["minter", "Minter", "text"]] },
          { id: "remove_minter", label: "Remove minter", entrypoint: "remove_minter", fields: [["minter", "Minter", "text"]] },
          { id: "add_curator", label: "Add curator", entrypoint: "add_curator", fields: [["curator", "Curator", "text"]] },
          { id: "remove_curator", label: "Remove curator", entrypoint: "remove_curator", fields: [["curator", "Curator", "text"]] },
          { id: "set_current_revision", label: "Set current revision", entrypoint: "set_current_revision", fields: [["rid", "Revision", "number"]] },
          { id: "transfer_administration", label: "Transfer administration", entrypoint: "transfer_administration", fields: [["pending_administrator", "New administrator", "text"]] },
          { id: "accept_administration", label: "Accept administration", entrypoint: "accept_administration", fields: [] },
        ];
        const nat = (values, name) => Math.max(0, Number(values[name]) || 0);
        const bool = (values, name) => values[name] !== "false";
        function contractType(entrypoints) {
          if (entrypoints.has("publish_revision")) return "Lasagna exhibition";
          if (entrypoints.has("set_allocations")) return "Penne distribution";
          if (entrypoints.has("open_mint")) return "Gnocchi open edition";
          if (entrypoints.has("create_bundle")) return "Ravioli bundle";
          if (entrypoints.has("create_token")) return "Spaghetti / Rotini collection";
          if (entrypoints.has("transfer")) return "FA2 contract";
          return "Unrecognized contract";
        }
        function buildMethod(action, values) {
          const m = openedContract.methodsObject;
          if (action.id === "transfer") return m.transfer([{ from_: walletAddress, txs: [{ to_: values.to_, token_id: nat(values, "token_id"), amount: nat(values, "amount") }] }]);
          if (action.id === "mint") return m.mint({ to_: values.to_, token_id: nat(values, "token_id"), amount: nat(values, "amount") });
          if (action.id === "set_sale") return m.set_sale({ token_id: nat(values, "token_id"), sale: { active: bool(values, "active"), seller: walletAddress, treasury: walletAddress, price: nat(values, "price"), remaining: nat(values, "remaining"), start: null, end: null } });
          if (action.id === "set_sale_active") return m.set_sale_active({ token_id: nat(values, "token_id"), active: bool(values, "active") });
          if (action.id === "redeem") return m.redeem({ token_id: nat(values, "token_id"), amount: nat(values, "amount") });
          if (action.id === "set_bundle_contents") return m.set_bundle_contents({ token_id: nat(values, "token_id"), contents_uri: MD.utf8ToHex(values.contents_uri) });
          if (action.id === "open_claim") return m.open_claim({ active: bool(values, "active"), start: null, end: null });
          if (action.id === "add_minter") return m.add_minter(values.minter);
          if (action.id === "remove_minter") return m.remove_minter(values.minter);
          if (action.id === "add_curator") return m.add_curator(values.curator);
          if (action.id === "remove_curator") return m.remove_curator(values.curator);
          if (action.id === "set_current_revision") return m.set_current_revision(nat(values, "rid"));
          if (action.id === "transfer_administration") return m.transfer_administration(values.pending_administrator);
          if (action.id === "accept_administration") return m.accept_administration();
          throw new Error("Unsupported contract action");
        }
        function renderActions() {
          const root = byId("contract-actions"); root.innerHTML = "";
          ACTIONS.filter((action) => openedEntrypoints.has(action.entrypoint) && (!action.fixedSale || !openedEntrypoints.has("open_mint"))).forEach((action) => {
            const card = document.createElement("form"); card.className = "contract-action"; card.dataset.action = action.id;
            const title = document.createElement("h3"); title.textContent = action.label; card.appendChild(title);
            const fields = document.createElement("div"); fields.className = "action-fields";
            action.fields.forEach(([name, label, type]) => {
              const wrapper = document.createElement("label"); wrapper.textContent = label;
              const input = type === "bool" ? document.createElement("select") : document.createElement("input");
              input.name = name;
              if (type === "bool") input.innerHTML = '<option value="true">Yes</option><option value="false">No</option>';
              else input.type = type;
              input.required = true; wrapper.appendChild(input); fields.appendChild(wrapper);
            });
            card.appendChild(fields);
            const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = "Submit " + action.label; card.appendChild(submit);
            card.onsubmit = async (event) => {
              event.preventDefault();
              try {
                if (!walletAddress) walletAddress = await MD.connectWallet("Pasta Suite Colander");
                await MD.assertOperationSafety();
                const values = Object.fromEntries(new FormData(card).entries());
                byId("contract-facts").textContent = "Waiting for wallet signature: " + action.label + "…";
                const op = await buildMethod(action, values).send(); await op.confirmation();
                byId("contract-facts").textContent = action.label + " confirmed on Tezos.";
              } catch (error) { byId("contract-facts").textContent = "Action failed: " + (error.message || error); }
            };
            root.appendChild(card);
          });
        }
        byId("connect-wallet").onclick = async () => {
          try { walletAddress = await MD.connectWallet("Pasta Suite Colander"); byId("connect-wallet").textContent = MD.short(walletAddress); }
          catch (error) { byId("contract-facts").textContent = "Wallet connection failed: " + (error.message || error); }
        };
        byId("open-contract").onclick = async () => {
          const kt = byId("contract-kt").value.trim();
          try {
            if (!MD.isAddress(kt) || !kt.startsWith("KT1")) throw new Error("Enter a valid KT1 contract address.");
            const network = byId("contract-network").value; localStorage.setItem("wtf:network", network); MD.setupToolkit(network);
            const readContract = await MD.getToolkit().contract.at(kt);
            openedEntrypoints = new Set(Object.keys(readContract.entrypoints?.entrypoints || {}));
            openedContract = await MD.getToolkit().wallet.at(kt);
            const storage = await readContract.storage();
            byId("contract-facts").textContent = contractType(openedEntrypoints) + "\\n" + kt + "\\n" + openedEntrypoints.size + " entrypoints" + (storage.administrator ? "\\nAdmin: " + storage.administrator : "");
            const project = active();
            if (project && !(project.contracts || []).includes(kt)) { project.contracts = [kt, ...(project.contracts || [])]; project.stage = "deployed"; project.updatedAt = new Date().toISOString(); save(); render(); }
            renderActions();
          } catch (error) { openedContract = null; openedEntrypoints = new Set(); byId("contract-actions").innerHTML = ""; byId("contract-facts").textContent = "Could not open contract: " + (error.message || error); }
        };
        byId("contract-network").value = localStorage.getItem("wtf:network") || "mainnet";
        window.addEventListener("storage", (event) => {
          if (event.key === "wtfos.pasta.local-sites.changed") { refreshSites(); return; }
          if (event.key !== KEY) return;
          try { projects = JSON.parse(event.newValue || "[]"); render(); } catch (_) { /* keep the last valid workspace */ }
        });
        window.addEventListener("focus", refreshSites);
        render();
        refreshSites();
      })();
    </script>
  </body>
</html>
`;
}
