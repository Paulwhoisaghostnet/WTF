import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  cacheConsoleDependencyTree,
  collectConsoleDependencyDecisions,
  isConsoleDependencyCached,
  type ConsoleDependencyDecision,
} from "./dependency-proxy";

const SEARCH_ROOTS = [
  path.resolve(process.cwd(), "dist", "public", "games", "installed"),
  path.resolve(process.cwd(), "public", "games", "installed"),
];

const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs", ".svg", ".txt", ".xml"]);
const MAX_SCAN_FILES = 500;
const MAX_TEXT_BYTES = Number(process.env.CONSOLE_DEPENDENCY_SCAN_MAX_TEXT_BYTES || 5 * 1024 * 1024);

export type ConsoleDependencyAuditEntry = ConsoleDependencyDecision & {
  cached?: boolean;
  files: string[];
};

export type ConsoleDependencyAudit = {
  slug: string;
  root: string;
  scannedFiles: number;
  dependencies: ConsoleDependencyAuditEntry[];
};

function safeSlug(slug: string): string {
  return String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}

function findInstalledRoot(slug: string): string {
  const safe = safeSlug(slug);
  if (!safe) throw new Error("Missing console cartridge slug");
  for (const root of SEARCH_ROOTS) {
    const candidate = path.join(root, safe);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Console cartridge not found: ${safe}`);
}

async function walkTextFiles(root: string, dir = root, out: string[] = []): Promise<string[]> {
  if (out.length >= MAX_SCAN_FILES) return out;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (out.length >= MAX_SCAN_FILES) break;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      await walkTextFiles(root, full, out);
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      const stat = await fs.stat(full);
      if (stat.size <= MAX_TEXT_BYTES) out.push(full);
    }
  }
  return out;
}

function auditKey(decision: ConsoleDependencyDecision): string {
  return decision.status === "cacheable"
    ? decision.url
    : `${decision.status}:${decision.reason}:${decision.rawUrl}`;
}

export async function auditInstalledConsoleCartridgeDependencies(
  slug: string
): Promise<ConsoleDependencyAudit> {
  const root = findInstalledRoot(slug);
  const files = await walkTextFiles(root);
  const byKey = new Map<string, ConsoleDependencyAuditEntry>();

  for (const filePath of files) {
    const rel = path.relative(root, filePath).replace(/\\/g, "/");
    const body = await fs.readFile(filePath, "utf8");
    for (const decision of collectConsoleDependencyDecisions(body)) {
      const key = auditKey(decision);
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.files.includes(rel)) existing.files.push(rel);
        continue;
      }
      const entry: ConsoleDependencyAuditEntry = {
        ...decision,
        files: [rel],
      };
      if (decision.status === "cacheable") {
        entry.cached = isConsoleDependencyCached(new URL(decision.url));
      }
      byKey.set(key, entry);
    }
  }

  return {
    slug: safeSlug(slug),
    root,
    scannedFiles: files.length,
    dependencies: [...byKey.values()].sort((a, b) => a.rawUrl.localeCompare(b.rawUrl)),
  };
}

export async function warmInstalledConsoleCartridgeDependencies(slug: string) {
  const before = await auditInstalledConsoleCartridgeDependencies(slug);
  const warmed: Array<{ url: string; bytes: number; contentType: string }> = [];
  const failed: Array<{ url: string; error: string }> = [];

  for (const dep of before.dependencies) {
    if (dep.status !== "cacheable") continue;
    try {
      const metas = await cacheConsoleDependencyTree(new URL(dep.url), { depth: 2 });
      for (const meta of metas) {
        warmed.push({
          url: meta.sourceUrl,
          bytes: meta.bytes,
          contentType: meta.contentType,
        });
      }
    } catch (err) {
      failed.push({
        url: dep.url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    before,
    after: await auditInstalledConsoleCartridgeDependencies(slug),
    warmed,
    failed,
  };
}
