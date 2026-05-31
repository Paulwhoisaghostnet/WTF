export function sanitizeApiError(body: string, status: number): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return `Request failed: ${status}`;
  }

  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
    for (const candidate of [parsed.error, parsed.message]) {
      if (typeof candidate === "string" && candidate.length > 0 && candidate.length <= 240) {
        return candidate;
      }
    }
  } catch {
    // fall through
  }

  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.includes("<html")) {
    return `Request failed: ${status}`;
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return `Request failed: ${status}`;
  }

  return trimmed.slice(0, 200);
}
