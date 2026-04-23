/*
 * WTF Games hi-score client (no-deps, vendored into each game).
 *
 * Flow:
 *   1. On game load, request a play ticket from the parent window via
 *      postMessage `{ type: "wtf:ticket:request", gameSlug }`.
 *   2. Parent answers `{ type: "wtf:ticket:issued", runId, expiresAt }`.
 *   3. On game-over, call WtfHiScore.submit(score) to send
 *      `{ type: "wtf:score", gameSlug, score, runId, payload }`.
 *   4. Parent POSTs to /api/console/scores using the session cookie.
 *
 * The iframe never talks to the server directly in parent-postmessage
 * mode. That means this file is safe to ship bit-for-bit to any origin —
 * it only talks to `window.parent` and any reply is checked against the
 * expected WTF origin list in the Console page.
 */
(function () {
  "use strict";

  var gameSlug = null;
  var runId = null;
  var runExpiresAt = null;
  var onReadyCallbacks = [];
  var onErrorCallbacks = [];
  var payloadBuilder = null;

  function postToParent(msg) {
    try {
      window.parent.postMessage(msg, "*");
    } catch (err) {
      console.warn("[wtf-hiscore] postMessage failed", err);
    }
  }

  function handleMessage(event) {
    var data = event && event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "wtf:ticket:issued") {
      runId = String(data.runId || "");
      runExpiresAt = Number(data.expiresAt || 0);
      onReadyCallbacks.splice(0).forEach(function (cb) {
        try {
          cb({ runId: runId, expiresAt: runExpiresAt });
        } catch (err) {
          console.warn("[wtf-hiscore] onReady handler threw", err);
        }
      });
    } else if (data.type === "wtf:ticket:error") {
      var reason = String(data.reason || "unknown");
      onErrorCallbacks.splice(0).forEach(function (cb) {
        try {
          cb({ reason: reason });
        } catch (err) {
          console.warn("[wtf-hiscore] onError handler threw", err);
        }
      });
    }
  }

  window.addEventListener("message", handleMessage, false);

  var WtfHiScore = {
    init: function (slug) {
      gameSlug = String(slug || "");
      if (!gameSlug) {
        throw new Error("WtfHiScore.init: missing game slug");
      }
      postToParent({ type: "wtf:ticket:request", gameSlug: gameSlug });
    },
    onReady: function (cb) {
      if (runId) {
        try {
          cb({ runId: runId, expiresAt: runExpiresAt });
        } catch (err) {
          console.warn("[wtf-hiscore] onReady handler threw", err);
        }
        return;
      }
      onReadyCallbacks.push(cb);
    },
    onError: function (cb) {
      onErrorCallbacks.push(cb);
    },
    setPayloadBuilder: function (fn) {
      payloadBuilder = typeof fn === "function" ? fn : null;
    },
    submit: function (score) {
      if (!gameSlug) {
        throw new Error("WtfHiScore.submit: init() not called");
      }
      var s = Math.max(0, Math.floor(Number(score) || 0));
      var payload = null;
      if (payloadBuilder) {
        try {
          payload = payloadBuilder();
        } catch (err) {
          console.warn("[wtf-hiscore] payloadBuilder threw", err);
        }
      }
      postToParent({
        type: "wtf:score",
        gameSlug: gameSlug,
        score: s,
        runId: runId,
        payload: payload || {},
      });
      // After submit, the run is spent. Request a fresh ticket so the
      // player can chain another attempt without reloading.
      runId = null;
      runExpiresAt = null;
      postToParent({ type: "wtf:ticket:request", gameSlug: gameSlug });
    },
    requestReplay: function () {
      runId = null;
      runExpiresAt = null;
      postToParent({ type: "wtf:ticket:request", gameSlug: gameSlug });
    },
    status: function () {
      return { runId: runId, expiresAt: runExpiresAt, gameSlug: gameSlug };
    },
  };

  window.WtfHiScore = WtfHiScore;
})();
