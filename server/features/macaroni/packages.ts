import { createHash } from "crypto";

export const MACARONI_PACKAGE_SCHEMA_VERSION = "wtfos.macaroni-package.v1";
export const MACARONI_PACKAGE_SOURCE = "macaroni_package" as const;
export const MACARONI_ARTIFACT_MAX_BYTES = 1024 * 1024 * 1024;
export const MACARONI_ARTIFACT_AVERAGE_BYTES = 250 * 1024 * 1024;

export const CHEASE_EXPORT_TARGETS = [
  "macaroni",
  "objkt",
  "mederu",
  "drop-art",
  "versum",
  "teia",
  "generic",
] as const;

export const CHEASE_DROP_LAYOUTS = ["single-page", "tabbed", "multi-page"] as const;

export const CHEASE_DROP_MODULES = [
  "dropStory",
  "mintPanel",
  "tokenGrid",
  "recentMints",
  "mintGallery",
  "leaderboard",
  "collectionCompletion",
] as const;

export type CheaseExportTarget = typeof CHEASE_EXPORT_TARGETS[number];
export type CheaseDropLayout = typeof CHEASE_DROP_LAYOUTS[number];
export type CheaseDropModule = typeof CHEASE_DROP_MODULES[number];

export type CheaseDropConfig = {
  exportTarget: CheaseExportTarget;
  layout: CheaseDropLayout;
  theme: "gallery-white" | "dark-room" | "editorial" | "arcade";
  headline: string;
  intro: string;
  callToAction: string;
  modules: Record<CheaseDropModule, boolean>;
};

export const DEFAULT_CHEASE_DROP_CONFIG: CheaseDropConfig = {
  exportTarget: "macaroni",
  layout: "single-page",
  theme: "gallery-white",
  headline: "Untitled drop",
  intro: "A wtfOS-staged collection package.",
  callToAction: "View collection",
  modules: {
    dropStory: true,
    mintPanel: true,
    tokenGrid: true,
    recentMints: false,
    mintGallery: true,
    leaderboard: false,
    collectionCompletion: false,
  },
};

export type MacaroniPackageAttribute = {
  name: string;
  value: string;
};

export type MacaroniPackageItemLike = {
  id?: number;
  tokenId: number;
  originalFilename: string;
  originalTitle: string;
  normalizedFilename: string;
  tokenName: string;
  tokenDescription?: string | null;
  mimeType: string;
  sizeBytes: number;
  checksumSha256?: string | null;
  mediaCid: string;
  metadataCid?: string | null;
  tags?: string[] | null;
  attributes?: MacaroniPackageAttribute[] | null;
};

export type MacaroniPackageLike = {
  id: number;
  title: string;
  description?: string | null;
  itemCount?: number;
  totalBytes?: number;
  averageBytes?: number;
  csvCid?: string | null;
  manifestCid?: string | null;
  dropConfig?: CheaseDropConfig | Record<string, unknown> | null;
};

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/ogg": ".ogg",
  "application/pdf": ".pdf",
};

function basename(input: string): string {
  const cleaned = String(input || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop();
  return cleaned || "untitled";
}

function safeTrim(input: unknown, fallback = ""): string {
  const value = String(input ?? "").trim();
  return value || fallback;
}

function oneOf<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] {
  const raw = String(value || "");
  return options.includes(raw) ? raw as T[number] : fallback;
}

function boundedText(value: unknown, fallback: string, max: number): string {
  return safeTrim(value, fallback).replace(/\s+/g, " ").slice(0, max);
}

