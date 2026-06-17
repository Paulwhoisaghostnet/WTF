export function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const max = (xs) => (xs.length ? Math.max(...xs) : 0);
const r1 = (n) => Number(n.toFixed(1));
const r2 = (n) => Number(n.toFixed(2));

export function summarizeClient(samples) {
  const byLabel = {};
  const allLatencies = [];
  let errors = 0;
  for (const s of samples) {
    const bucket = (byLabel[s.label] ??= { count: 0, errors: 0, latencies: [] });
    bucket.count += 1;
    bucket.latencies.push(s.ms);
    allLatencies.push(s.ms);
    if (s.status < 0 || s.status >= 500 || s.status === 429) {
      bucket.errors += 1;
      errors += 1;
    }
  }
  const labels = {};
  for (const [label, b] of Object.entries(byLabel)) {
    labels[label] = {
      count: b.count,
      errors: b.errors,
      avgMs: r1(avg(b.latencies)),
      p50Ms: r1(percentile(b.latencies, 50)),
      p95Ms: r1(percentile(b.latencies, 95)),
      p99Ms: r1(percentile(b.latencies, 99)),
      maxMs: r1(max(b.latencies)),
    };
  }
  return {
    totalRequests: samples.length,
    errors,
    errorRate: samples.length ? r2(errors / samples.length) : 0,
    overall: {
      avgMs: r1(avg(allLatencies)),
      p50Ms: r1(percentile(allLatencies, 50)),
      p95Ms: r1(percentile(allLatencies, 95)),
      p99Ms: r1(percentile(allLatencies, 99)),
      maxMs: r1(max(allLatencies)),
    },
    byLabel: labels,
  };
}

export function summarizeServer(samples, finalSnap) {
  if (!samples.length && !finalSnap) return null;
  // Instantaneous gauges are averaged/maxed across in-step samples.
  const dbActive = samples.map((s) => s.dbPool?.active ?? 0);
  const dbWaiting = samples.map((s) => s.dbPool?.waiting ?? 0);
  const rss = samples.map((s) => s.memory?.rssBytes ?? 0);
  const wsTotal = samples.map((s) => s.websocket?.total ?? 0);
  const wsLive = samples.map((s) => s.websocket?.wtfLive ?? 0);
  const inFlight = samples.map((s) => s.http?.inFlight ?? 0);
  // Event-loop / CPU / request totals come from the end-of-step cumulative
  // snapshot (since the step-start reset) when available; otherwise fall back
  // to the sample series.
  const elMeanSeries = samples.map((s) => s.eventLoop?.meanMs ?? 0);
  const elP99Series = samples.map((s) => s.eventLoop?.p99Ms ?? 0);
  const cpuSeries = samples.map((s) => s.cpu?.percent ?? 0);
  return {
    sampleCount: samples.length,
    eventLoopMeanMs: finalSnap?.eventLoop
      ? r2(finalSnap.eventLoop.meanMs)
      : r2(avg(elMeanSeries)),
    eventLoopP99AvgMs: finalSnap?.eventLoop
      ? r2(finalSnap.eventLoop.p99Ms)
      : r2(avg(elP99Series)),
    eventLoopP99MaxMs: r2(max(elP99Series.length ? elP99Series : [finalSnap?.eventLoop?.p99Ms ?? 0])),
    eventLoopResolutionMs: finalSnap?.eventLoop?.resolutionMs ?? null,
    cpuPercentAvg: finalSnap?.cpu ? r1(finalSnap.cpu.percent) : r1(avg(cpuSeries)),
    cpuPercentMax: r1(max(cpuSeries.length ? cpuSeries : [finalSnap?.cpu?.percent ?? 0])),
    dbPoolMax: finalSnap?.dbPool?.max ?? samples[samples.length - 1]?.dbPool?.max ?? null,
    dbActiveAvg: r1(avg(dbActive)),
    dbActiveMax: max(dbActive),
    dbWaitingAvg: r2(avg(dbWaiting)),
    dbWaitingMax: max(dbWaiting),
    rssMaxMB: r1(max(rss) / 1024 / 1024),
    wsTotalMax: max(wsTotal),
    wsLiveMax: max(wsLive),
    httpInFlightMax: max(inFlight),
    serverWindowReqTotal: finalSnap?.http?.windowTotal ?? 0,
    serverWindowErrTotal: finalSnap?.http?.windowErrors ?? 0,
  };
}

function mb(bytes) {
  return r1(bytes / 1024 / 1024);
}

