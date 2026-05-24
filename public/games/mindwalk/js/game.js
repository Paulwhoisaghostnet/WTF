/**
 * MindWalk — AI-guided word-cloud exploration game
 * Creator: skllzrmy
 *
 * Architecture:
 *   - Pure browser ES6; no build step required.
 *   - AI calls are client-side only; keys live in localStorage per user.
 *   - Word cloud rendered on <canvas> via custom force-directed layout.
 *   - Three.js integration point marked below (swap renderer when ready).
 */

const MindWalk = (() => {
  "use strict";

  // ─── State ───────────────────────────────────────────────────────────────
  const state = {
    running: false,
    words: [],          // { text, weight, x, y, vx, vy, color, angle }
    seed: "",           // current topic seed
    history: [],        // explored seeds
    sessionStart: null,
    aiProvider: null,   // "gemini" | "openai" | "claude"
    apiKey: null,
    pending: false,
  };

  // ─── Canvas / renderer ───────────────────────────────────────────────────
  let canvas, ctx, W, H, animFrame;

  const PALETTE = [
    "#00ff88", "#00ccff", "#ff44aa", "#ffcc00",
    "#aa44ff", "#ff8844", "#44ffaa", "#ff4466",
  ];

  function resize() {
    const container = canvas.parentElement;
    W = canvas.width  = container.clientWidth  || 800;
    H = canvas.height = container.clientHeight || 500;
  }

  // ─── Word cloud physics ──────────────────────────────────────────────────
  function spawnWord(text, weight = 1) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.min(W, H) * 0.15 + Math.random() * Math.min(W, H) * 0.2;
    state.words.push({
      text,
      weight,
      x: W / 2 + Math.cos(angle) * r,
      y: H / 2 + Math.sin(angle) * r,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      alpha: 0,
      targetAlpha: 1,
      fontSize: Math.max(12, Math.min(48, 12 + weight * 9)),
      selected: false,
    });
  }

  function stepPhysics() {
    const cx = W / 2, cy = H / 2;
    const maxWords = 40;
    if (state.words.length > maxWords) state.words.splice(0, state.words.length - maxWords);

    for (const w of state.words) {
      // Gentle gravity toward center
      w.vx += (cx - w.x) * 0.0003;
      w.vy += (cy - w.y) * 0.0003;

      // Repulsion between words
      for (const other of state.words) {
        if (other === w) continue;
        const dx = w.x - other.x, dy = w.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = (w.fontSize + other.fontSize) * 1.2;
        if (dist < minDist) {
          const force = (minDist - dist) / minDist * 0.08;
          w.vx += (dx / dist) * force;
          w.vy += (dy / dist) * force;
        }
      }

      w.vx *= 0.92;
      w.vy *= 0.92;
      w.x += w.vx;
      w.y += w.vy;

      // Fade in
      if (w.alpha < w.targetAlpha) w.alpha = Math.min(w.targetAlpha, w.alpha + 0.03);

      // Boundary bounce
      const pad = w.fontSize;
      if (w.x < pad) { w.x = pad; w.vx = Math.abs(w.vx); }
      if (w.x > W - pad) { w.x = W - pad; w.vx = -Math.abs(w.vx); }
      if (w.y < pad) { w.y = pad; w.vy = Math.abs(w.vy); }
      if (w.y > H - pad) { w.y = H - pad; w.vy = -Math.abs(w.vy); }
    }
  }

  function drawFrame() {
    // Dark translucent wipe for trail effect
    ctx.fillStyle = "rgba(8, 8, 20, 0.18)";
    ctx.fillRect(0, 0, W, H);

    stepPhysics();

    // Draw central seed
    if (state.seed) {
      ctx.save();
      ctx.font = "bold 22px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.shadowColor = "#00ccff";
      ctx.shadowBlur = 14;
      ctx.fillText(`[ ${state.seed} ]`, W / 2, H / 2);
      ctx.restore();
    }

    // Draw words
    for (const w of state.words) {
      ctx.save();
      ctx.globalAlpha = w.alpha;
      ctx.font = `${w.selected ? "bold" : "normal"} ${w.fontSize}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = w.color;
      ctx.shadowColor = w.color;
      ctx.shadowBlur = w.selected ? 18 : 6;
      ctx.fillText(w.text, w.x, w.y);
      ctx.restore();
    }

    // Idle hint
    if (!state.running && !state.pending && state.words.length === 0) {
      ctx.save();
      ctx.font = "14px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(150,150,180,0.6)";
      ctx.fillText("Enter a topic above to begin your MindWalk", W / 2, H / 2 + 40);
      ctx.restore();
    }
  }

  function loop() {
    drawFrame();
    animFrame = requestAnimationFrame(loop);
  }

  // ─── AI Integration ───────────────────────────────────────────────────────
  async function fetchWordExpansion(seed) {
    const provider = state.aiProvider;
    const apiKey  = state.apiKey;
    if (!provider || !apiKey) {
      fallbackExpansion(seed);
      return;
    }
    state.pending = true;
    const prompt = `You are a word association engine. Given the concept "${seed}", return exactly 8 loosely related concepts (single words or short 2-word phrases), one per line, with a weight 1–5 on the same line after a tab. No explanations.`;
    try {
      let text = "";
      if (provider === "gemini") {
        text = await callGemini(apiKey, prompt);
      } else if (provider === "openai") {
        text = await callOpenAI(apiKey, prompt);
      } else if (provider === "claude") {
        text = await callClaude(apiKey, prompt);
      }
      parseAndSpawn(text);
    } catch (e) {
      console.warn("[MindWalk] AI call failed:", e.message);
      fallbackExpansion(seed);
    } finally {
      state.pending = false;
    }
  }

  async function callGemini(key, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  async function callOpenAI(key, prompt) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  }

  async function callClaude(key, prompt) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-20240307",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Claude ${res.status}`);
    const data = await res.json();
    return data?.content?.[0]?.text ?? "";
  }

  function parseAndSpawn(raw) {
    const lines = raw.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      const [word, weightStr] = line.split("\t");
      const text = (word || "").trim().replace(/^[-*•]\s*/, "");
      const weight = Math.min(5, Math.max(1, parseInt(weightStr) || 2));
      if (text.length > 0 && text.length < 40) spawnWord(text, weight);
    }
  }

  const FALLBACK_MAP = {
    _default: ["concept", "idea", "pattern", "structure", "system", "network", "flow", "signal"],
    music: ["rhythm", "melody", "harmony", "tempo", "chord", "beat", "scale", "tone"],
    art: ["color", "form", "texture", "space", "line", "composition", "light", "shadow"],
    code: ["function", "loop", "state", "event", "module", "data", "async", "type"],
  };

  function fallbackExpansion(seed) {
    const key = Object.keys(FALLBACK_MAP).find(k => seed.toLowerCase().includes(k)) || "_default";
    const words = FALLBACK_MAP[key];
    words.forEach((w, i) => spawnWord(w, Math.max(1, 5 - i)));
  }

  // ─── Game loop control ────────────────────────────────────────────────────
  function startWalk(seed) {
    if (!seed.trim()) return;
    state.seed = seed.trim();
    state.history.push(state.seed);
    if (!state.running) {
      state.running = true;
      state.sessionStart = Date.now();
    }
    fetchWordExpansion(state.seed);
  }

  function selectWord(word) {
    if (state.pending) return;
    state.words.forEach(w => (w.selected = false));
    const found = state.words.find(w => w.text === word);
    if (found) found.selected = true;
    startWalk(word);
  }

  function clearWalk() {
    state.words = [];
    state.seed = "";
    state.history = [];
    state.running = false;
    state.pending = false;
    ctx.fillStyle = "#080814";
    ctx.fillRect(0, 0, W, H);
  }

  // ─── Canvas click to select ────────────────────────────────────────────────
  function handleCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top)  * (H / rect.height);

    for (const w of [...state.words].reverse()) {
      ctx.font = `${w.fontSize}px monospace`;
      const tw = ctx.measureText(w.text).width;
      if (mx > w.x - tw / 2 && mx < w.x + tw / 2 &&
          my > w.y - w.fontSize / 2 && my < w.y + w.fontSize / 2) {
        selectWord(w.text);
        return;
      }
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────
  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("click", handleCanvasClick);
    ctx.fillStyle = "#080814";
    ctx.fillRect(0, 0, W, H);
    loop();
  }

  function destroy() {
    if (animFrame) cancelAnimationFrame(animFrame);
    window.removeEventListener("resize", resize);
  }

  function setProvider(provider, key) {
    state.aiProvider = provider;
    state.apiKey = key;
  }

  return { init, destroy, startWalk, clearWalk, setProvider, getState: () => ({ ...state }) };
})();

// Attach to window for index.html inline usage
window.MindWalk = MindWalk;
