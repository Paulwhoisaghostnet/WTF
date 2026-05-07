import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  tokenListings,
  tokenMetadata,
  xTezosIdentityHints,
} from "@shared/schema";
import { externalMarketplaceName } from "@shared/external-marketplaces";
import {
  buildObjktTokenUrl,
  buildTzktTokenUrl,
  buildXProfileUrl,
  type ConsoleMarketplaceLink,
  type ConsoleTokenProvenance,
} from "@shared/console-provenance";
import {
  extractTokenIdentityFields,
  isTezosAddress,
  shortTezosAddress,
} from "@shared/tezos-identity";
import { db } from "../../db";
import {
  resolveTokenDisplayIdentities,
  tokenIdentityKey,
} from "../../lib/tezos-identity";

export type ConsoleProvenanceInput = {
  tokenContract?: string | null;
  tokenId?: string | null;
  tokenName?: string | null;
  metadata?: unknown;
  source?: "tezos-token" | "static" | "upload" | "unknown";
};

type NormalizedInput = Omit<ConsoleProvenanceInput, "tokenContract" | "tokenId"> & {
  tokenContract: string;
  tokenId: string;
};

export async function buildConsoleTokenProvenanceMap(
  inputs: ConsoleProvenanceInput[]
): Promise<Map<string, ConsoleTokenProvenance>> {
  const normalized = normalizeInputs(inputs);
  const out = new Map<string, ConsoleTokenProvenance>();
  if (normalized.length === 0) return out;

  const metadataByKey = await loadMissingTokenMetadata(normalized);
  const identityInputs = normalized.map((input) => {
    const key = tokenIdentityKey(input.tokenContract, input.tokenId);
    const fallback = metadataByKey.get(key);
    return {
      tokenContract: input.tokenContract,
      tokenId: input.tokenId,
      tokenName: input.tokenName || fallback?.name || null,
      metadata: input.metadata || fallback?.raw || null,
      creatorAddress: fallback?.creatorAddress || null,
    };
  });

  const identities = await resolveTokenDisplayIdentities(identityInputs);
  const creatorAddresses = Array.from(
    new Set(
      Array.from(identities.values())
        .map((identity) => identity.creatorAddress)
        .filter((address): address is string => Boolean(address && isTezosAddress(address)))
    )
  );
  const [xByAddress, listingsByToken] = await Promise.all([
    loadXHandlesByAddress(creatorAddresses),
    loadActiveListingLinks(normalized),
  ]);

  for (const input of normalized) {
    const key = tokenIdentityKey(input.tokenContract, input.tokenId);
    const fallback = metadataByKey.get(key);
    const metadata = input.metadata || fallback?.raw || null;
    const identity = identities.get(key);
    const extracted = extractTokenIdentityFields(metadata, input.tokenName || fallback?.name);
    const creatorAddress = identity?.creatorAddress || extracted.creatorAddress || fallback?.creatorAddress || null;
    const xHint = creatorAddress ? xByAddress.get(creatorAddress) : null;
    const tokenUrl = buildObjktTokenUrl(input.tokenContract, input.tokenId);
    const marketplaceLinks = [
      ...listingLinksForToken(input.tokenContract, input.tokenId, listingsByToken.get(key) || []),
      {
        label: "objkt token page",
        url: tokenUrl,
        kind: "marketplace",
        marketplace: "objkt",
      } satisfies ConsoleMarketplaceLink,
    ];

    out.set(key, {
      source: input.source || "tezos-token",
      chain: "tezos",
      tokenContract: input.tokenContract,
      tokenId: input.tokenId,
      tokenTitle: identity?.tokenName || extracted.tokenName || fallback?.name || input.tokenName || null,
      tokenUrl,
      explorerUrl: buildTzktTokenUrl(input.tokenContract, input.tokenId),
      creatorName: identity?.creatorName || extracted.creatorName || null,
      creatorAddress,
      tezosIdentity:
        identity?.creatorName ||
        extracted.creatorName ||
        (creatorAddress ? shortTezosAddress(creatorAddress) : null),
      xHandle: xHint?.twitterHandle || null,
      xUrl: xHint?.twitterHandle ? buildXProfileUrl(xHint.twitterHandle) : null,
      collectionName: identity?.collectionName || extracted.collectionName || null,
      mintedAtIso: extracted.mintedAtIso || null,
      marketplaceLinks: dedupeMarketplaceLinks(marketplaceLinks),
      attributionRequired: true,
    });
  }

  return out;
}

export function mergeConsoleProvenanceIntoMetadata(
  metadata: unknown,
  provenance: ConsoleTokenProvenance | null | undefined
): unknown {
  if (!provenance) return metadata;
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  return { ...base, wtfProvenance: provenance };
}

