function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function boundedClientLogMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 25);
  const out: Record<string, unknown> = {};
  for (const [key, raw] of entries) {
    const safeKey = boundedString(key, 80);
    if (!safeKey) continue;
    if (typeof raw === "string") {
      out[safeKey] = raw.slice(0, 1_000);
    } else if (typeof raw === "number" || typeof raw === "boolean" || raw === null) {
      out[safeKey] = raw;
    } else {
      out[safeKey] = "[structured metadata omitted]";
    }
  }
  return out;
}
