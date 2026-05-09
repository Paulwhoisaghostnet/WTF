import type { GameStudioTemplate } from "./catalog";
import { buildGameStudioStockAssetFile } from "./catalog";

export type GameStudioLocalAsset = {
  id: string;
  name: string;
  size: number;
  type: string;
  dataBase64?: string;
};

export type GameStudioBundleManifest = {
  title: string;
  slug: string;
  templateId: string;
  engine: GameStudioTemplate["engine"];
  sdkVersion: string;
  files: string[];
  stockAssets: Array<{
    id: string;
    title: string;
    kind: string;
    path: string;
    license: string;
  }>;
  uploadedAssets: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    path?: string;
  }>;
  builtAt: string;
};

type ZipEntryInput = {
  path: string;
  data: Buffer | string;
};

const MAX_ZIP_ENTRIES = 350;
const MAX_STUDIO_FILE_BYTES = 8 * 1024 * 1024;
export const GAME_STUDIO_MAX_LOCAL_ASSET_BYTES = 2 * 1024 * 1024;
export const GAME_STUDIO_MAX_LOCAL_ASSET_TOTAL_BYTES = 8 * 1024 * 1024;
const ALLOWED_LOCAL_ASSET_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "application/json",
  "text/plain",
  "model/gltf-binary",
  "model/gltf+json",
  "model/obj",
  "model/mtl",
]);

export function buildGameStudioZip(input: {
  title: string;
  slug: string;
  template: GameStudioTemplate;
  files: Record<string, string>;
  selectedAssetIds?: string[];
  localAssets?: GameStudioLocalAsset[];
}): {
  zip: Buffer;
  manifest: GameStudioBundleManifest;
} {
  const entries = new Map<string, Buffer>();
  const manifestAssets: GameStudioBundleManifest["stockAssets"] = [];
  const uploadedAssets: GameStudioBundleManifest["uploadedAssets"] = [];
  const slug = normalizeConsoleSlug(input.slug || input.template.id);

  for (const [path, contents] of Object.entries(input.files || {})) {
    const normalized = normalizeZipPath(path);
    if (!normalized) continue;
    const stamped =
      normalized === "index.html"
        ? stampConsoleSdkSlug(String(contents || ""), slug)
        : String(contents || "");
    const data = Buffer.from(stamped, "utf8");
    if (data.length > MAX_STUDIO_FILE_BYTES) {
      throw new Error(`${normalized} exceeds the Game Studio file size limit`);
    }
    entries.set(normalized, data);
  }

  for (const assetId of dedupeStrings(input.selectedAssetIds || []).slice(0, 80)) {
    const stock = buildGameStudioStockAssetFile(assetId);
    if (!stock) continue;
    entries.set(stock.path, stock.bytes);
    manifestAssets.push({
      id: stock.asset.id,
      title: stock.asset.title,
      kind: stock.asset.kind,
      path: stock.path,
      license: stock.asset.license,
    });
  }

  let uploadedTotal = 0;
  for (const asset of normalizeLocalAssets(input.localAssets || [], { strict: true })) {
    const outputPath = asset.dataBase64
      ? `assets/uploads/${safeFilename(asset.name, asset.type)}`
      : undefined;
    uploadedAssets.push({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      size: asset.size,
      ...(outputPath ? { path: outputPath } : {}),
    });
    if (!asset.dataBase64 || !outputPath) continue;
    if (!ALLOWED_LOCAL_ASSET_TYPES.has(asset.type)) {
      throw new Error(`${asset.name} has an unsupported asset type`);
    }
    if (asset.size > GAME_STUDIO_MAX_LOCAL_ASSET_BYTES) {
      throw new Error(`${asset.name} exceeds the Game Studio asset size limit`);
    }
    uploadedTotal += asset.size;
    if (uploadedTotal > GAME_STUDIO_MAX_LOCAL_ASSET_TOTAL_BYTES) {
      throw new Error("Uploaded assets exceed the Game Studio project limit");
    }
    const bytes = Buffer.from(asset.dataBase64, "base64");
    if (bytes.length !== asset.size && Math.abs(bytes.length - asset.size) > 4) {
      throw new Error(`${asset.name} asset data is incomplete`);
    }
    entries.set(outputPath, bytes);
  }

  const builtAt = new Date().toISOString();
  const assetManifest = {
    stockAssets: manifestAssets,
    uploadedAssets,
    generatedAt: builtAt,
  };
  const manifest: GameStudioBundleManifest = {
    title: input.title,
    slug,
    templateId: input.template.id,
    engine: input.template.engine,
    sdkVersion: "wtf-console-v1",
    files: Array.from(
      new Set([...entries.keys(), "assets/manifest.json", "wtf-game.json"])
    ).sort(),
    stockAssets: manifestAssets,
    uploadedAssets,
    builtAt,
  };
  entries.set(
    "assets/manifest.json",
    Buffer.from(JSON.stringify(assetManifest, null, 2), "utf8")
  );
  entries.set("wtf-game.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));

  if (!entries.has("index.html")) {
    throw new Error("Game Studio bundles must include index.html");
  }
  if (entries.size > MAX_ZIP_ENTRIES) {
    throw new Error("Game Studio bundle has too many files");
  }

  return {
    zip: createStoreZip(
      Array.from(entries.entries()).map(([path, data]) => ({ path, data }))
    ),
    manifest,
  };
}

export function normalizeLocalAssets(
  input: unknown,
  options: { strict?: boolean } = {}
): GameStudioLocalAsset[] {
  if (!Array.isArray(input)) return [];
  let totalBytes = 0;
  return input.slice(0, 40).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const value = entry as Record<string, unknown>;
    const name = String(value.name || "").trim().slice(0, 160);
    if (!name) return [];
    const dataBase64 = normalizeBase64(String(value.dataBase64 || value.fileData || ""));
    const size = Math.max(0, Math.floor(Number(value.size || 0)));
    const type = normalizeAssetMimeType(String(value.type || "application/octet-stream"));
    if (options.strict) {
      if (!ALLOWED_LOCAL_ASSET_TYPES.has(type)) {
        throw new Error(`${name} has an unsupported asset type`);
      }
      if (size > GAME_STUDIO_MAX_LOCAL_ASSET_BYTES) {
        throw new Error(`${name} exceeds the Game Studio asset size limit`);
      }
      const actualBytes = dataBase64 ? Buffer.from(dataBase64, "base64").length : size;
      if (dataBase64 && actualBytes !== size && Math.abs(actualBytes - size) > 4) {
        throw new Error(`${name} asset data is incomplete`);
      }
      totalBytes += Math.max(size, actualBytes);
      if (totalBytes > GAME_STUDIO_MAX_LOCAL_ASSET_TOTAL_BYTES) {
        throw new Error("Uploaded assets exceed the Game Studio project limit");
      }
    }
    return [
      {
        id: String(value.id || `${name}-${size}`).slice(0, 180),
        name,
        size,
        type,
        ...(dataBase64 ? { dataBase64 } : {}),
      },
    ];
  });
}

