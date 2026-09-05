import type { Router } from "express";
import { isAuthenticated } from "../../auth/passport";
import {
  prefetchMediaAsync,
  streamMediaThroughCache,
} from "./cache-runtime";
import { readTvCacheStats } from "./cache-storage";
import { normalizeMediaUri } from "./media-urls";
import {
  isStaffRole,
  type TvAuthUser as AuthUser,
} from "./channel-service";

async function handleCacheMedia(req: any, res: any) {
  try {
    const input = String(req.query.url || "").trim();
    if (!input) return res.status(400).json({ error: "url is required" });

    const normalized = normalizeMediaUri(input);
    if (!normalized) return res.status(400).json({ error: "Unsupported media URL" });

    const path = String(req.path || "");
    const allowArtifacts = path === "/api/cache/artifact";
    const allowImages = path === "/api/cache/media" || allowArtifacts;
    await streamMediaThroughCache(req, res, normalized, {
      allowRange: true,
      allowImages,
      allowArtifacts,
    });
  } catch (err) {
    console.error("[tv] failed to proxy/cache media:", err);
    if (!res.headersSent) {
      res.status(502).json({ error: "Failed to fetch media from source" });
    } else {
      try {
        res.end();
      } catch {
        /* swallow */
      }
    }
  }
}

export function registerTvCacheRoutes(router: Router): void {
  router.get("/api/tv/cache/media", handleCacheMedia);
  router.get("/api/cache/media", handleCacheMedia);
  router.get("/api/cache/artifact", handleCacheMedia);

  router.get("/api/tv/cache/stats", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as AuthUser;
      if (!(await isStaffRole(user.role))) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const stats = await readTvCacheStats();
      const pct =
        stats.maxTotalBytes > 0
          ? Math.round((stats.totalBytes / stats.maxTotalBytes) * 10000) / 100
          : 0;
      res.json({ ...stats, utilizationPct: pct });
    } catch (err) {
      console.error("[tv] cache stats error:", err);
      res.status(500).json({ error: "Failed to read cache stats" });
    }
  });

  router.post("/api/tv/cache/prefetch", isAuthenticated, async (req, res) => {
    try {
      const raw = Array.isArray(req.body?.urls) ? req.body.urls : [];
      const uris: string[] = [];
      for (const value of raw.slice(0, 10)) {
        if (typeof value !== "string") continue;
        let candidate = value.trim();
        if (!candidate) continue;
        try {
          if (
            candidate.startsWith("/api/tv/cache/media") ||
            candidate.startsWith("/api/cache/media") ||
            candidate.startsWith("/api/cache/artifact")
          ) {
            const url = new URL(candidate, "http://local");
            candidate = url.searchParams.get("url") || "";
            if (!candidate) continue;
          }
        } catch {
          /* ignore bad URL */
        }
        const normalized = normalizeMediaUri(candidate);
        if (!normalized) continue;
        uris.push(normalized);
      }
      for (const uri of uris) prefetchMediaAsync(uri);
      res.status(202).json({ queued: uris.length });
    } catch (err) {
      res.status(400).json({ error: "Invalid prefetch payload" });
    }
  });
}
