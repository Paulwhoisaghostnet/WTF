/**
 * Pasta Protocol — recipient list parsing (Penne distribution).
 *
 * Pure, dependency-free parser for the CSV-ish recipient/allocation lists Penne loads into
 * `PastaDistributionFA2.set_allocations`. Mirrored byte-for-byte in the browser port and parity-tested.
 * Address validation is a light structural check (prefix + base58 charset + length); on-chain remains the
 * source of truth.
 */

export type RecipientAllocation = { recipient: string; amount: number };
export type RecipientParseError = { line: number; message: string };
export type RecipientParseResult = {
  entries: RecipientAllocation[];
  errors: RecipientParseError[];
};

const ADDRESS_RE = /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;

/** Light structural validation of a Tezos address (tz1/tz2/tz3/KT1). */
export function isTezosAddress(value: string): boolean {
  return typeof value === "string" && ADDRESS_RE.test(value.trim());
}

/**
 * Parses a recipient list. Each non-empty, non-comment line is `address[, amount]` (amount defaults to
 * `defaultAmount`). Returns valid entries plus a per-line error list; duplicate recipients keep the last.
 */
export function parseRecipientList(text: string, defaultAmount = 1): RecipientParseResult {
  const entries: RecipientAllocation[] = [];
  const errors: RecipientParseError[] = [];
  const seen = new Map<string, number>(); // recipient -> index in entries

  const lines = typeof text === "string" ? text.split(/\r?\n/) : [];
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) return;

    const parts = line.split(/[,\t;]/).map((p) => p.trim());
    const recipient = parts[0] ?? "";
    if (!isTezosAddress(recipient)) {
      errors.push({ line: lineNo, message: `invalid address: "${recipient}"` });
      return;
    }

    let amount = defaultAmount;
    if (parts.length > 1 && parts[1].length > 0) {
      const parsed = Number(parts[1]);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        errors.push({ line: lineNo, message: `invalid amount: "${parts[1]}"` });
        return;
      }
      amount = parsed;
    }

    const existing = seen.get(recipient);
    if (existing !== undefined) {
      entries[existing] = { recipient, amount };
    } else {
      seen.set(recipient, entries.length);
      entries.push({ recipient, amount });
    }
  });

  return { entries, errors };
}

/** Total editions across all parsed allocations. */
export function totalAllocation(entries: RecipientAllocation[]): number {
  return entries.reduce((sum, e) => sum + (Number.isFinite(e.amount) ? e.amount : 0), 0);
}
