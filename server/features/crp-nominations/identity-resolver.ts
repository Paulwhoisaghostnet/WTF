import { and, eq, inArray, sql } from "drizzle-orm";
import { AtpAgent } from "@atproto/api";
import {
  atprotoAccounts,
  tz2atIdentityLinks,
  userWallets,
  users,
  xTezosIdentityHints,
} from "@shared/schema";
import { isTezosAddress, shortTezosAddress } from "@shared/tezos-identity";
import { db } from "../../db";
import { resolveTezosDomainsIdentity } from "../../lib/tezos-domains";
import { resolveTezosIdentities } from "../../lib/tezos-identity";
import { resolveProfile } from "../../tzprofiles";
import { getWtfDomainsRegistrarConfig } from "../wtf-subdomains/contracts";
import { parseTzbskyCryptoAddressRecord } from "../tz2at/tzbsky";
import {
  detectNomineeQueryKind,
  normalizeBskyHandle,
  normalizeNomineeQuery,
  normalizeXHandle,
} from "./records";

export type NomineeSocialHandle = {
  platform: "x" | "bsky";
  handle: string;
  sources: string[];
};

export type NomineeWalletCandidate = {
  address: string;
  displayName: string | null;
  tezosDomain: string | null;
  sources: string[];
};

export type NomineeIdentityBundle = {
  id: string;
  tezosAddress: string | null;
  tezosDomain: string | null;
  displayName: string | null;
  xHandle: string | null;
  bskyHandle: string | null;
  sources: string[];
};

export type NomineeIdentityResolution = {
  query: string;
  kind: ReturnType<typeof detectNomineeQueryKind>;
  wallets: NomineeWalletCandidate[];
  xHandles: NomineeSocialHandle[];
  bskyHandles: NomineeSocialHandle[];
  bundles: NomineeIdentityBundle[];
};

const tezosDomainForwardQuery = `query TezosDomainForward($name: String!) {
  record(domain: { name: { equalTo: $name } }, validity: VALID) {
    address
  }
}`;

const TZBSKY_COLLECTION = "com.tzbsky.cryptoAddress";

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function addWallet(
  map: Map<string, NomineeWalletCandidate>,
  address: string,
  source: string,
  input?: { displayName?: string | null; tezosDomain?: string | null }
) {
  if (!isTezosAddress(address)) return;
  const key = address.trim();
  const current = map.get(key) ?? {
    address: key,
    displayName: null,
    tezosDomain: null,
    sources: [],
  };
  if (input?.displayName && !current.displayName) current.displayName = input.displayName;
  if (input?.tezosDomain && !current.tezosDomain) current.tezosDomain = input.tezosDomain;
  if (!current.sources.includes(source)) current.sources.push(source);
  map.set(key, current);
}

function addSocial(
  map: Map<string, NomineeSocialHandle>,
  platform: "x" | "bsky",
  handle: string,
  source: string
) {
  const normalized =
    platform === "x" ? normalizeXHandle(handle) : normalizeBskyHandle(handle);
  if (!normalized) return;
  const key = `${platform}:${normalized}`;
  const current = map.get(key) ?? { platform, handle: normalized, sources: [] };
  if (!current.sources.includes(source)) current.sources.push(source);
  map.set(key, current);
}

async function resolveTezosDomainToAddress(domain: string): Promise<string | null> {
  const name = domain.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!name.endsWith(".tez")) return null;
  try {
    const url =
      process.env.TEZOS_DOMAINS_GRAPHQL_URL ||
      process.env.WTF_DOMAINS_GRAPHQL_URL ||
      getWtfDomainsRegistrarConfig().domainsGraphql;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query: tezosDomainForwardQuery, variables: { name } }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      data?: { record?: { address?: string | null } | null };
    };
    const address = payload?.data?.record?.address;
    return isTezosAddress(address) ? address.trim() : null;
  } catch {
    return null;
  }
}

