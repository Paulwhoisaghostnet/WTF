import { inflateRawSync } from "node:zlib";
import path from "node:path";
import { promises as fs } from "node:fs";
import type { Request, Response } from "express";
import { assertInsideRoot, WTF_DATA_ROOT } from "../../lib/storage/paths";

export const CONSOLE_BUNDLE_ROOT =
  process.env.CONSOLE_BUNDLE_ROOT?.trim() ||
  path.join(WTF_DATA_ROOT, "console-bundles");

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

export const CONSOLE_BUNDLE_LIMITS = {
  maxZipBytes: Math.max(
    1024 * 1024,
    Number(process.env.CONSOLE_BUNDLE_MAX_ZIP_BYTES || 25 * 1024 * 1024)
  ),
  maxUncompressedBytes: Math.max(
    1024 * 1024,
    Number(process.env.CONSOLE_BUNDLE_MAX_UNCOMPRESSED_BYTES || 40 * 1024 * 1024)
  ),
  maxFileBytes: Math.max(
    64 * 1024,
    Number(process.env.CONSOLE_BUNDLE_MAX_FILE_BYTES || 8 * 1024 * 1024)
  ),
  maxFiles: Math.max(1, Number(process.env.CONSOLE_BUNDLE_MAX_FILES || 300)),
};

const ALLOWED_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".mp3",
  ".wav",
  ".ogg",
  ".oga",
  ".mp4",
  ".webm",
  ".woff",
  ".woff2",
  ".wasm",
]);

export type ConsoleBundleFile = {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
};

export type ConsoleBundleValidation = {
  ok: boolean;
  errors: string[];
  files: ConsoleBundleFile[];
  totalUncompressedBytes: number;
  hasSdk: boolean;
  entryPath: "index.html";
};

type ZipEntry = ConsoleBundleFile & {
  localHeaderOffset: number;
  dataStart: number;
};

export type ConsoleBundleExtraction = ConsoleBundleValidation & {
  rootDir: string;
  publicBasePath: string;
  entryUri: string;
};

export function isConsoleZipMime(mimeType: string | null | undefined): boolean {
  const mime = String(mimeType || "").toLowerCase().split(";")[0].trim();
  return (
    mime === "application/zip" ||
    mime === "application/x-zip" ||
    mime === "application/x-zip-compressed"
  );
}

export function validateConsoleBundleZip(zipBytes: Buffer): ConsoleBundleValidation {
  const errors: string[] = [];
  const files: ConsoleBundleFile[] = [];

  if (zipBytes.byteLength > CONSOLE_BUNDLE_LIMITS.maxZipBytes) {
    errors.push(`zip_too_large:${zipBytes.byteLength}`);
  }

  let entries: ZipEntry[] = [];
  try {
    entries = readCentralDirectory(zipBytes);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "invalid_zip");
  }

  let totalUncompressedBytes = 0;
  let hasRootIndex = false;
  let hasSdk = false;

  for (const entry of entries) {
    const fileError = validateBundlePath(entry.path);
    if (fileError) {
      errors.push(`${fileError}:${entry.path}`);
      continue;
    }

    const ext = path.posix.extname(entry.path).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      errors.push(`extension_not_allowed:${entry.path}`);
    }

    if (entry.method !== 0 && entry.method !== 8) {
      errors.push(`compression_not_supported:${entry.path}`);
    }

    if (entry.uncompressedSize > CONSOLE_BUNDLE_LIMITS.maxFileBytes) {
      errors.push(`file_too_large:${entry.path}`);
    }

    totalUncompressedBytes += entry.uncompressedSize;
    files.push({
      path: entry.path,
      compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize,
      method: entry.method,
    });

    if (entry.path === "index.html") hasRootIndex = true;
    if (entry.path === "api/console/sdk.js" || entry.path.endsWith("/sdk.js")) {
      hasSdk = true;
    }
  }

  if (files.length > CONSOLE_BUNDLE_LIMITS.maxFiles) {
    errors.push(`too_many_files:${files.length}`);
  }
  if (totalUncompressedBytes > CONSOLE_BUNDLE_LIMITS.maxUncompressedBytes) {
    errors.push(`bundle_too_large:${totalUncompressedBytes}`);
  }
  if (!hasRootIndex) errors.push("missing_root_index_html");

  return {
    ok: errors.length === 0,
    errors,
    files,
    totalUncompressedBytes,
    hasSdk,
    entryPath: "index.html",
  };
}

