/**
 * BigInt-safe conversions for `nat` contract parameters.
 *
 * Previously the client used `Number(value)` which silently corrupts
 * integers > 2^53.  Because WTF amounts can grow beyond that (and
 * contract storage big-map keys certainly can once counters climb),
 * every nat-valued parameter is now passed to Taquito as a decimal
 * string.  Taquito then feeds the string directly to BigNumber inside
 * its parameter schema, preserving arbitrary precision.
 */

export type NatInput = string | number | bigint;

function assertSafeInputShape(value: NatInput): void {
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error(`Invalid nat value: ${value.toString()}`);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      throw new Error(`Invalid nat value: ${value}`);
    }
    return;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || !/^[0-9]+$/.test(trimmed)) {
      throw new Error(`Invalid nat value: ${value}`);
    }
    return;
  }
  throw new Error(`Invalid nat value: ${String(value)}`);
}

/**
 * Coerce any nat-shaped input into a decimal string suitable for
 * Taquito.  Strings pass through verbatim, numbers are checked for
 * safe-integer-ness, and BigInts are serialised via `.toString()`.
 */
export function toNatString(value: NatInput): string {
  assertSafeInputShape(value);

  if (typeof value === "string") {
    return value.trim().replace(/^0+(?=\d)/, "") || "0";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return String(value);
}

/**
 * Where we still hand a JS number to Taquito's FA2 operator schema
 * (which is strongly typed to `number`), we can at least enforce the
 * 2^53 ceiling so we fail loudly instead of silently mutating the
 * value.
 */
export function toSafeNatNumber(value: NatInput): number {
  const s = toNatString(value);
  if (s.length > 16) {
    throw new Error(
      `nat value ${s} exceeds safe-integer range; use toNatString instead`
    );
  }
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`nat value ${s} is not a safe integer`);
  }
  return n;
}
