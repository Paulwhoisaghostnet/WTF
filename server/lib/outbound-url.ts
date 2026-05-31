import { isPrivateOrLocalHost, parseHostAllowlist } from "./network-safety";

export type OutboundUrlPolicy = {
  /** When true, only https: URLs are allowed (recommended in production). */
  httpsOnly?: boolean;
  /** Optional hostname allowlist; empty means any public host is allowed. */
  hostAllowlist?: string[];
};

export class OutboundUrlRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundUrlRejectedError";
  }
}

function hostAllowed(hostname: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  const host = hostname.toLowerCase();
  return allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/**
 * Validates a caller-supplied HTTP(S) URL before the server fetches it.
 * Blocks private/loopback/link-local targets and non-http(s) schemes.
 */
export function assertSafeOutboundUrl(
  raw: unknown,
  policy: OutboundUrlPolicy = {}
): URL {
  const value = String(raw || "").trim();
  if (!value) {
    throw new OutboundUrlRejectedError("URL is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new OutboundUrlRejectedError("URL is malformed");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new OutboundUrlRejectedError("Only http and https URLs are allowed");
  }

  if (policy.httpsOnly && parsed.protocol !== "https:") {
    throw new OutboundUrlRejectedError("HTTPS is required for outbound requests");
  }

  if (parsed.username || parsed.password) {
    throw new OutboundUrlRejectedError("Embedded credentials are not allowed in outbound URLs");
  }

  if (isPrivateOrLocalHost(parsed.hostname)) {
    throw new OutboundUrlRejectedError("Private or local network hosts are not allowed");
  }

  const allowlist = policy.hostAllowlist ?? [];
  if (!hostAllowed(parsed.hostname, allowlist)) {
    throw new OutboundUrlRejectedError("Host is not on the outbound allowlist");
  }

  return parsed;
}

export type SafeHttpFetchOptions = OutboundUrlPolicy & {
  maxRedirects?: number;
};

const DEFAULT_MAX_REDIRECTS = 5;

/**
 * Fetch with manual redirect handling so each hop is re-validated (SSRF-safe).
 */
export async function fetchSafeHttp(
  rawUrl: string,
  init: RequestInit = {},
  options: SafeHttpFetchOptions = {}
): Promise<Response> {
  const maxRedirects = Math.max(
    0,
    Math.min(10, Math.trunc(options.maxRedirects ?? DEFAULT_MAX_REDIRECTS))
  );
  let current = assertSafeOutboundUrl(rawUrl, options).toString();
  let redirects = 0;

  while (true) {
    const response = await fetch(current, {
      ...init,
      redirect: "manual",
    });

    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    if (redirects >= maxRedirects) {
      throw new OutboundUrlRejectedError("Too many redirects");
    }

    current = assertSafeOutboundUrl(new URL(location, current).toString(), options).toString();
    redirects += 1;
  }
}

export function porcupinOutboundPolicy(): OutboundUrlPolicy {
  const httpsOnly =
    process.env.NODE_ENV === "production" && process.env.PORCUPIN_ALLOW_HTTP !== "1";
  const hostAllowlist = parseHostAllowlist(process.env.PORCUPIN_ALLOWED_HOSTS);
  return { httpsOnly, hostAllowlist };
}
