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
    id: "ch-ease",
    title: "CH-EASE",
    summary: "Prepare package metadata, media archives, and publisher handoffs locally.",
    entry: "/creation-tools/ch-ease/index.html",
    required: ["index.html", "css/theme.css", "js/studio.js", "vendor/jszip.min.js"],
  },
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
      .project-manager { display: grid; gap: 7px; padding: 9px; border: 1px solid var(--line); background: var(--panel); }
      .project-manager[hidden] { display: none; }
      .project-manager-actions { display: flex; flex-wrap: wrap; gap: 5px; }
      .project-manager-actions button { min-height: 34px; flex: 1 1 120px; font-size: 12px; }
      .project-manager .danger { color: var(--danger, #ff8178); border-color: var(--danger, #ff8178); }
      .archived-project { display: grid; gap: 5px; padding-top: 7px; border-top: 1px solid var(--line); }
      .archived-project small { color: var(--muted); }
      .project-resources { display: grid; gap: 10px; margin-top: 8px; }
      .project-resource-group { display: grid; gap: 6px; padding-top: 10px; border-top: 1px solid var(--line); }
      .project-resource-group h3 { margin: 0; font-size: 14px; }
      .project-resource { display: grid; gap: 5px; padding: 8px; border: 1px solid var(--line); background: var(--panel); overflow-wrap: anywhere; }
      .project-resource small { color: var(--muted); }
      .project-resource-actions { display: flex; flex-wrap: wrap; gap: 5px; }
      .project-resource-actions button { min-height: 34px; flex: 1 1 120px; font-size: 12px; color: var(--accent); }
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
      .local-site-actions { display: flex; flex-wrap: wrap; gap: 6px; }
      .local-site-actions button { flex: 1 1 130px; }
      .local-site-actions .danger { color: var(--danger, #ff8178); border-color: var(--danger, #ff8178); }
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
          <label>Network <select id="project-network"><option value="shadownet">Shadownet (recommended for testing)</option><option value="mainnet">Mainnet</option></select></label>
          <button id="create-project" type="button">Create project</button>
          <button id="export-project" type="button">Export active manifest</button>
          <label>Import manifest <input id="import-project" type="file" accept="application/json,.json" /></label>
          <div id="project-list"><small>No projects yet.</small></div>
          <section id="active-project-manager" class="project-manager" aria-label="Active project management" hidden>
            <strong>Manage active project</strong>
            <label>Project title <input id="active-project-title" autocomplete="off" /></label>
            <div class="project-manager-actions">
              <button id="rename-project" type="button">Save name</button>
              <button id="duplicate-project" type="button">Duplicate as new project</button>
              <button id="archive-project" type="button" class="danger">Archive project</button>
            </div>
            <small>Duplicates start clean and do not share contracts, drafts, or exported sites.</small>
          </section>
          <section id="archived-projects" class="project-manager" aria-label="Archived Pasta projects" hidden></section>
          <div class="project-resources" aria-label="Active project lifecycle">
            <section class="project-resource-group" aria-label="Recoverable drafts"><h3>Recoverable drafts</h3><div id="project-drafts"><small>No saved studio drafts.</small></div></section>
            <section class="project-resource-group" aria-label="Remembered contracts"><h3>Remembered contracts</h3><div id="project-contracts"><small>No remembered contracts.</small></div></section>
            <section class="project-resource-group" aria-label="Project self-hosted pages"><h3>Project pages</h3><div id="project-sites"><small>No self-hosted page exports.</small></div></section>
          </div>
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
          <label>Network <select id="contract-network"><option value="shadownet">Shadownet</option><option value="mainnet">Mainnet</option></select></label>
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
        const TOOL_IDS = new Set(["ch-ease", "macaroni", "spaghetti", "gnocchi", "ravioli", "rotini", "penne", "lasagna"]);
        const PROJECT_STAGES = new Set(["planning", "preparing", "deployed", "published", "archived"]);
        const CONTRACT_SOURCES = new Set(["deployed", "remembered", "colander"]);
        const isText = (value) => typeof value === "string";
        const isKt = (value) => isText(value) && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
        const safeLocalSiteUrl = (value) => {
          if (!isText(value) || !value.startsWith("/sites/") || !value.endsWith("/")) return undefined;
          const slug = value.slice(7, -1);
          return /^[a-z0-9][a-z0-9-]*$/.test(slug) ? value : undefined;
        };
        function normalizeProject(value) {
          if (!value || typeof value !== "object" || value.schema !== SCHEMA || !isText(value.id) || !isText(value.title)) return null;
          const now = new Date().toISOString();
          const contracts = Array.isArray(value.contracts) ? Array.from(new Set(value.contracts.filter(isKt))) : [];
          const drafts = Array.isArray(value.drafts) ? value.drafts.filter((draft) =>
            draft && draft.schema === "pasta-studio-draft-ref@1" && TOOL_IDS.has(draft.toolId) && isText(draft.storageKey) && isText(draft.savedAt) && isText(draft.summary)
          ).map((draft) => ({ schema: "pasta-studio-draft-ref@1", toolId: draft.toolId, storageKey: draft.storageKey, savedAt: draft.savedAt, summary: draft.summary })) : [];
          const contractRecords = Array.isArray(value.contractRecords) ? value.contractRecords.filter((record) =>
            record && record.schema === "pasta-contract-ref@1" && isKt(record.address) && TOOL_IDS.has(record.toolId) && isText(record.network) && isText(record.label) && CONTRACT_SOURCES.has(record.source) && isText(record.recordedAt) && (record.lastVerifiedAt == null || isText(record.lastVerifiedAt))
          ).map((record) => ({ schema: "pasta-contract-ref@1", address: record.address, toolId: record.toolId, network: record.network, label: record.label, source: record.source, recordedAt: record.recordedAt, lastVerifiedAt: record.lastVerifiedAt })) : [];
          const artifacts = Array.isArray(value.artifacts) ? value.artifacts.filter((artifact) =>
            artifact && isText(artifact.id) && artifact.kind === "self_hosted_site" && TOOL_IDS.has(artifact.toolId) && isKt(artifact.contract) && isText(artifact.fileName) && isText(artifact.createdAt)
          ).map((artifact) => ({ id: artifact.id, kind: "self_hosted_site", toolId: artifact.toolId, contract: artifact.contract, tokenId: Number.isSafeInteger(Number(artifact.tokenId)) ? Number(artifact.tokenId) : undefined, fileName: artifact.fileName, localUrl: safeLocalSiteUrl(artifact.localUrl), createdAt: artifact.createdAt })) : [];
          const normalized = {
            schema: SCHEMA,
            id: value.id,
            title: value.title.trim() || "Untitled Pasta project",
            toolId: TOOL_IDS.has(value.toolId) ? value.toolId : "spaghetti",
            stage: PROJECT_STAGES.has(value.stage) ? value.stage : "planning",
            network: value.network === "shadownet" ? "shadownet" : "mainnet",
            contracts,
            contractRecords,
            artifacts,
            drafts,
            createdAt: isText(value.createdAt) ? value.createdAt : now,
            updatedAt: isText(value.updatedAt) ? value.updatedAt : now,
          };
          if (normalized.stage === "archived" && ["planning", "preparing", "deployed", "published"].includes(value.archivedFromStage)) normalized.archivedFromStage = value.archivedFromStage;
          return normalized;
        }
        function normalizeProjects(value) {
          return (Array.isArray(value) ? value : [value]).map(normalizeProject).filter(Boolean);
        }
        let projects = [];
        let activeId = "";
        try { projects = normalizeProjects(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch (_) { projects = []; }
        const byId = (id) => document.getElementById(id);
        let openedContract = null;
        let openedEntrypoints = new Set();
        let walletAddress = "";
        const save = () => localStorage.setItem(KEY, JSON.stringify(projects));
        const activeProjects = () => projects.filter((project) => project.stage !== "archived");
        const active = () => activeProjects().find((project) => project.id === activeId) || activeProjects()[0];
        const emit = (type, detail = {}) => window.dispatchEvent(new CustomEvent("pasta-protocol", { detail: { type, app: "colander", ...detail } }));
        const toolCard = (toolId) => Array.from(document.querySelectorAll(".tool-card")).find((card) => card.dataset.tool === toolId);
        function launchTool(toolId, project, contract) {
          const card = toolCard(toolId);
          if (!card) { byId("suite-status").textContent = "The owner app for this record is not installed in this suite."; return false; }
          const query = new URLSearchParams({ handoff: "colander-workspace", projectId: project.id, projectTitle: project.title, network: project.network, kind: toolId });
          const address = contract || project.contracts?.[0];
          if (address) query.set("contract", address);
          window.open(card.dataset.entry + "?" + query, "_blank", "noopener");
          return true;
        }
        function resourceCard(titleText, detailText) {
          const card = document.createElement("article"); card.className = "project-resource";
          const title = document.createElement("strong"); title.textContent = titleText; card.appendChild(title);
          const detail = document.createElement("small"); detail.textContent = detailText; card.appendChild(detail);
          const actions = document.createElement("div"); actions.className = "project-resource-actions"; card.appendChild(actions);
          return { card, actions };
        }
        function actionButton(label, handler) {
          const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.onclick = handler; return button;
        }
        function siteSlugFromUrl(value) {
          const raw = String(value || ""); if (!raw.startsWith("/sites/") || !raw.endsWith("/")) return "";
          const slug = raw.slice(7, -1); const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789-"; const first = "abcdefghijklmnopqrstuvwxyz0123456789";
          return slug.length > 0 && slug.length <= 80 && first.includes(slug[0]) && Array.from(slug).every((char) => alphabet.includes(char)) ? slug : "";
        }
        function forgetProjectArtifact(projectId, artifactId) {
          const project = projects.find((candidate) => candidate.id === projectId); if (!project) return;
          const artifact = project.artifacts.find((candidate) => candidate.id === artifactId); if (!artifact) return;
          project.artifacts = project.artifacts.filter((candidate) => candidate.id !== artifactId); project.updatedAt = new Date().toISOString(); save(); render();
          byId("suite-status").textContent = "Forgot site record " + artifact.fileName + ". Installed bytes and the contract are unchanged.";
          emit("colander.site_record_forgotten", { projectId, artifactId, contract: artifact.contract });
        }
        function requestForgetProjectArtifact(project, artifact, actions) {
          actions.replaceChildren();
          const confirm = actionButton("Confirm forget record", () => forgetProjectArtifact(project.id, artifact.id)); confirm.classList.add("danger"); actions.appendChild(confirm);
          actions.appendChild(actionButton("Cancel", render));
        }
        function pruneSiteArtifacts(url) {
          let changed = false; const now = new Date().toISOString();
          projects.forEach((project) => { const next = project.artifacts.filter((artifact) => artifact.localUrl !== url); if (next.length !== project.artifacts.length) { project.artifacts = next; project.updatedAt = now; changed = true; } });
          if (changed) save();
        }
        async function uninstallSite(site) {
          const slug = site.slug || siteSlugFromUrl(site.url); if (!slug) throw new Error("That page does not have a managed local slug.");
          const response = await fetch("/api/pasta/sites/" + encodeURIComponent(slug), { method: "DELETE" }); const payload = await response.json();
          if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not uninstall the local page.");
          const url = payload.site?.url || site.url || "/sites/" + slug + "/"; pruneSiteArtifacts(url); render(); await refreshSites();
          byId("suite-status").textContent = "Uninstalled " + (payload.site?.title || site.title || slug) + " and removed its project records.";
          emit("pasta_suite.site_uninstalled", { slug, url });
        }
        function requestUninstallSite(site, actions, cancel = refreshSites) {
          actions.replaceChildren();
          const confirm = actionButton("Confirm uninstall page", async () => { confirm.disabled = true; try { await uninstallSite(site); } catch (error) { byId("suite-status").textContent = "Could not uninstall page: " + (error.message || error); render(); await refreshSites(); } }); confirm.classList.add("danger"); actions.appendChild(confirm);
          actions.appendChild(actionButton("Cancel", cancel));
        }
        function renderProjectResources(project) {
          const draftsRoot = byId("project-drafts"); draftsRoot.replaceChildren();
          const contractsRoot = byId("project-contracts"); contractsRoot.replaceChildren();
          const sitesRoot = byId("project-sites"); sitesRoot.replaceChildren();
          if (!project) {
            for (const [root, copy] of [[draftsRoot, "No saved studio drafts."], [contractsRoot, "No remembered contracts."], [sitesRoot, "No self-hosted page exports."]]) { const empty = document.createElement("small"); empty.textContent = copy; root.appendChild(empty); }
            return;
          }
          if (!project.drafts.length) { const empty = document.createElement("small"); empty.textContent = "No saved studio drafts."; draftsRoot.appendChild(empty); }
          project.drafts.slice().reverse().slice(0, 6).forEach((draft) => {
            const row = resourceCard(draft.summary, draft.toolId + " · saved " + new Date(draft.savedAt).toLocaleString());
            row.actions.appendChild(actionButton("Resume draft", () => launchTool(draft.toolId, project)));
            draftsRoot.appendChild(row.card);
          });
          if (!project.contractRecords.length) { const empty = document.createElement("small"); empty.textContent = "No remembered contracts."; contractsRoot.appendChild(empty); }
          project.contractRecords.slice().reverse().slice(0, 8).forEach((record) => {
            const verified = record.lastVerifiedAt ? "verified " + new Date(record.lastVerifiedAt).toLocaleString() : "not re-verified on this device";
            const row = resourceCard(record.label, record.address + " · " + record.network + " · " + verified);
            row.actions.appendChild(actionButton("Open in contract manager", () => {
              byId("contract-network").value = record.network === "shadownet" ? "shadownet" : "mainnet";
              byId("contract-kt").value = record.address;
              byId("open-contract").click();
            }));
            row.actions.appendChild(actionButton("Resume in owner app", () => launchTool(record.toolId, project, record.address)));
            contractsRoot.appendChild(row.card);
          });
          if (!project.artifacts.length) { const empty = document.createElement("small"); empty.textContent = "No self-hosted page exports."; sitesRoot.appendChild(empty); }
          project.artifacts.slice().reverse().slice(0, 8).forEach((artifact) => {
            const row = resourceCard(artifact.fileName, artifact.toolId + " · " + artifact.contract);
            if (artifact.localUrl) row.actions.appendChild(actionButton("Open installed page", () => window.open(artifact.localUrl, "_blank", "noopener")));
            row.actions.appendChild(actionButton("Rebuild in owner app", () => launchTool(artifact.toolId, project, artifact.contract)));
            if (siteSlugFromUrl(artifact.localUrl)) row.actions.appendChild(actionButton("Uninstall local page", () => requestUninstallSite({ slug: siteSlugFromUrl(artifact.localUrl), url: artifact.localUrl, title: artifact.fileName }, row.actions, render)));
            const forget = actionButton("Forget record only", () => requestForgetProjectArtifact(project, artifact, row.actions)); forget.classList.add("danger"); row.actions.appendChild(forget);
            sitesRoot.appendChild(row.card);
          });
        }
        function render() {
          const list = byId("project-list");
          list.innerHTML = "";
          if (!activeProjects().length) list.innerHTML = "<small>No active projects. Start a new one or restore an archived project.</small>";
          activeProjects().forEach((project) => {
            const button = document.createElement("button");
            button.className = "project";
            button.setAttribute("aria-current", String(project.id === active()?.id));
            const title = document.createElement("strong"); title.textContent = project.title; button.appendChild(title);
            const detail = document.createElement("small"); detail.textContent = project.stage + " · " + project.contracts.length + " contracts · " + project.drafts.length + " drafts · " + project.artifacts.length + " site exports"; button.appendChild(detail);
            button.onclick = () => { activeId = project.id; render(); };
            list.appendChild(button);
          });
          document.querySelectorAll(".tool-card").forEach((card) => {
              card.querySelector("button").textContent = active() ? "Open for " + active().title + " ↗" : "Start with " + card.querySelector("span").textContent + " ↗";
          });
          const current = active();
          const manager = byId("active-project-manager"); manager.hidden = !current;
          byId("active-project-title").value = current?.title || "";
          const archiveRoot = byId("archived-projects"); archiveRoot.replaceChildren();
          const archived = projects.filter((project) => project.stage === "archived"); archiveRoot.hidden = !archived.length;
          if (archived.length) { const heading = document.createElement("strong"); heading.textContent = "Archived projects"; archiveRoot.appendChild(heading); }
          archived.forEach((project) => {
            const row = document.createElement("div"); row.className = "archived-project";
            const title = document.createElement("strong"); title.textContent = project.title; row.appendChild(title);
            const detail = document.createElement("small"); detail.textContent = "archived from " + (project.archivedFromStage || "legacy state"); row.appendChild(detail);
            const actions = document.createElement("div"); actions.className = "project-manager-actions";
            actions.appendChild(actionButton("Restore project", () => restoreProject(project.id)));
            const remove = actionButton("Delete permanently", () => requestDeleteProject(project.id, actions)); remove.classList.add("danger"); actions.appendChild(remove);
            row.appendChild(actions); archiveRoot.appendChild(row);
          });
          renderProjectResources(active());
        }
        function createProject(toolId) {
          const now = new Date().toISOString();
          const network = byId("project-network").value === "mainnet" ? "mainnet" : "shadownet";
          const project = { schema: SCHEMA, id: crypto.randomUUID(), title: byId("project-title").value.trim() || "Untitled Pasta project", toolId, stage: toolId === "ch-ease" ? "preparing" : "planning", network, contracts: [], contractRecords: [], artifacts: [], drafts: [], createdAt: now, updatedAt: now };
          projects.unshift(project); activeId = project.id; byId("project-title").value = ""; save(); render(); emit("colander.project_created", { projectId: project.id, toolId }); return project;
        }
        function renameProject() {
          const project = active(); if (!project) return;
          const title = byId("active-project-title").value.trim();
          if (!title) { byId("suite-status").textContent = "Project name cannot be empty."; return; }
          if (title === project.title) { byId("suite-status").textContent = "Project name is unchanged."; return; }
          project.title = title; project.updatedAt = new Date().toISOString(); save(); render(); byId("suite-status").textContent = "Renamed project to " + title + "."; emit("colander.project_renamed", { projectId: project.id });
        }
        function duplicateProject() {
          const project = active(); if (!project) return;
          const now = new Date().toISOString();
          const duplicate = { ...project, id: crypto.randomUUID(), title: project.title + " copy", stage: project.toolId === "ch-ease" ? "preparing" : "planning", contracts: [], contractRecords: [], artifacts: [], drafts: [], createdAt: now, updatedAt: now };
          delete duplicate.archivedFromStage; projects.unshift(duplicate); activeId = duplicate.id; save(); render(); byId("suite-status").textContent = "Created independent copy " + duplicate.title + "."; emit("colander.project_duplicated", { projectId: project.id, duplicateProjectId: duplicate.id });
        }
        function archiveProject() {
          const project = active(); if (!project) return;
          project.archivedFromStage = project.stage; project.stage = "archived"; project.updatedAt = new Date().toISOString();
          activeId = activeProjects().find((candidate) => candidate.id !== project.id)?.id || ""; save(); render(); byId("suite-status").textContent = "Archived " + project.title + ". You can restore it below."; emit("colander.project_archived", { projectId: project.id, previousStage: project.archivedFromStage });
        }
        function restoreProject(projectId) {
          const project = projects.find((candidate) => candidate.id === projectId && candidate.stage === "archived"); if (!project) return;
          project.stage = ["planning", "preparing", "deployed", "published"].includes(project.archivedFromStage) ? project.archivedFromStage : project.contracts.length ? "deployed" : project.toolId === "ch-ease" ? "preparing" : "planning";
          delete project.archivedFromStage; project.updatedAt = new Date().toISOString(); activeId = project.id; save(); render(); byId("suite-status").textContent = "Restored " + project.title + "."; emit("colander.project_restored", { projectId: project.id, stage: project.stage });
        }
        function requestDeleteProject(projectId, actions) {
          actions.replaceChildren();
          const confirm = actionButton("Confirm permanent delete", () => deleteProject(projectId)); confirm.classList.add("danger"); actions.appendChild(confirm);
          actions.appendChild(actionButton("Cancel", render));
        }
        function deleteProject(projectId) {
          const project = projects.find((candidate) => candidate.id === projectId && candidate.stage === "archived"); if (!project) return;
          projects = projects.filter((candidate) => candidate.id !== projectId); save(); render(); byId("suite-status").textContent = "Permanently deleted " + project.title + "."; emit("colander.project_deleted", { projectId });
        }
        byId("create-project").onclick = () => createProject(byId("project-tool").value);
        byId("rename-project").onclick = renameProject;
        byId("duplicate-project").onclick = duplicateProject;
        byId("archive-project").onclick = archiveProject;
        document.querySelectorAll(".tool-card").forEach((card) => card.querySelector("button").onclick = () => {
          const project = active() || createProject(card.dataset.tool);
          launchTool(card.dataset.tool, project);
        });
        byId("export-project").onclick = () => {
          const project = active(); if (!project) return;
          const anchor = document.createElement("a");
          anchor.href = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }));
          anchor.download = "pasta-project.pasta.json"; anchor.click(); URL.revokeObjectURL(anchor.href);
        };
        byId("import-project").onchange = async (event) => {
          const file = event.target.files?.[0]; if (!file) return;
          try { const project = normalizeProject(JSON.parse(await file.text())); if (!project) throw new Error(); projects = [project, ...projects.filter((item) => item.id !== project.id)]; activeId = project.id; save(); render(); byId("suite-status").textContent = "Imported " + project.title + "."; } catch (_) { byId("suite-status").textContent = "That file is not a Pasta Project manifest."; }
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
              const actions = document.createElement("div"); actions.className = "local-site-actions";
              const open = document.createElement("button"); open.type = "button"; open.textContent = "Open local page ↗"; open.onclick = () => window.open(site.url, "_blank", "noopener"); actions.appendChild(open);
              const remove = actionButton("Uninstall local page", () => requestUninstallSite(site, actions)); remove.classList.add("danger"); actions.appendChild(remove); card.appendChild(actions);
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
        function toolIdForEntrypoints(entrypoints, project) {
          if (entrypoints.has("publish_revision")) return "lasagna";
          if (entrypoints.has("set_allocations")) return "penne";
          if (entrypoints.has("open_mint")) return "gnocchi";
          if (entrypoints.has("create_bundle")) return "ravioli";
          if (entrypoints.has("create_token") && project?.toolId === "rotini") return "rotini";
          return "spaghetti";
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
            if (project) {
              const now = new Date().toISOString();
              const toolId = toolIdForEntrypoints(openedEntrypoints, project);
              const existing = project.contractRecords.find((record) => record.address === kt);
              project.contracts = [kt, ...project.contracts.filter((address) => address !== kt)];
              project.contractRecords = [
                ...project.contractRecords.filter((record) => record.address !== kt),
                {
                  schema: "pasta-contract-ref@1",
                  address: kt,
                  toolId,
                  network,
                  label: contractType(openedEntrypoints),
                  source: "colander",
                  recordedAt: existing?.recordedAt || now,
                  lastVerifiedAt: now,
                },
              ];
              project.toolId = toolId;
              project.network = network;
              if (project.stage === "planning" || project.stage === "preparing") project.stage = "deployed";
              project.updatedAt = now;
              save(); render();
            }
            renderActions();
          } catch (error) { openedContract = null; openedEntrypoints = new Set(); byId("contract-actions").innerHTML = ""; byId("contract-facts").textContent = "Could not open contract: " + (error.message || error); }
        };
        byId("contract-network").value = localStorage.getItem("wtf:network") || "shadownet";
        function refreshProjects() {
          try {
            const next = normalizeProjects(JSON.parse(localStorage.getItem(KEY) || "[]"));
            projects = next;
            if (activeId && !projects.some((project) => project.id === activeId)) activeId = projects[0]?.id || "";
            render();
          } catch (_) { /* keep the last valid workspace */ }
        }
        window.addEventListener("storage", (event) => {
          if (event.key === "wtfos.pasta.local-sites.changed") { refreshSites(); return; }
          if (event.key !== KEY) return;
          refreshProjects();
        });
        window.addEventListener("focus", () => { refreshProjects(); refreshSites(); });
        render();
        refreshSites();
      })();
    </script>
  </body>
</html>
`;
}
