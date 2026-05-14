import { createBoundedExpiringCache } from "./lib/bounded-expiring-cache";
import {
  primaryTezosDomain,
  resolveTezosDomainsIdentity,
} from "./lib/tezos-domains";
import { tzkt } from "./lib/upstream";

const CACHE_TTL = 30 * 60 * 1000;
const DOMAIN_CACHE_MAX_ENTRIES = Math.max(
  100,
  Number(process.env.TEZNAMES_CACHE_MAX_ENTRIES || 5_000)
);

const domainCache = createBoundedExpiringCache<{ domain: string | null }>({
  ttlMs: CACHE_TTL,
  maxEntries: DOMAIN_CACHE_MAX_ENTRIES,
});

export async function resolveDomain(
  address: string
): Promise<string | null> {
  const cached = domainCache.get(address);
  if (cached !== null) return cached.domain;

  try {
    const identity = await resolveTezosDomainsIdentity(address, { limit: 1 });
    const domain = primaryTezosDomain(identity);
    if (domain) {
      domainCache.set(address, { domain });
      return domain;
    }
  } catch {
    // Fall through to the legacy TzKT /domains path.
  }

  try {
    const data = await tzkt.getJson<Array<string | { name?: string | null }>>(
      "/domains",
      {
        address,
        "select.values": "name",
        limit: 1,
      }
    );
    const first = Array.isArray(data) ? data[0] : null;
    const domain =
      typeof first === "string" ? first : first?.name || null;
    domainCache.set(address, { domain });
    return domain;
  } catch {
    domainCache.set(address, { domain: null });
    return null;
  }
}

export async function resolveMultipleDomains(
  addresses: string[]
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  const uncached: string[] = [];

  for (const addr of addresses) {
    const cached = domainCache.get(addr);
    if (cached !== null) {
      results.set(addr, cached.domain);
    } else {
      uncached.push(addr);
    }
  }

  const resolvePromises = uncached.map(async (addr) => {
    const domain = await resolveDomain(addr);
    results.set(addr, domain);
  });

  await Promise.allSettled(resolvePromises);
  return results;
}
