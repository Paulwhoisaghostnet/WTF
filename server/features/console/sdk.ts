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
  window.Hackcade = window.Hackcade || {
    ready: sdk.ready,
    getPlayer: sdk.getPlayer,
    updateScore: sdk.updateScore,
    gameOver: sdk.gameOver,
    on: sdk.on,
  };
})();`;
