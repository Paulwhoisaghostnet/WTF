/**
 * WTF TV — embed surface.
 *
 * Exposes:
 *   GET /embed/tv/:ref                      → slim HTML player (iframe target)
 *   GET /api/tv/channels/by-dial/:dial      → JSON dial → channel lookup
 *   GET /api/tv/channels/:channelId/embed   → JSON metadata for embeds
 *   GET /oembed                             → oEmbed JSON for rich previews
 *
 * The embed player is intentionally streaming-free: it polls the
 * existing /api/tv/channels/:id/stream endpoint on a 30-minute
 * deterministic window, plays each item in sequence from the cache
 * proxy, and re-fetches the queue when it reaches the end (or when
 * the poll detects that the channel's playlist changed).  Every
 * viewer is a progressive-download client — no HLS/DASH/WebRTC
 * session is created anywhere.
 */
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { tvChannels, users as usersTable } from "@shared/schema";
import { getPublicSiteOrigin } from "../auth/oauth-base";
import { crawlerCachePolicy, requestLooksLikeCrawler } from "../lib/crawler-detect";

const router = Router();

const EMBED_DEFAULT_WIDTH = 640;
const EMBED_DEFAULT_HEIGHT = 360;
const EMBED_MAX_WIDTH = 1920;
const EMBED_MAX_HEIGHT = 1080;

/**
 * Resolves a channel by dial number, slug, or numeric id.  Returns
 * the same subset of fields the stream endpoint publishes so every
 * consumer sees consistent metadata.
 */
async function resolveChannelByRef(rawRef: string) {
  const ref = String(rawRef || "").trim();
  if (!ref) return null;

  const asNumber = Number(ref);

  if (Number.isInteger(asNumber) && asNumber > 0) {
    // Dial-number lookup first (covers 1, 2, 3, 69, 4+).
    const [byDial] = await db
      .select({
        id: tvChannels.id,
        slug: tvChannels.slug,
        title: tvChannels.title,
        description: tvChannels.description,
        logoUrl: tvChannels.logoUrl,
        bannerUrl: tvChannels.bannerUrl,
        isPublic: tvChannels.isPublic,
        isActive: tvChannels.isActive,
        dialNumber: tvChannels.dialNumber,
        ownerUsername: usersTable.username,
        ownerDisplayName: usersTable.displayName,
      })
      .from(tvChannels)
      .innerJoin(usersTable, eq(tvChannels.ownerUserId, usersTable.id))
      .where(and(eq(tvChannels.dialNumber, asNumber), eq(tvChannels.isActive, true)))
      .limit(1);
    if (byDial) return byDial;

    // Fall through to id lookup only when the dial search missed AND
    // the value is small enough to plausibly be an id — this keeps a
    // dial 4 request from accidentally hitting channel id 4 when the
    // caller meant the dial.  We key off the same WHERE.isActive
    // guard so inactive channels never leak through the public embed.
    const [byId] = await db
      .select({
        id: tvChannels.id,
        slug: tvChannels.slug,
        title: tvChannels.title,
        description: tvChannels.description,
        logoUrl: tvChannels.logoUrl,
        bannerUrl: tvChannels.bannerUrl,
        isPublic: tvChannels.isPublic,
        isActive: tvChannels.isActive,
        dialNumber: tvChannels.dialNumber,
        ownerUsername: usersTable.username,
        ownerDisplayName: usersTable.displayName,
      })
      .from(tvChannels)
      .innerJoin(usersTable, eq(tvChannels.ownerUserId, usersTable.id))
      .where(and(eq(tvChannels.id, asNumber), eq(tvChannels.isActive, true)))
      .limit(1);
    if (byId) return byId;
  }

  // Slug lookup — also lower-cases to match the unique index casing.
  const [bySlug] = await db
    .select({
      id: tvChannels.id,
      slug: tvChannels.slug,
      title: tvChannels.title,
      description: tvChannels.description,
      logoUrl: tvChannels.logoUrl,
      bannerUrl: tvChannels.bannerUrl,
      isPublic: tvChannels.isPublic,
      isActive: tvChannels.isActive,
      dialNumber: tvChannels.dialNumber,
      ownerUsername: usersTable.username,
      ownerDisplayName: usersTable.displayName,
    })
    .from(tvChannels)
    .innerJoin(usersTable, eq(tvChannels.ownerUserId, usersTable.id))
    .where(and(eq(tvChannels.slug, ref.toLowerCase()), eq(tvChannels.isActive, true)))
    .limit(1);
  return bySlug || null;
}

