import test from "node:test";
import assert from "node:assert/strict";
import RotiniAleatory from "../../public/creation-tools/rotini/js/aleatory/rotini-aleatory.js";

test("ALEATORY-001 PRNG produces deterministic output from same seed", () => {
  const seed = "op123456789abcdef";
  const prng1 = RotiniAleatory.createSeededStream(seed);
  const prng2 = RotiniAleatory.createSeededStream(seed);

  const seq1 = Array.from({ length: 10 }, () => prng1());
  const seq2 = Array.from({ length: 10 }, () => prng2());

  assert.deepEqual(seq1, seq2);
  assert.equal(seq1.length, 10);
  assert.ok(seq1.every((v) => typeof v === "number" && v >= 0 && v < 1));
});

test("Different seeds produce distinct pseudo-random sequences", () => {
  const prngA = RotiniAleatory.createSeededStream("seed-alpha");
  const prngB = RotiniAleatory.createSeededStream("seed-beta");

  assert.notEqual(prngA(), prngB());
});

test("Parameter resolution satisfies ALEATORY-001 type quantization", () => {
  const schema = [
    { id: "density", label: "Density", type: "number", min: 0, max: 10, step: 0.5, default: 2 },
    { id: "grid", label: "Grid Count", type: "int", min: 1, max: 20, default: 5 },
    { id: "invert", label: "Invert Colors", type: "bool", default: false },
    { id: "palette", label: "Palette", type: "select", options: ["dark", "light", "neon"], default: "dark" },
    { id: "bg", label: "Background", type: "color", default: "#111111" },
  ];

  const rawValues = {
    density: 7.34, // Should snap to 7.5
    grid: 12.8,    // Should clamp/round to 13 int
    invert: 1,     // Should resolve to true
    palette: "neon",
    bg: "#ff00aa",
  };

  const resolved = RotiniAleatory.resolveParams(schema, rawValues);

  assert.equal(resolved.density, 7.5);
  assert.equal(resolved.grid, 13);
  assert.equal(resolved.invert, true);
  assert.equal(resolved.palette, "neon");
  assert.equal(resolved.bg, "#ff00aa");
});

test("Fallback to default when input parameter is invalid or missing", () => {
  const schema = [
    { id: "speed", label: "Speed", type: "number", min: 1, max: 5, default: 2.5 },
    { id: "mode", label: "Mode", type: "select", options: ["a", "b"], default: "a" },
  ];

  const resolved = RotiniAleatory.resolveParams(schema, { speed: "invalid", mode: "non-existent" });
  assert.equal(resolved.speed, 2.5);
  assert.equal(resolved.mode, "a");
});

test("Extracts declared libraries (<meta name=\"alea:library\">) in order without duplicates", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <!-- <meta name="alea:library" content="ignored@1.0.0"> -->
        <meta name="alea:library" content="p5@1.5.0">
        <meta name="alea:library" content="three@0.160.1">
        <meta name="alea:library" content="p5@1.5.0">
      </head>
      <body></body>
    </html>
  `;

  const libs = RotiniAleatory.extractLibraries(html);
  assert.deepEqual(libs, ["p5@1.5.0", "three@0.160.1"]);
});

test("Extracts typed parameter schema from html meta tag", () => {
  const schemaJSON = JSON.stringify([
    { id: "size", label: "Size", type: "number", min: 10, max: 100, default: 50 },
  ]);
  const html = `<html><head><meta name="alea:params" content='${schemaJSON}'></head></html>`;

  const extracted = RotiniAleatory.extractParamsSchema(html);
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].id, "size");
  assert.equal(extracted[0].default, 50);
});

test("createAleaGlobal exposes full ALEATORY-001 surface and ready callback", () => {
  let finished = false;
  let readyEvent = null;

  const alea = RotiniAleatory.createAleaGlobal(
    "opHash123",
    [{ id: "layers", label: "Layers", type: "int", min: 1, max: 5, default: 3 }],
    { layers: 4 },
    (event) => {
      finished = true;
      readyEvent = event;
    }
  );

  assert.equal(alea.seed, "opHash123");
  assert.equal(alea.param("layers"), 4);
  assert.equal(alea.param("unknown", "fallback"), "fallback");

  const r1 = alea.rand();
  const r2 = alea.rand();
  assert.notEqual(r1, r2);

  const integer = alea.randInt(1, 10);
  assert.ok(integer >= 1 && integer <= 10);

  alea.features({ complexity: "high" });
  assert.equal(alea.features().complexity, "high");

  assert.equal(finished, false);
  alea.ready();
  assert.equal(finished, true);
  assert.equal(readyEvent.seed, "opHash123");
  assert.equal(readyEvent.params.layers, 4);
});
