import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { request as pwRequest } from "@playwright/test";
import { loadConfig, loadPuppetCredentials, isProductionHost } from "./config.mjs";
import { loginWalletActor } from "./auth-wallet.mjs";
import { resolveJourney, pickJourneyName, sleep } from "./journeys.mjs";
import { renderMarkdown, summarizeClient, summarizeServer } from "./report.mjs";

const config = loadConfig();

function log(...args) {
  console.log(`[load ${new Date().toISOString()}]`, ...args);
}

if (isProductionHost(config.baseUrl) && !config.allowProduction) {
  console.error(
    `Refusing to load test production host (${config.baseUrl}).\n` +
      `Set WTF_LOAD_ALLOW_PRODUCTION=1 to override, and prefer a gentle profile ` +
      `(e.g. WTF_LOAD_STEPS=1,3 WTF_LOAD_MIX=public:1 WTF_LOAD_MAX_RPS=5).`,
  );
  process.exit(2);
}

async function fetchMetrics(reset) {
  const url = `${config.baseUrl}/api/metrics${reset ? "?reset=1" : ""}`;
  const headers = config.metricsToken
    ? { "x-metrics-token": config.metricsToken }
    : {};
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return { ok: false, status: res.status };
    return await res.json();
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function fetchHealth() {
  try {
    const res = await fetch(`${config.baseUrl}/api/health`);
    return await res.json();
  } catch {
    return null;
  }
}

async function loginActor(actor) {
  const useWallet =
    config.auth === "wallet" ||
    (config.auth === "auto" && isProductionHost(config.baseUrl));
  if (useWallet) {
    const bundle = await loginWalletActor(config.baseUrl, actor);
    const context = await pwRequest.newContext({
      baseURL: config.baseUrl,
      extraHTTPHeaders: bundle.cookieHeader ? { Cookie: bundle.cookieHeader } : undefined,
    });
    return { actor, context, cookieHeader: bundle.cookieHeader };
  }
  const context = await pwRequest.newContext({ baseURL: config.baseUrl });
  const res = await context.post("/api/auth/login", {
    data: { username: actor.username, password: actor.password },
  });
  if (!res.ok()) {
    await context.dispose();
    throw new Error(`login failed for ${actor.username}: HTTP ${res.status()}`);
  }
  const state = await context.storageState();
  const cookieHeader = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  return { actor, context, cookieHeader };
}

function makeThrottle(maxRps) {
  if (!maxRps || maxRps <= 0) return null;
  let windowStart = Date.now();
  let count = 0;
  return async function throttle() {
    for (;;) {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        count = 0;
      }
      if (count < maxRps) {
        count += 1;
        return;
      }
      await sleep(1000 - (now - windowStart));
    }
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  log(`Target ${config.baseUrl}`);
  log(`Ramp steps: ${config.steps.join(", ")} | step ${config.stepSeconds}s | settle ${config.settleSeconds}s`);

  const health = await fetchHealth();
  const commitRef = health?.version?.commitRef ?? null;
  log(`Health: ${health?.status ?? "unreachable"} commit=${commitRef ?? "?"}`);

  const probe = await fetchMetrics(false);
  const metricsAvailable = probe?.ok === true;
  if (!metricsAvailable) {
    log(
      `WARNING: /api/metrics not available (status=${probe?.status ?? "?"}). ` +
        `Server-side metrics will be empty; relying on client-side timings only. ` +
        `Set WTF_METRICS_TOKEN (and the same on the server) for full instrumentation.`,
    );
  } else {
    log(`Metrics endpoint OK (db pool max=${probe.dbPool?.max ?? "?"}).`);
  }

  // Auth setup. Build a pool of independent logged-in HTTP contexts sized to
  // peak concurrency so each authed virtual user has its own cookie jar and
  // connection pool (avoids client-side request serialization skewing latency).
  const credentials = await loadPuppetCredentials(config);
  const maxConcurrency = Math.max(...config.steps);
  let authPool = [];
  if (credentials && credentials.length) {
    const target = maxConcurrency;
    log(`Authenticating ${target} virtual-user sessions across ${credentials.length} actors...`);
    const logins = [];
    for (let i = 0; i < target; i += 1) {
      const actor = credentials[i % credentials.length];
      logins.push(
        loginActor(actor)
          .then((bundle) => bundle)
          .catch((err) => {
            log(`  skip session ${i} (${actor.username}): ${err.message}`);
            return null;
          }),
      );
    }
    authPool = (await Promise.all(logins)).filter(Boolean);
    log(`Authenticated ${authPool.length} virtual-user sessions.`);
  } else {
    log(`No puppet credentials — running guest-only journeys.`);
  }

  const guestContext = await pwRequest.newContext({ baseURL: config.baseUrl });
  const throttle = makeThrottle(config.maxRps);

  // Background sampler
  let activeStep = null;
  let currentLevel = 0;
  let sampling = true;
  const samplerLoop = (async () => {
    while (sampling) {
      // Poll without reset: gauges are instantaneous; event-loop/CPU/route
      // stats accumulate over the step (reset happens once at step start).
      const snap = await fetchMetrics(false);
      if (snap?.ok && activeStep) {
        activeStep.samples.push(snap);
      }
      await sleep(config.sampleMs);
    }
  })();

  const steps = [];

  for (const level of config.steps) {
    log(`--- Ramp step: ${level} concurrent users ---`);
    currentLevel = level;
    const clientSamples = [];
    activeStep = { level, samples: [] };

    const stop = { stopped: false };
    const vus = [];
    for (let i = 0; i < level; i += 1) {
      let journeyName = pickJourneyName(config.mix);
      let journey = resolveJourney(journeyName);
      let actorBundle = null;
      if (!journey.guestOk) {
        if (authPool.length === 0) {
          journey = resolveJourney("public");
        } else {
          actorBundle = authPool[i % authPool.length];
        }
      }
      const ctx = {
        request: actorBundle ? actorBundle.context : guestContext,
        baseUrl: config.baseUrl,
        wsUrl: config.wsUrl,
        roomId: config.roomId,
        cookieHeader: actorBundle?.cookieHeader || "",
        throttle,
        record: (sample) => clientSamples.push(sample),
      };
      vus.push({ journey, ctx, stop });
    }

    const runners = vus.map(async (vu) => {
      let state = {};
      try {
        state = await vu.journey.setup(vu.ctx);
      } catch {}
      while (!vu.stop.stopped) {
        try {
          await vu.journey.tick(vu.ctx, state);
        } catch {}
        if (vu.stop.stopped) break;
        await sleep(vu.journey.thinkMs);
      }
      try {
        await vu.journey.teardown(vu.ctx, state);
      } catch {}
    });

    // Warm up (establish sessions, pay one-time cold costs), then reset the
    // server window and discard warmup samples so the step measures steady state.
    await sleep(1500);
    if (metricsAvailable) await fetchMetrics(true);
    activeStep.samples.length = 0;
    clientSamples.length = 0;

    await sleep(config.stepSeconds * 1000);
    const finalSnap = metricsAvailable ? await fetchMetrics(false) : null;
    stop.stopped = true;
    await Promise.all(runners);

    const durationSec = config.stepSeconds;
    const client = summarizeClient(clientSamples);
    const server = summarizeServer(activeStep.samples, finalSnap);
    const rps = Number((client.totalRequests / durationSec).toFixed(2));
    steps.push({
      level,
      durationSec,
      rps,
      client,
      server,
      serverRoutes: finalSnap?.routes || [],
    });
    log(
      `  level ${level}: ${client.totalRequests} reqs (${rps} rps), ` +
        `client p95=${client.overall.p95Ms}ms p99=${client.overall.p99Ms}ms err=${(client.errorRate * 100).toFixed(1)}% | ` +
        (server
          ? `EL mean=${server.eventLoopMeanMs}ms p99=${server.eventLoopP99AvgMs}ms cpu=${server.cpuPercentAvg}% dbWaitMax=${server.dbWaitingMax} wsLive=${server.wsLiveMax}`
          : "no server metrics"),
    );

    activeStep = null;
    if (config.settleSeconds > 0) await sleep(config.settleSeconds * 1000);
  }

  sampling = false;
  await samplerLoop;

  // teardown
  await guestContext.dispose();
  for (const a of authPool) await a.context.dispose();

  const result = {
    label: config.label,
    baseUrl: config.baseUrl,
    commitRef,
    startedAt,
    finishedAt: new Date().toISOString(),
    config: {
      steps: config.steps,
      stepSeconds: config.stepSeconds,
      sampleMs: config.sampleMs,
      mix: config.mix,
      auth: config.auth,
      roomId: config.roomId || null,
    },
    metricsAvailable,
    steps,
  };

  await mkdir(config.outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = join(config.outDir, `load-${config.label}-${stamp}`);
  await writeFile(`${base}.json`, JSON.stringify(result, null, 2));
  const md = renderMarkdown(result);
  await writeFile(`${base}.md`, md);
  log(`Wrote ${base}.json and ${base}.md`);
  console.log("\n" + md + "\n");
}

main().catch((err) => {
  console.error("[load] fatal:", err);
  process.exit(1);
});
