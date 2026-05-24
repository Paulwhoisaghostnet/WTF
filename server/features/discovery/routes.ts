import { Router } from "express";
import { pool } from "../../db";
import { getRandomArtist } from "./random-artist";
import { getRandomNft } from "./random-nft";
import { getSpotlight } from "./spotlight-scheduler";
import { logSystemEvent } from "../../lib/system-log";
import { createInMemoryRateLimit } from "../../lib/in-memory-rate-limit";

const router = Router();

const discoveryRateLimit = createInMemoryRateLimit({
  windowMs: 60_000,
  max: 30,
  message: { error: "Too many discovery requests, please try again later" },
  keyGenerator: (req) => req.ip || req.headers["x-forwarded-for"]?.toString() || "anonymous",
});

router.get("/api/discovery/random-artist", discoveryRateLimit, async (req, res) => {
  try {
    const artist = await getRandomArtist(pool);

    logSystemEvent({
      source: "server",
      eventType: "discovery.random_artist",
      severity: "info",
      userId: null,
      method: req.method,
      path: req.path,
      metadata: { artistAddress: artist?.address ?? null },
    });

    res.json(artist);
  } catch (err) {
    console.error("[discovery] random-artist failed:", err);
    res.status(500).json({ error: "Failed to fetch random artist" });
  }
});

router.get("/api/discovery/random-nft", discoveryRateLimit, async (req, res) => {
  try {
    const nft = await getRandomNft(pool);

    logSystemEvent({
      source: "server",
      eventType: "discovery.random_nft",
      severity: "info",
      userId: null,
      method: req.method,
      path: req.path,
      metadata: { nftContract: nft?.contractAddress ?? null, nftTokenId: nft?.tokenId ?? null },
    });

    res.json(nft);
  } catch (err) {
    console.error("[discovery] random-nft failed:", err);
    res.status(500).json({ error: "Failed to fetch random NFT" });
  }
});

router.get("/api/discovery/spotlight", discoveryRateLimit, (_req, res) => {
  res.json(getSpotlight());
});

export default router;
