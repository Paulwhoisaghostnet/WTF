import { Router } from "express";
import {
  SPICY_API_URL,
  type SpicyToken,
  type SpicyPool,
  type SpicyPoolMetric,
} from "@shared/types";

const router = Router();

const CACHE_TTL_MS = 20_000;

interface CacheEntry<T> {
  data: T;
  ts: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T) {
  cache.set(key, { data, ts: Date.now() });
}

function calculateDayAgg(): number {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return Math.floor(d.getTime() / 1000);
}

function calculateHourAgg(): number {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return Math.floor(d.getTime() / 1000);
}

function transformToken(raw: any): SpicyToken {
  return {
    name: raw.name ?? raw.symbol ?? "Unknown",
    symbol: raw.symbol ?? "???",
    decimals: raw.decimals ?? 0,
    img: raw.img ?? "",
    tag: raw.tag ?? "",
    derivedXtz: Number(raw.derivedxtz ?? raw.derivedXtz ?? 0),
    derivedUsd: Number(raw.derivedusd ?? raw.derivedUsd ?? 0),
    totalLiquidityXtz: Number(
      raw.totalliquidityxtz ?? raw.totalLiquidityXtz ?? 0
    ),
    totalLiquidityUsd: Number(
      raw.totalliquidityusd ?? raw.totalLiquidityUsd ?? 0
    ),
  };
}

function transformPool(raw: any): SpicyPool {
  return {
    pairId: String(raw.pair_id ?? raw.pairId ?? ""),
    fromToken: transformToken(raw.from_token ?? raw.fromToken ?? {}),
    toToken: transformToken(raw.to_token ?? raw.toToken ?? {}),
    reserveFrom: Number(raw.reserve_from ?? raw.reserveFrom ?? 0),
    reserveTo: Number(raw.reserve_to ?? raw.reserveTo ?? 0),
    volumeUsd: Number(raw.volume_usd ?? raw.volumeUsd ?? 0),
    volumeXtz: Number(raw.volume_xtz ?? raw.volumeXtz ?? 0),
  };
}

router.get("/api/dex/tokens", async (_req, res) => {
  try {
    const cacheKey = "dex:tokens";
    const cached = getCached<SpicyToken[]>(cacheKey);
    if (cached) return res.json(cached);

    const url = `${SPICY_API_URL}/TokenList?day_agg_start=${calculateDayAgg()}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`SpicySwap API ${resp.status}`);

    const body = await resp.json();
    const tokens: SpicyToken[] = (body.tokens ?? []).map(transformToken);

    setCache(cacheKey, tokens);
    res.json(tokens);
  } catch (err: any) {
    console.error("DEX tokens error:", err?.message);
    res.status(502).json({ error: "Failed to fetch DEX tokens" });
  }
});

router.get("/api/dex/pools", async (_req, res) => {
  try {
    const cacheKey = "dex:pools";
    const cached = getCached<SpicyPool[]>(cacheKey);
    if (cached) return res.json(cached);

    const url = `${SPICY_API_URL}/PoolListAll?day_agg_start=${calculateDayAgg()}&hour_agg_start=${calculateHourAgg()}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`SpicySwap API ${resp.status}`);

    const body = await resp.json();
    const pools: SpicyPool[] = (body.pair_info ?? []).map(transformPool);

    setCache(cacheKey, pools);
    res.json(pools);
  } catch (err: any) {
    console.error("DEX pools error:", err?.message);
    res.status(502).json({ error: "Failed to fetch DEX pools" });
  }
});

router.get("/api/dex/pools/:pairId/metrics", async (req, res) => {
  try {
    const { pairId } = req.params;
    const cacheKey = `dex:metrics:${pairId}`;
    const cached = getCached<SpicyPoolMetric[]>(cacheKey);
    if (cached) return res.json(cached);

    const url = `${SPICY_API_URL}/PoolDailyMetrics?_ilike=${encodeURIComponent(pairId)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`SpicySwap API ${resp.status}`);

    const body = await resp.json();
    const metrics: SpicyPoolMetric[] = (body.pair_day_data ?? []).map(
      (m: any) => ({
        date: m.day ?? m.date ?? "",
        reserveUsd: Number(m.reserve_usd ?? m.reserveUsd ?? 0),
        volumeUsd: Number(m.daily_volume_usd ?? m.volumeUsd ?? 0),
      })
    );

    setCache(cacheKey, metrics);
    res.json(metrics);
  } catch (err: any) {
    console.error("DEX pool metrics error:", err?.message);
    res.status(502).json({ error: "Failed to fetch pool metrics" });
  }
});

export default router;
