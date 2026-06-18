"use strict";

function writeAscii(out, text) {
  for (let i = 0; i < text.length; i += 1) out.push(text.charCodeAt(i) & 255);
}

function writeU16(out, value) {
  out.push((value >> 8) & 255, value & 255);
}

function writeU32(out, value) {
  out.push((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
}

function writeSubBlocks(out, bytes) {
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
}

function make332Palette() {
  const palette = new Uint8Array(256 * 3);
  for (let r = 0; r < 8; r += 1) {
    for (let g = 0; g < 8; g += 1) {
      for (let b = 0; b < 4; b += 1) {
        const index = (r << 5) | (g << 2) | b;
        palette[index * 3] = Math.round((r / 7) * 255);
        palette[index * 3 + 1] = Math.round((g / 7) * 255);
        palette[index * 3 + 2] = Math.round((b / 3) * 255);
      }
    }
  }
  return palette;
}

function quantize332(pixels) {
  const indexes = new Uint8Array(pixels.length / 4);
  for (let src = 0, dst = 0; src < pixels.length; src += 4, dst += 1) {
    const alpha = pixels[src + 3] / 255;
    const r = Math.round(pixels[src] * alpha + 248 * (1 - alpha));
    const g = Math.round(pixels[src + 1] * alpha + 242 * (1 - alpha));
    const b = Math.round(pixels[src + 2] * alpha + 223 * (1 - alpha));
    indexes[dst] = ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
  }
  return indexes;
}

function lzwEncode(indexes, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const maxCode = 4095;
  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;
  let bitBuffer = 0;
  let bitCount = 0;
  const bytes = [];
  let dict = new Map();

  function resetDictionary() {
    dict = new Map();
    for (let i = 0; i < clearCode; i += 1) dict.set(String(i), i);
    codeSize = minCodeSize + 1;
    nextCode = endCode + 1;
  }

  function writeCode(code) {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 255);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  }

  resetDictionary();
  writeCode(clearCode);
  let prefix = String(indexes[0] || 0);

  for (let i = 1; i < indexes.length; i += 1) {
    const value = indexes[i];
    const next = `${prefix},${value}`;
    if (dict.has(next)) {
      prefix = next;
      continue;
    }
    writeCode(dict.get(prefix));
    if (nextCode <= maxCode) {
      dict.set(next, nextCode);
      nextCode += 1;
      if (nextCode === 1 << codeSize && codeSize < 12) codeSize += 1;
    } else {
      writeCode(clearCode);
      resetDictionary();
    }
    prefix = String(value);
  }

  writeCode(dict.get(prefix));
  writeCode(endCode);
  if (bitCount > 0) bytes.push(bitBuffer & 255);
  return new Uint8Array(bytes);
}

function encodeGif(width, height, pixelBuffer) {
  if (width < 1 || height < 1 || width > 4096 || height > 4096) {
    throw new Error("GIF export supports canvases up to 4096px on each side.");
  }
  const pixels = new Uint8ClampedArray(pixelBuffer);
  const indexes = quantize332(pixels);
  const palette = make332Palette();
  const imageData = lzwEncode(indexes, 8);
  const out = [];

  writeAscii(out, "GIF89a");
  writeU16(out, width);
  writeU16(out, height);
  out.push(0xf7, 0, 0);
  out.push(...palette);
  out.push(0x21, 0xf9, 0x04, 0x00);
  writeU16(out, 0);
  out.push(0, 0);
  out.push(0x2c);
  writeU16(out, 0);
  writeU16(out, 0);
  writeU16(out, width);
  writeU16(out, height);
  out.push(0);
  out.push(8);
  writeSubBlocks(out, imageData);
  out.push(0x3b);
  return new Uint8Array(out).buffer;
}

function encodePsd(width, height, pixelBuffer) {
  if (width < 1 || height < 1 || width > 30000 || height > 30000) {
    throw new Error("PSD export dimensions are outside the Photoshop header limit.");
  }
  const pixels = new Uint8ClampedArray(pixelBuffer);
  const out = [];
  writeAscii(out, "8BPS");
  writeU16(out, 1);
  out.push(0, 0, 0, 0, 0, 0);
  writeU16(out, 3);
  writeU32(out, height);
  writeU32(out, width);
  writeU16(out, 8);
  writeU16(out, 3);
  writeU32(out, 0);
  writeU32(out, 0);
  writeU32(out, 0);
  writeU16(out, 0);

  const planeSize = width * height;
  const planes = [new Uint8Array(planeSize), new Uint8Array(planeSize), new Uint8Array(planeSize)];
  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    const alpha = pixels[i + 3] / 255;
    planes[0][p] = Math.round(pixels[i] * alpha + 248 * (1 - alpha));
    planes[1][p] = Math.round(pixels[i + 1] * alpha + 242 * (1 - alpha));
    planes[2][p] = Math.round(pixels[i + 2] * alpha + 223 * (1 - alpha));
  }
  for (const plane of planes) out.push(...plane);
  return new Uint8Array(out).buffer;
}

function buildArtifacts(payload) {
  const tags = String(payload.tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const artifactUri = payload.artifactUri || "";
  const wallet = payload.walletAddress || "";
  const royaltyBps = Math.max(0, Math.min(2500, Number(payload.royaltyBps || 0)));
  const metadata = {
    name: payload.name || "Untitled Broot artifact",
    description: payload.description || "",
    artifactUri,
    displayUri: payload.displayUri || artifactUri,
    thumbnailUri: payload.thumbnailUri || artifactUri,
    decimals: 0,
    symbol: payload.symbol || "BROOT",
    creators: wallet ? [wallet] : [],
    tags,
    formats: [
      {
        uri: artifactUri,
        mimeType: payload.mimeType || "image/png",
        fileName: payload.fileName || "broot.png",
      },
    ],
    royalties: wallet
      ? {
          decimals: 4,
          shares: {
            [wallet]: royaltyBps,
          },
        }
      : { decimals: 4, shares: {} },
    attributes: [
      { name: "tool", value: "Broot" },
      { name: "network", value: payload.network || "shadownet" },
      { name: "canvas", value: `${payload.width}x${payload.height}` },
    ],
  };
  const fa2Artifact = {
    kind: "broot.fa2_artifact.v1",
    network: payload.network || "shadownet",
    artifactPolicy: "creator-originated FA2 token metadata",
    walletAddress: wallet || null,
    token: {
      tokenId: Number(payload.tokenId || 0),
      amount: Number(payload.amount || 1),
      metadata,
    },
    files: {
      artifact: artifactUri || null,
      metadata: payload.metadataUri || null,
      svgSnapshot: payload.svg || "",
    },
  };
  return { metadata, fa2Artifact };
}

self.onmessage = (event) => {
  const { id, type, payload } = event.data || {};
  try {
    if (type === "encodeGif") {
      const buffer = encodeGif(payload.width, payload.height, payload.pixels);
      self.postMessage({ id, ok: true, buffer, mimeType: "image/gif" }, [buffer]);
      return;
    }
    if (type === "encodePsd") {
      const buffer = encodePsd(payload.width, payload.height, payload.pixels);
      self.postMessage({ id, ok: true, buffer, mimeType: "image/vnd.adobe.photoshop" }, [buffer]);
      return;
    }
    if (type === "buildArtifacts") {
      self.postMessage({ id, ok: true, artifacts: buildArtifacts(payload) });
      return;
    }
    throw new Error(`Unknown worker job: ${type}`);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error && error.message ? error.message : String(error),
    });
  }
};
