export function parseHostAllowlist(raw: string | undefined | null): string[] {
  return String(raw || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function isPrivateOrLocalHost(hostname: string): boolean {
  const host = String(hostname || "").toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  if (host === "0.0.0.0") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (/^(fc|fd)[0-9a-f]{0,2}:/i.test(host)) return true;
  if (/^fe80:/i.test(host)) return true;
  return false;
}

export function isAllowedRemoteHost(hostname: string, allowlist: string[]): boolean {
  const host = String(hostname || "").toLowerCase();
  if (!host) return false;
  if (allowlist.length === 0) return true;
  return allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export function normalizePublicHttpUrl(
  input: unknown,
  allowlist: string[] = []
): string | null {
  const value = String(input || "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (isPrivateOrLocalHost(parsed.hostname)) return null;
    if (!isAllowedRemoteHost(parsed.hostname, allowlist)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
