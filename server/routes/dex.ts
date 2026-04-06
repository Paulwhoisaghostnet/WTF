import { Router } from "express";
import {
  SPICY_API_URL,
  type SpicyToken,
  type SpicyPool,
  type SpicyPoolMetric,
} from "@shared/types";

const router = Router();

const CACHE_TTL_MS = 30_000;

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

async function fetchTokenMap(): Promise<Map<string, SpicyToken>> {
  const cacheKey = "dex:tokenmap";
  const cached = getCached<Map<string, SpicyToken>>(cacheKey);
  if (cached) return cached;

  const url = `${SPICY_API_URL}/TokenList?day_agg_start=${calculateDayAgg()}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`SpicySwap token API ${resp.status}`);

  const body = await resp.json();
  const map = new Map<string, SpicyToken>();
  for (const raw of body.tokens ?? []) {
    const token = transformToken(raw);
    if (token.tag) map.set(token.tag, token);
  }
  setCache(cacheKey, map);
  return map;
}

function stubToken(tag: string): SpicyToken {
  return {
    name: tag,
    symbol: tag.split(":")[0]?.slice(-6) ?? "???",
    decimals: 0,
    img: "",
    tag,
    derivedXtz: 0,
    derivedUsd: 0,
    totalLiquidityXtz: 0,
    totalLiquidityUsd: 0,
  };
}

function transformPool(raw: any, tokenMap: Map<string, SpicyToken>): SpicyPool {
  const tag0 = String(raw.token0 ?? "");
  const tag1 = String(raw.token1 ?? "");
  const dayAgg = raw.pairDayData_aggregate?.aggregate?.sum ?? {};

  return {
    pairId: String(raw.pair_id ?? raw.pairId ?? ""),
    fromToken: tokenMap.get(tag0) ?? stubToken(tag0),
    toToken: tokenMap.get(tag1) ?? stubToken(tag1),
    reserveFrom: Number(raw.reserve0 ?? raw.reserve_from ?? raw.reserveFrom ?? 0),
    reserveTo: Number(raw.reserve1 ?? raw.reserve_to ?? raw.reserveTo ?? 0),
    volumeUsd: Number(dayAgg.dailyvolumeusd ?? raw.volume_usd ?? raw.volumeUsd ?? 0),
    volumeXtz: Number(dayAgg.dailyvolumextz ?? raw.volume_xtz ?? raw.volumeXtz ?? 0),
  };
}

const MIN_LIQUIDITY_XTZ = 1;

async function fetchPools(): Promise<SpicyPool[]> {
  const cacheKey = "dex:pools:raw";
  const cached = getCached<SpicyPool[]>(cacheKey);
  if (cached) return cached;

  const [tokenMap, poolResp] = await Promise.all([
    fetchTokenMap(),
    fetch(`${SPICY_API_URL}/PoolListAll?day_agg_start=${calculateDayAgg()}&hour_agg_start=${calculateHourAgg()}`),
  ]);

  if (!poolResp.ok) throw new Error(`SpicySwap API ${poolResp.status}`);

  const body = await poolResp.json();
  const pools: SpicyPool[] = (body.pair_info ?? []).map(
    (raw: any) => transformPool(raw, tokenMap),
  );
  setCache(cacheKey, pools);
  return pools;
}

function getActivePools(pools: SpicyPool[]): SpicyPool[] {
  return pools.filter(
    (p) =>
      p.reserveFrom > 0 &&
      p.reserveTo > 0 &&
      p.fromToken.tag &&
      p.toToken.tag &&
      (p.fromToken.totalLiquidityXtz >= MIN_LIQUIDITY_XTZ ||
        p.toToken.totalLiquidityXtz >= MIN_LIQUIDITY_XTZ ||
        p.volumeXtz > 0),
  );
}

function extractPoolTokens(pools: SpicyPool[]): SpicyToken[] {
  const map = new Map<string, SpicyToken>();
  for (const pool of pools) {
    if (!map.has(pool.fromToken.tag)) map.set(pool.fromToken.tag, pool.fromToken);
    if (!map.has(pool.toToken.tag)) map.set(pool.toToken.tag, pool.toToken);
  }
  return Array.from(map.values()).sort(
    (a, b) => b.totalLiquidityXtz - a.totalLiquidityXtz,
  );
}

/* ── GET /api/dex/tokens — only tokens in active pools ─────────────────── */
router.get("/api/dex/tokens", async (_req, res) => {
  try {
    const cacheKey = "dex:tokens:active";
    const cached = getCached<SpicyToken[]>(cacheKey);
    if (cached) return res.json(cached);

    const pools = await fetchPools();
    const active = getActivePools(pools);
    const tokens = extractPoolTokens(active);

    setCache(cacheKey, tokens);
    res.json(tokens);
  } catch (err: any) {
    console.error("DEX tokens error:", err?.message);
    res.status(502).json({ error: "Failed to fetch DEX tokens" });
  }
});

/* ── GET /api/dex/pools — only active pools ────────────────────────────── */
router.get("/api/dex/pools", async (_req, res) => {
  try {
    const cacheKey = "dex:pools:active";
    const cached = getCached<SpicyPool[]>(cacheKey);
    if (cached) return res.json(cached);

    const pools = await fetchPools();
    const active = getActivePools(pools);

    setCache(cacheKey, active);
    res.json(active);
  } catch (err: any) {
    console.error("DEX pools error:", err?.message);
    res.status(502).json({ error: "Failed to fetch DEX pools" });
  }
});

/* ── GET /api/dex/counterparts/:tag — valid swap partners, ranked ──────── */
router.get("/api/dex/counterparts/:tag", async (req, res) => {
  try {
    const fromTag = decodeURIComponent(req.params.tag);
    const cacheKey = `dex:counterparts:${fromTag}`;
    const cached = getCached<SpicyToken[]>(cacheKey);
    if (cached) return res.json(cached);

    const pools = await fetchPools();
    const active = getActivePools(pools);

    const counterpartMap = new Map<string, { token: SpicyToken; poolHealth: number }>();

    for (const pool of active) {
      let partner: SpicyToken | null = null;
      let health = 0;

      if (pool.fromToken.tag === fromTag) {
        partner = pool.toToken;
        health = pool.reserveTo * pool.toToken.totalLiquidityXtz + pool.volumeXtz;
      } else if (pool.toToken.tag === fromTag) {
        partner = pool.fromToken;
        health = pool.reserveFrom * pool.fromToken.totalLiquidityXtz + pool.volumeXtz;
      }

      if (partner) {
        const existing = counterpartMap.get(partner.tag);
        if (!existing || health > existing.poolHealth) {
          counterpartMap.set(partner.tag, { token: partner, poolHealth: health });
        }
      }
    }

    const ranked = Array.from(counterpartMap.values())
      .sort((a, b) => b.poolHealth - a.poolHealth)
      .map((e) => e.token);

    setCache(cacheKey, ranked);
    res.json(ranked);
  } catch (err: any) {
    console.error("DEX counterparts error:", err?.message);
    res.status(502).json({ error: "Failed to fetch counterparts" });
  }
});

/* ── GET /api/dex/health — check SpicySwap API status ──────────────────── */
router.get("/api/dex/health", async (_req, res) => {
  try {
    const pools = await fetchPools();
    const active = getActivePools(pools);

    res.json({
      spicyswap: true,
      totalPools: pools.length,
      activePools: active.length,
      activeTokens: extractPoolTokens(active).length,
    });
  } catch (err: any) {
    res.json({
      spicyswap: false,
      error: err?.message,
      totalPools: 0,
      activePools: 0,
      activeTokens: 0,
    });
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