export function normalizeCheaseDropConfig(input: unknown, pkg?: { title?: string | null; description?: string | null }): CheaseDropConfig {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const defaultConfig = {
    ...DEFAULT_CHEASE_DROP_CONFIG,
    headline: boundedText(pkg?.title, DEFAULT_CHEASE_DROP_CONFIG.headline, 120),
    intro: boundedText(pkg?.description, DEFAULT_CHEASE_DROP_CONFIG.intro, 500),
  };
  const rawModules = source.modules && typeof source.modules === "object"
    ? source.modules as Record<string, unknown>
    : {};
  const modules = CHEASE_DROP_MODULES.reduce((acc, key) => {
    acc[key] = rawModules[key] === undefined
      ? defaultConfig.modules[key]
      : Boolean(rawModules[key]);
    return acc;
  }, {} as Record<CheaseDropModule, boolean>);
  if (!modules.dropStory && !modules.tokenGrid && !modules.mintGallery) {
    modules.dropStory = true;
    modules.tokenGrid = true;
  }
  return {
    exportTarget: oneOf(source.exportTarget, CHEASE_EXPORT_TARGETS, defaultConfig.exportTarget),
    layout: oneOf(source.layout, CHEASE_DROP_LAYOUTS, defaultConfig.layout),
    theme: oneOf(source.theme, ["gallery-white", "dark-room", "editorial", "arcade"] as const, defaultConfig.theme),
    headline: boundedText(source.headline, defaultConfig.headline, 120),
    intro: boundedText(source.intro, defaultConfig.intro, 500),
    callToAction: boundedText(source.callToAction, defaultConfig.callToAction, 60),
    modules,
  };
}

export function sha256Buffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function originalTitleFromFilename(fileName: string, tokenId: number): string {
  const base = basename(fileName).replace(/\.[^.]+$/, "").trim();
  return base || `Token ${tokenId}`;
}

export function normalizedFilenameForToken(input: {
  tokenId: number;
  originalFilename: string;
  mimeType?: string | null;
}): string {
  const base = basename(input.originalFilename);
  const extMatch = base.match(/\.([a-zA-Z0-9]{1,12})$/);
  const ext = extMatch
    ? `.${extMatch[1].toLowerCase()}`
    : MIME_EXTENSIONS[String(input.mimeType || "").toLowerCase()] || ".bin";
  return `${input.tokenId}${ext}`;
}

export function normalizeTags(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[;,]/)
      : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of raw) {
    const tag = String(value || "").trim();
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag.slice(0, 80));
  }
  return tags.slice(0, 50);
}

export function normalizeAttributes(input: unknown): MacaroniPackageAttribute[] {
  if (!Array.isArray(input)) return [];
  const attributes: MacaroniPackageAttribute[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const name = safeTrim(record.name, safeTrim(record.trait_type)).slice(0, 120);
    const value = safeTrim(record.value).slice(0, 500);
    if (!name) continue;
    attributes.push({ name, value });
  }
  return attributes.slice(0, 100);
}

function withOriginalFilenameAttribute(
  attributes: MacaroniPackageAttribute[] | null | undefined,
  originalFilename: string
): MacaroniPackageAttribute[] {
  const normalized = normalizeAttributes(attributes);
  if (normalized.some((attr) => attr.name.toLowerCase() === "original_filename")) {
    return normalized;
  }
  return [
    ...normalized,
    { name: "original_filename", value: originalFilename },
  ];
}

export function readinessForPackageItem(item: MacaroniPackageItemLike) {
  const warnings: string[] = [];
  if (!item.mediaCid) warnings.push("Missing media CID");
  if (!item.metadataCid) warnings.push("Missing metadata CID");
  if (!safeTrim(item.tokenName)) warnings.push("Missing token name");
  if (!safeTrim(item.tokenDescription)) warnings.push("Description is empty");
  if (item.sizeBytes > MACARONI_ARTIFACT_MAX_BYTES) warnings.push("Artifact is larger than 1 GB");
  return {
    hasMedia: Boolean(item.mediaCid),
    hasMetadata: Boolean(item.metadataCid),
    hasName: Boolean(safeTrim(item.tokenName)),
    readyForMint: Boolean(item.mediaCid && item.metadataCid && safeTrim(item.tokenName) && item.sizeBytes <= MACARONI_ARTIFACT_MAX_BYTES),
    warnings,
  };
}