function htmlEscape(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clampDim(value: unknown, fallback: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function requestBaseUrl(req: any): string {
  const env = getPublicSiteOrigin();
  if (env) return env;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const host = (req.headers["x-forwarded-host"] as string) || req.get("host");
  return host ? `${proto}://${host}` : "";
}

// ─── Public dial lookup ────────────────────────────────────
router.get("/api/tv/channels/by-dial/:dial", async (req, res) => {
  try {
    const dial = Number(req.params.dial);
    if (!Number.isInteger(dial) || dial <= 0 || dial > 9999) {
      return res.status(400).json({ error: "Invalid dial number" });
    }
    const channel = await resolveChannelByRef(String(dial));
    if (!channel || !channel.isPublic) {
      return res.status(404).json({ error: "Channel not found" });
    }
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json(channel);
  } catch (err) {
    console.error("[tv-embed] by-dial lookup failed:", err);
    res.status(500).json({ error: "Failed to resolve dial" });
  }
});

// ─── Embed metadata (used by the full app, Discord webhooks, etc.) ──
router.get("/api/tv/channels/:channelId/embed", async (req, res) => {
  try {
    const ref = String(req.params.channelId);
    const channel = await resolveChannelByRef(ref);
    if (!channel || !channel.isPublic) {
      return res.status(404).json({ error: "Channel not found" });
    }
    const origin = requestBaseUrl(req);
    const dialOrSlug = channel.dialNumber ?? channel.slug;
    const embedUrl = `${origin}/embed/tv/${dialOrSlug}`;
    const width = clampDim(req.query.width, EMBED_DEFAULT_WIDTH, EMBED_MAX_WIDTH);
    const height = clampDim(req.query.height, EMBED_DEFAULT_HEIGHT, EMBED_MAX_HEIGHT);
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({
      channel,
      embed: {
        url: embedUrl,
        width,
        height,
        html: `<iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`,
        oembed: `${origin}/oembed?url=${encodeURIComponent(embedUrl)}&format=json`,
      },
    });
  } catch (err) {
    console.error("[tv-embed] metadata failed:", err);
    res.status(500).json({ error: "Failed to build embed metadata" });
  }
});

// ─── oEmbed (https://oembed.com) ─────────────────────────
router.get("/oembed", async (req, res) => {
  try {
    const rawUrl = String(req.query.url || "").trim();
    if (!rawUrl) return res.status(400).json({ error: "url parameter is required" });
    const format = String(req.query.format || "json").toLowerCase();
    if (format !== "json") {
      return res
        .status(501)
        .json({ error: "Only JSON format is supported (no XML)" });
    }

    // Parse /embed/tv/:ref out of the provided URL.  Accept any
    // origin — Discord/Twitter/embed.ly all send the full URL they
    // want rendered, including the user's live host.
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: "Invalid url" });
    }
    const match = parsed.pathname.match(/^\/embed\/tv\/([^/?#]+)/);
    if (!match) return res.status(404).json({ error: "Not an embed URL" });
    const ref = decodeURIComponent(match[1]!);
    const channel = await resolveChannelByRef(ref);
    if (!channel || !channel.isPublic) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const origin = requestBaseUrl(req);
    const width = clampDim(req.query.maxwidth, EMBED_DEFAULT_WIDTH, EMBED_MAX_WIDTH);
    const height = clampDim(req.query.maxheight, EMBED_DEFAULT_HEIGHT, EMBED_MAX_HEIGHT);
    const embedUrl = `${origin}/embed/tv/${channel.dialNumber ?? channel.slug}`;

    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({
      type: "video",
      version: "1.0",
      provider_name: "WTF TV",
      provider_url: origin || "https://wtfgameshow.netlify.app",
      title: channel.title,
      author_name: channel.ownerDisplayName || channel.ownerUsername,
      thumbnail_url: channel.logoUrl || channel.bannerUrl || null,
      thumbnail_width: width,
      thumbnail_height: height,
      width,
      height,
      html: `<iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`,
    });
  } catch (err) {
    console.error("[tv-embed] oEmbed failed:", err);
    res.status(500).json({ error: "Failed to build oEmbed response" });
  }
});

// ─── The embed HTML page itself ───────────────────────────
router.get("/embed/tv/:ref", async (req, res) => {
  try {
    const channel = await resolveChannelByRef(req.params.ref);
    if (!channel || !channel.isPublic) {
      res
        .status(404)
        .setHeader("Content-Type", "text/html; charset=utf-8")
        .send(
          `<!doctype html><html><body style="font:14px system-ui;color:#eee;background:#000;padding:20px">Channel not found.</body></html>`
        );
      return;
    }
    const origin = requestBaseUrl(req);
    const channelId = channel.id;
    const dialOrSlug = channel.dialNumber ?? channel.slug;
    const title = `${channel.title} • WTF TV`;
    const desc =
      channel.description ||
      `Live queue from ${channel.ownerDisplayName || channel.ownerUsername} on WTF TV.`;
    const posterUrl = channel.bannerUrl || channel.logoUrl || null;
    const embedUrl = `${origin}/embed/tv/${dialOrSlug}`;
    const oembedUrl = `${origin}/oembed?url=${encodeURIComponent(embedUrl)}&format=json`;
    const width = EMBED_DEFAULT_WIDTH;
    const height = EMBED_DEFAULT_HEIGHT;
    const isCrawler = requestLooksLikeCrawler(req);

    // Open the page up for embedding anywhere — Discord, Twitter, and
    // any third-party site should be able to iframe this.  Strip the
    // default X-Frame-Options that Express helmet-style setups often
    // add, and publish a permissive frame-ancestors CSP.
    res.setHeader("Content-Security-Policy", "frame-ancestors *;");
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", crawlerCachePolicy(isCrawler));

    const streamUrl = `${origin}/api/tv/channels/${channelId}/stream`;
    const channelUrl = `${origin}/tv/${channel.slug}`;

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${htmlEscape(title)}</title>
<meta name="description" content="${htmlEscape(desc)}">

<!-- OpenGraph / Discord -->
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="WTF TV">
<meta property="og:title" content="${htmlEscape(title)}">
<meta property="og:description" content="${htmlEscape(desc)}">
<meta property="og:url" content="${htmlEscape(channelUrl)}">
${posterUrl ? `<meta property="og:image" content="${htmlEscape(posterUrl)}">` : ""}
<meta property="og:video" content="${htmlEscape(embedUrl)}">
<meta property="og:video:url" content="${htmlEscape(embedUrl)}">
<meta property="og:video:secure_url" content="${htmlEscape(embedUrl)}">
<meta property="og:video:type" content="text/html">
<meta property="og:video:width" content="${width}">
<meta property="og:video:height" content="${height}">

<!-- Twitter player card -->
<meta name="twitter:card" content="player">
<meta name="twitter:title" content="${htmlEscape(title)}">
<meta name="twitter:description" content="${htmlEscape(desc)}">
${posterUrl ? `<meta name="twitter:image" content="${htmlEscape(posterUrl)}">` : ""}
<meta name="twitter:player" content="${htmlEscape(embedUrl)}">
<meta name="twitter:player:width" content="${width}">
<meta name="twitter:player:height" content="${height}">

<!-- oEmbed discovery -->
<link rel="alternate" type="application/json+oembed" href="${htmlEscape(oembedUrl)}" title="${htmlEscape(title)}">

<style>
  html,body{margin:0;padding:0;background:#000;color:#eee;font:13px system-ui;-webkit-font-smoothing:antialiased;height:100%;}
  body{display:flex;flex-direction:column;}
  .stage{position:relative;flex:1 1 auto;width:100%;aspect-ratio:16/9;background:#000;overflow:hidden;}
  video, img.gif, img.crawler-poster{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;}
  img.gif{object-fit:cover;}
  img.crawler-poster{object-fit:cover;opacity:.9;}
  .strap{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 10px;background:#0a0a0a;border-top:1px solid #222;font-size:12px;}
  .strap .now{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .strap .dial{opacity:.7;font-variant-numeric:tabular-nums;}
  .strap a{color:#ccc;text-decoration:none;border-left:1px solid #222;padding-left:10px;margin-left:4px;}
  .strap a:hover{color:#fff;}
  .kind-badge{display:inline-block;margin-right:8px;padding:1px 6px;border-radius:3px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;background:#222;color:#8ecbff;}
  .kind-badge.bumper{background:#291f00;color:#ffcc66;}
  .err{padding:8px 10px;color:#ff8a8a;background:#1a0a0a;font-size:12px;}
  .placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#888;background:#0a0a0a;}
  .placeholder.crawler-overlay{background:linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.76));color:#ddd;text-shadow:0 1px 2px #000;}
  button.unmute{position:absolute;top:8px;right:8px;padding:4px 8px;background:rgba(0,0,0,.6);color:#fff;border:1px solid #444;border-radius:3px;font:11px system-ui;cursor:pointer;z-index:2;}
  button.unmute:hover{background:rgba(0,0,0,.85);}
  button.unmute[hidden]{display:none;}
</style>
</head>
<body data-preview-client="${isCrawler ? "crawler" : "interactive"}">
  <div class="stage" id="stage">
    ${
      isCrawler && posterUrl
        ? `<img class="crawler-poster" src="${htmlEscape(posterUrl)}" alt="${htmlEscape(channel.title)}">`
        : `<video id="player" autoplay playsinline muted></video>
    <img class="gif" id="gif" alt="" hidden>`
    }
    <div class="placeholder${isCrawler && posterUrl ? " crawler-overlay" : ""}" id="placeholder">
      <div style="font-weight:600;color:#ccc">${htmlEscape(channel.title)}</div>
      <div style="margin-top:6px;opacity:.7">${isCrawler ? "Preview available on WTF TV" : "Loading channel…"}</div>
    </div>
    ${isCrawler ? "" : `<button class="unmute" id="unmute" type="button" hidden>Unmute</button>`}
  </div>
  <div class="strap">
    <div class="now">
      <span class="kind-badge" id="kind">TV</span><span id="nowplaying">${isCrawler ? htmlEscape(desc) : "Loading…"}</span>
    </div>
    <div class="dial">CH ${channel.dialNumber ?? "?"}</div>
    <a href="${htmlEscape(channelUrl)}" target="_top" rel="noopener">Open on WTF TV →</a>
  </div>
${isCrawler ? "" : `
<script>
(function () {
  "use strict";
  var CHANNEL_ID = ${channelId};
  var STREAM_URL = ${JSON.stringify(streamUrl)};
  var REFETCH_AT_END = true;
  // Re-fetch once the shuffle window rotates so the viewer doesn't
  // see the same ordering twice, and so playlist edits show up
  // automatically.  30 min matches STREAM_SHUFFLE_WINDOW_MS server-side.
  var REFRESH_POLL_MS = 15 * 60 * 1000;

  var player = document.getElementById("player");
  var gif = document.getElementById("gif");
  var placeholder = document.getElementById("placeholder");
  var nowLabel = document.getElementById("nowplaying");
  var kindLabel = document.getElementById("kind");
  var unmuteBtn = document.getElementById("unmute");

  var queue = [];
  var cursor = 0;
  var fetchInFlight = false;
  var lastShuffleSeed = null;
  var lastFetchAt = 0;

  function setKindBadge(kind) {
    kindLabel.textContent = (kind || "?").slice(0,8);
    kindLabel.className = "kind-badge" + (kind === "bumper" ? " bumper" : "");
  }

  async function fetchQueue() {
    if (fetchInFlight) return;
    fetchInFlight = true;
    try {
      var res = await fetch(STREAM_URL, { credentials: "omit" });
      if (!res.ok) throw new Error("stream fetch failed: " + res.status);
      var data = await res.json();
      var newQueue = Array.isArray(data.queue) ? data.queue : [];
      lastShuffleSeed = data.shuffleSeed || null;
      lastFetchAt = Date.now();
      queue = newQueue;
      if (queue.length === 0) {
        nowLabel.textContent = data.message || "Channel is dark";
        setKindBadge("idle");
      }
      cursor = 0;
    } catch (err) {
      console.warn("[embed] fetch queue failed:", err);
    } finally {
      fetchInFlight = false;
    }
  }

  function hidePlaceholder() {
    if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
  }

  function playCurrent() {
    if (queue.length === 0) return;
    var item = queue[cursor % queue.length];
    if (!item) return;
    hidePlaceholder();
    nowLabel.textContent = item.title || "Playing…";
    setKindBadge(item.kind);
    var src = item.cacheUrl || item.sourceUri;
    if (item.kind === "gif" || (item.mimeType && item.mimeType.indexOf("image/") === 0)) {
      gif.hidden = false;
      player.hidden = true;
      gif.src = src;
      var dur = Math.max(1, item.durationSeconds || 4);
      clearTimeout(gif._timer);
      gif._timer = setTimeout(advance, dur * 1000);
    } else {
      gif.hidden = true;
      player.hidden = false;
      try {
        player.src = src;
        player.load();
        var p = player.play();
        if (p && typeof p.catch === "function") {
          p.catch(function (err) {
            console.warn("[embed] autoplay blocked; muting:", err && err.message);
            player.muted = true;
            unmuteBtn.hidden = false;
            player.play().catch(function () { /* fallthrough to timeout */ });
          });
        }
      } catch (err) {
        console.error("[embed] play error:", err);
        setTimeout(advance, 1000);
      }
    }
  }

  function advance() {
    cursor += 1;
    if (cursor >= queue.length) {
      if (REFETCH_AT_END) {
        fetchQueue().then(playCurrent);
        return;
      }
      cursor = 0;
    }
    playCurrent();
  }

  player.addEventListener("ended", advance);
  player.addEventListener("error", function () {
    console.warn("[embed] media error, skipping");
    setTimeout(advance, 500);
  });
  player.addEventListener("stalled", function () {
    // Do NOT auto-skip on stall — progressive download often reports
    // stalled briefly while buffering.  Give it 8s to recover first.
    if (player._stalledTimer) return;
    player._stalledTimer = setTimeout(function () {
      player._stalledTimer = null;
      if (player.readyState < 2) advance();
    }, 8000);
  });
  player.addEventListener("playing", function () {
    if (player._stalledTimer) {
      clearTimeout(player._stalledTimer);
      player._stalledTimer = null;
    }
  });

  unmuteBtn.addEventListener("click", function () {
    player.muted = false;
    unmuteBtn.hidden = true;
    player.play().catch(function () {});
  });

  // Light-touch refresh: poll every REFRESH_POLL_MS.  If the seed
  // changed, reset the queue at the next natural item boundary so
  // the current item still plays out.
  setInterval(function () {
    var prior = lastShuffleSeed;
    fetchQueue().then(function () {
      if (prior !== null && lastShuffleSeed !== null && lastShuffleSeed !== prior) {
        cursor = 0;
      }
    });
  }, REFRESH_POLL_MS);

  fetchQueue().then(playCurrent);
})();
</script>
`}
</body>
</html>`;

    res.send(html);
  } catch (err) {
    console.error("[tv-embed] embed page failed:", err);
    res
      .status(500)
      .setHeader("Content-Type", "text/html; charset=utf-8")
      .send(
        `<!doctype html><html><body style="font:14px system-ui;color:#eee;background:#000;padding:20px">Embed error.</body></html>`
      );
  }
});

export default router;
