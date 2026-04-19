import { Router } from "express";
import { and, eq, sql, desc } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db";
import { isAuthenticated } from "../auth/passport";
import { walletHoldings, tokenMetadata } from "@shared/schema";

const lastSeenConsole = sql`COALESCE(${walletHoldings.tzktLastTime}, ${walletHoldings.lastActivityAt}, ${walletHoldings.derivedAt})`;

const router = Router();

type AuthUser = { id: number; username: string; role: string };

type DemoCartridge = {
  id: string;
  title: string;
  description: string;
  mimeType: string;
  thumbnailUri: string | null;
  artifactUri: string;
  tokenContract: string;
  tokenId: string;
  isDemo: boolean;
  kind?: "html5" | "dos-game" | "dos-installer" | "vite-project";
};

const FALLBACK_DEMO_CARTRIDGES: DemoCartridge[] = [
  {
    id: "demo-pixel-runner",
    title: "Pixel Runner",
    description: "Jump over obstacles in this endless runner. How far can you go?",
    mimeType: "application/zip",
    thumbnailUri: null,
    artifactUri: "/games/cartridges/pixel-runner.zip",
    tokenContract: "demo",
    tokenId: "pixel-runner",
    isDemo: true,
    kind: "html5",
  },
  {
    id: "demo-space-blocks",
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
  },
];

// `public/games/installed/manifest.json` is produced by
// `scripts/install-games.mjs`.  In production we read from
// `dist/public/...` because Vite copies `public/` into the build output.
// If the manifest is missing we fall back to the legacy hard-coded demos
// so the console keeps working during first deploys.
const MANIFEST_SEARCH_PATHS = [
  path.resolve(process.cwd(), "dist", "public", "games", "installed", "manifest.json"),
  path.resolve(process.cwd(), "public", "games", "installed", "manifest.json"),
];

let manifestCache: {
  mtimeMs: number;
  path: string;
  cartridges: DemoCartridge[];
} | null = null;

function readInstalledManifest(): DemoCartridge[] {
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

      const cartridges: DemoCartridge[] = [];
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const slug = String(item.slug || "").trim();
        const artifactUri = String(item.artifactUri || "").trim();
        const title = String(item.title || "").trim();
        if (!slug || !artifactUri || !title) continue;
        if (!artifactUri.startsWith("/games/")) continue;

        cartridges.push({
          id: `demo-${slug}`,
          title,
          description: String(item.description || ""),
          mimeType: "text/html",
          thumbnailUri: item.thumbnailUri ? String(item.thumbnailUri) : null,
          artifactUri,
          tokenContract: "demo",
          tokenId: slug,
          isDemo: true,
          kind: item.kind,
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

router.get("/api/console/demo-cartridges", (_req, res) => {
  const manifestEntries = readInstalledManifest();
  if (manifestEntries.length > 0) {
    return res.json(manifestEntries);
  }
  res.json(FALLBACK_DEMO_CARTRIDGES);
});

router.get("/api/console/cartridges", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const rows = await db
      .select({
        id: walletHoldings.id,
        tokenContract: walletHoldings.tokenContract,
        tokenId: walletHoldings.tokenId,
        tokenName: tokenMetadata.name,
        tokenThumbnail: tokenMetadata.thumbnail,
        metadata: tokenMetadata.raw,
        balance: walletHoldings.balance,
      })
      .from(walletHoldings)
      .leftJoin(
        tokenMetadata,
        and(
          eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
          eq(tokenMetadata.tokenId, walletHoldings.tokenId)
        )
      )
      .where(
        and(
          eq(walletHoldings.userId, user.id),
          sql`COALESCE(NULLIF(${walletHoldings.balance}, ''), '0')::numeric > 0`
        )
      )
      .orderBy(desc(lastSeenConsole))
      .limit(2000);

    const cartridges = rows
      .map((row) => {
        const meta = (row.metadata as Record<string, any>) || {};
        const artifactUri = String(meta.artifactUri || "").trim();
        if (!artifactUri) return null;

        const isZip = isZipToken(meta, artifactUri);
        if (!isZip) return null;

        return {
          id: `${row.tokenContract}:${row.tokenId}`,
          title: row.tokenName || meta.name || `Token #${row.tokenId}`,
          description: String(meta.description || "").slice(0, 200),
          mimeType: "application/zip",
          thumbnailUri: row.tokenThumbnail || meta.thumbnailUri || meta.displayUri || null,
          artifactUri,
          tokenContract: row.tokenContract,
          tokenId: row.tokenId,
          isDemo: false,
        };
      })
      .filter(Boolean);

    res.json(cartridges);
  } catch (err) {
    console.error("[console] failed to fetch cartridges:", err);
    res.status(500).json({ error: "Failed to fetch cartridges" });
  }
});

function isZipToken(
  meta: Record<string, any>,
  artifactUri: string
): boolean {
  const rootMime = String(meta.mimeType || meta.mime_type || "")
    .trim()
    .toLowerCase();
  if (
    rootMime === "application/zip" ||
    rootMime === "application/x-zip-compressed" ||
    rootMime === "application/x-zip"
  )
    return true;

  const formats = Array.isArray(meta.formats) ? meta.formats : [];
  for (const f of formats) {
    const fm = String(f.mimeType || f.mime_type || "")
      .trim()
      .toLowerCase();
    if (
      fm === "application/zip" ||
      fm === "application/x-zip-compressed" ||
      fm === "application/x-zip"
    )
      return true;
  }

  const lower = artifactUri.toLowerCase();
  if (lower.endsWith(".zip")) return true;

  return false;
}

export default router;
