import {
  WTFOS_GAMESHOW_ORIGIN,
  WTFOS_LEGACY_PLATFORM_ORIGINS,
  WTFOS_PLATFORM_DOMAIN,
  WTFOS_PLATFORM_ORIGIN,
} from "@shared/platform-branding";

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
    env.DUES_MODULE_URL,
    env.VITE_DUES_MODULE_URL,
  ].forEach((value) => {
    const origin = normalizeOrigin(value || "");
    if (origin) allowed.add(origin);
  });

  if (env.NODE_ENV !== "production") {
    const localPorts = new Set(["3000", "3001", "5173"]);
    const runtimePort = String(env.PORT || "").trim();
    if (/^\d+$/.test(runtimePort)) localPorts.add(runtimePort);
    [
      ...[...localPorts].map((port) => `http://localhost:${port}`),
      ...[...localPorts].map((port) => `http://127.0.0.1:${port}`),
    ].forEach((origin) => allowed.add(origin));
  }

  if (env.NODE_ENV === "production") {
    allowed.add(WTFOS_PLATFORM_ORIGIN);
    allowed.add(`https://skywire.${WTFOS_PLATFORM_DOMAIN}`);
    allowed.add(`https://gamma.${WTFOS_PLATFORM_DOMAIN}`);
    allowed.add(`https://beta.${WTFOS_PLATFORM_DOMAIN}`);
    allowed.add(`https://dues.${WTFOS_PLATFORM_DOMAIN}`);
    allowed.add(`https://dues.wtfgameshow.app`);
    for (const legacyOrigin of WTFOS_LEGACY_PLATFORM_ORIGINS) {
      allowed.add(legacyOrigin);
    }
    allowed.add(WTFOS_GAMESHOW_ORIGIN);
  }

  return allowed;
}

export function isArcadeSourceAssetPath(value: string): boolean {
  const raw = String(value || "");
  const path = raw.split("?", 1)[0] || raw;
  return (
    path.startsWith("/api/arcade/source/") ||
    path.startsWith("/api/console/hackcade/")
  );
}

export function shouldAllowNullOriginArcadeSource(
  origin: string | undefined,
  path: string
): boolean {
  return origin === "null" && isArcadeSourceAssetPath(path);
}