export function buildPackageTokenMetadata(item: MacaroniPackageItemLike) {
  const name = safeTrim(item.tokenName, item.originalTitle).slice(0, 300);
  const description = safeTrim(item.tokenDescription);
  const artifactUri = `ipfs://${item.mediaCid}`;
  const attributes = withOriginalFilenameAttribute(item.attributes, item.originalFilename);
  const metadata: Record<string, unknown> = {
    name,
    title: name,
    description,
    decimals: 0,
    isBooleanAmount: true,
    artifactUri,
    displayUri: artifactUri,
    thumbnailUri: artifactUri,
    formats: [
      {
        uri: artifactUri,
        mimeType: item.mimeType || "application/octet-stream",
      },
    ],
    tags: normalizeTags(item.tags),
    attributes,
    macaroni: {
      packageSchema: MACARONI_PACKAGE_SCHEMA_VERSION,
      tokenId: item.tokenId,
      originalFilename: item.originalFilename,
      normalizedFilename: item.normalizedFilename,
      checksumSha256: item.checksumSha256 || undefined,
    },
  };
  if (!description) delete metadata.description;
  if (!(metadata.tags as string[]).length) delete metadata.tags;
  if (!attributes.length) delete metadata.attributes;
  return metadata;
}

function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  if (!/[",\n\r]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

export function buildPackageCsv(items: MacaroniPackageItemLike[]): string {
  const traitNames = new Set<string>(["original_filename"]);
  for (const item of items) {
    for (const attr of withOriginalFilenameAttribute(item.attributes, item.originalFilename)) {
      if (attr.name) traitNames.add(attr.name);
    }
  }
  const traits = [...traitNames].sort((a, b) => a.localeCompare(b));
  const headers = ["id", "quantity", "name", "description", "tags", ...traits];
  const rows = [...items].sort((a, b) => a.tokenId - b.tokenId).map((item) => {
    const attrs = new Map(
      withOriginalFilenameAttribute(item.attributes, item.originalFilename)
        .map((attr) => [attr.name, attr.value])
    );
    return [
      item.tokenId,
      1,
      safeTrim(item.tokenName, item.originalTitle),
      safeTrim(item.tokenDescription),
      normalizeTags(item.tags).join("; "),
      ...traits.map((trait) => attrs.get(trait) || ""),
    ].map(csvCell).join(",");
  });
  return `${headers.map(csvCell).join(",")}\n${rows.join("\n")}\n`;
}

export function summarizePackageItems(items: MacaroniPackageItemLike[]) {
  const totalBytes = items.reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0);
  const itemCount = items.length;
  return {
    itemCount,
    totalBytes,
    averageBytes: itemCount ? Math.round(totalBytes / itemCount) : 0,
  };
}

export function assertMacaroniPackageSizePolicy(items: MacaroniPackageItemLike[]) {
  const largest = items.find((item) => item.sizeBytes > MACARONI_ARTIFACT_MAX_BYTES);
  if (largest) {
    throw new Error(`${largest.originalFilename} exceeds the 1 GB Macaroni artifact limit`);
  }
  const summary = summarizePackageItems(items);
  if (summary.averageBytes > MACARONI_ARTIFACT_AVERAGE_BYTES) {
    throw new Error("Macaroni packages must average 250 MB or less per artifact");
  }
  return summary;
}

export function buildPackageManifest(
  pkg: MacaroniPackageLike,
  items: MacaroniPackageItemLike[]
) {
  const summary = summarizePackageItems(items);
  const dropConfig = normalizeCheaseDropConfig(pkg.dropConfig, pkg);
  return {
    schemaVersion: MACARONI_PACKAGE_SCHEMA_VERSION,
    packageId: pkg.id,
    title: pkg.title,
    description: pkg.description || "",
    dropConfig,
    itemCount: summary.itemCount,
    totalBytes: summary.totalBytes,
    averageBytes: summary.averageBytes,
    csvCid: pkg.csvCid || null,
    manifestCid: pkg.manifestCid || null,
    items: [...items].sort((a, b) => a.tokenId - b.tokenId).map((item) => ({
      tokenId: item.tokenId,
      name: safeTrim(item.tokenName, item.originalTitle),
      originalFilename: item.originalFilename,
      normalizedFilename: item.normalizedFilename,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      checksumSha256: item.checksumSha256 || null,
      mediaCid: item.mediaCid,
      metadataCid: item.metadataCid || null,
      readiness: readinessForPackageItem(item),
    })),
  };
}
