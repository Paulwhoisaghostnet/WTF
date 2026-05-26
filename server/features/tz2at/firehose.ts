export type Tz2atFirehoseSnapshot = {
  mode: "wallet-activity-snapshot";
  baseUrl: string;
  sourceUrl: string;
  chain: "tezos" | "etherlink" | null;
  walletAddress: string;
  limit: number;
  cursor: string | null;
  items: Array<Record<string, unknown>>;
  raw: Record<string, unknown> | null;
};

export function extractTz2atEventItems(upstream: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(upstream)) return upstream.filter(isRecord);
  if (!isRecord(upstream)) return [];
  const candidates = [upstream.items, upstream.events, upstream.records, upstream.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(isRecord);
  }
  return [];
}

export function extractTz2atCursor(upstream: unknown): string | null {
  if (!isRecord(upstream)) return null;
  const cursor = upstream.cursor ?? upstream.nextCursor ?? upstream.latestCursor;
  return typeof cursor === "string" && cursor.trim() ? cursor : null;
}

export function buildTz2atFirehoseSnapshot(input: {
  baseUrl: string;
  sourceUrl: string;
  chain?: "tezos" | "etherlink";
  walletAddress: string;
  limit: number;
  upstream: unknown;
}): Tz2atFirehoseSnapshot {
  return {
    mode: "wallet-activity-snapshot",
    baseUrl: input.baseUrl,
    sourceUrl: input.sourceUrl,
    chain: input.chain ?? null,
    walletAddress: input.walletAddress,
    limit: input.limit,
    cursor: extractTz2atCursor(input.upstream),
    items: extractTz2atEventItems(input.upstream),
    raw: isRecord(input.upstream) ? input.upstream : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
