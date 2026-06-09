/**
 * GenerativeArtPanel — Phase 11 Generative Art Minting
 *
 * Provides:
 *   1. A code editor (textarea) for writing p5.js-compatible generative art.
 *   2. A live-preview iframe that sandboxes and reruns the sketch on demand.
 *   3. A ZIP download that packages the sketch as a self-contained HTML file
 *      suitable for IPFS upload and on-chain minting.
 *
 * No external dependencies — p5.js is loaded from a CDN script tag inside the
 * generated HTML.  If `public/assets/p5.min.js` is present it will be inlined;
 * otherwise the generated HTML fetches p5 from cdnjs.
 */

import { useRef, useState } from "react";
import { Button, GroupBox, Separator } from "react95";
import styled from "styled-components";

// ── Styled elements ────────────────────────────────────────────────────────

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const EditorTextarea = styled.textarea`
  width: 100%;
  font-family: var(--wtf-mono-font);
  font-size: 12px;
  background: #0b0b0b;
  color: #d6d6d6;
  border: 2px inset #808080;
  padding: 8px;
  resize: vertical;
  tab-size: 2;
`;

const PreviewFrame = styled.iframe`
  width: 100%;
  height: 300px;
  border: 2px inset #808080;
  background: #000;
`;

const Muted = styled.span`
  color: #555;
  font-size: 12px;
`;

// ── Default sketch ─────────────────────────────────────────────────────────

const DEFAULT_SKETCH = `// Generative Art Sketch — edit and click Preview
// p5.js API is available via the global p5 instance.

function setup() {
  createCanvas(400, 400);
  noLoop();
}

function draw() {
  background(10);
  colorMode(HSB, 360, 100, 100, 100);
  noFill();
  strokeWeight(1.2);

  const cx = width / 2;
  const cy = height / 2;
  const count = 120;

  for (let i = 0; i < count; i++) {
    const angle = TWO_PI * (i / count);
    const r = 60 + noise(i * 0.15, frameCount * 0.01) * 120;
    const x = cx + cos(angle) * r;
    const y = cy + sin(angle) * r;
    stroke((i / count) * 360, 80, 90, 60);
    line(cx, cy, x, y);
  }
}
`;

// ── HTML scaffold builder ──────────────────────────────────────────────────

function buildHtml(sketch: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; overflow: hidden; }
    canvas { display: block; }
  </style>
</head>
<body>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js"></script>
  <script>
${sketch}
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Pure-JS ZIP builder (no external deps) ────────────────────────────────
//
// Implements a minimal store-only (no compression) ZIP to package the
// single index.html.  Compression would require a deflate implementation;
// store is sufficient for IPFS upload and previewing in wallets.

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  const table = crc32Table();
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let _crc32Table: Uint32Array | null = null;
function crc32Table(): Uint32Array {
  if (_crc32Table) return _crc32Table;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  _crc32Table = t;
  return t;
}

function writeUint16LE(buf: DataView, offset: number, value: number) {
  buf.setUint16(offset, value, true);
}
function writeUint32LE(buf: DataView, offset: number, value: number) {
  buf.setUint32(offset, value, true);
}

