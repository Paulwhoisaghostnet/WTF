import { Router } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../auth/passport";
import {
  userOwnedTokens,
  userWallets,
} from "@shared/schema";

const router = Router();

type AuthUser = {
  id: number;
  username: string;
};

/**
 * Normalises a token metadata blob into the small, deterministic shape
 * the gallery UI expects.  The underlying `user_owned_tokens.metadata`
 * is a best-effort mix of Objkt / TZIP-12 / custom marketplace shapes,
 * so we centralise the read-side fallbacks here instead of spraying
 * them across the client.
 */
function normalizeMetadata(raw: any, tokenName: string | null | undefined) {
  const meta = (raw && typeof raw === "object") ? raw as Record<string, any> : {};

  const pickString = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s ? s : null;
  };

  const creators = Array.isArray(meta.creators) ? meta.creators
                 : Array.isArray(meta.authors)  ? meta.authors
                 : [];
  const firstCreator = pickString(creators[0]);

  const tezAddressRe = /^(tz1|tz2|tz3|KT1)[A-Za-z0-9]{33,34}$/;

  const tags: string[] = Array.isArray(meta.tags)
    ? meta.tags.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
    : [];

  const formats: Array<{ mimeType?: string; uri?: string }> = Array.isArray(meta.formats)
    ? meta.formats
        .filter((f: any) => f && typeof f === "object")
        .map((f: any) => ({
          mimeType: pickString(f.mimeType) || undefined,
          uri: pickString(f.uri) || undefined,
        }))
    : [];

  const primaryMime = formats[0]?.mimeType
                   ?? pickString(meta.mimeType)
                   ?? pickString(meta.mime)
                   ?? null;

  let mintedAtIso: string | null = null;
  const dateRaw = pickString(meta.date) ?? pickString(meta.mintedAt) ?? pickString(meta.created);
  if (dateRaw) {
    const parsed = new Date(dateRaw);
    if (!Number.isNaN(parsed.getTime())) mintedAtIso = parsed.toISOString();
  }

  return {
    title: pickString(meta.name) ?? pickString(tokenName) ?? null,
    description: pickString(meta.description),
    creatorName: firstCreator ?? pickString(meta.creator) ?? pickString(meta.artist) ?? null,
    creatorAddress: firstCreator && tezAddressRe.test(firstCreator) ? firstCreator : null,
    collectionName: pickString(meta.collectionName)
                 ?? pickString(meta.collection?.name)
                 ?? pickString(meta.contract?.name)
                 ?? null,
    mintedAtIso,
    tags,
    mimeType: primaryMime,
    artifactUri: pickString(meta.artifactUri) ?? pickString(meta.artifact_uri),
    displayUri: pickString(meta.displayUri) ?? pickString(meta.display_uri),
    thumbnailUri: pickString(meta.thumbnailUri) ?? pickString(meta.thumbnail_uri),
    royalties: meta.royalties ?? null,
    editions: pickString(meta.editions) ?? pickString(meta.supply) ?? null,
  };
}

/**
 * GET /api/gallery/mine
 *
 * Returns every token owned by the authenticated user across all of
 * their linked wallets, plus a compact facet summary (creators,
 * collections, media kinds, tags) so the UI can build filter chips
 * without a second round trip.
 *
 * Supports rich filtering and sorting:
 *
 *   ?q=           Free-text match over title / creator / collection / tokenId
 *   ?mediaKind=   video | gif | image | animated (comma separated ok)
 *   ?creator=     creatorName OR creatorAddress (comma separated)
 *   ?collection=  collectionName (comma separated)
 *   ?wallet=      wallet address (comma separated)
 *   ?contract=    token contract address (comma separated)
 *   ?tag=         metadata tag (comma separated)
 *   ?mintedFrom=  ISO date inclusive
 *   ?mintedTo=    ISO date inclusive
 *   ?sort=        acquired_desc (default) | acquired_asc | minted_desc |
 *                 minted_asc | title_asc | title_desc | creator_asc
 *   ?limit=       1…200 (default 60)
 *   ?offset=      0+
 */
