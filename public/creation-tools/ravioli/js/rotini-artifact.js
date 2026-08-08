"use strict";

/* Dependency-free Rotini iteration artifact builder.
 *
 * The browser mint flow uses this file after an on-chain reservation has fixed the token id and seed.
 * It can materialize a normal PNG, an animated GIF, or an Objkt-compatible interactive ZIP whose
 * top-level index.html and every runtime dependency are contained in the archive.
 */
((root) => {
  const encoder = new TextEncoder();
  const MAX_ARTIFACT_BYTES = 250 * 1024 * 1024;
  const OUTPUTS = Object.freeze({
    png: Object.freeze({ extension: "png", mimeType: "image/png" }),
    gif: Object.freeze({ extension: "gif", mimeType: "image/gif" }),
    zip: Object.freeze({ extension: "zip", mimeType: "application/zip" }),
  });

  function asBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return encoder.encode(String(value ?? ""));
  }

  function concat(parts) {
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  }

  function u16(value) {
    return Uint8Array.of(value & 255, (value >>> 8) & 255);
  }

  function u32(value) {
    return Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index++) {
      let value = index;
      for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      table[index] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 255] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  }

  function normalizeFiles(files) {
    return files.map((file) => ({ path: String(file.path || ""), data: asBytes(file.data) }));
  }

  function validateInteractiveFiles(inputFiles) {
    const files = normalizeFiles(inputFiles);
    const errors = [];
    const paths = new Set();
    let totalBytes = 0;
    for (const file of files) {
      totalBytes += file.data.length;
      if (!file.path || file.path.startsWith("/") || file.path.includes("\\") || file.path.split("/").includes("..")) {
        errors.push(`unsafe package path: ${file.path || "(empty)"}`);
      }
      if (paths.has(file.path)) errors.push(`duplicate package path: ${file.path}`);
      paths.add(file.path);
      if (/\.(?:html?|js|css|json|svg)$/i.test(file.path)) {
        const text = new TextDecoder().decode(file.data);
        if (/\b(?:https?:)?\/\//i.test(text)) errors.push(`${file.path} contains an external URL`);
        if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(text)) {
          errors.push(`${file.path} contains a network API`);
        }
        if (/(?:src|href)\s*=\s*["']\//i.test(text) || /url\(\s*["']?\//i.test(text)) {
          errors.push(`${file.path} contains an absolute runtime path`);
        }
      }
    }
    if (!paths.has("index.html")) errors.push("interactive ZIP requires top-level index.html");
    if (totalBytes > MAX_ARTIFACT_BYTES) errors.push("interactive ZIP exceeds Objkt's 250 MB artifact limit");
    return { ok: errors.length === 0, errors, totalBytes, files };
  }

  function zipFiles(inputFiles) {
    const files = normalizeFiles(inputFiles);
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    for (const file of files) {
      const name = encoder.encode(file.path);
      const checksum = crc32(file.data);
      const localHeader = concat([
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum),
        u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), name,
      ]);
      localParts.push(localHeader, file.data);
      centralParts.push(concat([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum),
        u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), u16(0), u16(0),
        u16(0), u32(0), u32(localOffset), name,
      ]));
      localOffset += localHeader.length + file.data.length;
    }
    const central = concat(centralParts);
    const end = concat([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(central.length), u32(localOffset), u16(0),
    ]);
    return new Blob([...localParts, central, end], { type: OUTPUTS.zip.mimeType });
  }

  function escapeJson(value) {
    return JSON.stringify(value).replace(/</g, "\\u003c").replace(/-->/g, "--\\u003e");
  }

  function interactiveHtml(config) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${String(config.name || "Rotini iteration").replace(/[<>&]/g, "")}</title>
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111;color:#fff;font-family:system-ui,sans-serif}
main,canvas{width:100%;height:100%;display:block}aside{position:fixed;left:12px;bottom:12px;padding:8px 10px;background:#000b;border:1px solid #fff4;font-size:12px;pointer-events:none}
</style>
</head>
<body>
<main><canvas id="art" aria-label="Interactive generative artwork"></canvas></main>
<aside>${String(config.name || "Rotini iteration").replace(/[<>&]/g, "")} · move pointer to explore</aside>
<script>
"use strict";
const TOKEN=${escapeJson(config)};
const canvas=document.getElementById("art"),ctx=canvas.getContext("2d"),images=[];
let pointer={x:0,y:0};
function resize(){const ratio=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.max(1,Math.round(innerWidth*ratio));canvas.height=Math.max(1,Math.round(innerHeight*ratio));draw()}
function draw(){if(!images.length)return;ctx.clearRect(0,0,canvas.width,canvas.height);const size=Math.min(canvas.width,canvas.height),left=(canvas.width-size)/2,top=(canvas.height-size)/2;images.forEach((image,index)=>{const depth=(index+1)/images.length,dx=pointer.x*depth*8,dy=pointer.y*depth*8;ctx.drawImage(image,left+dx,top+dy,size,size)})}
addEventListener("pointermove",event=>{pointer={x:event.clientX/innerWidth-.5,y:event.clientY/innerHeight-.5};draw()});
addEventListener("resize",resize);
Promise.all(TOKEN.layers.map(layer=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{images.push(image);resolve()};image.onerror=reject;image.src=layer.path}))).then(resize);
</script>
</body>
</html>`;
  }

  function extensionForMime(mimeType) {
    const mime = String(mimeType || "").toLowerCase();
    if (mime === "image/png") return "png";
    if (mime === "image/jpeg") return "jpg";
    if (mime === "image/gif") return "gif";
    if (mime === "image/webp") return "webp";
    if (mime === "image/svg+xml") return "svg";
    return "bin";
  }

  async function buildInteractiveZip(input) {
    const layers = [];
    const files = [];
    for (let index = 0; index < input.layers.length; index++) {
      const layer = input.layers[index];
      const extension = extensionForMime(layer.mimeType || layer.blob?.type);
      const path = `assets/layer-${String(index + 1).padStart(2, "0")}.${extension}`;
      const data = layer.data ? asBytes(layer.data) : new Uint8Array(await layer.blob.arrayBuffer());
      files.push({ path, data });
      layers.push({ path: `./${path}`, name: String(layer.name || `Layer ${index + 1}`) });
    }
    const manifest = {
      schema: "pasta-rotini-interactive@1",
      name: input.name,
      seed: input.seed,
      tokenId: input.tokenId,
      projectId: input.projectId,
      width: input.width,
      height: input.height,
      traits: input.traits || [],
      provenance: input.provenance || undefined,
      layers,
    };
    files.unshift({ path: "index.html", data: interactiveHtml(manifest) });
    files.push({ path: "rotini-manifest.json", data: JSON.stringify(manifest, null, 2) });
    const validation = validateInteractiveFiles(files);
    if (!validation.ok) throw new Error(`interactive package failed validation: ${validation.errors.join("; ")}`);
    return { blob: zipFiles(files), manifest, validation };
  }

  function framePixels(frame) {
    if (frame?.data && Number.isInteger(frame.width) && Number.isInteger(frame.height)) return frame;
    if (frame?.getContext) {
      const context = frame.getContext("2d", { willReadFrequently: true });
      return context.getImageData(0, 0, frame.width, frame.height);
    }
    throw new Error("GIF frame must be ImageData or canvas-like");
  }

  function gifPalette() {
    const palette = new Uint8Array(256 * 3);
    for (let index = 0; index < 256; index++) {
      palette[index * 3] = Math.round(((index >>> 5) & 7) * 255 / 7);
      palette[index * 3 + 1] = Math.round(((index >>> 2) & 7) * 255 / 7);
      palette[index * 3 + 2] = Math.round((index & 3) * 255 / 3);
    }
    return palette;
  }

  function indexedPixels(frame, width, height) {
    const pixels = framePixels(frame);
    if (pixels.width !== width || pixels.height !== height) throw new Error("GIF frames must share dimensions");
    const output = new Uint8Array(width * height);
    for (let index = 0, pixel = 0; index < output.length; index++, pixel += 4) {
      output[index] = ((pixels.data[pixel] >>> 5) << 5) | ((pixels.data[pixel + 1] >>> 5) << 2) | (pixels.data[pixel + 2] >>> 6);
    }
    return output;
  }

  function lzwBytes(indices) {
    const clear = 256;
    const end = 257;
    let codeSize = 9;
    let nextCode = 258;
    let dictionary = new Map();
    const output = [];
    let bitBuffer = 0;
    let bitCount = 0;
    function write(code) {
      bitBuffer |= code << bitCount;
      bitCount += codeSize;
      while (bitCount >= 8) {
        output.push(bitBuffer & 255);
        bitBuffer >>>= 8;
        bitCount -= 8;
      }
    }
    function reset() {
      dictionary = new Map();
      codeSize = 9;
      nextCode = 258;
    }
    write(clear);
    if (indices.length > 0) {
      let prefix = indices[0];
      for (let index = 1; index < indices.length; index++) {
        const suffix = indices[index];
        const key = (prefix << 8) | suffix;
        const found = dictionary.get(key);
        if (found !== undefined) {
          prefix = found;
          continue;
        }
        write(prefix);
        if (nextCode < 4096) {
          dictionary.set(key, nextCode++);
          if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
        } else {
          write(clear);
          reset();
        }
        prefix = suffix;
      }
      write(prefix);
    }
    write(end);
    if (bitCount > 0) output.push(bitBuffer & 255);
    return Uint8Array.from(output);
  }

  function gifSubBlocks(bytes) {
    const parts = [];
    for (let offset = 0; offset < bytes.length; offset += 255) {
      const block = bytes.slice(offset, Math.min(offset + 255, bytes.length));
      parts.push(Uint8Array.of(block.length), block);
    }
    parts.push(Uint8Array.of(0));
    return concat(parts);
  }

  function encodeGif(frames, options = {}) {
    if (!Array.isArray(frames) || frames.length === 0) throw new Error("GIF requires at least one frame");
    const first = framePixels(frames[0]);
    const width = first.width;
    const height = first.height;
    if (width < 1 || height < 1 || width > 4096 || height > 4096) throw new Error("GIF dimensions are out of range");
    const delay = Math.max(1, Math.min(65535, Math.round((options.delayMs || 350) / 10)));
    const parts = [
      encoder.encode("GIF89a"), u16(width), u16(height), Uint8Array.of(0xf7, 0, 0), gifPalette(),
      Uint8Array.of(0x21, 0xff, 0x0b), encoder.encode("NETSCAPE2.0"), Uint8Array.of(3, 1, 0, 0, 0),
    ];
    for (const frame of frames) {
      const pixels = indexedPixels(frame, width, height);
      parts.push(
        Uint8Array.of(0x21, 0xf9, 4, 0), u16(delay), Uint8Array.of(0, 0),
        Uint8Array.of(0x2c), u16(0), u16(0), u16(width), u16(height), Uint8Array.of(0),
        Uint8Array.of(8), gifSubBlocks(lzwBytes(pixels)),
      );
    }
    parts.push(Uint8Array.of(0x3b));
    const bytes = concat(parts);
    if (bytes.length > MAX_ARTIFACT_BYTES) throw new Error("GIF exceeds Objkt's 250 MB artifact limit");
    return new Blob([bytes], { type: OUTPUTS.gif.mimeType });
  }

  function canvasToPng(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("could not encode PNG")), OUTPUTS.png.mimeType);
    });
  }

  async function sha256(blob) {
    const data = blob instanceof Blob ? await blob.arrayBuffer() : asBytes(blob);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
    return { bytes: digest, hex: [...digest].map((value) => value.toString(16).padStart(2, "0")).join("") };
  }

  function hashSeed(input) {
    let hash = 2166136261 >>> 0;
    const text = String(input);
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value + 0x6d2b79f5) | 0;
      let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
      mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  function selectTraits(manifest, seed) {
    const rng = mulberry32(hashSeed(String(seed)));
    return (manifest.layers || []).map((layer) => {
      const variants = Array.isArray(layer.variants) ? layer.variants : [];
      if (!variants.length) throw new Error(`generator layer ${layer.name || "(unnamed)"} has no variants`);
      const total = variants.reduce((sum, variant) => sum + (Number(variant.weight) > 0 ? Number(variant.weight) : 1), 0);
      let threshold = rng() * total;
      let selected = variants.at(-1);
      for (const variant of variants) {
        threshold -= Number(variant.weight) > 0 ? Number(variant.weight) : 1;
        if (threshold < 0) { selected = variant; break; }
      }
      return { layer: layer.name, value: selected.value, artifactUri: selected.artifactUri, mimeType: selected.mimeType || "image/png" };
    });
  }

  root.RotiniArtifacts = Object.freeze({
    MAX_ARTIFACT_BYTES,
    OUTPUTS,
    asBytes,
    buildInteractiveZip,
    canvasToPng,
    encodeGif,
    selectTraits,
    sha256,
    validateInteractiveFiles,
    zipFiles,
  });
})(typeof window !== "undefined" ? window : globalThis);
