import { monitorEventLoopDelay, type IntervalHistogram } from "perf_hooks";
import type { NextFunction, Request, Response } from "express";

/**
 * Lightweight, dependency-free runtime metrics for diagnosing wtfOS lag.
 *
 * The single Node process serves all HTTP, WebSocket, and background-job work
 * on one event loop, so the numbers that actually explain user-visible lag are:
 *
 *   - event-loop delay (how long the loop is blocked between ticks)
 *   - process CPU saturation
 *   - DB pool in-use / waiting counts (pool exhaustion stalls every request)
 *   - per-route latency (which handlers are slow under load)
 *   - in-flight HTTP requests and live WebSocket counts
 *
 * Counters are accumulated since the last reset window. A load harness polls
 * `/api/metrics?reset=1` at a fixed cadence so each sample is a clean window
 * (delta polling); the percentile reservoirs and the event-loop histogram are
 * cleared on each reset so a sample reflects only that interval.
 */

const MAX_ROUTE_KEYS = 250;
const MAX_SAMPLES_PER_ROUTE = 256;

type RouteStat = {
  key: string;
  count: number;
  errorCount: number;
  totalMs: number;
  maxMs: number;
  samples: number[];
};

const routeStats = new Map<string, RouteStat>();

let elHistogram: IntervalHistogram | null = null;
let elResolutionMs = 10;

let cpuBaseline = process.cpuUsage();
let windowStartedAt = Date.now();

let httpInFlight = 0;
let httpAllTimeTotal = 0;
let httpWindowTotal = 0;
let httpWindowErrors = 0;

let started = false;

export function startRuntimeMetrics(resolutionMs = 10): void {
  if (started) return;
  started = true;
  elResolutionMs = Math.max(1, resolutionMs);
  elHistogram = monitorEventLoopDelay({ resolution: elResolutionMs });
  elHistogram.enable();
  cpuBaseline = process.cpuUsage();
  windowStartedAt = Date.now();
}

function normalizePath(rawUrl: string): string {
  const path = rawUrl.split("?", 1)[0] || rawUrl;
  if (!path) return "/";
  const normalized = path
    .split("/")
    .map((seg) => {
      if (!seg) return seg;
      if (/^\d+$/.test(seg)) return ":id";
      if (/^(tz1|tz2|tz3|KT1)[0-9A-Za-z]{20,}$/.test(seg)) return ":addr";
      if (/^[0-9a-fA-F-]{16,}$/.test(seg)) return ":uuid";
      if (/^[0-9a-fA-F]{12,}$/.test(seg)) return ":hex";
      return seg;
    })
    .join("/");
  return normalized || "/";
}

function recordRoute(key: string, durMs: number, isError: boolean): void {
  let stat = routeStats.get(key);
  if (!stat) {
    if (routeStats.size >= MAX_ROUTE_KEYS) {
      key = "OTHER";
      stat = routeStats.get(key);
    }
    if (!stat) {
      stat = { key, count: 0, errorCount: 0, totalMs: 0, maxMs: 0, samples: [] };
      routeStats.set(key, stat);
    }
  }
  stat.count += 1;
  if (isError) stat.errorCount += 1;
  stat.totalMs += durMs;
  if (durMs > stat.maxMs) stat.maxMs = durMs;
  if (stat.samples.length < MAX_SAMPLES_PER_ROUTE) {
    stat.samples.push(durMs);
  } else {
    const idx = Math.floor(Math.random() * stat.count);
    if (idx < MAX_SAMPLES_PER_ROUTE) stat.samples[idx] = durMs;
  }
}

export function routeTimingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = process.hrtime.bigint();
  httpInFlight += 1;
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    httpInFlight = Math.max(0, httpInFlight - 1);
    const durMs = Number(process.hrtime.bigint() - start) / 1e6;
    const status = res.statusCode || 0;
    const isError = status >= 500;
    httpAllTimeTotal += 1;
    httpWindowTotal += 1;
    if (isError) httpWindowErrors += 1;
    const method = String(req.method || "GET").toUpperCase();
    const key = `${method} ${normalizePath(String(req.originalUrl || req.url || ""))}`;
    recordRoute(key, durMs, isError);
  };
  res.on("finish", finish);
  res.on("close", finish);
  next();
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return Number(sorted[idx].toFixed(2));
}

function ns2ms(n: number): number {
  return Number.isFinite(n) ? Number((n / 1e6).toFixed(2)) : 0;
}

export type DbPoolGauge = {
  max: number | null;
  total: number;
  idle: number;
  active: number;
  waiting: number;
} | null;

export type WebSocketGauge = Record<string, number> | null;

export type RuntimeMetricsSnapshot = {
  ok: true;
  timestamp: string;
  uptimeSec: number;
  windowMs: number;
  eventLoop: {
    resolutionMs: number;
    meanMs: number;
    p50Ms: number;
    p90Ms: number;
    p99Ms: number;
    maxMs: number;
  } | null;
  cpu: {
    userMs: number;
    systemMs: number;
    windowMs: number;
    percent: number;
  };
  memory: {
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    externalBytes: number;
  };
  dbPool: DbPoolGauge;
  http: {
    inFlight: number;
    windowTotal: number;
    windowErrors: number;
    allTimeTotal: number;
  };
  websocket: WebSocketGauge;
  routes: Array<{
    key: string;
    count: number;
    errorCount: number;
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
  }>;
};

export function buildRuntimeMetricsSnapshot(opts: {
  dbPool?: DbPoolGauge;
  websocket?: WebSocketGauge;
}): RuntimeMetricsSnapshot {
  const now = Date.now();
  const windowMs = Math.max(1, now - windowStartedAt);
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage(cpuBaseline);
  const userMs = cpu.user / 1000;
  const systemMs = cpu.system / 1000;

  const routes = [...routeStats.values()]
    .map((stat) => {
      const sorted = [...stat.samples].sort((a, b) => a - b);
      return {
        key: stat.key,
        count: stat.count,
        errorCount: stat.errorCount,
        avgMs: stat.count ? Number((stat.totalMs / stat.count).toFixed(2)) : 0,
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        p99Ms: percentile(sorted, 99),
        maxMs: Number(stat.maxMs.toFixed(2)),
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    ok: true,
    timestamp: new Date(now).toISOString(),
    uptimeSec: Number(process.uptime().toFixed(1)),
    windowMs,
    eventLoop: elHistogram
      ? {
          resolutionMs: elResolutionMs,
          meanMs: ns2ms(elHistogram.mean),
          p50Ms: ns2ms(elHistogram.percentile(50)),
          p90Ms: ns2ms(elHistogram.percentile(90)),
          p99Ms: ns2ms(elHistogram.percentile(99)),
          maxMs: ns2ms(elHistogram.max),
        }
      : null,
    cpu: {
      userMs: Number(userMs.toFixed(1)),
      systemMs: Number(systemMs.toFixed(1)),
      windowMs,
      percent: Number((((userMs + systemMs) / windowMs) * 100).toFixed(1)),
    },
    memory: {
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      externalBytes: mem.external,
    },
    dbPool: opts.dbPool ?? null,
    http: {
      inFlight: httpInFlight,
      windowTotal: httpWindowTotal,
      windowErrors: httpWindowErrors,
      allTimeTotal: httpAllTimeTotal,
    },
    websocket: opts.websocket ?? null,
    routes,
  };
}

export function resetRuntimeMetricWindows(): void {
  routeStats.clear();
  httpWindowTotal = 0;
  httpWindowErrors = 0;
  cpuBaseline = process.cpuUsage();
  windowStartedAt = Date.now();
  elHistogram?.reset();
}
