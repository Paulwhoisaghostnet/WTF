import { eq, inArray, sql } from "drizzle-orm";

import {
  addressLabels,
  contractMetadata,
  userWallets,
  users,
  xTezosIdentityHints,
} from "@shared/schema";
import {
  bestTezosIdentityDisplay,
  extractCollectionName,
  extractTokenIdentityFields,
  isTezosAddress,
  pickHumanTezosString,
  pickTezosString,
  shortTezosAddress,
} from "@shared/tezos-identity";
import { objkt } from "./upstream";

export type TezosIdentity = {
  address: string;
  displayName: string;
  label: string | null;
  alias: string | null;
  tezosDomain: string | null;
  source: string;
  isFallback: boolean;
};

export type TokenDisplayIdentityInput = {
  tokenContract?: string | null;
  tokenId?: string | null;
  tokenName?: string | null;
  metadata?: unknown;
  creatorName?: string | null;
  creatorAddress?: string | null;
  collectionName?: string | null;
};

export type TokenDisplayIdentity = {
  tokenKey: string;
  tokenName: string | null;
  creatorName: string | null;
  creatorAddress: string | null;
  collectionName: string | null;
};

type ObjktHolderIdentityRow = {
  address?: string | null;
  alias?: string | null;
  name?: string | null;
};

const IDENTITY_CACHE_TTL_MS = Math.max(
  30_000,
  Number(process.env.TEZOS_IDENTITY_CACHE_TTL_MS || 10 * 60 * 1000)
);
const MAX_OBJKT_IDENTITY_LOOKUP = 75;
const identityCache = new Map<string, { value: TezosIdentity; expiresAt: number }>();

async function getDb() {
  return (await import("../db")).db;
}

export function tokenIdentityKey(
  tokenContract: string | null | undefined,
  tokenId: string | null | undefined
): string {
  return `${String(tokenContract || "").trim()}:${String(tokenId || "").trim()}`;
}

export function buildObjktHolderIdentityQuery(addresses: string[]) {
  const normalized = uniqueTezosAddresses(addresses).slice(0, MAX_OBJKT_IDENTITY_LOOKUP);
  return {
    query: `query ObjktHolderIdentities($addresses: [String!]!) {
  holder(where: { address: { _in: $addresses } }, limit: 100) {
    address
    alias
    name
  }
}`,
    variables: { addresses: normalized },
  };
}

export function normalizeObjktHolderIdentityRows(
  rows: ObjktHolderIdentityRow[]
): TezosIdentity[] {
  const seen = new Set<string>();
  const identities: TezosIdentity[] = [];

  for (const row of rows) {
    const address = String(row?.address || "").trim();
    if (!isTezosAddress(address) || seen.has(address)) continue;
    seen.add(address);

    const alias =
      pickHumanTezosString(row?.alias) ?? pickHumanTezosString(row?.name) ?? null;
    if (!alias) continue;

    identities.push(makeIdentity(address, { alias }, "objkt_holder"));
  }

  return identities;
}

export async function resolveTezosIdentities(
  addresses: Array<string | null | undefined>,
  options?: { fetchMissing?: boolean }
): Promise<Map<string, TezosIdentity>> {
  const fetchMissing = options?.fetchMissing !== false;
  const normalized = uniqueTezosAddresses(addresses);
  const now = Date.now();
  const resolved = new Map<string, TezosIdentity>();
  const needsLookup: string[] = [];

  for (const address of normalized) {
    const cached = identityCache.get(address);
    if (cached && cached.expiresAt > now) {
      resolved.set(address, cached.value);
    } else {
      needsLookup.push(address);
    }
  }

  if (needsLookup.length > 0) {
    for (const address of needsLookup) {
      resolved.set(address, makeFallbackIdentity(address));
    }

    await mergeAddressLabelRows(resolved, needsLookup);
    await mergeLinkedWalletRows(resolved, needsLookup);
    await mergeXIdentityHintRows(resolved, needsLookup);

    const missingHumanNames = needsLookup.filter((address) => {
      const identity = resolved.get(address);
      return !identity || identity.isFallback;
    });

    if (fetchMissing && missingHumanNames.length > 0) {
      await mergeObjktHolderRows(resolved, missingHumanNames);
    }

    for (const address of needsLookup) {
      const identity = resolved.get(address) ?? makeFallbackIdentity(address);
      identityCache.set(address, {
        value: identity,
        expiresAt: now + IDENTITY_CACHE_TTL_MS,
      });
    }
  }

  return resolved;
}

