/* Macaroni — bundle a standalone mint site (index.html + wallet stack + config) as a zip.
   Used by the Studio export buttons; no external dependencies. */
"use strict";

const MDSiteBundle = (() => {
  // Mint page assets — same set serve.py copies into site/.
  const ASSETS = [
    "css/theme.css",
    "js/common.js",
    "js/drop.js",
    "js/octez-wallet.js",
    "vendor/octez-connect.js",
    "vendor/tezos.js",
  ];

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function u16(n) {
    return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  }
  function u32(n) {
    return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
  }

  /** Store uncompressed files in a zip archive (enough for static site upload). */
  function zipStore(files) {
    const enc = new TextEncoder();
    const locals = [];
    const central = [];
    let offset = 0;

    for (const f of files) {
      const name = enc.encode(f.path);
      const data = f.data instanceof Uint8Array ? f.data : enc.encode(String(f.data));
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length + data.length);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(8, 0, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, name.length, true);
      local.set(name, 30);
      local.set(data, 30 + name.length);
      locals.push(local);

      const cen = new Uint8Array(46 + name.length);
      const cv = new DataView(cen.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(10, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      cen.set(name, 46);
      central.push(cen);

      offset += local.length;
    }

    const centralBytes = central.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralBytes, true);
    ev.setUint32(16, offset, true);

    return new Blob([...locals, ...central, end], { type: "application/zip" });
  }

  function triggerDownload(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function fetchAsset(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`could not fetch ${path} (${res.status})`);
    if (path.endsWith(".js") || path.endsWith(".css") || path.endsWith(".html"))
      return new TextEncoder().encode(await res.text());
    return new Uint8Array(await res.arrayBuffer());
  }

  function parseConfigJs(configJs) {
    let body = String(configJs || "").trim();
    const match = body.match(/^window\.DROP_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
    if (match) body = match[1];
    const config = JSON.parse(body);
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("drop.config.js must contain one configuration object");
    }
    return config;
  }

  function assertNoSecretFields(value, path = "DROP_CONFIG") {
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoSecretFields(item, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== "object") {
      const text = typeof value === "string" ? value.trim() : "";
      if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text) || /^(?:edsk|spsk|p2sk)[1-9A-HJ-NP-Za-km-z]{40,}$/.test(text)) {
        throw new Error(`${path} contains a credential or private key`);
      }
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      if (/(?:secret|private.?key|api.?key|jwt|credential|nonce|preimage)/i.test(key)) {
        throw new Error(`${path}.${key} is private and cannot be included in a static site`);
      }
      assertNoSecretFields(item, `${path}.${key}`);
    }
  }

  function assertPublicHttpsUrl(value, label) {
    const text = String(value || "").trim();
    if (!text) throw new Error(`Secure V3.5 ${label} is required`);
    let url;
    try {
      url = new URL(text);
    } catch (_) {
      throw new Error(`Secure V3.5 ${label} must be a valid public HTTPS URL`);
    }
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      throw new Error(`Secure V3.5 ${label} must be a credential-free public HTTPS URL`);
    }
    const hostname = url.hostname.toLowerCase();
    if (["localhost", "127.0.0.1", "::1"].includes(hostname)) {
      throw new Error(`Secure V3.5 ${label} cannot point collectors to a local-only service`);
    }
    return url;
  }

  function assertPublicHttpsTemplate(value, placeholder, label) {
    const text = String(value || "").trim();
    const token = `{${placeholder}}`;
    if (!text.includes(token) || text.indexOf(token) !== text.lastIndexOf(token)) {
      throw new Error(`Secure V3.5 ${label} must contain exactly one ${token} placeholder`);
    }
    const withoutToken = text.replace(token, `macaroni-${placeholder}-placeholder`);
    if (/[{}]/.test(withoutToken)) {
      throw new Error(`Secure V3.5 ${label} contains an unsupported URL placeholder`);
    }
    return assertPublicHttpsUrl(withoutToken, label);
  }

  function assertSecretFreeConfig(configJs) {
    const config = parseConfigJs(configJs);
    assertNoSecretFields(config);
    const profileId = String(config.profile?.id || config.contractVersion || "");
    if (profileId !== "macaroni-secure-v35") return config;

    const allowedServiceKeys = new Set([
      "schema",
      "provider",
      "publicStatusUrl",
      "claimStatusUrlTemplate",
      "purchaseStatusUrlTemplate",
      "wakeUrl",
      "projectId",
    ]);
    for (const key of Object.keys(config.service || {})) {
      if (!allowedServiceKeys.has(key)) {
        throw new Error(`Secure V3.5 static service descriptor contains unsupported field ${key}`);
      }
    }
    const service = config.service || {};
    if (service.schema !== "wtfos.macaroni-v35-public-service.v1") {
      throw new Error("Secure V3.5 static service descriptor has an unsupported schema");
    }
    if (!["wtfos_managed", "creator_companion"].includes(service.provider)) {
      throw new Error("Secure V3.5 static service descriptor has an unsupported provider");
    }
    assertPublicHttpsUrl(service.publicStatusUrl, "public status URL");
    assertPublicHttpsTemplate(service.claimStatusUrlTemplate, "claimId", "claim status URL template");
    assertPublicHttpsTemplate(service.purchaseStatusUrlTemplate, "operationHash", "purchase status URL template");
    assertPublicHttpsUrl(service.wakeUrl, "fulfillment wake URL");
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(String(service.projectId || ""))) {
      throw new Error("Secure V3.5 static service descriptor needs a valid project ID");
    }
    for (const [index, token] of (Array.isArray(config.tokens) ? config.tokens : []).entries()) {
      const allowedTokenKeys = new Set(["id", "displayId", "quantity"]);
      for (const key of Object.keys(token || {})) {
        if (!allowedTokenKeys.has(key)) {
          throw new Error(`Secure V3.5 token ${index + 1} exposes ${key}; private inventory cannot be bundled`);
        }
      }
    }
    if (Array.isArray(config.reveal?.placeholderPool) && config.reveal.placeholderPool.length) {
      throw new Error("Secure V3.5 placeholder inventory cannot be bundled into the static site");
    }
    if (String(config.reveal?.serviceUrl || "").trim()) {
      throw new Error("Secure V3.5 uses only its non-secret public service descriptor");
    }
    return config;
  }

  /** Build a zip containing index.html, drop.config.js, and the wallet/mint stack. */
  async function buildSiteZip(configJs) {
    assertSecretFreeConfig(configJs);
    const dropHtml = await fetchAsset("drop.html");
    const files = [
      { path: "index.html", data: dropHtml },
      { path: "drop.config.js", data: configJs },
    ];
    for (const rel of ASSETS) files.push({ path: rel, data: await fetchAsset(rel) });
    return zipStore(files);
  }

  async function downloadSiteZip(configJs, filename) {
    const zip = await buildSiteZip(configJs);
    let installed = null;
    if (window.PASTA_SUITE_DESKTOP?.suite) {
      const params = new URLSearchParams({ app: "macaroni", title: "Macaroni mint site" });
      const response = await fetch(`/api/pasta/sites/install?${params}`, {
        method: "POST",
        headers: { "content-type": "application/zip" },
        body: zip,
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not install the site in local Colander.");
      installed = payload;
      localStorage.setItem("wtfos.pasta.local-sites.changed", String(Date.now()));
    }
    triggerDownload(zip, filename || "macaroni-site.zip");
    return { blob: zip, fileName: filename || "macaroni-site.zip", installed };
  }

  function recordColanderSite(config, result) {
    const handoff = window.MD?.readRouteHandoff?.();
    if (!handoff?.projectId) return false;
    try {
      const key = "wtfos.pasta.colander.workspace.v1";
      const projects = JSON.parse(localStorage.getItem(key) || "[]");
      const now = new Date().toISOString();
      const artifact = {
        id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `site-${Date.now()}`,
        kind: "self_hosted_site",
        toolId: "macaroni",
        contract: config.contract || "",
        fileName: result.fileName,
        localUrl: result.installed?.url,
        createdAt: now,
      };
      const next = projects.map((project) => project.id === handoff.projectId ? {
        ...project,
        toolId: "macaroni",
        stage: "published",
        artifacts: [...(project.artifacts || []), artifact],
        updatedAt: now,
      } : project);
      localStorage.setItem(key, JSON.stringify(next));
      return true;
    } catch (_) {
      return false;
    }
  }

  return { ASSETS, parseConfigJs, assertSecretFreeConfig, buildSiteZip, downloadSiteZip, recordColanderSite };
})();

window.MDSiteBundle = MDSiteBundle;
