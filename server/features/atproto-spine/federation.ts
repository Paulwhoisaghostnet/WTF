import { getSpineConfig } from "./config";

/**
 * Federation enablement (S3.4). Bidirectional federation with the wider AT Protocol /
 * Bluesky network:
 *  - requestCrawl: announce our PDS hostnames to relays so they index our repos.
 *  - createInviteCode: gate account creation on our PDS when invite-only.
 *  - shouldIndexCollection: filter the inbound firehose to collections we care about.
 *
 * All network calls take an injectable fetch so request shaping is unit-testable.
 */

export interface FederationConfig {
  /** Relays we ask to crawl our PDSes (our own relay + optionally bsky's). */
  crawlRelays: string[];
  /** PDS hostnames to announce. */
  pdsHostnames: string[];
  /** Whether to index external (non-wtfOS) collections from the firehose. */
  acceptExternal: boolean;
  /** Extra non-wtfOS collection prefixes to index when acceptExternal is true. */
  externalAllowlist: string[];
}

export function federationConfig(env: NodeJS.ProcessEnv = process.env): FederationConfig {
  const spine = getSpineConfig(env);
  const network = spine.networkDomain;
  const crawlRelays = (env.WTFOS_CRAWL_RELAYS || `https://relay.${network}`)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const pdsHostnames = (env.WTFOS_FEDERATED_PDS_HOSTS || `pds.${network}`)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const acceptExternal = env.WTFOS_ACCEPT_EXTERNAL === "true" || env.WTFOS_ACCEPT_EXTERNAL === "1";
  const externalAllowlist = (env.WTFOS_EXTERNAL_COLLECTION_ALLOWLIST || "app.bsky.")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { crawlRelays, pdsHostnames, acceptExternal, externalAllowlist };
}

/** Decide whether to index an inbound firehose collection. Our own lexicons always pass. */
export function shouldIndexCollection(collection: string, config?: FederationConfig): boolean {
  const namespace = getSpineConfig().lexiconNamespace;
  if (collection.startsWith(`${namespace}.`)) return true;
  const cfg = config ?? federationConfig();
  if (!cfg.acceptExternal) return false;
  return cfg.externalAllowlist.some((prefix) => collection.startsWith(prefix));
}

export interface RelayResult {
  relay: string;
  hostname: string;
  ok: boolean;
  status?: number;
  error?: string;
}

/** Ask a relay to crawl a PDS hostname (com.atproto.sync.requestCrawl). */
export async function requestCrawl(input: {
  relayUrl: string;
  hostname: string;
  fetchImpl?: typeof fetch;
}): Promise<RelayResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = new URL("/xrpc/com.atproto.sync.requestCrawl", input.relayUrl.replace(/\/$/, "") + "/");
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hostname: input.hostname }),
    });
    return { relay: input.relayUrl, hostname: input.hostname, ok: res.ok, status: res.status };
  } catch (err) {
    return {
      relay: input.relayUrl,
      hostname: input.hostname,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Announce all configured PDS hostnames to all configured crawl relays. */
export async function announceToRelays(fetchImpl: typeof fetch = fetch): Promise<RelayResult[]> {
  const cfg = federationConfig();
  const results: RelayResult[] = [];
  for (const relay of cfg.crawlRelays) {
    for (const hostname of cfg.pdsHostnames) {
      results.push(await requestCrawl({ relayUrl: relay, hostname, fetchImpl }));
    }
  }
  return results;
}

/** Create an invite code on a PDS (com.atproto.server.createInviteCode). */
export async function createInviteCode(input: {
  pdsUrl?: string;
  adminPassword?: string;
  useCount?: number;
  forAccount?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ code: string }> {
  const config = getSpineConfig();
  const pdsUrl = (input.pdsUrl ?? config.users?.url ?? config.master.url).replace(/\/$/, "");
  const adminPassword = input.adminPassword ?? config.users?.adminPassword ?? config.master.adminPassword;
  if (!adminPassword) throw new Error("pds_admin_password_required");
  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(new URL("/xrpc/com.atproto.server.createInviteCode", pdsUrl + "/"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${Buffer.from(`admin:${adminPassword}`).toString("base64")}`,
    },
    body: JSON.stringify({
      useCount: input.useCount ?? 1,
      ...(input.forAccount ? { forAccount: input.forAccount } : {}),
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as { code?: string; error?: string; message?: string };
  if (!res.ok || !payload.code) {
    throw new Error(`createInviteCode failed: ${payload.message ?? payload.error ?? res.statusText}`);
  }
  return { code: payload.code };
}
