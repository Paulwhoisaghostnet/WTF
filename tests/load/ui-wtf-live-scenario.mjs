/**
 * Real-UI WTF Live load scenario: one presenter (screen-share + mic) and N
 * guest viewers in Chromium, with optional TV + Skywire vault side journeys.
 *
 * Env:
 *   WTF_LOAD_BASE_URL (default http://127.0.0.1:3000)
 *   WTF_METRICS_TOKEN
 *   WTF_LOAD_UI_VIEWERS (default 3)
 *   WTF_LOAD_UI_DURATION_SEC (default 45)
 *   WTF_LOAD_UI_ROOM_ID (optional — creates a public room when omitted)
 *   WTF_LOAD_ALLOW_PRODUCTION=1 (required for wtfos.app)
 *   WTF_LOAD_LABEL (default ui-wtf-live)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { loadConfig, isProductionHost } from "./config.mjs";
import { loginWalletActor } from "./auth-wallet.mjs";
import { readPuppetCredentials, actorById } from "../e2e/puppets/runtime.mjs";
import { renderMarkdown } from "./report.mjs";

const config = loadConfig();
const viewerCount = Number(process.env.WTF_LOAD_UI_VIEWERS || 3);
const durationSec = Number(process.env.WTF_LOAD_UI_DURATION_SEC || 45);
const label = process.env.WTF_LOAD_LABEL || "ui-wtf-live";

if (isProductionHost(config.baseUrl) && !config.allowProduction) {
  console.error(`Refuse prod UI scenario without WTF_LOAD_ALLOW_PRODUCTION=1`);
  process.exit(2);
}

const FAKE_MEDIA_INIT = () => {
  function canvasStream(w = 1280, h = 720, fps = 10) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    let frame = 0;
    const draw = () => {
      frame += 1;
      ctx.fillStyle = `hsl(${frame % 360} 70% 45%)`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      ctx.font = "32px sans-serif";
      ctx.fillText(`wtfOS load frame ${frame}`, 40, 60);
    };
    draw();
    const id = window.setInterval(draw, 1000 / fps);
    const stream = canvas.captureStream(fps);
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener("ended", () => window.clearInterval(id));
    });
    return stream;
  }

  const origGetUserMedia = navigator.mediaDevices.getUserMedia?.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints = {}) => {
    const stream = canvasStream(640, 360, 15);
    if (constraints.audio) {
      const audioCtx = new AudioContext();
      const osc = audioCtx.createOscillator();
      const dest = audioCtx.createMediaStreamDestination();
      osc.connect(dest);
      osc.start();
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }
    return stream;
  };

  navigator.mediaDevices.getDisplayMedia = async () => canvasStream(1280, 720, 12);
};

async function fetchMetrics(reset = false) {
  const url = `${config.baseUrl}/api/metrics${reset ? "?reset=1" : ""}`;
  const headers = config.metricsToken ? { "x-metrics-token": config.metricsToken } : {};
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function createPublicRoom(presenter) {
  const res = await fetch(`${config.baseUrl}/api/wtf-live/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: presenter.cookieHeader,
    },
    body: JSON.stringify({
      title: `Load UI ${Date.now()}`,
      description: "Automated WTF Live UI load scenario",
      accessMode: "public",
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`create room failed: HTTP ${res.status} ${body.slice(0, 160)}`);
  }
  const json = JSON.parse(body);
  return json?.room?.id || json?.room?.slug || null;
}

async function resolveRoomId(presenter) {
  if (config.roomId || process.env.WTF_LOAD_UI_ROOM_ID) {
    return config.roomId || process.env.WTF_LOAD_UI_ROOM_ID;
  }
  try {
    const created = await createPublicRoom(presenter);
    if (created) return created;
  } catch (err) {
    console.warn(`[ui-load] create room failed: ${err.message}; reusing an existing public room`);
  }
  const listRes = await fetch(`${config.baseUrl}/api/wtf-live/rooms`, {
    headers: { Cookie: presenter.cookieHeader },
  });
  if (!listRes.ok) {
    throw new Error(`list rooms failed: HTTP ${listRes.status}`);
  }
  const listJson = await listRes.json();
  const room = (listJson?.rooms || []).find((entry) => entry?.isPublic !== false && entry?.id);
  if (!room?.id) throw new Error("No public WTF Live room available for UI scenario");
  return room.id;
}

async function runPresenter(browser, roomId, presenter) {
  const context = await browser.newContext({
    baseURL: config.baseUrl,
    extraHTTPHeaders: presenter.cookieHeader ? { Cookie: presenter.cookieHeader } : undefined,
  });
  await context.addInitScript(FAKE_MEDIA_INIT);
  const page = await context.newPage();
  const t0 = performance.now();
  await page.goto(`/live/r/${encodeURIComponent(roomId)}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("[data-wtf-live-join-room]").click({ timeout: 30_000 });
  await page.waitForTimeout(2000);
  await page.locator("[data-wtf-live-toggle-screen]").click({ timeout: 15_000 });
  await page.waitForTimeout(durationSec * 1000);
  const elapsed = performance.now() - t0;
  await context.close();
  return { role: "presenter", elapsed, ok: true };
}

async function runViewer(browser, roomId, index) {
  const context = await browser.newContext({ baseURL: config.baseUrl });
  await context.addInitScript(FAKE_MEDIA_INIT);
  const page = await context.newPage();
  const t0 = performance.now();
  await page.goto(`/live/r/${encodeURIComponent(roomId)}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByLabel("Display name", { exact: false }).fill(`Viewer ${index}`).catch(() => {});
  await page.locator("[data-wtf-live-join-room]").click({ timeout: 30_000 });
  await page.waitForSelector("[data-wtf-live-stage-entry]", { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(durationSec * 1000);
  const elapsed = performance.now() - t0;
  await context.close();
  return { role: `viewer-${index}`, elapsed, ok: true };
}

async function runTvJourney(browser, presenter) {
  const context = await browser.newContext({
    baseURL: config.baseUrl,
    extraHTTPHeaders: presenter.cookieHeader ? { Cookie: presenter.cookieHeader } : undefined,
  });
  const page = await context.newPage();
  const t0 = performance.now();
  await page.goto("/tv", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(Math.min(durationSec, 30) * 1000);
  await context.close();
  return { role: "tv-viewer", elapsed: performance.now() - t0, ok: true };
}

async function runSkywireVaultPoll(presenter) {
  const t0 = performance.now();
  const res = await fetch(`${config.baseUrl}/api/skywire/tezos-vault?limit=24&offset=0`, {
    headers: { Cookie: presenter.cookieHeader },
  });
  return {
    role: "skywire-vault",
    elapsed: performance.now() - t0,
    ok: res.ok,
    status: res.status,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const credentials = await readPuppetCredentials();
  const presenterActor =
    actorById(credentials, process.env.WTF_LOAD_UI_PRESENTER_ID || "bigbird");
  const presenter = await loginWalletActor(config.baseUrl, presenterActor);

  const roomId = await resolveRoomId(presenter);

  console.log(`[ui-load] target=${config.baseUrl} room=${roomId} viewers=${viewerCount} duration=${durationSec}s`);

  const health = await fetch(`${config.baseUrl}/api/health`).then((r) => r.json()).catch(() => null);
  const metricsAvailable = Boolean((await fetchMetrics(false))?.ok);
  const samples = [];
  const sampling = (async () => {
    const end = Date.now() + durationSec * 1000 + 15_000;
    while (Date.now() < end) {
      const snap = await fetchMetrics(false);
      if (snap?.ok) samples.push(snap);
      await new Promise((r) => setTimeout(r, config.sampleMs));
    }
  })();

  if (metricsAvailable) await fetchMetrics(true);

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const results = await Promise.allSettled([
    runPresenter(browser, roomId, presenter),
    ...Array.from({ length: viewerCount }, (_, i) => runViewer(browser, roomId, i + 1)),
    runTvJourney(browser, presenter),
    runSkywireVaultPoll(presenter),
  ]);

  await browser.close();
  await sampling;

  const finalMetrics = await fetchMetrics(false);
  const actors = results.map((r, i) =>
    r.status === "fulfilled" ? r.value : { role: `task-${i}`, ok: false, error: String(r.reason) },
  );

  const result = {
    label,
    baseUrl: config.baseUrl,
    commitRef: health?.version?.commitRef ?? null,
    startedAt,
    finishedAt: new Date().toISOString(),
    roomId,
    viewerCount,
    durationSec,
    metricsAvailable,
    actors,
    metricsSamples: samples.length,
    finalMetrics: finalMetrics
      ? {
          eventLoop: finalMetrics.eventLoop,
          dbPool: finalMetrics.dbPool,
          websocket: finalMetrics.websocket,
          memory: finalMetrics.memory,
        }
      : null,
  };

  await mkdir(config.outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = join(config.outDir, `load-${label}-${stamp}`);
  await writeFile(`${base}.json`, JSON.stringify(result, null, 2));
  const md = [
    `# wtfOS UI Load Scenario — ${label}`,
    ``,
    `- Target: \`${config.baseUrl}\``,
    `- Room: \`${roomId}\``,
    `- Presenter + ${viewerCount} viewers + TV + Skywire vault poll`,
    `- Duration: ${durationSec}s per browser session`,
    `- Metrics: ${metricsAvailable ? "yes" : "no"}`,
    ``,
    `## Actors`,
    ...actors.map((a) => `- ${a.role}: ${a.ok ? "ok" : "fail"} (${Math.round(a.elapsed || 0)} ms)`),
    ``,
    finalMetrics?.websocket
      ? `## Final WebSocket counts\n\n\`\`\`json\n${JSON.stringify(finalMetrics.websocket, null, 2)}\n\`\`\``
      : "",
  ].join("\n");
  await writeFile(`${base}.md`, md);
  console.log(`[ui-load] wrote ${base}.json`);
  console.log(md);
}

main().catch((err) => {
  console.error("[ui-load] fatal:", err);
  process.exit(1);
});
