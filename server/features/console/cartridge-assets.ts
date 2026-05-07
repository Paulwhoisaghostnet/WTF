import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { rewriteConsoleDependencyUrls } from "./dependency-proxy";

const SEARCH_ROOTS = [
  path.resolve(process.cwd(), "dist", "public", "games", "installed"),
  path.resolve(process.cwd(), "public", "games", "installed"),
];

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".txt",
  ".xml",
]);

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".wasm") return "application/wasm";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".zip" || ext === ".jsdos") return "application/zip";
  if (ext === ".nes" || ext === ".sfc" || ext === ".smc" || ext === ".gb" || ext === ".gbc" || ext === ".gba") {
    return "application/octet-stream";
  }
  return "application/octet-stream";
}

function resolveInstalledPath(rawRelPath: string): string | null {
  const decoded = decodeURIComponent(rawRelPath || "");
  const normalized = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  if (!normalized || path.isAbsolute(normalized) || normalized.startsWith("..")) return null;

  for (const root of SEARCH_ROOTS) {
    const candidate = path.resolve(root, normalized);
    if (!candidate.startsWith(root + path.sep) && candidate !== root) continue;
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // Try the next root.
    }
  }
  return null;
}

export function serveInstalledConsoleCartridge(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const rawRelPath = String((req.params as Record<string, string | undefined>)[0] || "");
  const filePath = resolveInstalledPath(rawRelPath);
  if (!filePath) return next();

  noStore(res);
  const ext = path.extname(filePath).toLowerCase();
  res.type(contentTypeFor(filePath));

  if (TEXT_EXTENSIONS.has(ext)) {
    const body = fs.readFileSync(filePath, "utf-8");
    return res.send(rewriteConsoleDependencyUrls(body));
  }
  return res.sendFile(filePath);
}
