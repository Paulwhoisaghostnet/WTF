import { getWtfDomainsRegistrarConfig } from "../features/wtf-subdomains/contracts";
import { createBoundedExpiringCache } from "./bounded-expiring-cache";
import { UpstreamClient } from "./upstream";

export const tezosDomainsQuery = `query TezosDomainIdentity($address: Address!, $limit: Int!) {
  reverseRecord(address: $address, validity: VALID) {
    domain {
      name
    }
  }
  domains(first: $limit, where: { owner: { equalTo: $address }, validity: VALID }) {
    items {
      name
      owner
    }
  }
}`;

interface GraphqlClient {
  postJson<T>(path: string, body: unknown): Promise<T>;
}

interface TezosDomainsIdentityResponse {
  data?: {
    reverseRecord?: {
      domain?: { name?: string | null } | null;
    } | null;
    domains?: {
      items?: Array<{ name?: string | null; owner?: string | null } | null> | null;
    } | null;
  } | null;
}

export interface TezosDomainsIdentity {
  reverseDomain: string | null;
  ownedDomains: string[];
}

let cachedClient: GraphqlClient | null = null;
let cachedUrl: string | null = null;
const identityCache = createBoundedExpiringCache<TezosDomainsIdentity>({
  ttlMs: Math.max(60_000, Number(process.env.TEZOS_DOMAINS_CACHE_TTL_MS || 30 * 60_000)),
  maxEntries: Math.max(100, Number(process.env.TEZOS_DOMAINS_CACHE_MAX_ENTRIES || 5_000)),
});

function normalizeDomainName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  return normalized.endsWith(".tez") ? normalized : null;
}

export function pickReverseTezosDomain(payload: unknown): string | null {
  const response = payload as TezosDomainsIdentityResponse;
  return normalizeDomainName(response?.data?.reverseRecord?.domain?.name);
}

export function pickOwnedTezosDomains(payload: unknown): string[] {
  const response = payload as TezosDomainsIdentityResponse;
  const items = response?.data?.domains?.items;
  if (!Array.isArray(items)) return [];
  const domains: string[] = [];
  for (const item of items) {
    const name = normalizeDomainName(item?.name);
    if (name && !domains.includes(name)) domains.push(name);
  }
  return domains.sort((a, b) => a.localeCompare(b));
}

export function primaryTezosDomain(
  identity: TezosDomainsIdentity | null | undefined,
  fallback: string | null = null
): string | null {
  return identity?.reverseDomain ?? identity?.ownedDomains[0] ?? fallback;
}

function domainsGraphqlUrl(env: NodeJS.ProcessEnv = process.env) {
  const configured =
    env.TEZOS_DOMAINS_GRAPHQL_URL ||
    env.WTF_DOMAINS_GRAPHQL_URL ||
    getWtfDomainsRegistrarConfig(env).domainsGraphql;
  return configured.trim().replace(/\/+$/, "");
}

function domainsClient(env: NodeJS.ProcessEnv = process.env): GraphqlClient | null {
  const url = domainsGraphqlUrl(env);
  if (!url) return null;
  if (cachedClient && cachedUrl === url) return cachedClient;
  cachedUrl = url;
  cachedClient = new UpstreamClient({
    label: "tezos-domains",
    baseUrl: url,
    requestsPerSecond: 3,
    burst: 6,
    timeoutMs: 15_000,
    maxRetries: 3,
  });
  return cachedClient;
}

export async function resolveTezosDomainsIdentity(
  address: string,
  options: {
    limit?: number;
    client?: GraphqlClient | null;
  } = {}
): Promise<TezosDomainsIdentity> {
  const cacheKey = `${address}:${Math.min(50, Math.max(1, Math.floor(options.limit ?? 20)))}`;
  const cached = identityCache.get(cacheKey);
  if (cached) return cached;

  const client = options.client === undefined ? domainsClient() : options.client;
  if (!client) {
    const empty = { reverseDomain: null, ownedDomains: [] };
    identityCache.set(cacheKey, empty);
    return empty;
  }

  const limit = Math.min(50, Math.max(1, Math.floor(options.limit ?? 20)));
  const payload = await client.postJson<TezosDomainsIdentityResponse>("", {
    query: tezosDomainsQuery,
    variables: { address, limit },
  });

  const identity = {
    reverseDomain: pickReverseTezosDomain(payload),
    ownedDomains: pickOwnedTezosDomains(payload),
  };
  identityCache.set(cacheKey, identity);
  return identity;
}
