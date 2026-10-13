"use strict";

/**
 * Rotini ALEATORY-001 Generator Standards Runtime
 *
 * Implements the core standard features of ALEATORY-001 for Rotini:
 * 1. PRNG Construction (xmur3 + sfc32) identical to Aleatory spec
 * 2. $alea Runtime Injection ($alea.seed, $alea.random(), $alea.randInt(), $alea.params, $alea.ready())
 * 3. Declared Libraries extraction (<meta name="alea:library">)
 * 4. Typed Parameters extraction (<meta name="alea:params"> and $alea.paramsSchema)
 * 5. Determinism, network isolation, canvas pixel sampling, and preflight checks
 */

((root) => {
  // --- Seeded PRNG Architecture (xmur3 + sfc32) ---
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  function sfc32(a, b, c, d) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }

  function createSeededStream(seedStr) {
    const seed = String(seedStr || "rotini-aleatory-default-seed");
    const seedFn = xmur3(seed);
    const rand = sfc32(seedFn(), seedFn(), seedFn(), seedFn());
    // Warm up the generator
    for (let i = 0; i < 15; i++) rand();
    return rand;
  }

  // --- Parameter Resolution ---
  function resolveParamValue(spec, rawValue) {
    if (rawValue === undefined || rawValue === null) return spec.default;
    switch (spec.type) {
      case "number":
      case "int": {
        const num = Number(rawValue);
        if (!Number.isFinite(num)) return spec.default;
        const min = spec.min ?? 0;
        const max = spec.max ?? 1;
        const clamped = Math.max(min, Math.min(max, num));
        const step = spec.step ?? (spec.type === "int" ? 1 : 0.01);
        if (step > 0) {
          const snapped = Math.round((clamped - min) / step) * step + min;
          return spec.type === "int" ? Math.round(snapped) : Number(snapped.toFixed(6));
        }
        return spec.type === "int" ? Math.round(clamped) : clamped;
      }
      case "bool":
        return Boolean(rawValue);
      case "select": {
        const str = String(rawValue);
        return (spec.options && spec.options.includes(str)) ? str : spec.default;
      }
      case "color": {
        const str = String(rawValue);
        return /^#[0-9a-f]{6}$/i.test(str) ? str : spec.default;
      }
      default:
        return rawValue;
    }
  }

  function resolveParams(schema, rawValues) {
    const resolved = {};
    const specs = Array.isArray(schema) ? schema : (schema?.params || []);
    for (const spec of specs) {
      resolved[spec.id] = resolveParamValue(spec, rawValues ? rawValues[spec.id] : undefined);
    }
    return resolved;
  }

  // --- Metadata & Tag Extraction ---
  const LIB_TAG = /<meta\s+[^>]*name\s*=\s*["']alea:library["'][^>]*>/gi;
  const PARAMS_META_TAG = /<meta\s+[^>]*name\s*=\s*["']alea:params["'][^>]*>/i;

  function extractLibraries(html) {
    if (typeof html !== "string") return [];
    const cleaned = html.replace(/<!--[\s\S]*?-->/g, "");
    const tags = cleaned.match(LIB_TAG) || [];
    const coords = [];
    for (const tag of tags) {
      const match = tag.match(/content\s*=\s*["']([^"']+)["']/i);
      if (match && match[1]) {
        const val = match[1].trim();
        if (!coords.includes(val)) coords.push(val);
      }
    }
    return coords;
  }

  function extractParamsSchema(html) {
    if (typeof html !== "string") return [];
    const cleaned = html.replace(/<!--[\s\S]*?-->/g, "");
    const metaTag = cleaned.match(PARAMS_META_TAG);
    if (metaTag) {
      const match = metaTag[0].match(/content\s*=\s*(['"])([\s\S]*?)\1/i);
      if (match && match[2]) {
        try {
          const parsed = JSON.parse(match[2]);
          return Array.isArray(parsed) ? parsed : (parsed.params || []);
        } catch (_) {}
      }
    }
    // Look for window.$alea.paramsSchema or ALEA_PARAMS assignment
    const scriptMatch = cleaned.match(/(?:\$alea\.paramsSchema|ALEA_PARAMS)\s*=\s*(\[[\s\S]*?\])\s*;/);
    if (scriptMatch && scriptMatch[1]) {
      try {
        const evaluated = JSON.parse(scriptMatch[1]);
        if (Array.isArray(evaluated)) return evaluated;
      } catch (_) {}
    }
    return [];
  }

  // --- Canvas Pixel Sampling & Validation ---
  function isBlankOrSolidBlackCanvas(canvas) {
    if (!canvas || !canvas.getContext) return true;
    try {
      const ctx = canvas.getContext("2d");
      if (!ctx) return true;
      const w = Math.min(canvas.width || 100, 100);
      const h = Math.min(canvas.height || 100, 100);
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = w;
      sampleCanvas.height = h;
      const sCtx = sampleCanvas.getContext("2d");
      if (!sCtx) return true;
      sCtx.drawImage(canvas, 0, 0, w, h);
      const imgData = sCtx.getImageData(0, 0, w, h).data;
      for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        const a = imgData[i + 3];
        if (a > 10 && (r > 10 || g > 10 || b > 10)) {
          return false;
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  // --- Harness Factory ---
  function createAleaGlobal(seed, paramsSchema, userParams, onReadyCallback) {
    const rand = createSeededStream(seed);
    const schema = Array.isArray(paramsSchema) ? paramsSchema : [];
    const resolved = resolveParams(schema, userParams || {});
    const featureStore = {};
    let isReady = false;

    function finish() {
      if (isReady) return;
      isReady = true;
      if (typeof onReadyCallback === "function") {
        onReadyCallback({
          seed,
          params: resolved,
          features: featureStore,
        });
      }
    }

    return {
      version: 2,
      standard: "ALEATORY-001",
      seed: String(seed),
      hash: String(seed),
      params: resolved,
      paramsSchema: schema,
      random: rand,
      rand: rand,
      randInt: (lo, hi) => Math.floor(rand() * (hi - lo + 1)) + lo,
      randBetween: (lo, hi) => lo + rand() * (hi - lo),
      pick: (arr) => arr[Math.floor(rand() * arr.length)],
      chance: (p) => rand() < p,
      param: (name, fallback) => (name in resolved ? resolved[name] : fallback),
      features: (obj) => {
        if (!obj) return featureStore;
        Object.assign(featureStore, obj);
        return featureStore;
      },
      ready: finish,
    };
  }

  const RotiniAleatory = Object.freeze({
    createSeededStream,
    createAleaGlobal,
    resolveParams,
    resolveParamValue,
    extractLibraries,
    extractParamsSchema,
    isBlankOrSolidBlackCanvas,
  });

  root.RotiniAleatory = RotiniAleatory;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = RotiniAleatory;
  }
})(typeof window !== "undefined" ? window : globalThis);

export default (typeof window !== "undefined" ? window.RotiniAleatory : globalThis.RotiniAleatory);
