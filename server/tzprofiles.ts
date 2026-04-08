const TZKT_BASE = "https://api.tzkt.io/v1";
const CACHE_TTL = 30 * 60 * 1000;

const profileCache = new Map<string, { alias: string | null; ts: number }>();

async function resolveViaTzktAccount(address: string): Promise<string | null> {
  try {
    const res = await fetch(`${TZKT_BASE}/accounts/${address}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.alias || null;
  } catch {
    return null;
  }
}

async function resolveViaTzProfiles(address: string): Promise<string | null> {
  try {
    const res = await fetch(`https://indexer.tzprofiles.com/${address}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    for (const claim of data) {
      if (!Array.isArray(claim) || claim.length < 2) continue;
      try {
        const parsed = JSON.parse(claim[1]);
        if (parsed?.credentialSubject?.alias) return parsed.credentialSubject.alias;
        if (parsed?.credentialSubject?.name) return parsed.credentialSubject.name;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveViaObjkt(address: string): Promise<string | null> {
  try {
    const res = await fetch("https://data.objkt.com/v3/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query { holder(where: {address: {_eq: "${address}"}}) { alias } }`,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.holder?.[0]?.alias || null;
  } catch {
    return null;
  }
}

export async function resolveProfile(address: string): Promise<string | null> {
  const cached = profileCache.get(address);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.alias;

  let alias: string | null = null;

  alias = await resolveViaTzktAccount(address);
  if (!alias) alias = await resolveViaTzProfiles(address);
  if (!alias) alias = await resolveViaObjkt(address);

  profileCache.set(address, { alias, ts: Date.now() });
  return alias;
}

export async function resolveMultipleProfiles(
  addresses: string[]
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  const uncached: string[] = [];

  for (const addr of addresses) {
    const cached = profileCache.get(addr);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      results.set(addr, cached.alias);
    } else {
      uncached.push(addr);
    }
  }

  const batchSize = 10;
  for (let i = 0; i < uncached.length; i += batchSize) {
    const batch = uncached.slice(i, i + batchSize);
    const resolved = await Promise.allSettled(
      batch.map(async (addr) => {
        const alias = await resolveProfile(addr);
        results.set(addr, alias);
      })
    );
  }

  return results;
}
