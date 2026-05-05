export function parseBoundedQueryInt(
  input: unknown,
  defaultValue: number,
  { min = 0, max }: { min?: number; max: number }
): number {
  const raw = Number(input);
  if (!Number.isFinite(raw)) return defaultValue;
  return Math.max(min, Math.min(max, Math.trunc(raw)));
}

export function paginationMeta(total: number, limit: number, offset: number) {
  return {
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
}
