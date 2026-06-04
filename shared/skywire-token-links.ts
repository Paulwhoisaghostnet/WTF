export const SKYWIRE_MARKET_FEED_DOMAINS = ["objkt.com", "teia.art"] as const;

export const SKYWIRE_MARKET_FEED_QUERY_BY_DOMAIN: Record<(typeof SKYWIRE_MARKET_FEED_DOMAINS)[number], string> = {
  "objkt.com": "objkt.com",
  "teia.art": "teia.art",
};

export const SKYWIRE_MARKET_FEED_SEARCH_TERMS = [
  "objkt.com/asset",
  "objkt.com/token",
  "objkt.com/tokens",
  "objkt.com/collection",
  "objkt.com/collections",
  "objkt.com/open-edition",
  "objkt.com/open-editions",
  "objkt.com/editions",
  "teia.art/objkt",
  "teia.art/token",
  "teia.art/tokens",
  "teia.art/asset",
] as const;

const TEZOS_CONTRACT_RE = /^KT1[0-9A-Za-z]{33}$/;

export function normalizeSkywirePossibleUrl(value: string): string {
  return value.trim().replace(/[)\].,;!?]+$/g, "");
}

export function isSkywireNaturalPath(value: string | null | undefined): boolean {
  return Boolean(value && /^\d+$/.test(value));
}

export function isSkywireTezosContract(value: string | null | undefined): boolean {
  return Boolean(value && TEZOS_CONTRACT_RE.test(value));
}

export function isObjktSkywireTokenPath(parts: string[]): boolean {
  if (
    (parts[0] === "asset" || parts[0] === "token" || parts[0] === "tokens") &&
    Boolean(parts[1]) &&
    isSkywireNaturalPath(parts[2])
  ) {
    return true;
  }
  if ((parts[0] === "collection" || parts[0] === "collections") && Boolean(parts[1])) {
    return (parts[2] === "tokens" && isSkywireNaturalPath(parts[3])) || isSkywireNaturalPath(parts[2]);
  }
  return (
    (parts[0] === "open-edition" || parts[0] === "open-editions" || parts[0] === "editions") &&
    isSkywireNaturalPath(parts[1])
  );
}

export function isTeiaSkywireTokenPath(parts: string[]): boolean {
  if (parts[0] === "objkt") {
    if (isSkywireNaturalPath(parts[1])) return true;
    return isSkywireTezosContract(parts[1]) && isSkywireNaturalPath(parts[2]);
  }
  if ((parts[0] === "token" || parts[0] === "tokens") && isSkywireNaturalPath(parts[1])) return true;
  return (
    (parts[0] === "asset" || parts[0] === "token" || parts[0] === "tokens") &&
    isSkywireTezosContract(parts[1]) &&
    isSkywireNaturalPath(parts[2])
  );
}

export function isSkywireTokenUrl(value: string): boolean {
  try {
    const url = new URL(normalizeSkywirePossibleUrl(value));
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    if (host === "teia.art") return isTeiaSkywireTokenPath(parts);
    return host === "objkt.com" && isObjktSkywireTokenPath(parts);
  } catch {
    return false;
  }
}

export function extractSkywireTokenUrlsFromValues(values: Array<string | null | undefined>, limit = 4): string[] {
  const candidates = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const urls = value.match(/https?:\/\/[^\s<>"']+/gi) ?? [value];
    for (const raw of urls) {
      const candidate = normalizeSkywirePossibleUrl(raw);
      if (isSkywireTokenUrl(candidate)) candidates.add(candidate);
      if (candidates.size >= limit) return Array.from(candidates);
    }
  }
  return Array.from(candidates);
}
