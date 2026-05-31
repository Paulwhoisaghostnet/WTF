const DEFAULT_KILN_TIMEOUT_MS = 120_000;

export function defaultKilnApiUrl(): string {
  if (process.env.KILN_API_URL?.trim()) {
    return process.env.KILN_API_URL.trim().replace(/\/+$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    return "http://host.docker.internal:3001";
  }
  return "http://127.0.0.1:3080";
}

export function kilnApiToken(): string | undefined {
  return (
    process.env.KILN_API_TOKEN?.trim() ||
    process.env.WTF_KILN_API_TOKEN?.trim() ||
    process.env.API_AUTH_TOKEN?.trim() ||
    undefined
  );
}

export function kilnTimeoutMs(): number {
  return Math.max(
    1_000,
    Number(
      process.env.KILN_TIMEOUT_MS ??
        process.env.WTF_KILN_TIMEOUT_MS ??
        DEFAULT_KILN_TIMEOUT_MS
    ) || DEFAULT_KILN_TIMEOUT_MS
  );
}

export function assertKilnConfigured(): void {
  if (process.env.NODE_ENV === "production" && !kilnApiToken()) {
    const err = new Error("Kiln API token is not configured") as Error & { status?: number };
    err.status = 503;
    throw err;
  }
}

export async function kilnFetch<T = unknown>(
  requestPath: string,
  body?: unknown,
  method: "GET" | "POST" = body === undefined ? "GET" : "POST"
): Promise<T> {
  assertKilnConfigured();

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const token = kilnApiToken();
  if (token) {
    headers["x-kiln-token"] = token;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), kilnTimeoutMs());
  const kilnApiUrl = defaultKilnApiUrl();

  try {
    const response = await fetch(`${kilnApiUrl}${requestPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      const err = new Error(
        `Kiln ${requestPath} failed: HTTP ${response.status} — ${text.slice(0, 400)}`
      ) as Error & { status?: number; kilnBody?: string };
      err.status = response.status;
      err.kilnBody = text;
      throw err;
    }
    try {
      return text ? (JSON.parse(text) as T) : ({} as T);
    } catch {
      return { raw: text } as unknown as T;
    }
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }
    const wrapped = new Error(
      `Kiln ${requestPath} failed: ${
        err instanceof Error && err.name === "AbortError"
          ? "request timed out"
          : err instanceof Error
            ? err.message
            : "network error"
      }`
    ) as Error & { status?: number };
    wrapped.status = 503;
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }
}