async function resolveBskyDid(handle: string): Promise<{ did: string; pdsUrl: string | null } | null> {
  const agent = new AtpAgent({ service: "https://public.api.bsky.app" });
  try {
    const resolved = await agent.com.atproto.identity.resolveHandle({ handle });
    const did = resolved.data.did;
    let pdsUrl: string | null = null;
    try {
      const plc = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);
      if (plc.ok) {
        const body = (await plc.json()) as {
          service?: Array<{ id?: string; serviceEndpoint?: string }>;
        };
        const pds = body.service?.find((service) => service.id === "#atproto_pds");
        pdsUrl = typeof pds?.serviceEndpoint === "string" ? pds.serviceEndpoint : null;
      }
    } catch {
      pdsUrl = null;
    }
    return { did, pdsUrl };
  } catch {
    return null;
  }
}

async function fetchTzbskyRecord(did: string, pdsUrl: string | null) {
  const pds = (pdsUrl || "https://bsky.social").replace(/\/$/, "");
  const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
  url.searchParams.set("repo", did);
  url.searchParams.set("collection", TZBSKY_COLLECTION);
  url.searchParams.set("limit", "20");
  const response = await fetch(url.toString(), { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`tzbsky listRecords failed: ${response.status}`);
  const body = (await response.json()) as { records?: Array<{ value?: unknown }> };
  const records = Array.isArray(body.records) ? body.records : [];
  const record = records.find((candidate) => candidate?.value);
  if (!record?.value) throw new Error("tzbsky record missing");
  return record.value;
}

async function walletsFromBskyHandle(
  handle: string,
  walletMap: Map<string, NomineeWalletCandidate>,
  bskyMap: Map<string, NomineeSocialHandle>
) {
  const normalized = normalizeBskyHandle(handle);
  addSocial(bskyMap, "bsky", normalized, "bsky_handle");
  const resolved = await resolveBskyDid(normalized);
  if (!resolved) return;

  try {
    const value = await fetchTzbskyRecord(resolved.did, resolved.pdsUrl);
    const proofs = parseTzbskyCryptoAddressRecord(value);
    for (const proof of proofs) {
      if (proof.chain !== "tezos") continue;
      addWallet(walletMap, proof.walletAddress, "tzbsky", { displayName: normalized });
    }
  } catch {
    // tzbsky proof is optional enrichment
  }

  try {
    const links = await db
      .select({ walletAddress: tz2atIdentityLinks.walletAddress })
      .from(tz2atIdentityLinks)
      .where(eq(tz2atIdentityLinks.did, resolved.did));
    for (const link of links) {
      addWallet(walletMap, link.walletAddress, "tz2at_identity_link");
    }
  } catch {
    // optional enrichment
  }
}

async function walletsFromXHandle(
  handle: string,
  walletMap: Map<string, NomineeWalletCandidate>,
  xMap: Map<string, NomineeSocialHandle>
) {
  const normalized = normalizeXHandle(handle);
  if (!normalized) return;
  addSocial(xMap, "x", normalized, "x_handle");

  try {
    const hints = await db
      .select({
        address: xTezosIdentityHints.tezosAddress,
        alias: xTezosIdentityHints.alias,
        tzDomain: xTezosIdentityHints.tzDomain,
        source: xTezosIdentityHints.source,
      })
      .from(xTezosIdentityHints)
      .where(sql`lower(${xTezosIdentityHints.twitterHandle}) = ${normalized}`);
    for (const hint of hints) {
      addWallet(walletMap, hint.address, `x_tezos_hints:${hint.source}`, {
        displayName: hint.alias,
        tezosDomain: hint.tzDomain,
      });
    }
  } catch {
    // optional enrichment
  }

  try {
    const linked = await db
      .select({
        walletAddress: userWallets.walletAddress,
        tezDomain: userWallets.tezDomain,
        displayName: users.displayName,
        username: users.username,
      })
      .from(users)
      .innerJoin(userWallets, eq(userWallets.userId, users.id))
      .where(sql`lower(${users.twitterHandle}) = ${normalized}`);
    for (const row of linked) {
      addWallet(walletMap, row.walletAddress, "wtfos_user_wallet", {
        displayName: row.displayName ?? row.username,
        tezosDomain: row.tezDomain,
      });
    }
  } catch {
    // optional enrichment
  }
}

async function enrichWalletSocials(
  walletMap: Map<string, NomineeWalletCandidate>,
  xMap: Map<string, NomineeSocialHandle>,
  bskyMap: Map<string, NomineeSocialHandle>
) {
  const addresses = [...walletMap.keys()];
  if (addresses.length === 0) return;

  const [identityMap, domainRows, profileAliases] = await Promise.all([
    resolveTezosIdentities(addresses),
    Promise.all(addresses.map((address) => resolveTezosDomainsIdentity(address))),
    Promise.all(addresses.map((address) => resolveProfile(address))),
  ]);

  for (let index = 0; index < addresses.length; index += 1) {
    const address = addresses[index]!;
    const wallet = walletMap.get(address);
    if (!wallet) continue;
    const identity = identityMap.get(address);
    if (identity && !identity.isFallback) {
      wallet.displayName = wallet.displayName ?? identity.displayName;
      wallet.tezosDomain = wallet.tezosDomain ?? identity.tezosDomain;
      if (!wallet.sources.includes(identity.source)) wallet.sources.push(identity.source);
    }
    const domains = domainRows[index];
    if (domains?.reverseDomain && !wallet.tezosDomain) {
      wallet.tezosDomain = domains.reverseDomain;
      wallet.sources.push("tezos_domains");
    } else if (domains?.ownedDomains?.[0] && !wallet.tezosDomain) {
      wallet.tezosDomain = domains.ownedDomains[0] ?? null;
      wallet.sources.push("tezos_domains");
    }
    const alias = profileAliases[index];
    if (alias && !wallet.displayName) {
      wallet.displayName = alias;
      wallet.sources.push("tzprofiles");
    }
  }

  try {
    const hints = await db
      .select({
        address: xTezosIdentityHints.tezosAddress,
        handle: xTezosIdentityHints.twitterHandle,
        source: xTezosIdentityHints.source,
      })
      .from(xTezosIdentityHints)
      .where(inArray(xTezosIdentityHints.tezosAddress, addresses));
    for (const hint of hints) {
      addSocial(xMap, "x", hint.handle, `x_tezos_hints:${hint.source}`);
      const wallet = walletMap.get(hint.address);
      if (wallet && !wallet.sources.includes(`x_tezos_hints:${hint.source}`)) {
        wallet.sources.push(`x_tezos_hints:${hint.source}`);
      }
    }
  } catch {
    // optional enrichment
  }

  try {
    const linked = await db
      .select({
        walletAddress: userWallets.walletAddress,
        twitterHandle: users.twitterHandle,
        bskyHandle: atprotoAccounts.handle,
      })
      .from(userWallets)
      .leftJoin(users, eq(users.id, userWallets.userId))
      .leftJoin(atprotoAccounts, eq(atprotoAccounts.userId, users.id))
      .where(inArray(userWallets.walletAddress, addresses));
    for (const row of linked) {
      if (row.twitterHandle) addSocial(xMap, "x", row.twitterHandle, "wtfos_user");
      if (row.bskyHandle) addSocial(bskyMap, "bsky", row.bskyHandle, "wtfos_user");
    }
  } catch {
    // optional enrichment
  }

  try {
    const links = await db
      .select({
        walletAddress: tz2atIdentityLinks.walletAddress,
        handle: atprotoAccounts.handle,
      })
      .from(tz2atIdentityLinks)
      .leftJoin(atprotoAccounts, eq(atprotoAccounts.did, tz2atIdentityLinks.did))
      .where(
        and(
          inArray(tz2atIdentityLinks.walletAddress, addresses),
          eq(tz2atIdentityLinks.chain, "tezos")
        )
      );
    for (const link of links) {
      if (link.handle) addSocial(bskyMap, "bsky", link.handle, "tz2at_identity_link");
      const wallet = walletMap.get(link.walletAddress);
      if (wallet && !wallet.sources.includes("tz2at_identity_link")) {
        wallet.sources.push("tz2at_identity_link");
      }
    }
  } catch {
    // optional enrichment
  }
}

function buildBundles(input: {
  wallets: NomineeWalletCandidate[];
  xHandles: NomineeSocialHandle[];
  bskyHandles: NomineeSocialHandle[];
}): NomineeIdentityBundle[] {
  const bundles: NomineeIdentityBundle[] = [];
  const walletList =
    input.wallets.length > 0
      ? input.wallets
      : [{ address: "", displayName: null, tezosDomain: null, sources: ["unknown"] }];

  for (const wallet of walletList) {
    const xChoices =
      input.xHandles.length > 0
        ? input.xHandles
        : [{ platform: "x" as const, handle: "", sources: [] }];
    const bskyChoices =
      input.bskyHandles.length > 0
        ? input.bskyHandles
        : [{ platform: "bsky" as const, handle: "", sources: [] }];

    for (const x of xChoices.slice(0, 6)) {
      for (const bsky of bskyChoices.slice(0, 6)) {
        const tezosAddress = wallet.address || null;
        const xHandle = x.handle || null;
        const bskyHandle = bsky.handle || null;
        const sources = uniqueStrings([...wallet.sources, ...x.sources, ...bsky.sources]);
        const id = [tezosAddress, xHandle, bskyHandle].filter(Boolean).join("|") || "empty";
        bundles.push({
          id,
          tezosAddress,
          tezosDomain: wallet.tezosDomain,
          displayName:
            wallet.displayName ??
            (wallet.tezosDomain ? wallet.tezosDomain.replace(/\.tez$/i, "") : null) ??
            (xHandle ? `@${xHandle}` : null) ??
            (bskyHandle ? `@${bskyHandle}` : null) ??
            (tezosAddress ? shortTezosAddress(tezosAddress) : null),
          xHandle,
          bskyHandle,
          sources,
        });
      }
    }
  }

  const deduped = new Map<string, NomineeIdentityBundle>();
  for (const bundle of bundles) {
    if (!deduped.has(bundle.id)) deduped.set(bundle.id, bundle);
  }
  return [...deduped.values()].slice(0, 24);
}

export async function resolveNomineeIdentity(queryInput: string): Promise<NomineeIdentityResolution> {
  const query = normalizeNomineeQuery(queryInput);
  const kind = detectNomineeQueryKind(query);
  const walletMap = new Map<string, NomineeWalletCandidate>();
  const xMap = new Map<string, NomineeSocialHandle>();
  const bskyMap = new Map<string, NomineeSocialHandle>();

  if (kind === "wallet" && isTezosAddress(query)) {
    addWallet(walletMap, query, "query_wallet");
  } else if (kind === "tezos_domain") {
    const address = await resolveTezosDomainToAddress(query);
    if (address) {
      addWallet(walletMap, address, "tezos_domains_forward", { tezosDomain: query });
    }
  } else if (kind === "x") {
    await walletsFromXHandle(query.replace(/^@/, ""), walletMap, xMap);
  } else if (kind === "bsky") {
    await walletsFromBskyHandle(query, walletMap, bskyMap);
  }

  await enrichWalletSocials(walletMap, xMap, bskyMap);

  return {
    query,
    kind,
    wallets: [...walletMap.values()].sort((a, b) => a.address.localeCompare(b.address)),
    xHandles: [...xMap.values()].sort((a, b) => a.handle.localeCompare(b.handle)),
    bskyHandles: [...bskyMap.values()].sort((a, b) => a.handle.localeCompare(b.handle)),
    bundles: buildBundles({
      wallets: [...walletMap.values()],
      xHandles: [...xMap.values()],
      bskyHandles: [...bskyMap.values()],
    }),
  };
}
