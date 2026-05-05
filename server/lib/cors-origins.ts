type EnvLike = Record<string, string | undefined>;

export function normalizeOrigin(value: string): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export function allowedOriginsForRuntime(env: EnvLike = process.env): Set<string> {
  const allowed = new Set<string>();

  const fromEnv = String(env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => normalizeOrigin(value))
    .filter((value): value is string => Boolean(value));
  fromEnv.forEach((origin) => allowed.add(origin));

  [
    env.PUBLIC_SITE_URL,
    env.COLLEKT_MODULE_URL,
    env.VITE_COLLEKT_MODULE_URL,
  ].forEach((value) => {
    const origin = normalizeOrigin(value || "");
    if (origin) allowed.add(origin);
  });

  if (env.NODE_ENV !== "production") {
    [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ].forEach((origin) => allowed.add(origin));
  }

  return allowed;
}