function buildZip(filename: string, content: string): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const fileData = enc.encode(content);
  const nameData = enc.encode(filename);
  const crc = crc32(fileData);
  const now = new Date();
  const dosTime =
    ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) >>> 0;
  const dosDate =
    ((((now.getFullYear() - 1980) & 0x7f) << 9) |
      (((now.getMonth() + 1) & 0x0f) << 5) |
      (now.getDate() & 0x1f)) >>>
    0;

  // Local file header (30 bytes) + name + data
  const localHeaderSize = 30 + nameData.length;
  const localBuf = new ArrayBuffer(localHeaderSize + fileData.length);
  const lv = new DataView(localBuf);
  const la = new Uint8Array(localBuf);

  writeUint32LE(lv, 0, 0x04034b50); // signature
  writeUint16LE(lv, 4, 20);          // version needed
  writeUint16LE(lv, 6, 0);           // general purpose bit flag
  writeUint16LE(lv, 8, 0);           // compression method: store
  writeUint16LE(lv, 10, dosTime);
  writeUint16LE(lv, 12, dosDate);
  writeUint32LE(lv, 14, crc);
  writeUint32LE(lv, 18, fileData.length); // compressed size
  writeUint32LE(lv, 22, fileData.length); // uncompressed size
  writeUint16LE(lv, 26, nameData.length);
  writeUint16LE(lv, 28, 0); // extra field length
  la.set(nameData, 30);
  la.set(fileData, 30 + nameData.length);

  // Central directory header (46 bytes) + name
  const cdSize = 46 + nameData.length;
  const cdBuf = new ArrayBuffer(cdSize);
  const cv = new DataView(cdBuf);
  const ca = new Uint8Array(cdBuf);

  writeUint32LE(cv, 0, 0x02014b50); // signature
  writeUint16LE(cv, 4, 20);          // version made by
  writeUint16LE(cv, 6, 20);          // version needed
  writeUint16LE(cv, 8, 0);
  writeUint16LE(cv, 10, 0);
  writeUint16LE(cv, 12, dosTime);
  writeUint16LE(cv, 14, dosDate);
  writeUint32LE(cv, 16, crc);
  writeUint32LE(cv, 20, fileData.length);
  writeUint32LE(cv, 24, fileData.length);
  writeUint16LE(cv, 28, nameData.length);
  writeUint16LE(cv, 30, 0); // extra
  writeUint16LE(cv, 32, 0); // comment
  writeUint16LE(cv, 34, 0); // disk start
  writeUint16LE(cv, 36, 0); // internal attr
  writeUint32LE(cv, 38, 0); // external attr
  writeUint32LE(cv, 42, 0); // relative offset of local header
  ca.set(nameData, 46);

  // End of central directory record (22 bytes)
  const eocdBuf = new ArrayBuffer(22);
  const ev = new DataView(eocdBuf);

  writeUint32LE(ev, 0, 0x06054b50); // signature
  writeUint16LE(ev, 4, 0);
  writeUint16LE(ev, 6, 0);
  writeUint16LE(ev, 8, 1);
  writeUint16LE(ev, 10, 1);
  writeUint32LE(ev, 12, cdSize);
  writeUint32LE(ev, 16, localHeaderSize + fileData.length);
  writeUint16LE(ev, 20, 0);

  const outBuf = new ArrayBuffer(la.length + cdSize + 22);
  const total = new Uint8Array(outBuf);
  total.set(la, 0);
  total.set(ca, la.length);
  total.set(new Uint8Array(eocdBuf), la.length + cdSize);
  return total as Uint8Array<ArrayBuffer>;
}

// ── Component ──────────────────────────────────────────────────────────────

export function GenerativeArtPanel() {
  const [code, setCode] = useState(DEFAULT_SKETCH);
  const [title, setTitle] = useState("My Generative Artwork");
  const [previewKey, setPreviewKey] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function handlePreview() {
    setShowPreview(true);
    setPreviewKey((k) => k + 1);
  }

  function handleDownloadZip() {
    const html = buildHtml(code, title);
    const zip = buildZip("index.html", html);
    const blob = new Blob([zip], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "sketch"}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const previewSrc = showPreview
    ? `data:text/html;charset=utf-8,${encodeURIComponent(buildHtml(code, title))}`
    : undefined;

  return (
    <Stack>
      <GroupBox label="Generative Art Minting Studio">
        <Muted>
          Write a p5.js sketch. Preview it live, then download as a
          self-contained ZIP for IPFS upload and on-chain minting.
        </Muted>

        <Separator style={{ margin: "8px 0" }} />

        <Row>
          <span style={{ fontSize: 12 }}>Artwork title:</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              flex: 1,
              fontFamily: "var(--wtf-mono-font)",
              fontSize: 12,
              padding: "2px 6px",
              border: "2px inset #808080",
            }}
          />
        </Row>

        <EditorTextarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={18}
          spellCheck={false}
        />

        <Row style={{ marginTop: 6 }}>
          <Button onClick={handlePreview}>▶ Preview</Button>
          <Button onClick={handleDownloadZip}>⬇ Download ZIP</Button>
          <Muted>
            ZIP contains a standalone <code>index.html</code> ready for IPFS.
          </Muted>
        </Row>
      </GroupBox>

      {showPreview && (
        <GroupBox label="Live Preview">
          <PreviewFrame
            key={previewKey}
            ref={iframeRef}
            src={previewSrc}
            sandbox="allow-scripts"
            title="Generative art preview"
          />
          <Muted style={{ marginTop: 4 }}>
            Sandboxed iframe — click Preview again after editing to refresh.
          </Muted>
        </GroupBox>
      )}

      <GroupBox label="Minting guide">
        <p style={{ fontSize: 11 }}>
          1. Write your p5.js sketch in the editor above.{" "}
          <code>setup()</code> and <code>draw()</code> are the standard p5
          entry-points.
        </p>
        <p style={{ fontSize: 11, marginTop: 4 }}>
          2. Click <strong>Preview</strong> to run the sketch in a sandboxed
          iframe.
        </p>
        <p style={{ fontSize: 11, marginTop: 4 }}>
          3. Click <strong>Download ZIP</strong> to get a self-contained{" "}
          <code>index.html</code> packaged as a ZIP.
        </p>
        <p style={{ fontSize: 11, marginTop: 4 }}>
          4. Upload the ZIP to IPFS via Pinata, NFT.Storage, or the WTF file
          manager, then use the resulting <code>ipfs://</code> URI as the
          <code>artifactUri</code> when minting via the{" "}
          <strong>Mint Portal</strong>.
        </p>
      </GroupBox>
    </Stack>
  );
}
