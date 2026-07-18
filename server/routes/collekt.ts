import { Router } from "express";
import { isAuthenticated } from "../auth/passport";
import {
  loadCollektTokens,
  parseCollektTokensQuery,
} from "../features/collekt/tokens";
import { loadCollektSession } from "../features/collekt/session";
import { ingestSystemEvent } from "../challenges/events/ingest";
import {
  isTezosWalletAddress,
  scanDuplicateArtWallet,
} from "../features/collekt/duplicates";

const router = Router();

router.get("/api/collekt/duplicates", async (req, res) => {
  try {
    const wallet = String(req.query.wallet ?? "").trim();
    if (!isTezosWalletAddress(wallet)) {
      return res.status(400).json({
        error: "Enter a valid Tezos wallet address.",
        code: "INVALID_WALLET_ADDRESS",
      });
    }
    res.json(
      await scanDuplicateArtWallet(wallet, {
        forceFresh: String(req.query.refresh ?? "") === "1",
      })
    );
  } catch (err) {
    console.error("[collekt] GET /api/collekt/duplicates failed:", err);
    res.status(502).json({
      error: "The Tezos holdings scan is temporarily unavailable. Try again.",
      code: "DUPLICATE_SCAN_UNAVAILABLE",
    });
  }
});

router.post("/api/collekt/events", isAuthenticated, async (req, res) => {
  const user = req.user as { id: number };
  const eventType = String(req.body?.eventType ?? "");
  if (![
    "collekt.duplicates.scanned",
    "collekt.offer.terms_previewed",
    "collekt.offer.placed",
  ].includes(eventType)) {
    return res.status(400).json({ error: "Unsupported colleKT event" });
  }
  const tokenRef = String(req.body?.tokenRef ?? "duplicate-scan").slice(0, 160);
  await ingestSystemEvent({
    eventType,
    userId: user.id,
    source: "collekt",
    sourceModule: "collekt",
    rawRefType: tokenRef === "duplicate-scan" ? "tezos_wallet" : "tezos_token",
    rawRefId: tokenRef,
    metadata: req.body?.metadata && typeof req.body.metadata === "object"
      ? req.body.metadata
      : {},
  });
  res.json({ ok: true });
});

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
