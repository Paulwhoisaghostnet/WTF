const TEZNAMES_API = "https://api.teznames.com";
const CACHE_TTL = 30 * 60 * 1000;

const domainCache = new Map<string, { domain: string | null; ts: number }>();

export async function resolveDomain(
  address: string
): Promise<string | null> {
  const cached = domainCache.get(address);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.domain;

  try {
    const res = await fetch(
      `${TEZNAMES_API}/info/getNameFromAddress/${address}`
    );
    if (!res.ok) {
      domainCache.set(address, { domain: null, ts: Date.now() });
      return null;
    }
    const data = await res.json();
    const domain = data?.name || null;
    domainCache.set(address, { domain, ts: Date.now() });
    return domain;
  } catch {
    domainCache.set(address, { domain: null, ts: Date.now() });
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
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
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
