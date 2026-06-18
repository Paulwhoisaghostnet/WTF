/**
 * Pasta Protocol — deterministic generative trait engine (Rotini).
 *
 * Pure, dependency-free, and fully deterministic: the same seed + layers always produce the same
 * editions, so the studio preview, the published metadata, and any later regeneration agree. Canvas
 * compositing of the actual artwork happens in the browser studio; only the trait selection / rarity /
 * uniqueness logic lives here and is mirrored byte-for-byte in the browser port and parity-tested.
 */

export type TraitVariant = {
  value: string; // trait label, e.g. "Red"
  weight?: number; // relative rarity weight (default 1); non-positive treated as 1
};

export type GenerativeLayer = {
  name: string; // trait category, e.g. "Background"
  variants: TraitVariant[];
};

export type GeneratedTrait = { layer: string; value: string };

export type GeneratedEdition = {
  index: number;
  dna: string;
  traits: GeneratedTrait[];
};

export type GenerateOptions = {
  unique?: boolean; // avoid duplicate trait combinations
  maxAttempts?: number; // re-roll budget per edition when unique (default 50)
};

// FNV-1a string hash -> 32-bit seed. Identical integer ops in TS and JS for cross-port parity.
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 PRNG -> deterministic float in [0, 1).
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightOf(variant: TraitVariant): number {
  return typeof variant.weight === "number" && variant.weight > 0 ? variant.weight : 1;
}

/** Picks a variant index from `variants` using weighted rarity and a [0,1) random value. */
export function pickVariantIndex(variants: TraitVariant[], r: number): number {
  const total = variants.reduce((sum, v) => sum + weightOf(v), 0);
  let threshold = r * total;
  for (let i = 0; i < variants.length; i++) {
    threshold -= weightOf(variants[i]);
    if (threshold < 0) return i;
  }
  return variants.length - 1;
}

/** Canonical DNA string for a trait combination. */
export function dnaOf(traits: GeneratedTrait[]): string {
  return traits.map((t) => `${t.layer}:${t.value}`).join("|");
}

/** Trait combinations available = product of per-layer variant counts (layers with variants only). */
export function maxCombinations(layers: GenerativeLayer[]): number {
  const usable = layers.filter((l) => l.variants && l.variants.length > 0);
  if (usable.length === 0) return 0;
  return usable.reduce((acc, l) => acc * l.variants.length, 1);
}

/** TZIP-21-style attributes from a trait combination. */
export function traitAttributes(traits: GeneratedTrait[]): Array<{ name: string; value: string }> {
  return traits.map((t) => ({ name: t.layer, value: t.value }));
}

/**
 * Deterministically generate `count` editions from `layers` seeded by `seed`. When `unique` is set,
 * duplicate trait combinations are re-rolled (bounded by `maxAttempts`) and the result is capped at the
 * number of available combinations.
 */
export function generateEditions(
  layers: GenerativeLayer[],
  count: number,
  seed: string | number,
  options: GenerateOptions = {}
): GeneratedEdition[] {
  const usable = (Array.isArray(layers) ? layers : []).filter(
    (l) => l && l.name && Array.isArray(l.variants) && l.variants.length > 0
  );
  const wanted = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  if (usable.length === 0 || wanted === 0) return [];

  const rng = mulberry32(hashSeed(String(seed)));
  const unique = options.unique === true;
  const maxAttempts = options.maxAttempts && options.maxAttempts > 0 ? Math.floor(options.maxAttempts) : 50;
  const target = unique ? Math.min(wanted, maxCombinations(usable)) : wanted;

  const editions: GeneratedEdition[] = [];
  const seen = new Set<string>();
  let index = 0;

  while (editions.length < target) {
    let traits: GeneratedTrait[] = [];
    let dna = "";
    let accepted = false;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      traits = usable.map((layer) => ({
        layer: layer.name,
        value: layer.variants[pickVariantIndex(layer.variants, rng())].value,
      }));
      dna = dnaOf(traits);
      if (!unique || !seen.has(dna)) {
        accepted = true;
        break;
      }
    }
    if (!accepted) break; // exhausted the re-roll budget without a fresh combination
    seen.add(dna);
    editions.push({ index: index++, dna, traits });
  }
  return editions;
}
