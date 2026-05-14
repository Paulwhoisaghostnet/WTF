import { createBoundedExpiringCache } from "./lib/bounded-expiring-cache";
import { objkt, tzkt, tzprofiles } from "./lib/upstream";

const CACHE_TTL = 30 * 60 * 1000;
const PROFILE_CACHE_MAX_ENTRIES = Math.max(
  100,
  Number(process.env.TEZOS_PROFILE_CACHE_MAX_ENTRIES || 5_000)
);

const profileCache = createBoundedExpiringCache<{ alias: string | null }>({
  ttlMs: CACHE_TTL,
  maxEntries: PROFILE_CACHE_MAX_ENTRIES,
});

async function resolveViaTzktAccount(address: string): Promise<string | null> {
  try {
    const data = await tzkt.getJson<{ alias?: string | null }>(
      `/accounts/${encodeURIComponent(address)}`
    );
    return data?.alias || null;
  } catch {
    return null;
  }
}

async function resolveViaTzProfiles(address: string): Promise<string | null> {
  try {
    const data = await tzprofiles.getJson<unknown>(
      `/${encodeURIComponent(address)}`
    );
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
    const data = await objkt.postJson<{
      data?: { holder?: Array<{ alias?: string | null }> };
    }>("", {
      query: `query ProfileAlias($address: String!) {
  holder(where: { address: { _eq: $address } }, limit: 1) {
    alias
  }
}`,
      variables: { address },
    });
    return data?.data?.holder?.[0]?.alias || null;
  } catch {
    return null;
  }
}

export async function resolveProfile(address: string): Promise<string | null> {
  const cached = profileCache.get(address);
  if (cached !== null) return cached.alias;

  let alias: string | null = null;

  alias = await resolveViaTzktAccount(address);
  if (!alias) alias = await resolveViaTzProfiles(address);
  if (!alias) alias = await resolveViaObjkt(address);

  profileCache.set(address, { alias });
  return alias;
}

export async function resolveMultipleProfiles(
  addresses: string[]
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  const uncached: string[] = [];

  for (const addr of addresses) {
    const cached = profileCache.get(addr);
    if (cached !== null) {
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
    void resolved;
  }

  return results;
}