export async function extractConsoleBundleZip(input: {
  zipBytes: Buffer;
  slug: string;
  version: number;
}): Promise<ConsoleBundleExtraction> {
  const slug = normalizeBundleSlug(input.slug);
  const version = normalizeBundleVersion(input.version);
  const validation = validateConsoleBundleZip(input.zipBytes);
  if (!validation.ok) {
    throw new Error(`Console bundle validation failed: ${validation.errors.join(", ")}`);
  }

  const entries = readCentralDirectory(input.zipBytes);
  const targetDir = bundleVersionDir(slug, version);
  const stagingDir = path.join(
    CONSOLE_BUNDLE_ROOT,
    ".incoming",
    `${slug}-v${version}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  assertInsideRoot(stagingDir, CONSOLE_BUNDLE_ROOT);
  assertInsideRoot(targetDir, CONSOLE_BUNDLE_ROOT);

  await fs.rm(stagingDir, { recursive: true, force: true });
  await fs.mkdir(stagingDir, { recursive: true });

  try {
    for (const entry of entries) {
      if (validateBundlePath(entry.path)) continue;
      const bytes = inflateEntry(input.zipBytes, entry);
      const outputPath = path.join(stagingDir, entry.path);
      assertInsideRoot(outputPath, stagingDir);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(
        outputPath,
        entry.path === "index.html" ? injectConsoleSdk(bytes, slug) : bytes
      );
    }

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.mkdir(path.dirname(targetDir), { recursive: true });
    await fs.rename(stagingDir, targetDir);
  } catch (error) {
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  const publicBasePath = `/api/console/bundles/${slug}/v${version}`;
  return {
    ...validation,
    rootDir: targetDir,
    publicBasePath,
    entryUri: `${publicBasePath}/index.html?game=${encodeURIComponent(slug)}&slug=${encodeURIComponent(slug)}`,
  };
}

export async function serveConsoleBundleFile(req: Request, res: Response) {
  const raw = String((req.params as any)[0] || "");
  const parsed = parseBundleRequestPath(raw);
  if (!parsed) return res.status(400).json({ error: "Invalid console bundle path" });

  const filePath = path.join(
    bundleVersionDir(parsed.slug, parsed.version),
    parsed.filePath
  );
  try {
    assertInsideRoot(filePath, bundleVersionDir(parsed.slug, parsed.version));
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return res.status(404).json({ error: "Console bundle file not found" });

    const bytes = await fs.readFile(filePath);
    const contentType = contentTypeForPath(parsed.filePath);
    res
      .status(200)
      .type(contentType)
      .setHeader("Cache-Control", parsed.filePath === "index.html"
        ? "public, max-age=60"
        : "public, max-age=31536000, immutable")
      .setHeader("Cross-Origin-Resource-Policy", "cross-origin")
      .setHeader("Access-Control-Allow-Origin", "*");

    if (contentType.startsWith("text/html")) {
      res.setHeader(
        "Content-Security-Policy",
        [
          "default-src 'self' blob: data:",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "media-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "frame-ancestors 'self'",
          "base-uri 'none'",
          "object-src 'none'",
        ].join("; ")
      );
    }

    return res.send(bytes);
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return res.status(404).json({ error: "Console bundle file not found" });
    }
    console.warn("[console] bundle serve failed:", error);
    return res.status(500).json({ error: "Failed to serve console bundle" });
  }
}

function normalizeBundleSlug(slug: string): string {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(normalized)) {
    throw new Error("Invalid console bundle slug.");
  }
  return normalized;
}

function normalizeBundleVersion(version: number): number {
  const normalized = Number(version);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 1_000_000) {
    throw new Error("Invalid console bundle version.");
  }
  return normalized;
}

function bundleVersionDir(slug: string, version: number): string {
  return path.join(
    CONSOLE_BUNDLE_ROOT,
    normalizeBundleSlug(slug),
    `v${normalizeBundleVersion(version)}`
  );
}

function parseBundleRequestPath(raw: string): {
  slug: string;
  version: number;
  filePath: string;
} | null {
  const cleaned = String(raw || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const match = cleaned.match(/^([a-z0-9][a-z0-9-]{0,119})\/v([1-9]\d*)\/(.+)$/);
  if (!match) return null;
  const filePath = normalizeZipPath(match[3]);
  if (!filePath || validateBundlePath(filePath)) return null;
  return {
    slug: normalizeBundleSlug(match[1]),
    version: normalizeBundleVersion(Number(match[2])),
    filePath,
  };
}

function readCentralDirectory(zipBytes: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(zipBytes);
  if (eocdOffset < 0) throw new Error("invalid_zip:eocd_missing");

  const entryCount = zipBytes.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = zipBytes.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = zipBytes.readUInt32LE(eocdOffset + 16);
  if (
    centralDirectoryOffset <= 0 ||
    centralDirectoryOffset + centralDirectorySize > zipBytes.byteLength
  ) {
    throw new Error("invalid_zip:central_directory_out_of_bounds");
  }

  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;
  for (let i = 0; i < entryCount; i++) {
    if (zipBytes.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("invalid_zip:central_directory_corrupt");
    }
    const flags = zipBytes.readUInt16LE(offset + 8);
    if ((flags & 0x1) === 0x1) throw new Error("invalid_zip:encrypted_entries_not_allowed");

    const method = zipBytes.readUInt16LE(offset + 10);
    const compressedSize = zipBytes.readUInt32LE(offset + 20);
    const uncompressedSize = zipBytes.readUInt32LE(offset + 24);
    const nameLength = zipBytes.readUInt16LE(offset + 28);
    const extraLength = zipBytes.readUInt16LE(offset + 30);
    const commentLength = zipBytes.readUInt16LE(offset + 32);
    const localHeaderOffset = zipBytes.readUInt32LE(offset + 42);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error("invalid_zip:zip64_not_supported");
    }

    const name = zipBytes
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8");
    offset += 46 + nameLength + extraLength + commentLength;

    const normalizedPath = normalizeZipPath(name);
    if (!normalizedPath || normalizedPath.endsWith("/")) continue;

    if (localHeaderOffset + 30 > zipBytes.byteLength) {
      throw new Error("invalid_zip:local_header_out_of_bounds");
    }
    if (zipBytes.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
      throw new Error("invalid_zip:local_header_corrupt");
    }
    const localNameLength = zipBytes.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = zipBytes.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > zipBytes.byteLength) {
      throw new Error("invalid_zip:file_data_out_of_bounds");
    }

    entries.push({
      path: normalizedPath,
      compressedSize,
      uncompressedSize,
      method,
      localHeaderOffset,
      dataStart,
    });
  }

  return entries;
}

function findEndOfCentralDirectory(zipBytes: Buffer): number {
  const minOffset = Math.max(0, zipBytes.byteLength - 65_557);
  for (let offset = zipBytes.byteLength - 22; offset >= minOffset; offset--) {
    if (zipBytes.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

function normalizeZipPath(value: string): string {
  return String(value || "")
    .replace(/\0/g, "")
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/{2,}/g, "/");
}

function validateBundlePath(filePath: string): string | null {
  if (!filePath) return "empty_path";
  if (filePath.startsWith("/") || path.isAbsolute(filePath)) return "absolute_path";
  if (/^[a-zA-Z]:\//.test(filePath)) return "drive_path";
  const parts = filePath.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    return "unsafe_path_segment";
  }
  if (parts[0] === "__MACOSX") return "macosx_metadata_not_allowed";
  return null;
}

function inflateEntry(zipBytes: Buffer, entry: ZipEntry): Buffer {
  const compressed = zipBytes.subarray(
    entry.dataStart,
    entry.dataStart + entry.compressedSize
  );
  const output = entry.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
  if (output.byteLength !== entry.uncompressedSize) {
    throw new Error(`Console bundle file size mismatch: ${entry.path}`);
  }
  return output;
}

function injectConsoleSdk(bytes: Buffer, slug: string): Buffer {
  const html = bytes.toString("utf8");
  if (html.includes("/api/console/sdk.js")) return bytes;
  const script = `<script src="/api/console/sdk.js" data-game="${escapeHtmlAttr(slug)}"></script>`;
  if (/<\/head>/i.test(html)) {
    return Buffer.from(html.replace(/<\/head>/i, `${script}\n</head>`), "utf8");
  }
  if (/<\/body>/i.test(html)) {
    return Buffer.from(html.replace(/<\/body>/i, `${script}\n</body>`), "utf8");
  }
  return Buffer.from(`${script}\n${html}`, "utf8");
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function contentTypeForPath(filePath: string): string {
  const ext = path.posix.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
    case ".htm":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".ogg":
    case ".oga":
      return "audio/ogg";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".wasm":
      return "application/wasm";
    default:
      return "application/octet-stream";
  }
}
