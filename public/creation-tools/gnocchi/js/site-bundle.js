"use strict";

const PastaSiteKit = (() => {
  const FILES = ["site.html", "css/site.css", "js/site.js", "js/common.js", "js/octez-wallet.js", "vendor/octez-connect.js", "vendor/tezos.js"];
  const ROTINI_FILES = ["js/rotini-artifact.js", "js/rotini-mint.js"];
  const CRC_TABLE = (() => { const table = new Uint32Array(256); for (let i = 0; i < 256; i++) { let value = i; for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; table[i] = value >>> 0; } return table; })();
  const u32 = (view, offset, value) => view.setUint32(offset, value, true);
  const u16 = (view, offset, value) => view.setUint16(offset, value, true);
  function crc32(bytes) { let value = 0xffffffff; for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0; }
  function zip(files) {
    const encoder = new TextEncoder(); const local = []; const central = []; let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.path); const data = file.data instanceof Uint8Array ? file.data : encoder.encode(String(file.data)); const crc = crc32(data);
      const part = new Uint8Array(30 + name.length + data.length); const view = new DataView(part.buffer);
      u32(view, 0, 0x04034b50); u16(view, 8, 0); u32(view, 14, crc); u32(view, 18, data.length); u32(view, 22, data.length); u16(view, 26, name.length); part.set(name, 30); part.set(data, 30 + name.length); local.push(part);
      const record = new Uint8Array(46 + name.length); const centralView = new DataView(record.buffer);
      u32(centralView, 0, 0x02014b50); u16(centralView, 10, 0); u32(centralView, 16, crc); u32(centralView, 20, data.length); u32(centralView, 24, data.length); u16(centralView, 28, name.length); u32(centralView, 42, offset); record.set(name, 46); central.push(record); offset += part.length;
    }
    const centralSize = central.reduce((sum, part) => sum + part.length, 0); const end = new Uint8Array(22); const endView = new DataView(end.buffer);
    u32(endView, 0, 0x06054b50); u16(endView, 8, files.length); u16(endView, 10, files.length); u32(endView, 12, centralSize); u32(endView, 16, offset);
    return new Blob([...local, ...central, end], { type: "application/zip" });
  }
  async function asset(path) { const response = await fetch(path, { cache: "no-store" }); if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`); return new Uint8Array(await response.arrayBuffer()); }
  async function build(config) {
    const files = [{ path: "pasta.config.js", data: `window.PASTA_SITE_CONFIG = ${JSON.stringify(config, null, 2)};\n` }];
    const selected = config.app === "rotini" ? [...FILES, ...ROTINI_FILES] : FILES;
    for (const path of selected) files.push({ path: path === "site.html" ? "index.html" : path, data: await asset(path) });
    return zip(files);
  }
  async function download(config) {
    const blob = await build(config); let installed = null;
    if (window.PASTA_SUITE_DESKTOP?.suite) {
      const params = new URLSearchParams({ app: config.app || "pasta", title: config.title || config.label || "Pasta site" });
      const response = await fetch(`/api/pasta/sites/install?${params}`, { method: "POST", headers: { "content-type": "application/zip" }, body: blob });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not install the site in local Colander.");
      installed = payload;
      localStorage.setItem("wtfos.pasta.local-sites.changed", String(Date.now()));
    }
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = `${config.app || "pasta"}-site.zip`; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 5000); return { blob, fileName: anchor.download, installed };
  }
  function recordColanderSite(config, fileName, installed) {
    const handoff = window.MD?.readRouteHandoff?.();
    if (handoff?.source !== "colander-workspace" || !handoff.projectId) return false;
    try {
      const key = "wtfos.pasta.colander.workspace.v1";
      const projects = JSON.parse(localStorage.getItem(key) || "[]");
      const now = new Date().toISOString();
      const artifact = { id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `site-${Date.now()}`, kind: "self_hosted_site", toolId: config.app, contract: config.contract, tokenId: config.tokenId, fileName, localUrl: installed?.url, createdAt: now };
      const next = projects.map((project) => project.id === handoff.projectId ? { ...project, stage: "published", artifacts: [...(project.artifacts || []), artifact], updatedAt: now } : project);
      localStorage.setItem(key, JSON.stringify(next));
      return true;
    } catch (_) { return false; }
  }
  function readInput(id) { return id ? String(document.getElementById(id)?.value || "").trim() : ""; }
  function wire(exportConfig) {
    const button = document.getElementById("btnExportSite"); const status = document.getElementById("exportSiteStatus"); if (!button) return;
    button.addEventListener("click", async () => {
      const contract = readInput(exportConfig.contractInput); const title = readInput(exportConfig.titleInput); const description = readInput(exportConfig.descriptionInput); const tokenId = Number(readInput(exportConfig.tokenInput) || 0);
      if (!/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(contract)) { status.textContent = "Enter or deploy a valid KT1 contract before exporting."; return; }
      button.disabled = true; status.textContent = "Building self-hosted site package…";
      try {
        const config = { app: exportConfig.app, label: exportConfig.label, title, description, contract, tokenId, network: document.getElementById("network")?.value || "mainnet" };
        const result = await download(config);
        recordColanderSite(config, result.fileName, result.installed);
        status.textContent = result.installed ? `Installed in local Colander at ${result.installed.url} and downloaded the portable site zip.` : "Downloaded site zip. Unzip it on any static web host.";
        if (window.MD?.logEvent) MD.logEvent(`${exportConfig.app}.site_exported`, `${exportConfig.label} exported a self-hosted site`, { contract, token_id: tokenId });
        if (result.installed && window.MD?.logEvent) MD.logEvent("pasta_suite.site_installed", "Native Colander installed a self-hosted Pasta page", { app: exportConfig.app, contract, local_url: result.installed.url });
      } catch (error) { status.textContent = error.message || "Site export failed."; }
      finally { button.disabled = false; }
    });
  }
  return { build, download, recordColanderSite, wire };
})();

if (window.PASTA_SITE_EXPORT) PastaSiteKit.wire(window.PASTA_SITE_EXPORT);