function normalizeInputs(inputs: ConsoleProvenanceInput[]): NormalizedInput[] {
  const seen = new Set<string>();
  const out: NormalizedInput[] = [];
  for (const input of inputs) {
    const tokenContract = String(input.tokenContract || "").trim();
    const tokenId = String(input.tokenId || "").trim();
    if (!isTezosAddress(tokenContract) || !tokenId) continue;
    const key = tokenIdentityKey(tokenContract, tokenId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...input,
      tokenContract,
      tokenId,
    });
  }
  return out;
}

async function loadMissingTokenMetadata(inputs: NormalizedInput[]) {
  const out = new Map<
    string,
    { name: string | null; raw: unknown; creatorAddress: string | null }
  >();
  if (inputs.length === 0) return out;

  const rows = await queryTokenScoped(tokenMetadata, inputs, async (where) =>
    db
      .select({
        tokenContract: tokenMetadata.tokenContract,
        tokenId: tokenMetadata.tokenId,
        name: tokenMetadata.name,
        raw: tokenMetadata.raw,
        creatorAddress: tokenMetadata.creatorAddress,
      })
      .from(tokenMetadata)
      .where(where)
  );

  for (const row of rows) {
    out.set(tokenIdentityKey(row.tokenContract, row.tokenId), {
      name: row.name ?? null,
      raw: row.raw,
      creatorAddress: row.creatorAddress ?? null,
    });
  }
  return out;
}

async function loadXHandlesByAddress(addresses: string[]) {
  const out = new Map<
    string,
    { twitterHandle: string; alias: string | null; tzDomain: string | null }
  >();
  if (addresses.length === 0) return out;
  const rows = await db
    .select({
      twitterHandle: xTezosIdentityHints.twitterHandle,
      tezosAddress: xTezosIdentityHints.tezosAddress,
      alias: xTezosIdentityHints.alias,
      tzDomain: xTezosIdentityHints.tzDomain,
    })
    .from(xTezosIdentityHints)
    .where(inArray(xTezosIdentityHints.tezosAddress, addresses))
    .orderBy(desc(xTezosIdentityHints.updatedAt));

  for (const row of rows) {
    if (!out.has(row.tezosAddress)) {
      out.set(row.tezosAddress, {
        twitterHandle: row.twitterHandle,
        alias: row.alias ?? null,
        tzDomain: row.tzDomain ?? null,
      });
    }
  }
  return out;
}

async function loadActiveListingLinks(inputs: NormalizedInput[]) {
  const out = new Map<string, (typeof tokenListings.$inferSelect)[]>();
  if (inputs.length === 0) return out;

  const rows = await queryTokenScoped(tokenListings, inputs, async (where) =>
    db
      .select()
      .from(tokenListings)
      .where(and(eq(tokenListings.active, true), where))
      .orderBy(tokenListings.priceMutez)
      .limit(200)
  );

  for (const row of rows) {
    const key = tokenIdentityKey(row.tokenContract, row.tokenId);
    const list = out.get(key) || [];
    if (list.length < 5) {
      list.push(row);
      out.set(key, list);
    }
  }
  return out;
}

function listingLinksForToken(
  tokenContract: string,
  tokenId: string,
  listings: (typeof tokenListings.$inferSelect)[]
): ConsoleMarketplaceLink[] {
  const tokenUrl = buildObjktTokenUrl(tokenContract, tokenId);
  return listings.map((listing) => {
    const marketplace = externalMarketplaceName(listing.marketplace);
    return {
      label: `${marketplace} listing`,
      url: tokenUrl,
      kind: "listing",
      marketplace,
      listingId: listing.listingId,
      priceMutez: listing.priceMutez == null ? null : String(listing.priceMutez),
      editions: listing.editions ?? null,
    };
  });
}

async function queryTokenScoped(
  table: { tokenContract: any; tokenId: any },
  inputs: NormalizedInput[],
  run: (where: ReturnType<typeof or>) => Promise<any[]>
): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; i < inputs.length; i += 40) {
    const chunk = inputs.slice(i, i + 40);
    const where = or(
      ...chunk.map((input) =>
        and(
          eq(table.tokenContract, input.tokenContract),
          eq(table.tokenId, input.tokenId)
        )
      )
    );
    if (where) rows.push(...(await run(where)));
  }
  return rows;
}

function dedupeMarketplaceLinks(links: ConsoleMarketplaceLink[]): ConsoleMarketplaceLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.kind}:${link.marketplace || ""}:${link.listingId || ""}:${link.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