export async function resolveTokenDisplayIdentity(
  token: TokenDisplayIdentityInput
): Promise<TokenDisplayIdentity> {
  const map = await resolveTokenDisplayIdentities([token]);
  return (
    map.get(tokenIdentityKey(token.tokenContract, token.tokenId)) ?? {
      tokenKey: tokenIdentityKey(token.tokenContract, token.tokenId),
      tokenName: pickTezosString(token.tokenName),
      creatorName: null,
      creatorAddress: null,
      collectionName: pickHumanTezosString(token.collectionName),
    }
  );
}

export async function resolveTokenDisplayIdentities(
  tokens: TokenDisplayIdentityInput[]
): Promise<Map<string, TokenDisplayIdentity>> {
  const extracted = tokens.map((token) => ({
    token,
    fields: extractTokenIdentityFields(token.metadata, token.tokenName),
  }));

  const creatorAddresses = extracted.flatMap(({ token, fields }) => {
    const candidates = [token.creatorAddress, fields.creatorAddress];
    return candidates.filter((address): address is string => isTezosAddress(address));
  });
  const [identityMap, collectionTitles] = await Promise.all([
    resolveTezosIdentities(creatorAddresses),
    resolveContractCollectionTitles(
      tokens.map((token) => token.tokenContract).filter((address): address is string => isTezosAddress(address))
    ),
  ]);

  const out = new Map<string, TokenDisplayIdentity>();
  for (const { token, fields } of extracted) {
    const tokenContract = pickTezosString(token.tokenContract);
    const tokenId = pickTezosString(token.tokenId);
    const key = tokenIdentityKey(tokenContract, tokenId);
    const creatorAddress =
      (isTezosAddress(token.creatorAddress) ? String(token.creatorAddress).trim() : null) ??
      fields.creatorAddress;
    const identity = creatorAddress ? identityMap.get(creatorAddress) : null;
    const identityName =
      identity && !identity.isFallback ? identity.displayName : null;

    out.set(key, {
      tokenKey: key,
      tokenName: fields.tokenName ?? pickTezosString(token.tokenName),
      creatorName:
        pickHumanTezosString(token.creatorName) ??
        fields.creatorName ??
        identityName,
      creatorAddress,
      collectionName:
        pickHumanTezosString(token.collectionName) ??
        fields.collectionName ??
        (tokenContract ? collectionTitles.get(tokenContract) ?? null : null),
    });
  }

  return out;
}

export async function resolveContractCollectionTitles(
  tokenContracts: string[]
): Promise<Map<string, string>> {
  const contracts = uniqueTezosAddresses(tokenContracts);
  const out = new Map<string, string>();
  if (contracts.length === 0) return out;

  const db = await getDb();
  const rows = await db
    .select({
      address: contractMetadata.address,
      alias: contractMetadata.alias,
      raw: contractMetadata.raw,
    })
    .from(contractMetadata)
    .where(inArray(contractMetadata.address, contracts));

  for (const row of rows) {
    const title =
      pickHumanTezosString(row.alias) ??
      extractCollectionName(row.raw) ??
      extractContractRawTitle(row.raw);
    if (title) out.set(row.address, title);
  }

  return out;
}

async function mergeAddressLabelRows(
  resolved: Map<string, TezosIdentity>,
  addresses: string[]
) {
  const db = await getDb();
  const rows = await db
    .select({
      address: addressLabels.address,
      label: addressLabels.label,
      tezosDomain: addressLabels.tezosDomain,
    })
    .from(addressLabels)
    .where(inArray(addressLabels.address, addresses));

  for (const row of rows) {
    mergeIdentity(resolved, row.address, {
      label: row.label,
      tezosDomain: row.tezosDomain,
      source: "address_labels",
    });
  }
}

async function mergeLinkedWalletRows(
  resolved: Map<string, TezosIdentity>,
  addresses: string[]
) {
  const db = await getDb();
  const rows = await db
    .select({
      address: userWallets.walletAddress,
      tezosDomain: userWallets.tezDomain,
      username: users.username,
      displayName: users.displayName,
    })
    .from(userWallets)
    .leftJoin(users, eq(userWallets.userId, users.id))
    .where(inArray(userWallets.walletAddress, addresses));

  for (const row of rows) {
    mergeIdentity(resolved, row.address, {
      tezosDomain: row.tezosDomain,
      label: row.displayName ?? row.username,
      source: "linked_wallet",
    });
  }
}

