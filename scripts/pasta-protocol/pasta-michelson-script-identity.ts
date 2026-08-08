import assert from "node:assert/strict";
import { createHash } from "node:crypto";

type CanonicalJson = null | boolean | number | string | CanonicalJson[] | { [key: string]: CanonicalJson };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalTimestampSeconds(value: unknown): string | null {
  if (!isPlainRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 1) return null;
  if (keys[0] === "int" && typeof value.int === "string" && /^-?(?:0|[1-9][0-9]*)$/.test(value.int)) {
    return BigInt(value.int).toString();
  }
  if (keys[0] !== "string" || typeof value.string !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.string)) {
    return null;
  }
  const milliseconds = Date.parse(value.string);
  if (!Number.isFinite(milliseconds) || milliseconds % 1_000 !== 0) return null;
  return BigInt(milliseconds / 1_000).toString();
}

/**
 * Normalize only data literals whose enclosing Michelson instruction proves
 * their type is timestamp. The protocol may serialize `PUSH timestamp` values
 * as integer epoch seconds even when the compiler artifact used RFC3339. No
 * other string/integer pair is eligible for this semantic equivalence.
 */
function normalizeProtocolTimestampLiterals(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeProtocolTimestampLiterals);
  if (!isPlainRecord(value)) return value;
  const output = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeProtocolTimestampLiterals(entry)]),
  );
  if (
    output.prim === "PUSH" &&
    Array.isArray(value.args) &&
    value.args.length === 2 &&
    isPlainRecord(value.args[0]) &&
    value.args[0].prim === "timestamp"
  ) {
    const seconds = canonicalTimestampSeconds(value.args[1]);
    if (seconds !== null) {
      output.args = [normalizeProtocolTimestampLiterals(value.args[0]), { int: seconds }];
    }
  }
  return output;
}

function canonicalJson(value: unknown, path: string): CanonicalJson {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => canonicalJson(entry, `${path}[${index}]`));
  assert.ok(value && typeof value === "object", `${path} contains an unsupported value`);
  const prototype = Object.getPrototypeOf(value);
  assert.ok(prototype === Object.prototype || prototype === null, `${path} must contain only plain objects`);
  assert.equal(Object.getOwnPropertySymbols(value).length, 0, `${path} must not contain symbol keys`);
  const output: { [key: string]: CanonicalJson } = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(descriptor && "value" in descriptor, `${path}.${key} must not be an accessor`);
    output[key] = canonicalJson(descriptor.value, `${path}.${key}`);
  }
  return output;
}

function scriptSectionKey(section: unknown, index: number): string {
  assert.ok(section && typeof section === "object" && !Array.isArray(section), `Michelson script section ${index} must be an object`);
  const record = section as Record<string, unknown>;
  assert.equal(typeof record.prim, "string", `Michelson script section ${index} is missing prim`);
  if (record.prim !== "view") {
    assert.ok(
      record.prim === "parameter" || record.prim === "storage" || record.prim === "code",
      `unsupported Michelson script section ${String(record.prim)}`,
    );
    return String(record.prim);
  }
  assert.ok(Array.isArray(record.args), `Michelson view section ${index} is missing args`);
  const name = record.args[0];
  assert.ok(name && typeof name === "object" && !Array.isArray(name), `Michelson view section ${index} is missing its name`);
  assert.equal(typeof (name as Record<string, unknown>).string, "string", `Michelson view section ${index} has an invalid name`);
  const viewName = String((name as Record<string, unknown>).string);
  assert.ok(viewName.length > 0, `Michelson view section ${index} has an empty name`);
  return `view:${viewName}`;
}

/**
 * Canonicalize a complete Michelson contract script for identity comparison.
 *
 * Taquito's origination preparation and RPC serialization may expose valid
 * top-level script sections in a different order than the compiler artifact
 * (notably moving `view` declarations before the three core declarations).
 * Section order is not executable code identity, while every nested Micheline
 * array remains order-sensitive. Object key ordering is likewise JSON
 * serialization detail and is normalized recursively.
 */
export function canonicalMichelsonScriptCode(code: unknown): CanonicalJson[] {
  assert.ok(Array.isArray(code) && code.length >= 3, "Michelson script code must be a non-empty section array");
  const sections = code.map((section, index) => ({
    key: scriptSectionKey(section, index),
    value: canonicalJson(section, `Michelson script section ${index}`),
  }));
  const keys = sections.map(({ key }) => key);
  for (const required of ["parameter", "storage", "code"] as const) {
    assert.equal(keys.filter((key) => key === required).length, 1, `Michelson script must contain exactly one ${required} section`);
  }
  assert.equal(new Set(keys).size, keys.length, "Michelson script sections and view names must be unique");
  return sections
    .sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
    .map(({ value }) => value);
}

export function hashMichelsonScriptCode(code: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalMichelsonScriptCode(code))).digest("hex");
}

export function assertMichelsonScriptCodeIdentity(actual: unknown, expected: unknown, message: string): string {
  assert.deepEqual(canonicalMichelsonScriptCode(actual), canonicalMichelsonScriptCode(expected), message);
  return hashMichelsonScriptCode(actual);
}

export function canonicalMichelsonSemanticScriptCode(code: unknown): CanonicalJson[] {
  return canonicalMichelsonScriptCode(normalizeProtocolTimestampLiterals(code));
}

export function hashMichelsonSemanticScriptCode(code: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalMichelsonSemanticScriptCode(code))).digest("hex");
}

export function assertMichelsonSemanticScriptCodeIdentity(
  actual: unknown,
  expected: unknown,
  message: string,
): string {
  assert.deepEqual(
    canonicalMichelsonSemanticScriptCode(actual),
    canonicalMichelsonSemanticScriptCode(expected),
    message,
  );
  return hashMichelsonSemanticScriptCode(actual);
}
