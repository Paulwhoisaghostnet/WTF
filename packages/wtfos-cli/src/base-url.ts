import { WTFOS_CLI_DEFAULT_BASE_URL } from "../../../shared/wtfos-cli/types.ts";

const PRODUCTION_HOSTS = new Set([
  "wtfos.app",
  "www.wtfos.app",
  "wtfgameshow.app",
  "www.wtfgameshow.app",
]);

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
}

/** Validate and normalize a wtfOS deployment origin for the native CLI. */
export function normalizeCliBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("wtfOS baseUrl is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid wtfOS baseUrl: ${raw}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`wtfOS baseUrl must use http or https: ${raw}`);
  }

  if (parsed.username || parsed.password) {
    throw new Error("wtfOS baseUrl must not include credentials.");
  }

  const host = parsed.hostname.toLowerCase();
  const local = isLocalHost(host);
  const allowInsecure = process.env.WTFOS_ALLOW_INSECURE === "1";

  if (!local && parsed.protocol !== "https:" && !allowInsecure) {
    throw new Error(
      `wtfOS baseUrl must use https for ${host}. Set WTFOS_ALLOW_INSECURE=1 only for trusted dev overrides.`
    );
  }

  if (PRODUCTION_HOSTS.has(host) && parsed.protocol !== "https:") {
    throw new Error(`Production wtfOS hosts require https: ${raw}`);
  }

  const pathname = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.protocol}//${parsed.host}${pathname}`;
}

export function resolveCliBaseUrl(
  envUrl: string,
  storedUrl: string | undefined,
  fallback = WTFOS_CLI_DEFAULT_BASE_URL
): string {
  const candidate = envUrl.trim() || storedUrl?.trim() || fallback;
  return normalizeCliBaseUrl(candidate);
}