async function mergeXIdentityHintRows(
  resolved: Map<string, TezosIdentity>,
  addresses: string[]
) {
  const db = await getDb();
  const rows = await db
    .select({
      address: xTezosIdentityHints.tezosAddress,
      alias: xTezosIdentityHints.alias,
      tzDomain: xTezosIdentityHints.tzDomain,
    })
    .from(xTezosIdentityHints)
    .where(inArray(xTezosIdentityHints.tezosAddress, addresses));

  for (const row of rows) {
    mergeIdentity(resolved, row.address, {
      alias: row.alias,
      tezosDomain: row.tzDomain,
      source: "x_tezos_identity_hints",
    });
  }
}

async function mergeObjktHolderRows(
  resolved: Map<string, TezosIdentity>,
  addresses: string[]
) {
  try {
    const payload = buildObjktHolderIdentityQuery(addresses);
    if (payload.variables.addresses.length === 0) return;
    const response = await objkt.postJson<{
      data?: { holder?: ObjktHolderIdentityRow[] };
    }>("", payload);
    const rows = Array.isArray(response?.data?.holder) ? response.data!.holder! : [];
    const identities = normalizeObjktHolderIdentityRows(rows);
    for (const identity of identities) {
      mergeIdentity(resolved, identity.address, {
        alias: identity.alias,
        source: identity.source,
      });
    }
    await upsertAddressLabelHints(identities);
  } catch {
    // Objkt labels are a convenience layer. Token/media payloads should
    // still render with existing DB labels or short addresses if Objkt is down.
  }
}

async function upsertAddressLabelHints(identities: TezosIdentity[]) {
  const rows = identities
    .filter((identity) => !identity.isFallback && identity.displayName)
    .map((identity) => ({
      address: identity.address,
      label: identity.displayName,
      lastResolvedAt: new Date(),
      updatedAt: new Date(),
    }));
  if (rows.length === 0) return;

  const db = await getDb();
  await db
    .insert(addressLabels)
    .values(rows)
    .onConflictDoUpdate({
      target: addressLabels.address,
      set: {
        label: sql`COALESCE(excluded.label, ${addressLabels.label})`,
        lastResolvedAt: sql`excluded.last_resolved_at`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

function mergeIdentity(
  resolved: Map<string, TezosIdentity>,
  address: string,
  input: {
    label?: string | null;
    alias?: string | null;
    tezosDomain?: string | null;
    source: string;
  }
) {
  if (!isTezosAddress(address)) return;
  const current = resolved.get(address) ?? makeFallbackIdentity(address);
  const next = makeIdentity(
    address,
    {
      label: current.label ?? input.label ?? null,
      alias: current.alias ?? input.alias ?? null,
      tezosDomain: current.tezosDomain ?? input.tezosDomain ?? null,
    },
    current.isFallback ? input.source : current.source
  );
  resolved.set(address, next);
}

function makeIdentity(
  address: string,
  input: {
    label?: string | null;
    alias?: string | null;
    tezosDomain?: string | null;
  },
  source: string
): TezosIdentity {
  const humanDisplay = bestTezosIdentityDisplay({
    address,
    label: input.label,
    alias: input.alias,
    tezosDomain: input.tezosDomain,
    fallbackToShort: false,
  });
  return {
    address,
    displayName: humanDisplay ?? shortTezosAddress(address),
    label: pickHumanTezosString(input.label),
    alias: pickHumanTezosString(input.alias),
    tezosDomain: pickHumanTezosString(input.tezosDomain),
    source: humanDisplay ? source : "short_address",
    isFallback: !humanDisplay,
  };
}

function makeFallbackIdentity(address: string): TezosIdentity {
  return makeIdentity(address, {}, "short_address");
}

function uniqueTezosAddresses(addresses: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      addresses
        .map((address) => String(address || "").trim())
        .filter((address): address is string => isTezosAddress(address))
    )
  );
}

function extractContractRawTitle(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  return (
    pickHumanTezosString(record.name) ??
    pickHumanTezosString(record.title) ??
    pickHumanTezosString(record.alias) ??
    (record.metadata && typeof record.metadata === "object"
      ? pickHumanTezosString((record.metadata as Record<string, unknown>).name) ??
        pickHumanTezosString((record.metadata as Record<string, unknown>).title)
      : null) ??
    null
  );
}
