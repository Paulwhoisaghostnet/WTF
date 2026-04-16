import { Router } from "express";
import { and, eq, sql, desc } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../auth/passport";
import { userOwnedTokens } from "@shared/schema";

const router = Router();

type AuthUser = { id: number; username: string; role: string };

const DEMO_CARTRIDGES = [
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
  },
  {
    id: "demo-space-blocks",
    title: "Space Blocks",
    description: "Classic falling block puzzle. Clear lines, level up, chase high scores.",
    mimeType: "application/zip",
    thumbnailUri: null,
    artifactUri: "/games/cartridges/space-blocks.zip",
    tokenContract: "demo",
    tokenId: "space-blocks",
    isDemo: true,
  },
];

router.get("/api/console/demo-cartridges", (_req, res) => {
  res.json(DEMO_CARTRIDGES);
});

router.get("/api/console/cartridges", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const rows = await db
      .select({
        id: userOwnedTokens.id,
        tokenContract: userOwnedTokens.tokenContract,
        tokenId: userOwnedTokens.tokenId,
        tokenName: userOwnedTokens.tokenName,
        tokenThumbnail: userOwnedTokens.tokenThumbnail,
        metadata: userOwnedTokens.metadata,
        balance: userOwnedTokens.balance,
      })
      .from(userOwnedTokens)
      .where(
        and(
          eq(userOwnedTokens.userId, user.id),
          sql`COALESCE(NULLIF(${userOwnedTokens.balance}, ''), '0')::numeric > 0`
        )
      )
      .orderBy(desc(userOwnedTokens.lastSeenAt))
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
