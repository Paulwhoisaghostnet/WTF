import { readFileSync } from "node:fs";
import path from "node:path";

type MacaroniRuntimeBundle = {
  commonJs: string;
  dropJs: string;
};

let cachedRuntime: MacaroniRuntimeBundle | null | undefined;

const COMPAT_STYLE = `
.mint-share-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.mint-share {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid var(--border, rgba(255,255,255,0.2));
  border-radius: 999px;
  color: var(--text, inherit);
  background: rgba(255,255,255,0.06);
  font-size: 0.78rem;
  text-decoration: none;
}
.mint-share:hover { border-color: var(--accent, currentColor); }
.recent-mints h2 { margin: 0; }
.recent-mints-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.recent-mint {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--border, rgba(255,255,255,0.2));
  border-radius: calc(var(--radius, 16px) / 2);
  background: var(--bg-soft, rgba(255,255,255,0.06));
}
.recent-mint-media {
  display: grid;
  place-items: center;
  width: 70px;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid var(--border, rgba(255,255,255,0.2));
  border-radius: calc(var(--radius, 16px) / 2);
  color: var(--text-dim, rgba(255,255,255,0.65));
  text-decoration: none;
}
.recent-mint-media img,
.recent-mint-media video { width: 100%; height: 100%; object-fit: cover; display: block; background: #000; }
.recent-mint-body { min-width: 0; }
.recent-mint-body strong,
.recent-mint-body a { overflow-wrap: anywhere; }
.recent-mint-time { font-size: 0.78rem; margin-top: 2px; }
`.trim();

function readPublicAsset(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function macaroniRuntime(): MacaroniRuntimeBundle | null {
  if (cachedRuntime !== undefined) return cachedRuntime;
  try {
    cachedRuntime = {
      commonJs: readPublicAsset("public/creation-tools/macaroni/js/common.js"),
      dropJs: readPublicAsset("public/creation-tools/macaroni/js/drop.js"),
    };
  } catch (err) {
    cachedRuntime = null;
    console.warn("[wtf-sites] could not load Macaroni compatibility runtime", err);
  }
  return cachedRuntime;
}

function inlineScript(id: string, source: string): string {
  return `<script id="${id}" data-macaroni-runtime-compat="current">\n${source.replace(/<\/script/gi, "<\\/script")}\n</script>`;
}

function replaceInlineScript(html: string, id: string, source: string): string {
  const re = new RegExp(`<script\\s+id=["']${id}["'][^>]*>[\\s\\S]*?<\\/script>`, "i");
  return html.replace(re, inlineScript(id, source));
}

function ensureCompatStyle(html: string): string {
  if (html.includes("data-macaroni-runtime-compat-style")) return html;
  const style = `<style data-macaroni-runtime-compat-style>\n${COMPAT_STYLE}\n</style>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${style}\n</head>`);
  return `${style}\n${html}`;
}

export function normalizeMacaroniPublishedHtml(html: string): string {
  if (!html.includes("window.DROP_CONFIG")) return html;
  if (!/id=["']macaroniDropJs["']/i.test(html)) return html;
  const runtime = macaroniRuntime();
  if (!runtime) return html;

  let next = html;
  if (/id=["']macaroniCommonJs["']/i.test(next)) {
    next = replaceInlineScript(next, "macaroniCommonJs", runtime.commonJs);
  }
  next = replaceInlineScript(next, "macaroniDropJs", runtime.dropJs);
  return ensureCompatStyle(next);
}