export function renderMarkdown(result) {
  const lines = [];
  lines.push(`# wtfOS Load Test Report — ${result.label}`);
  lines.push("");
  lines.push(`- Target: \`${result.baseUrl}\``);
  lines.push(`- Commit: \`${result.commitRef ?? "unknown"}\``);
  lines.push(`- Started: ${result.startedAt}`);
  lines.push(`- Finished: ${result.finishedAt}`);
  lines.push(`- Step duration: ${result.config.stepSeconds}s, sample interval: ${result.config.sampleMs}ms`);
  lines.push(`- Journey mix: ${result.config.mix.map((m) => `${m.name}:${m.weight}`).join(", ")}`);
  lines.push("");

  lines.push("## Concurrency ramp — server load vs users");
  lines.push("");
  lines.push(
    "| Users | Client RPS | Client p95 (ms) | Client p99 (ms) | Err % | EL lag mean (ms) | EL lag p99 (ms) | CPU avg % | CPU max % | DB active/max | DB waiting max | RSS max (MB) | WS live max |",
  );
  lines.push(
    "|------:|-----------:|----------------:|----------------:|------:|-----------------:|----------------:|----------:|----------:|--------------:|---------------:|-------------:|------------:|",
  );
  for (const step of result.steps) {
    const c = step.client;
    const s = step.server || {};
    lines.push(
      `| ${step.level} | ${step.rps} | ${c.overall.p95Ms} | ${c.overall.p99Ms} | ${(c.errorRate * 100).toFixed(1)} | ${s.eventLoopMeanMs ?? "-"} | ${s.eventLoopP99AvgMs ?? "-"} | ${s.cpuPercentAvg ?? "-"} | ${s.cpuPercentMax ?? "-"} | ${s.dbActiveAvg ?? "-"}/${s.dbPoolMax ?? "-"} | ${s.dbWaitingMax ?? "-"} | ${s.rssMaxMB ?? "-"} | ${s.wsLiveMax ?? "-"} |`,
    );
  }
  lines.push("");

  lines.push("## Load per user (server cost ÷ concurrent users)");
  lines.push("");
  lines.push("| Users | RPS/user | CPU % /user | DB active /user | EL lag mean (ms) |");
  lines.push("|------:|---------:|------------:|----------------:|-----------------:|");
  for (const step of result.steps) {
    const s = step.server || {};
    const perRps = step.level ? r2(step.rps / step.level) : 0;
    const perCpu = step.level && s.cpuPercentAvg != null ? r2(s.cpuPercentAvg / step.level) : "-";
    const perDb = step.level && s.dbActiveAvg != null ? r2(s.dbActiveAvg / step.level) : "-";
    lines.push(`| ${step.level} | ${perRps} | ${perCpu} | ${perDb} | ${s.eventLoopMeanMs ?? "-"} |`);
  }
  lines.push("");

  // Slowest routes at peak step
  const peak = result.steps[result.steps.length - 1];
  if (peak?.client?.byLabel) {
    lines.push(`## Slowest endpoints at peak (${peak.level} users)`);
    lines.push("");
    lines.push("| Endpoint | Count | avg (ms) | p95 (ms) | p99 (ms) | max (ms) | errors |");
    lines.push("|----------|------:|---------:|---------:|---------:|---------:|-------:|");
    const rows = Object.entries(peak.client.byLabel)
      .sort((a, b) => b[1].p95Ms - a[1].p95Ms)
      .slice(0, 15);
    for (const [label, st] of rows) {
      lines.push(
        `| \`${label}\` | ${st.count} | ${st.avgMs} | ${st.p95Ms} | ${st.p99Ms} | ${st.maxMs} | ${st.errors} |`,
      );
    }
    lines.push("");
  }

  // Peak server route latency (from /api/metrics, full-chain timing)
  if (peak?.serverRoutes?.length) {
    lines.push(`## Server-measured route latency at peak (${peak.level} users)`);
    lines.push("");
    lines.push("| Route | Count | avg (ms) | p95 (ms) | p99 (ms) | max (ms) |");
    lines.push("|-------|------:|---------:|---------:|---------:|---------:|");
    for (const r of peak.serverRoutes.slice(0, 15)) {
      lines.push(
        `| \`${r.key}\` | ${r.count} | ${r1(r.avgMs)} | ${r1(r.p95Ms)} | ${r1(r.p99Ms)} | ${r1(r.maxMs)} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export { mb, r1, r2, avg, max };