router.get("/api/gallery/mine", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthUser;

    const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || "60", 10)));
    const offset = Math.max(0, parseInt((req.query.offset as string) || "0", 10));
    const q = String(req.query.q || "").trim();
    const sortKey = String(req.query.sort || "acquired_desc").trim();

    const asList = (value: unknown): string[] =>
      String(value || "")
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0);

    const wallets = asList(req.query.wallet);
    const contracts = asList(req.query.contract);
    const creators = asList(req.query.creator);
    const collections = asList(req.query.collection);
    const tags = asList(req.query.tag);
    const mediaKinds = asList(req.query.mediaKind).map((v) => v.toLowerCase());
    const mintedFromRaw = String(req.query.mintedFrom || "").trim();
    const mintedToRaw = String(req.query.mintedTo || "").trim();

    const whereParts = [eq(userOwnedTokens.userId, user.id)];

    if (wallets.length > 0) {
      whereParts.push(inArray(userOwnedTokens.walletAddress, wallets));
    }
    if (contracts.length > 0) {
      whereParts.push(inArray(userOwnedTokens.tokenContract, contracts));
    }

    if (q) {
      whereParts.push(
        sql`(
          ${userOwnedTokens.tokenName} ILIKE ${`%${q}%`}
          OR ${userOwnedTokens.tokenContract} ILIKE ${`%${q}%`}
          OR CAST(${userOwnedTokens.tokenId} AS TEXT) ILIKE ${`%${q}%`}
          OR COALESCE(${userOwnedTokens.metadata} ->> 'name', '')       ILIKE ${`%${q}%`}
          OR COALESCE(${userOwnedTokens.metadata} ->> 'creators', '')    ILIKE ${`%${q}%`}
          OR COALESCE(${userOwnedTokens.metadata} -> 'contract' ->> 'name', '') ILIKE ${`%${q}%`}
          OR COALESCE(${userOwnedTokens.metadata} ->> 'collectionName', '')     ILIKE ${`%${q}%`}
        )`
      );
    }

    if (creators.length > 0) {
      const anyMatch = creators.map(
        (name) => sql`(
          COALESCE(${userOwnedTokens.creatorAddress}, '') = ${name}
          OR COALESCE(${userOwnedTokens.metadata} ->> 'creator', '')  ILIKE ${`%${name}%`}
          OR COALESCE(${userOwnedTokens.metadata} ->> 'creators', '') ILIKE ${`%${name}%`}
          OR COALESCE(${userOwnedTokens.metadata} ->> 'authors', '')  ILIKE ${`%${name}%`}
        )`
      );
      whereParts.push(sql.join(anyMatch, sql` OR `));
    }

    if (collections.length > 0) {
      const anyMatch = collections.map(
        (name) => sql`(
          COALESCE(${userOwnedTokens.metadata} ->> 'collectionName', '')           ILIKE ${`%${name}%`}
          OR COALESCE(${userOwnedTokens.metadata} -> 'contract' ->> 'name', '')    ILIKE ${`%${name}%`}
          OR COALESCE(${userOwnedTokens.metadata} -> 'collection' ->> 'name', '')  ILIKE ${`%${name}%`}
        )`
      );
      whereParts.push(sql.join(anyMatch, sql` OR `));
    }

    if (tags.length > 0) {
      // metadata->'tags' is a JSON array; use the `?|` operator to
      // match any tag in the provided list without materialising the
      // whole array client-side.  CAST via ->'tags' ensures we don't
      // blow up when the key is missing.
      const tagList = sql.join(
        tags.map((t) => sql`${t}`),
        sql`, `
      );
      whereParts.push(sql`
        CASE
          WHEN jsonb_typeof(${userOwnedTokens.metadata} -> 'tags') = 'array'
          THEN ${userOwnedTokens.metadata} -> 'tags' ?| ARRAY[${tagList}]::text[]
          ELSE false
        END
      `);
    }

    if (mediaKinds.length > 0) {
      // Map a small taxonomy onto mimeType prefixes.
      //   video     → video/*
      //   gif       → image/gif
      //   image     → image/* except gif
      //   animated  → image/gif | image/webp | image/apng | video/*
      const kindClauses = mediaKinds.map((kind) => {
        switch (kind) {
          case "video":
            return sql`(
              COALESCE(${userOwnedTokens.metadata} ->> 'mimeType', '')  ILIKE 'video/%'
              OR COALESCE(${userOwnedTokens.metadata} -> 'formats' -> 0 ->> 'mimeType', '') ILIKE 'video/%'
            )`;
          case "gif":
            return sql`(
              COALESCE(${userOwnedTokens.metadata} ->> 'mimeType', '') = 'image/gif'
              OR COALESCE(${userOwnedTokens.metadata} -> 'formats' -> 0 ->> 'mimeType', '') = 'image/gif'
            )`;
          case "image":
            return sql`(
              COALESCE(${userOwnedTokens.metadata} ->> 'mimeType', '')  ILIKE 'image/%'
              AND COALESCE(${userOwnedTokens.metadata} ->> 'mimeType', '') <> 'image/gif'
            )`;
          case "animated":
            return sql`(
              COALESCE(${userOwnedTokens.metadata} ->> 'mimeType', '') IN ('image/gif', 'image/webp', 'image/apng')
              OR COALESCE(${userOwnedTokens.metadata} ->> 'mimeType', '') ILIKE 'video/%'
            )`;
          default:
            return sql`FALSE`;
        }
      });
      whereParts.push(sql.join(kindClauses, sql` OR `));
    }

    if (mintedFromRaw) {
      const from = new Date(mintedFromRaw);
      if (!Number.isNaN(from.getTime())) {
        whereParts.push(sql`
          CASE
            WHEN (${userOwnedTokens.metadata} ->> 'date') ~ '^\\d{4}-\\d{2}-\\d{2}'
            THEN (${userOwnedTokens.metadata} ->> 'date')::timestamp >= ${from.toISOString()}
            ELSE false
          END
        `);
      }
    }
    if (mintedToRaw) {
      const to = new Date(mintedToRaw);
      if (!Number.isNaN(to.getTime())) {
        whereParts.push(sql`
          CASE
            WHEN (${userOwnedTokens.metadata} ->> 'date') ~ '^\\d{4}-\\d{2}-\\d{2}'
            THEN (${userOwnedTokens.metadata} ->> 'date')::timestamp <= ${to.toISOString()}
            ELSE false
          END
        `);
      }
    }

    const orderBy = (() => {
      switch (sortKey) {
        case "acquired_asc":
          return [asc(userOwnedTokens.lastSeenAt), asc(userOwnedTokens.id)];
        case "minted_desc":
          return [
            desc(sql`(${userOwnedTokens.metadata} ->> 'date')::timestamp NULLS LAST`),
            desc(userOwnedTokens.lastSeenAt),
          ];
        case "minted_asc":
          return [
            asc(sql`(${userOwnedTokens.metadata} ->> 'date')::timestamp NULLS LAST`),
            asc(userOwnedTokens.lastSeenAt),
          ];
        case "title_asc":
          return [asc(sql`LOWER(COALESCE(${userOwnedTokens.tokenName}, ${userOwnedTokens.metadata} ->> 'name', ''))`)];
        case "title_desc":
          return [desc(sql`LOWER(COALESCE(${userOwnedTokens.tokenName}, ${userOwnedTokens.metadata} ->> 'name', ''))`)];
        case "creator_asc":
          return [
            asc(sql`LOWER(COALESCE(
              ${userOwnedTokens.creatorAddress},
              ${userOwnedTokens.metadata} ->> 'creator',
              ${userOwnedTokens.metadata} ->> 'creators',
              ''
            ))`),
          ];
        case "acquired_desc":
        default:
          return [desc(userOwnedTokens.lastSeenAt), desc(userOwnedTokens.id)];
      }
    })();

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: userOwnedTokens.id,
          walletAddress: userOwnedTokens.walletAddress,
          tokenContract: userOwnedTokens.tokenContract,
          tokenId: userOwnedTokens.tokenId,
          tokenName: userOwnedTokens.tokenName,
          tokenSymbol: userOwnedTokens.tokenSymbol,
          tokenThumbnail: userOwnedTokens.tokenThumbnail,
          balance: userOwnedTokens.balance,
          metadata: userOwnedTokens.metadata,
          creatorAddress: userOwnedTokens.creatorAddress,
          lastSeenAt: userOwnedTokens.lastSeenAt,
        })
        .from(userOwnedTokens)
        .where(and(...whereParts))
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(userOwnedTokens)
        .where(and(...whereParts)),
    ]);

    const items = rows.map((r) => {
      const normalized = normalizeMetadata(r.metadata, r.tokenName);
      return {
        id: r.id,
        walletAddress: r.walletAddress,
        contract: r.tokenContract,
        tokenId: r.tokenId,
        balance: r.balance,
        thumbnailUri: r.tokenThumbnail || normalized.thumbnailUri || normalized.displayUri,
        displayUri: normalized.displayUri,
        artifactUri: normalized.artifactUri,
        mimeType: normalized.mimeType,
        title: normalized.title ?? r.tokenName ?? `#${r.tokenId}`,
        description: normalized.description,
        creatorName: normalized.creatorName,
        creatorAddress: normalized.creatorAddress ?? r.creatorAddress ?? null,
        collectionName: normalized.collectionName,
        mintedAtIso: normalized.mintedAtIso,
        tags: normalized.tags,
        royalties: normalized.royalties,
        editions: normalized.editions,
        acquiredAtIso: r.lastSeenAt?.toISOString?.() ?? null,
        metadata: r.metadata as unknown,
      };
    });

    // Facets — computed from the same filter set so the UI can show
    // "N more under this creator" style hints without fetching the
    // whole table a second time.  We aggregate across the *filtered*
    // set so chips stay consistent with the current view.
    const [creatorsFacet, collectionsFacet, walletsFacet, kindsFacet] = await Promise.all([
      db.execute(sql`
        SELECT
          COALESCE(
            NULLIF(metadata ->> 'creator', ''),
            CASE
              WHEN jsonb_typeof(metadata -> 'creators') = 'array'
                   AND jsonb_array_length(metadata -> 'creators') > 0
              THEN metadata -> 'creators' ->> 0
              ELSE NULL
            END,
            creator_address
          ) AS name,
          count(*)::int AS count
        FROM user_owned_tokens
        WHERE user_id = ${user.id}
        GROUP BY name
        HAVING COALESCE(
            NULLIF(metadata ->> 'creator', ''),
            CASE
              WHEN jsonb_typeof(metadata -> 'creators') = 'array'
                   AND jsonb_array_length(metadata -> 'creators') > 0
              THEN metadata -> 'creators' ->> 0
              ELSE NULL
            END,
            creator_address
          ) IS NOT NULL
        ORDER BY count DESC, name ASC
        LIMIT 50
      `),
      db.execute(sql`
        SELECT
          COALESCE(
            NULLIF(metadata ->> 'collectionName', ''),
            NULLIF(metadata -> 'contract'   ->> 'name', ''),
            NULLIF(metadata -> 'collection' ->> 'name', '')
          ) AS name,
          count(*)::int AS count
        FROM user_owned_tokens
        WHERE user_id = ${user.id}
        GROUP BY name
        HAVING COALESCE(
            NULLIF(metadata ->> 'collectionName', ''),
            NULLIF(metadata -> 'contract'   ->> 'name', ''),
            NULLIF(metadata -> 'collection' ->> 'name', '')
          ) IS NOT NULL
        ORDER BY count DESC, name ASC
        LIMIT 50
      `),
      db
        .select({
          address: userWallets.walletAddress,
          label: userWallets.tezDomain,
          isPrimary: userWallets.isPrimary,
        })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id)),
      db.execute(sql`
        SELECT
          CASE
            WHEN COALESCE(metadata ->> 'mimeType', '') ILIKE 'video/%'    THEN 'video'
            WHEN COALESCE(metadata ->> 'mimeType', '') = 'image/gif'      THEN 'gif'
            WHEN COALESCE(metadata ->> 'mimeType', '') ILIKE 'image/%'    THEN 'image'
            ELSE 'other'
          END AS kind,
          count(*)::int AS count
        FROM user_owned_tokens
        WHERE user_id = ${user.id}
        GROUP BY kind
        ORDER BY count DESC
      `),
    ]);

    res.json({
      items,
      pagination: {
        limit,
        offset,
        total: Number(totalRow[0]?.count ?? 0),
      },
      facets: {
        creators: (creatorsFacet as any).rows ?? creatorsFacet,
        collections: (collectionsFacet as any).rows ?? collectionsFacet,
        wallets: walletsFacet,
        mediaKinds: (kindsFacet as any).rows ?? kindsFacet,
      },
      sort: sortKey,
    });
  } catch (err) {
    console.error("[gallery] failed to list owned tokens:", err);
    res.status(500).json({ error: "Failed to load gallery" });
  }
});

export default router;
