"use strict";

const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");

const LOCAL_FILE_SIGNATURE = 0x04034b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;

function safeArchivePath(value) {
  const raw = String(value || "").replaceAll("\\", "/");
  const segments = raw.split("/");
  if (
    !raw ||
    raw.includes("\0") ||
    raw.startsWith("/") ||
    /^[a-zA-Z]:\//.test(raw) ||
    segments.includes("..")
  ) {
    throw new Error("site archive contains an unsafe path");
  }
  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error("site archive contains an unsafe path");
  }
  return normalized;
}

function safeSiteSlug(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!slug) throw new Error("invalid site slug");
  return slug;
}

function exactSiteSlug(value) {
  const slug = String(value || "");
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) throw new Error("invalid site slug");
  return slug;
}

function parseStoredZip(input, options = {}) {
  const archive = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const maxFiles = options.maxFiles ?? 64;
  const maxBytes = options.maxBytes ?? 25 * 1024 * 1024;
  const files = [];
  const paths = new Set();
  let offset = 0;
  let expandedBytes = 0;

  while (offset + 4 <= archive.length) {
    const signature = archive.readUInt32LE(offset);
    if (signature === CENTRAL_FILE_SIGNATURE || signature === END_SIGNATURE) break;
    if (signature !== LOCAL_FILE_SIGNATURE || offset + 30 > archive.length) {
      throw new Error("site archive is not a supported ZIP package");
    }
    const flags = archive.readUInt16LE(offset + 6);
    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const uncompressedSize = archive.readUInt32LE(offset + 22);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    if ((flags & 0x1) !== 0 || (flags & 0x8) !== 0 || method !== 0 || compressedSize !== uncompressedSize) {
      throw new Error("site archive must use unencrypted stored ZIP entries");
    }
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > archive.length) throw new Error("site archive is truncated");
    const archivePath = safeArchivePath(archive.subarray(nameStart, nameStart + nameLength).toString("utf8"));
    if (!archivePath.endsWith("/")) {
      if (paths.has(archivePath)) throw new Error("site archive contains duplicate paths");
      expandedBytes += uncompressedSize;
      if (files.length >= maxFiles || expandedBytes > maxBytes) throw new Error("site archive exceeds local hosting limits");
      paths.add(archivePath);
      files.push({ path: archivePath, data: Buffer.from(archive.subarray(dataStart, dataEnd)) });
    }
    offset = dataEnd;
  }

  if (!files.some((file) => file.path === "index.html")) throw new Error("site archive must contain index.html");
  return files;
}

function resolveHostedSitePath(root, urlPath) {
  const match = String(urlPath || "").match(/^\/sites\/([a-z0-9-]+)(?:\/(.*))?$/);
  if (!match) return null;
  let relative;
  try {
    relative = safeArchivePath(decodeURIComponent(match[2] || "index.html"));
  } catch (_) {
    return null;
  }
  const siteRoot = path.resolve(root, match[1]);
  const fullPath = path.resolve(siteRoot, relative);
  if (!fullPath.startsWith(`${siteRoot}${path.sep}`)) return null;
  return fullPath;
}

async function installStoredSite(input, { root, appId, title, now = new Date() }) {
  const files = parseStoredZip(input);
  const app = safeSiteSlug(appId || "pasta");
  const suffix = crypto.randomBytes(4).toString("hex");
  const slug = safeSiteSlug(`${app}-${now.getTime().toString(36)}-${suffix}`);
  const resolvedRoot = path.resolve(root);
  const target = path.join(resolvedRoot, slug);
  const staging = path.join(resolvedRoot, `.${slug}.installing`);
  await fsp.mkdir(resolvedRoot, { recursive: true });
  await fsp.rm(staging, { recursive: true, force: true });
  try {
    await fsp.mkdir(staging, { recursive: true });
    for (const file of files) {
      const destination = path.resolve(staging, file.path);
      if (!destination.startsWith(`${staging}${path.sep}`)) throw new Error("site archive contains an unsafe path");
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      await fsp.writeFile(destination, file.data);
    }
    const manifest = {
      app,
      title: String(title || `${app} site`).slice(0, 160),
      installedAt: now.toISOString(),
      fileCount: files.length,
    };
    await fsp.writeFile(path.join(staging, "pasta-site.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await fsp.rename(staging, target);
    return { ...manifest, slug, url: `/sites/${slug}/` };
  } catch (error) {
    await fsp.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function listStoredSites(root) {
  await fsp.mkdir(root, { recursive: true });
  const entries = await fsp.readdir(root, { withFileTypes: true });
  const sites = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-z0-9-]+$/.test(entry.name)) continue;
    try {
      const manifest = JSON.parse(await fsp.readFile(path.join(root, entry.name, "pasta-site.json"), "utf8"));
      sites.push({ ...manifest, slug: entry.name, url: `/sites/${entry.name}/` });
    } catch (_) {
      // Ignore incomplete or manually-created folders.
    }
  }
  return sites.sort((a, b) => String(b.installedAt).localeCompare(String(a.installedAt)));
}

async function removeStoredSite(root, value) {
  const slug = exactSiteSlug(value);
  const resolvedRoot = path.resolve(root);
  const target = path.join(resolvedRoot, slug);
  const tombstone = path.join(resolvedRoot, `.${slug}.removing-${crypto.randomBytes(4).toString("hex")}`);
  let manifest;
  try {
    const stats = await fsp.lstat(target);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("stored site is not a managed directory");
    manifest = JSON.parse(await fsp.readFile(path.join(target, "pasta-site.json"), "utf8"));
    await fsp.rename(target, tombstone);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("stored site not found");
    throw error;
  }
  try {
    await fsp.rm(tombstone, { recursive: true, force: true });
  } catch (error) {
    await fsp.rename(tombstone, target).catch(() => {});
    throw error;
  }
  return { ...manifest, slug, url: `/sites/${slug}/` };
}

module.exports = {
  exactSiteSlug,
  installStoredSite,
  listStoredSites,
  parseStoredZip,
  resolveHostedSitePath,
  removeStoredSite,
  safeArchivePath,
  safeSiteSlug,
};
