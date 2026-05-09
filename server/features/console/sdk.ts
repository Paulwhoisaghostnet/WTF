export const WTF_CONSOLE_SDK = String.raw`(() => {
  const VERSION = "wtf-console-v1";
  const listeners = new Map();
  const state = {
    slug: "",
    player: null,
    session: null,
    ready: false,
  };
  const pendingParentRequests = new Map();
  let parentRequestSeq = 0;

  function currentScript() {
    return document.currentScript || [...document.scripts].find((script) =>
      String(script.src || "").includes("/api/console/sdk.js")
    );
  }

  function inferSlug(options = {}) {
    if (options.slug) return String(options.slug);
    const script = currentScript();
    if (script && script.dataset && script.dataset.game) return script.dataset.game;
    const params = new URLSearchParams(location.search);
    return params.get("game") || params.get("slug") || "";
  }

  function emit(type, payload) {
    const list = listeners.get(type) || [];
    for (const fn of list) {
      try {
        fn(payload);
      } catch (err) {
        console.warn("[wtf-console-sdk] listener failed", err);
      }
    }
  }

  async function postJson(path, body) {
    const bridgeResult = await requestParent("postJson", { path, body }).catch(() => null);
    if (bridgeResult) return bridgeResult;
    const response = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "WTF Console request failed");
    }
    return data;
  }

  function requestParent(action, payload = {}) {
    if (!window.parent || window.parent === window) return Promise.reject(new Error("No parent bridge"));
    const id = "wtf-sdk-" + (++parentRequestSeq) + "-" + Math.random().toString(36).slice(2);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingParentRequests.delete(id);
        reject(new Error("Parent bridge timeout"));
      }, 8000);
      pendingParentRequests.set(id, { resolve, reject, timeout });
      try {
        window.parent.postMessage({
          type: "wtf-console:request",
          source: "wtf-console-sdk",
          id,
          action,
          payload,
        }, "*");
      } catch (err) {
        clearTimeout(timeout);
        pendingParentRequests.delete(id);
        reject(err);
      }
    });
  }

  function notifyParent(type, payload = {}) {
    try {
      window.parent && window.parent.postMessage({ type, source: "wtf-console-sdk", ...payload }, "*");
    } catch {
      /* parent bridge is optional */
    }
  }

  function playerAvatarUrl(player) {
    return player && (player.avatarUrl || player.pfpImageUrl || player.imageUrl || "");
  }

  function avatarSize(value) {
    const size = Math.floor(Number(value || 128));
    return Math.max(32, Math.min(512, size || 128));
  }

  function loadAvatarImage(url) {
    return new Promise((resolve, reject) => {
      if (!url) return reject(new Error("Player avatar is not set"));
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Player avatar could not be loaded"));
      image.src = url;
    });
  }

  function drawAvatarFrame(ctx, image, x, y, size, options = {}) {
    const fit = options.fit === "contain" ? "contain" : "cover";
    ctx.save();
    ctx.clearRect(x, y, size, size);
    const iw = image.naturalWidth || image.width || size;
    const ih = image.naturalHeight || image.height || size;
    const scale = fit === "contain" ? Math.min(size / iw, size / ih) : Math.max(size / iw, size / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = x + (size - dw) / 2;
    const dy = y + (size - dh) / 2;
    ctx.imageSmoothingEnabled = options.pixelated ? false : true;
    ctx.drawImage(image, dx, dy, dw, dh);
    ctx.restore();
  }

  async function buildAvatarAsset(player, options = {}) {
    const sourceUrl = playerAvatarUrl(player);
    const size = avatarSize(options.size);
    const standard = "wtf-avatar-square-v1";
    if (!sourceUrl) {
      return { ok: false, url: "", sourceUrl: "", width: size, height: size, format: "image/png", standard, reason: "avatar_not_set", player };
    }
    try {
      const image = await loadAvatarImage(sourceUrl);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      drawAvatarFrame(ctx, image, 0, 0, size, options);
      return {
        ok: true,
        url: canvas.toDataURL("image/png"),
        sourceUrl,
        width: size,
        height: size,
        format: "image/png",
        standard,
        player,
      };
    } catch (err) {
      return {
        ok: true,
        url: sourceUrl,
        sourceUrl,
        width: size,
        height: size,
        format: "source",
        standard,
        externalFallback: true,
        error: err && err.message ? err.message : "avatar_normalization_failed",
        player,
      };
    }
  }

  async function buildAvatarSpriteSheet(player, options = {}) {
    const size = avatarSize(options.size);
    const base = await buildAvatarAsset(player, { ...options, size });
    if (!base.url) return { ...base, standard: "wtf-avatar-spritesheet-v1", frameWidth: size, frameHeight: size, frames: [] };
    try {
      const image = await loadAvatarImage(base.url);
      const canvas = document.createElement("canvas");
      canvas.width = size * 4;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      drawAvatarFrame(ctx, image, 0, 0, size, { ...options, fit: "contain" });
      ctx.save();
      ctx.translate(size * 1.5, size / 2);
      ctx.rotate(-0.08);
      drawAvatarFrame(ctx, image, -size / 2, -size / 2, size, { ...options, fit: "contain" });
      ctx.restore();
      ctx.save();
      ctx.translate(size * 2.5, size / 2);
      ctx.rotate(0.08);
      drawAvatarFrame(ctx, image, -size / 2, -size / 2, size, { ...options, fit: "contain" });
      ctx.restore();
      ctx.save();
      ctx.translate(size * 3, -size * 0.05);
      drawAvatarFrame(ctx, image, 0, 0, size, { ...options, fit: "contain" });
      ctx.restore();
      return {
        ...base,
        url: canvas.toDataURL("image/png"),
        format: "image/png",
        standard: "wtf-avatar-spritesheet-v1",
        frameWidth: size,
        frameHeight: size,
        frames: [
          { name: "idle", x: 0, y: 0, w: size, h: size },
          { name: "stepLeft", x: size, y: 0, w: size, h: size },
          { name: "stepRight", x: size * 2, y: 0, w: size, h: size },
          { name: "hop", x: size * 3, y: 0, w: size, h: size },
        ],
      };
    } catch (err) {
      return {
        ...base,
        standard: "wtf-avatar-spritesheet-v1",
        frameWidth: size,
        frameHeight: size,
        frames: [{ name: "idle", x: 0, y: 0, w: size, h: size }],
        error: err && err.message ? err.message : base.error,
      };
    }
  }

  const sdk = {
    version: VERSION,
    ready(options = {}) {
      state.slug = inferSlug(options);
      state.ready = true;
      notifyParent("wtf-console:ready", { slug: state.slug, version: VERSION });
      return Promise.resolve({ ok: true, slug: state.slug, version: VERSION });
    },
    async getPlayer() {
      if (state.session && state.session.player) return state.session.player;
      if (!state.slug) await sdk.ready();
      const session = await sdk.startSession();
      return session.player || null;
    },
    async getAvatarAsset(options = {}) {
      const player = await sdk.getPlayer();
      return buildAvatarAsset(player, options);
    },
    async getAvatarSpriteSheet(options = {}) {
      const player = await sdk.getPlayer();
      return buildAvatarSpriteSheet(player, options);
    },
    async startSession(options = {}) {
      const slug = inferSlug(options) || state.slug;
      if (!slug) throw new Error("Missing game slug. Pass WTFConsole.ready({ slug }).");
      state.slug = slug;
      const session = await postJson("/api/console/session", { slug });
      state.session = session;
      state.player = session.player || null;
      notifyParent("wtf-console:session", { slug, session });
      emit("start", session);
      return session;
    },
    async updateScore(score, payload = {}) {
      if (!state.slug) await sdk.ready();
      if (!state.session) await sdk.startSession({ slug: state.slug });
      const result = await postJson("/api/console/scores", {
        slug: state.slug,
        runId: state.session.runId || state.session.sessionId,
        ticket: state.session.ticket,
        score,
        payload,
      });
      notifyParent("wtf-console:score", { slug: state.slug, result });
      emit("score", result);
      return result;
    },
    async gameOver(score, payload = {}) {
      const result = await sdk.updateScore(score, { ...payload, gameOver: true });
      notifyParent("wtf-console:game-over", { slug: state.slug, result });
      emit("gameOver", result);
      state.session = null;
      return result;
    },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
      return () => {
        const list = listeners.get(type) || [];
        listeners.set(type, list.filter((entry) => entry !== fn));
      };
    },
    get state() {
      return { ...state };
    },
  };

  window.addEventListener("message", (event) => {
    const msg = event.data || {};
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "wtf-console:response" && msg.id) {
      const pending = pendingParentRequests.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      pendingParentRequests.delete(msg.id);
      if (msg.ok) pending.resolve(msg.data);
      else pending.reject(new Error(msg.error || "Parent bridge request failed"));
      return;
    }
    if (!msg.type.startsWith("wtf-console:")) return;
    emit(msg.type.replace("wtf-console:", ""), msg);
  });

  window.WTFConsole = sdk;
})();`;
