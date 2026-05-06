import type { Router } from "express";
import { isAuthenticated } from "../../auth/passport";
import {
  fetchLinkPreview,
  normalizePreviewTarget,
  shouldAttemptHtmlPreview,
} from "./link-preview";

export function registerWLinkPreviewRoutes(router: Router): void {
  router.post("/api/w/link-preview", isAuthenticated, async (req, res) => {
    try {
      const { url } = req.body || {};
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "url is required" });
      }
      const target = normalizePreviewTarget(url);
      if (!target || !shouldAttemptHtmlPreview(target)) {
        return res.json({ preview: null });
      }
      const preview = await fetchLinkPreview(target);
      return res.json({ preview });
    } catch (err) {
      console.error("[w] link-preview error:", err);
      return res.json({ preview: null });
    }
  });
}
