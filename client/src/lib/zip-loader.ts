// @ts-ignore — local vendor UMD bundle
import * as JSZipModule from "./vendor/jszip.min.js";

const JSZip: any =
  (JSZipModule as any)?.default ??
  (JSZipModule as any)?.JSZip ??
  (globalThis as any).JSZip;

const MIME_MAP: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
  ".xml": "text/xml",
};

function guessMime(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

export interface GameBundle {
  entryUrl: string;
  fileMap: Map<string, string>;
  revoke: () => void;
}

/**
 * Extracts a zip ArrayBuffer and builds blob URLs for every file.
 * Returns an entry blob URL pointing at index.html with all relative
 * references rewritten to their corresponding blob URLs.
 */
export async function loadGameFromZip(
  zipData: ArrayBuffer
): Promise<GameBundle> {
  const zip = new JSZip();
  await zip.loadAsync(zipData);

  const fileMap = new Map<string, string>();
  const blobUrls: string[] = [];

  let rootPrefix = "";
  const names = Object.keys(zip.files);
  if (!names.some((n) => n === "index.html")) {
    const candidate = names.find(
      (n) => n.endsWith("/index.html") && n.split("/").length === 2
    );
    if (candidate) {
      rootPrefix = candidate.replace("index.html", "");
    }
  }

  const extractJobs: Promise<void>[] = [];
  for (const [path, entry] of Object.entries(zip.files) as [string, any][]) {
    if (entry.dir) continue;
    extractJobs.push(
      (async () => {
        const data: ArrayBuffer = await entry.async("arraybuffer");
        const mime = guessMime(path);
        const blob = new Blob([data], { type: mime });
        const url = URL.createObjectURL(blob);
        blobUrls.push(url);
        const relative = rootPrefix ? path.replace(rootPrefix, "") : path;
        fileMap.set(relative, url);
      })()
    );
  }
  await Promise.all(extractJobs);

  const indexUrl = fileMap.get("index.html");
  if (!indexUrl) {
    const revoke = () => blobUrls.forEach((u) => URL.revokeObjectURL(u));
    revoke();
    throw new Error("No index.html found in zip");
  }

  const indexBlob = await fetch(indexUrl).then((r) => r.blob());
  let html = await indexBlob.text();

  for (const [filename, blobUrl] of fileMap) {
    if (filename === "index.html") continue;
    const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(["'(])(\\.?\\/?)${escaped}(["')])`,
      "g"
    );
    html = html.replace(pattern, `$1${blobUrl}$3`);
  }

  URL.revokeObjectURL(indexUrl);
  const idx = blobUrls.indexOf(indexUrl);
  if (idx >= 0) blobUrls.splice(idx, 1);

  const rewrittenBlob = new Blob([html], { type: "text/html" });
  const entryUrl = URL.createObjectURL(rewrittenBlob);
  blobUrls.push(entryUrl);
  fileMap.set("index.html", entryUrl);

  return {
    entryUrl,
    fileMap,
    revoke: () => blobUrls.forEach((u) => URL.revokeObjectURL(u)),
  };
}
