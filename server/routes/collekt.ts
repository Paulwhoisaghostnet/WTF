import { Router } from "express";
import { isAuthenticated } from "../auth/passport";
import {
  loadCollektTokens,
  parseCollektTokensQuery,
} from "../features/collekt/tokens";
import { loadCollektSession } from "../features/collekt/session";

const router = Router();

router.get("/api/collekt/session", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as {
      id: number;
      username: string;
      displayName?: string | null;
      avatarUrl?: string | null;
    };

    res.json(await loadCollektSession(user));
  } catch (err) {
    console.error("[collekt] GET /api/collekt/session failed:", err);
    res.status(500).json({ error: "Failed to load colleKT session" });
  }
});

router.get("/api/collekt/tokens", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const result = await loadCollektTokens(
      user.id,
      parseCollektTokensQuery(req.query as Record<string, unknown>)
    );

    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json(result.data);
  } catch (err) {
    console.error("[collekt] GET /api/collekt/tokens failed:", err);
    res.status(500).json({ error: "Failed to load colleKT tokens" });
  }
});

export default router;
