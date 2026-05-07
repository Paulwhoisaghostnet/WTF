import fs from "node:fs";
import path from "node:path";
import type { ConsoleTokenProvenance } from "@shared/console-provenance";
import type { ConsoleCartridge, ConsoleCartridgeKind } from "./types";

export const FALLBACK_DEMO_CARTRIDGES: ConsoleCartridge[] = [
  {
    id: "demo-pixel-runner",
    slug: "pixel-runner",
    title: "Pixel Runner",
    description: "Jump over obstacles in this endless runner. How far can you go?",
    mimeType: "application/zip",
    thumbnailUri: null,
    artifactUri: "/games/cartridges/pixel-runner.zip",
    tokenContract: "demo",
    tokenId: "pixel-runner",
    isDemo: true,
    kind: "html5",
    category: "arcade",
    leaderboardEnabled: false,
  },
  {
    id: "demo-space-blocks",
    slug: "space-blocks",
    title: "Space Blocks",
    description:
      "Classic falling block puzzle. Clear lines, level up, chase high scores.",
    mimeType: "application/zip",
    thumbnailUri: null,
    artifactUri: "/games/cartridges/space-blocks.zip",
    tokenContract: "demo",
    tokenId: "space-blocks",
    isDemo: true,
    kind: "html5",
    category: "puzzle",
    leaderboardEnabled: false,
  },
];

const MANIFEST_SEARCH_PATHS = [
  path.resolve(
    process.cwd(),
    "dist",
    "public",
    "games",
    "installed",
    "manifest.json"
  ),
  path.resolve(process.cwd(), "public", "games", "installed", "manifest.json"),
];

let manifestCache: {
  mtimeMs: number;
  path: string;
  cartridges: ConsoleCartridge[];
} | null = null;

function normalizeKind(value: unknown): ConsoleCartridgeKind | undefined {
  const kind = String(value || "").trim();
  return kind === "html5" ||
    kind === "dos-game" ||
    kind === "dos-installer" ||
    kind === "vite-project" ||
    kind === "rom"
    ? kind
    : undefined;
}

function normalizeProvenance(value: unknown): ConsoleTokenProvenance | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ConsoleTokenProvenance>;
  if (
    record.chain !== "tezos" ||
    typeof record.tokenContract !== "string" ||
    typeof record.tokenId !== "string" ||
    typeof record.tokenUrl !== "string" ||
    !Array.isArray(record.marketplaceLinks)
  ) {
    return null;
  }
  return {
    ...record,
    source: record.source || "tezos-token",
    chain: "tezos",
    tokenContract: record.tokenContract,
    tokenId: record.tokenId,
    tokenUrl: record.tokenUrl,
    explorerUrl: record.explorerUrl || "",
    marketplaceLinks: record.marketplaceLinks,
    attributionRequired: record.attributionRequired !== false,
  } as ConsoleTokenProvenance;
}

export function readInstalledDemoCartridges(): ConsoleCartridge[] {
  for (const p of MANIFEST_SEARCH_PATHS) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(p);
    } catch {
      continue;
    }

    if (manifestCache && manifestCache.path === p && manifestCache.mtimeMs === stat.mtimeMs) {
      return manifestCache.cartridges;
    }

    try {
      const raw = fs.readFileSync(p, "utf-8");
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed?.cartridges;
      if (!Array.isArray(list)) continue;

      const cartridges: ConsoleCartridge[] = [];
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const slug = String(item.slug || "").trim();
        const artifactUri = String(item.artifactUri || "").trim();
        const title = String(item.title || "").trim();
        if (!slug || !artifactUri || !title) continue;
        if (!artifactUri.startsWith("/games/")) continue;

        cartridges.push({
          id: `demo-${slug}`,
          slug,
          title,
          description: String(item.description || ""),
          mimeType: "text/html",
          thumbnailUri: item.thumbnailUri ? String(item.thumbnailUri) : null,
          artifactUri,
          tokenContract: "demo",
          tokenId: slug,
          isDemo: true,
          kind: normalizeKind(item.kind),
          category: String(item.category || item.kind || "arcade"),
          sourceUrl: item.sourceUrl ? String(item.sourceUrl) : null,
          sourceLabel: item.sourceLabel ? String(item.sourceLabel) : null,
          licenseName: item.licenseName ? String(item.licenseName) : null,
          provenance: normalizeProvenance(item.provenance),
          leaderboardEnabled: false,
          playCount: 0,
          playerCount: 0,
        });
      }

      manifestCache = { path: p, mtimeMs: stat.mtimeMs, cartridges };
      return cartridges;
    } catch (err) {
      console.warn(
        `[console] failed to read cartridge manifest ${p}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return [];
}

export function getDemoCartridges(): ConsoleCartridge[] {
  const manifestEntries = readInstalledDemoCartridges();
  return manifestEntries.length > 0 ? manifestEntries : FALLBACK_DEMO_CARTRIDGES;
}
