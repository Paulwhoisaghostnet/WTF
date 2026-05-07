/**
 * TzKT operation verification helpers.
 *
 * Used by server routes that accept client-submitted `opHash` values to
 * confirm the operation actually exists on-chain with the expected sender,
 * target contract, and entrypoint before trusting its claims.
 *
 * All helpers intentionally fail *closed* — a verification failure should
 * block the DB write rather than accept unverifiable data.
 */

import { tzkt } from "./upstream";

export interface TzktTransactionOp {
  type?: string;
  hash?: string;
  level?: number;
  timestamp?: string;
  sender?: { address?: string | null } | null;
  target?: { address?: string | null } | null;
  entrypoint?: string | null;
  parameter?: { entrypoint?: string | null; value?: unknown } | unknown;
  status?: string | null;
  amount?: number | string | null;
}

const OP_HASH_PATTERN = /^o[0-9A-Za-z]{50}$/;

export function isValidOpHash(value: unknown): value is string {
  return typeof value === "string" && OP_HASH_PATTERN.test(value);
}

/**
 * Fetch every transaction row matching a single opHash.  TzKT returns one
 * row per internal transaction (including the top-level one), which is
 * what we want — a `create_listing` call can emit internal `transfer`
 * operations to the WTF token contract, for example.
 *
 * Retries briefly because TzKT indexing lags the chain by a few seconds.
 */
export async function fetchTransactionsByHash(
  opHash: string,
  opts: { retries?: number; retryDelayMs?: number } = {}
): Promise<TzktTransactionOp[]> {
  if (!isValidOpHash(opHash)) return [];

  const retries = Math.max(0, opts.retries ?? 3);
  const delay = Math.max(0, opts.retryDelayMs ?? 1500);
  const path = `/operations/transactions/${encodeURIComponent(opHash)}?limit=50`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const rows = await tzkt.getJson<TzktTransactionOp[]>(path);
      if (Array.isArray(rows) && rows.length > 0) return rows;
    } catch (err) {
      if (attempt === retries) {
        console.warn(
          `[tzkt-ops] lookup failed for ${opHash} after ${retries + 1} attempts:`,
          (err as Error).message
        );
        return [];
      }
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return [];
}

export interface ContractCallMatch {
  op: TzktTransactionOp;
  sender: string;
  target: string;
  entrypoint: string;
  status: string;
  level: number | null;
  timestamp: string | null;
}

export function transactionEntrypoint(row: TzktTransactionOp): string {
  const direct = typeof row.entrypoint === "string" ? row.entrypoint : "";
  if (direct) return direct;
  const parameter = row.parameter;
  if (parameter && typeof parameter === "object" && "entrypoint" in parameter) {
    const fromParameter = (parameter as { entrypoint?: unknown }).entrypoint;
    return typeof fromParameter === "string" ? fromParameter : "";
  }
  return "";
}

/**
 * Return the first operation in the transaction list that targets the
 * given contract with the expected sender and (optionally) entrypoint,
 * with `status === "applied"`.  Returns `null` if no matching row exists.
 */
export function findAppliedContractCall(
  rows: TzktTransactionOp[],
  expected: {
    contract: string;
    senderOneOf: string[];
    entrypoint?: string | string[];
  }
): ContractCallMatch | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const allowedSenders = new Set(expected.senderOneOf.map((s) => s.toLowerCase()));
  const allowedEntrypoints = expected.entrypoint
    ? new Set(
        (Array.isArray(expected.entrypoint)
          ? expected.entrypoint
          : [expected.entrypoint]
        ).map((e) => e.toLowerCase())
      )
    : null;
  const expectedContract = expected.contract.toLowerCase();

  for (const row of rows) {
    const target = (row.target?.address || "").toLowerCase();
    const sender = (row.sender?.address || "").toLowerCase();
    const entrypoint = transactionEntrypoint(row).toLowerCase();
    const status = row.status || "applied";

    if (target !== expectedContract) continue;
    if (!allowedSenders.has(sender)) continue;
    if (allowedEntrypoints && !allowedEntrypoints.has(entrypoint)) continue;
    if (status !== "applied") continue;

    return {
      op: row,
      sender: row.sender?.address || "",
      target: row.target?.address || "",
      entrypoint: transactionEntrypoint(row),
      status,
      level: typeof row.level === "number" ? row.level : null,
      timestamp: row.timestamp || null,
    };
  }
  return null;
}

export interface VerifyContractCallOptions {
  opHash: string;
  contract: string;
  senderOneOf: string[];
  entrypoint?: string | string[];
  retries?: number;
  retryDelayMs?: number;
}

export interface VerifyContractCallResult {
  ok: boolean;
  reason?: "invalid_hash" | "not_found" | "mismatch";
  match?: ContractCallMatch;
}

/**
 * Convenience wrapper: fetch + match in one call.
 */
export async function verifyContractCall(
  options: VerifyContractCallOptions
): Promise<VerifyContractCallResult> {
  if (!isValidOpHash(options.opHash)) {
    return { ok: false, reason: "invalid_hash" };
  }

  const rows = await fetchTransactionsByHash(options.opHash, {
    retries: options.retries,
    retryDelayMs: options.retryDelayMs,
  });
  if (rows.length === 0) {
    return { ok: false, reason: "not_found" };
  }

  const match = findAppliedContractCall(rows, {
    contract: options.contract,
    senderOneOf: options.senderOneOf,
    entrypoint: options.entrypoint,
  });

  if (!match) return { ok: false, reason: "mismatch" };
  return { ok: true, match };
}

/**
 * Dig a value out of the call's `parameter.value` tree.  TzKT returns a
 * nested object that mirrors the michelson storage, but depending on
 * entrypoint shape it can be a string/number/boolean leaf or an object
 * whose keys reflect the contract's Record field names.  This helper
 * walks a sequence of candidate paths and returns the first primitive
 * that matches the predicate.
 */
export function extractCallArg(
  op: TzktTransactionOp,
  paths: Array<string | string[]>
): string | number | boolean | null {
  const param: any = (op as any).parameter;
  if (!param) return null;
  const root = param.value ?? param;

  for (const path of paths) {
    const parts = Array.isArray(path) ? path : path.split(".");
    let cursor: any = root;
    let ok = true;
    for (const part of parts) {
      if (cursor && typeof cursor === "object" && part in cursor) {
        cursor = cursor[part];
      } else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (
      typeof cursor === "string" ||
      typeof cursor === "number" ||
      typeof cursor === "boolean"
    ) {
      return cursor;
    }
  }
  return null;
}
