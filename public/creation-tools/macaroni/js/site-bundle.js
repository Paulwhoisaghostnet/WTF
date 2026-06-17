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

  /** Build a zip containing index.html, drop.config.js, and the wallet/mint stack. */
  async function buildSiteZip(configJs) {
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
    triggerDownload(zip, filename || "macaroni-site.zip");
    return zip;
  }

  return { ASSETS, buildSiteZip, downloadSiteZip };
})();
