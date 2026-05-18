import { Router } from "express";

import { isAuthenticated } from "../../auth/passport";
import { compareCreators, loadCreatorScore } from "./scout";
import { loadMarketPulse } from "./market-map";
import {
  isTezosIntelEnabled,
  TEZOS_INTEL_IMPORT_COMMANDS,
  TEZOS_INTEL_SOURCES,
} from "./imports";

const router = Router();

router.use("/api/tezos-intel", isAuthenticated, (req, res, next) => {
  if (!isTezosIntelEnabled()) {
    return res.status(503).json({ error: "Tezos intelligence API disabled" });
  }
  next();
});

router.get("/api/tezos-intel/sources", (_req, res) => {
  res.json({
    sources: TEZOS_INTEL_SOURCES,
    importCommands: TEZOS_INTEL_IMPORT_COMMANDS,
  });
});

router.get("/api/tezos-intel/creator/:address", async (req, res) => {
  try {
    res.json(await loadCreatorScore(req.params.address));
  } catch (err) {
    console.error("[tezos-intel] creator market signals failed:", err);
    res.status(500).json({ error: "Failed to load creator market signals" });
  }
});

router.get("/api/tezos-intel/compare", async (req, res) => {
  try {
    const addresses = String(req.query.addresses ?? "")
      .split(",")
      .map((address) => address.trim())
      .filter(Boolean);
    res.json({ creators: await compareCreators(addresses) });
  } catch (err) {
    console.error("[tezos-intel] creator compare failed:", err);
    res.status(500).json({ error: "Failed to compare creators" });
  }
});

router.get("/api/tezos-intel/market-pulse", async (req, res) => {
  try {
    const windowDays = Number(req.query.windowDays ?? 30);
    res.json(await loadMarketPulse(windowDays));
  } catch (err) {
    console.error("[tezos-intel] market pulse failed:", err);
    res.status(500).json({ error: "Failed to load market pulse" });
  }
});

export default router;