export function normalizeConsoleSlug(value: string): string {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "game"
  );
}

export function createStoreZip(entries: ZipEntryInput[]): Buffer {
  const files = entries.map((entry) => {
    const normalizedPath = normalizeZipPath(entry.path);
    if (!normalizedPath) {
      throw new Error(`Invalid ZIP path: ${entry.path}`);
    }
    const data = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(String(entry.data), "utf8");
    return {
      path: normalizedPath,
      nameBuffer: Buffer.from(normalizedPath, "utf8"),
      data,
      crc: crc32(data),
    };
  });

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const { dosTime, dosDate } = currentDosTimestamp();

  for (const file of files) {
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(file.crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(file.nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, file.nameBuffer, file.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(file.crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(file.nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, file.nameBuffer);

    offset += local.length + file.nameBuffer.length + file.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localDirectory = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localDirectory.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localDirectory, centralDirectory, end]);
}

function stampConsoleSdkSlug(html: string, slug: string): string {
  if (html.includes("/api/console/sdk.js")) {
    return html.replace(
      /(<script[^>]+src=["']\/api\/console\/sdk\.js["'][^>]*data-game=["'])[^"']*(["'][^>]*><\/script>)/i,
      `$1${slug}$2`
    );
  }
  return html.replace(
    /<\/head>/i,
    `    <script src="/api/console/sdk.js" data-game="${escapeHtml(slug)}"></script>\n  </head>`
  );
}

function normalizeZipPath(value: string): string | null {
  const normalized = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return null;
  if (normalized.includes("../") || normalized === ".." || normalized.startsWith("..")) {
    return null;
  }
  if (/^[a-z]:/i.test(normalized)) return null;
  if (normalized.split("/").some((part) => !part || part === ".")) return null;
  return normalized.slice(0, 240);
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeAssetMimeType(value: string): string {
  const lower = value.trim().toLowerCase();
  if (lower === "audio/mp3") return "audio/mpeg";
  if (ALLOWED_LOCAL_ASSET_TYPES.has(lower)) return lower;
  return lower || "application/octet-stream";
}

function normalizeBase64(value: string): string {
  const trimmed = value.trim();
  const payload = trimmed.includes(",") ? trimmed.split(",").pop() || "" : trimmed;
  if (!payload || !/^[a-z0-9+/=\s]+$/i.test(payload)) return "";
  return payload.replace(/\s+/g, "");
}

function safeFilename(name: string, mimeType: string): string {
  const base =
    name
      .trim()
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "asset";
  if (/\.[a-z0-9]{1,8}$/i.test(base)) return base;
  const ext =
    mimeType === "image/png" ? ".png" :
    mimeType === "image/jpeg" ? ".jpg" :
    mimeType === "image/webp" ? ".webp" :
    mimeType === "image/gif" ? ".gif" :
    mimeType === "image/svg+xml" ? ".svg" :
    mimeType === "audio/mpeg" ? ".mp3" :
    mimeType === "audio/wav" ? ".wav" :
    mimeType === "audio/ogg" ? ".ogg" :
    mimeType === "application/json" ? ".json" :
    mimeType === "model/gltf-binary" ? ".glb" :
    mimeType === "model/gltf+json" ? ".gltf" :
    mimeType === "model/obj" ? ".obj" :
    mimeType === "model/mtl" ? ".mtl" :
    ".txt";
  return `${base}${ext}`;
}

function currentDosTimestamp(): { dosTime: number; dosDate: number } {
  const now = new Date();
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate =
    ((Math.max(1980, now.getFullYear()) - 1980) << 9) |
    ((now.getMonth() + 1) << 5) |
    now.getDate();
  return { dosTime, dosDate };
}

let crcTable: Uint32Array | null = null;

function crc32(data: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let j = 0; j < 8; j += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
