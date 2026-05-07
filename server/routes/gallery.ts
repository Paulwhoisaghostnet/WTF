import { Router } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../auth/passport";
import { walletHoldings, userWallets, tokenMetadata } from "@shared/schema";
import { resolveArtifactMimeType } from "@shared/token-media";

const router = Router();

type AuthUser = {
  id: number;
  username: string;
};

/**
 * Normalises a token metadata blob into the small, deterministic shape
 * the gallery UI expects.  Source is `token_metadata.raw` (TzKT /
 * Objkt shapes), centralised here instead of across the client.
 */
function normalizeMetadata(raw: any, tokenName: string | null | undefined) {
  const meta = (raw && typeof raw === "object") ? (raw as Record<string, any>) : {};

  const pickString = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s ? s : null;
  };

  const creators = Array.isArray(meta.creators)
    ? meta.creators
    : Array.isArray(meta.authors)
      ? meta.authors
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

  const primaryMime =
    resolveArtifactMimeType(meta) ??
    formats[0]?.mimeType ??
    pickString(meta.mimeType) ??
    pickString(meta.mime) ??
    null;

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
    collectionName:
      pickString(meta.collectionName) ??
      pickString(meta.collection?.name) ??
      pickString(meta.contract?.name) ??
      null,
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
    const collectionNames = asList(req.query.collection);
    const tags = asList(req.query.tag);
    const mediaKinds = asList(req.query.mediaKind).map((v) => v.toLowerCase());
    const mintedFromRaw = String(req.query.mintedFrom || "").trim();
    const mintedToRaw = String(req.query.mintedTo || "").trim();

    const metaCol = sql`COALESCE(${tokenMetadata.raw}, '{}'::jsonb)`;

    // "Last seen" — any activity (inbound or outbound) for this holding.
    // Used for secondary sort, "since last interaction" UX, and as a
    // last-resort fallback when acquisition time isn't yet derived.
    const lastSeenCol = sql`COALESCE(${walletHoldings.tzktLastTime}, ${walletHoldings.lastActivityAt}, ${walletHoldings.derivedAt})`;

    // "First acquired" — the moment the token actually entered this
    // wallet on-chain.  Prefer TzKT's authoritative first_time, fall
    // back to the event-derived MIN, and only use derived_at as a
    // last resort so rows with zero event coverage don't all collapse
    // to the same DB-insert instant.  This is the column that powers
    // the `acquired_desc|asc` sort and the `acquiredAtIso` response
    // field the UI shows as "acquired".
    const firstAcquiredCol = sql`COALESCE(${walletHoldings.firstAcquiredAt}, ${walletHoldings.tzktFirstTime}, ${walletHoldings.derivedAt})`;

    const titleSort = sql`LOWER(COALESCE(${tokenMetadata.name}, ${metaCol} ->> 'name', ''))`;

    const whereParts = [eq(walletHoldings.userId, user.id)];

    if (wallets.length > 0) {
      whereParts.push(inArray(walletHoldings.walletAddress, wallets));
    }
    if (contracts.length > 0) {
      whereParts.push(inArray(walletHoldings.tokenContract, contracts));
    }

    if (q) {
      const like = `%${q}%`;
      whereParts.push(
        sql`(
          COALESCE(${tokenMetadata.name}, '') ILIKE ${like}
          OR COALESCE(${metaCol}::text, '') ILIKE ${like}
          OR ${walletHoldings.tokenContract} ILIKE ${like}
          OR CAST(${walletHoldings.tokenId} AS TEXT) ILIKE ${like}
        )`
      );
    }

    if (creators.length > 0) {
      const anyMatch = creators.map(
        (name) => sql`(
          COALESCE(${metaCol} ->> 'creator', '') = ${name}
          OR COALESCE(${metaCol} ->> 'creator', '')  ILIKE ${`%${name}%`}
          OR COALESCE(${metaCol} ->> 'creators', '') ILIKE ${`%${name}%`}
          OR COALESCE(${metaCol} ->> 'authors', '')  ILIKE ${`%${name}%`}
        )`
      );
      whereParts.push(sql.join(anyMatch, sql` OR `));
    }

    if (collectionNames.length > 0) {
      const anyMatch = collectionNames.map(
        (name) => sql`(
          COALESCE(${metaCol} ->> 'collectionName', '')           ILIKE ${`%${name}%`}
          OR COALESCE(${metaCol} -> 'contract' ->> 'name', '')    ILIKE ${`%${name}%`}
          OR COALESCE(${metaCol} -> 'collection' ->> 'name', '')  ILIKE ${`%${name}%`}
        )`
      );
      whereParts.push(sql.join(anyMatch, sql` OR `));
    }

    if (tags.length > 0) {
      const tagList = sql.join(
        tags.map((t) => sql`${t}`),
        sql`, `
      );
      whereParts.push(sql`
        CASE
          WHEN jsonb_typeof(${metaCol} -> 'tags') = 'array'
          THEN ${metaCol} -> 'tags' ?| ARRAY[${tagList}]::text[]
          ELSE false
        END
      `);
    }

    if (mediaKinds.length > 0) {
      const kindClauses = mediaKinds.map((kind) => {
        switch (kind) {
          case "video":
            return sql`(
              COALESCE(${metaCol} ->> 'mimeType', '')  ILIKE 'video/%'
              OR COALESCE(${metaCol} ->> 'mime_type', '') ILIKE 'video/%'
              OR COALESCE(${metaCol} -> 'formats' -> 0 ->> 'mimeType', '') ILIKE 'video/%'
              OR COALESCE(${metaCol} -> 'formats' -> 0 ->> 'mime_type', '') ILIKE 'video/%'
            )`;
          case "audio":
            return sql`(
              COALESCE(${metaCol} ->> 'mimeType', '')  ILIKE 'audio/%'
              OR COALESCE(${metaCol} ->> 'mime_type', '') ILIKE 'audio/%'
              OR COALESCE(${metaCol} ->> 'mime', '') ILIKE 'audio/%'
              OR COALESCE(${metaCol} -> 'formats' -> 0 ->> 'mimeType', '') ILIKE 'audio/%'
              OR COALESCE(${metaCol} -> 'formats' -> 0 ->> 'mime_type', '') ILIKE 'audio/%'
              OR COALESCE(${metaCol} -> 'formats' -> 0 ->> 'mime', '') ILIKE 'audio/%'
            )`;
          case "gif":
            return sql`(
              COALESCE(${metaCol} ->> 'mimeType', '') = 'image/gif'
              OR COALESCE(${metaCol} -> 'formats' -> 0 ->> 'mimeType', '') = 'image/gif'
            )`;
          case "game":
            return sql`(
              COALESCE(${metaCol} ->> 'mimeType', '') IN ('application/zip', 'application/x-zip', 'application/x-zip-compressed')
              OR COALESCE(${metaCol} -> 'formats' -> 0 ->> 'mimeType', '') IN ('application/zip', 'application/x-zip', 'application/x-zip-compressed')
              OR LOWER(COALESCE(${metaCol} ->> 'artifactUri', '')) LIKE '%.zip'
              OR LOWER(COALESCE(${metaCol} ->> 'artifact_uri', '')) LIKE '%.zip'
            )`;
          case "image":
            return sql`(
              COALESCE(${metaCol} ->> 'mimeType', '')  ILIKE 'image/%'
              AND COALESCE(${metaCol} ->> 'mimeType', '') <> 'image/gif'
            )`;
          case "animated":
            return sql`(
              COALESCE(${metaCol} ->> 'mimeType', '') IN ('image/gif', 'image/webp', 'image/apng')
              OR COALESCE(${metaCol} ->> 'mimeType', '') ILIKE 'video/%'
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
            WHEN (${metaCol} ->> 'date') ~ '^\\d{4}-\\d{2}-\\d{2}'
            THEN (${metaCol} ->> 'date')::timestamp >= ${from.toISOString()}
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
            WHEN (${metaCol} ->> 'date') ~ '^\\d{4}-\\d{2}-\\d{2}'
            THEN (${metaCol} ->> 'date')::timestamp <= ${to.toISOString()}
            ELSE false
          END
        `);
      }
    }

    const joinTm = and(
      eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
      eq(tokenMetadata.tokenId, walletHoldings.tokenId)
    );

    // Some `tm.raw ->> 'date'` values are malformed (e.g. 'GMT+0300'
     // suffixes Postgres won't parse).  Guard the cast with a regex so
    // bad rows are ordered as NULL instead of erroring the whole query.
    const mintedSortExpr = sql`
      CASE
        WHEN (${metaCol} ->> 'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          THEN (${metaCol} ->> 'date')::timestamp
        ELSE NULL
      END
    `;

    const orderBy = (() => {
      switch (sortKey) {
        case "acquired_asc":
          return [
            sql`${firstAcquiredCol} ASC NULLS LAST`,
            asc(walletHoldings.id),
          ];
        case "minted_desc":
          // Drizzle's `desc()` appends DESC, which collides with "NULLS LAST"
          // (PostgreSQL requires DESC before NULLS LAST).  Inline the raw
          // fragment instead.
          return [sql`${mintedSortExpr} DESC NULLS LAST`, desc(lastSeenCol)];
        case "minted_asc":
          return [sql`${mintedSortExpr} ASC NULLS LAST`, asc(lastSeenCol)];
        case "title_asc":
          return [asc(titleSort)];
        case "title_desc":
          return [desc(titleSort)];
        case "creator_asc":
          return [
            asc(
              sql`LOWER(COALESCE(
              ${metaCol} ->> 'creator',
              ${metaCol} ->> 'creators',
              ''
            ))`
            ),
          ];
        case "acquired_desc":
        default:
          return [
            sql`${firstAcquiredCol} DESC NULLS LAST`,
            desc(walletHoldings.id),
          ];
      }
    })();

    const whereAnd = and(...whereParts);

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: walletHoldings.id,
          walletAddress: walletHoldings.walletAddress,
          tokenContract: walletHoldings.tokenContract,
          tokenId: walletHoldings.tokenId,
          tokenName: tokenMetadata.name,
          tokenSymbol: tokenMetadata.symbol,
          tokenThumbnail: tokenMetadata.thumbnail,
          balance: walletHoldings.balance,
          metadata: tokenMetadata.raw,
          creatorAddress: sql<string | null>`(${metaCol} -> 'creators' ->> 0)`,
          acquiredAt: firstAcquiredCol,
          lastSeenAt: lastSeenCol,
        })
        .from(walletHoldings)
        .leftJoin(tokenMetadata, joinTm)
        .where(whereAnd)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(walletHoldings)
        .leftJoin(tokenMetadata, joinTm)
        .where(whereAnd),
    ]);

    const toIso = (v: unknown): string | null => {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString();
      const d = new Date(String(v));
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    };

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
        // `acquiredAtIso` now reflects the moment the token actually
        // entered this wallet on-chain (first inbound event), not the
        // moment we indexed it.  `lastSeenAtIso` is additionally exposed
        // so UI can show "last activity" separately.
        acquiredAtIso: toIso(r.acquiredAt),
        lastSeenAtIso: toIso(r.lastSeenAt),
        metadata: r.metadata as unknown,
      };
    });

    const [creatorsFacet, collectionsFacet, walletsFacet, kindsFacet] = await Promise.all([
      // Facet queries use a subquery so the computed `name` can be
      // filtered and grouped without referencing `tm.raw` outside
      // GROUP BY (which Postgres rejects in HAVING).
      db.execute(sql`
        SELECT name, count(*)::int AS count
        FROM (
          SELECT
            COALESCE(
              NULLIF((COALESCE(tm.raw, '{}'::jsonb)) ->> 'creator', ''),
              CASE
                WHEN jsonb_typeof((COALESCE(tm.raw, '{}'::jsonb)) -> 'creators') = 'array'
                     AND jsonb_array_length((COALESCE(tm.raw, '{}'::jsonb)) -> 'creators') > 0
                THEN (COALESCE(tm.raw, '{}'::jsonb)) -> 'creators' ->> 0
                ELSE NULL
              END
            ) AS name
          FROM wallet_holdings h
          LEFT JOIN token_metadata tm
            ON tm.token_contract = h.token_contract AND tm.token_id = h.token_id
          WHERE h.user_id = ${user.id}
        ) s
        WHERE name IS NOT NULL
        GROUP BY name
        ORDER BY count DESC, name ASC
        LIMIT 50
      `),
      db.execute(sql`
        SELECT name, count(*)::int AS count
        FROM (
          SELECT
            COALESCE(
              NULLIF((COALESCE(tm.raw, '{}'::jsonb)) ->> 'collectionName', ''),
              NULLIF((COALESCE(tm.raw, '{}'::jsonb)) -> 'contract'   ->> 'name', ''),
              NULLIF((COALESCE(tm.raw, '{}'::jsonb)) -> 'collection' ->> 'name', '')
            ) AS name
          FROM wallet_holdings h
          LEFT JOIN token_metadata tm
            ON tm.token_contract = h.token_contract AND tm.token_id = h.token_id
          WHERE h.user_id = ${user.id}
        ) s
        WHERE name IS NOT NULL
        GROUP BY name
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
            WHEN COALESCE((COALESCE(tm.raw, '{}'::jsonb)) ->> 'mimeType', '') ILIKE 'audio/%'
              OR COALESCE((COALESCE(tm.raw, '{}'::jsonb)) ->> 'mime_type', '') ILIKE 'audio/%'
              OR COALESCE((COALESCE(tm.raw, '{}'::jsonb)) ->> 'mime', '') ILIKE 'audio/%'
              OR COALESCE((COALESCE(tm.raw, '{}'::jsonb)) -> 'formats' -> 0 ->> 'mimeType', '') ILIKE 'audio/%'
              OR COALESCE((COALESCE(tm.raw, '{}'::jsonb)) -> 'formats' -> 0 ->> 'mime_type', '') ILIKE 'audio/%' THEN 'audio'
            WHEN COALESCE((COALESCE(tm.raw, '{}'::jsonb)) ->> 'mimeType', '') ILIKE 'video/%'    THEN 'video'
            WHEN COALESCE((COALESCE(tm.raw, '{}'::jsonb)) ->> 'mimeType', '') IN ('application/zip', 'application/x-zip', 'application/x-zip-compressed')
              OR COALESCE((COALESCE(tm.raw, '{}'::jsonb)) -> 'formats' -> 0 ->> 'mimeType', '') IN ('application/zip', 'application/x-zip', 'application/x-zip-compressed')
              OR LOWER(COALESCE((COALESCE(tm.raw, '{}'::jsonb)) ->> 'artifactUri', '')) LIKE '%.zip'
              OR LOWER(COALESCE((COALESCE(tm.raw, '{}'::jsonb)) ->> 'artifact_uri', '')) LIKE '%.zip' THEN 'game'
            WHEN COALESCE((COALESCE(tm.raw, '{}'::jsonb)) ->> 'mimeType', '') = 'image/gif'      THEN 'gif'
            WHEN COALESCE((COALESCE(tm.raw, '{}'::jsonb)) ->> 'mimeType', '') ILIKE 'image/%'    THEN 'image'
            ELSE 'other'
          END AS kind,
          count(*)::int AS count
        FROM wallet_holdings h
        LEFT JOIN token_metadata tm
          ON tm.token_contract = h.token_contract AND tm.token_id = h.token_id
        WHERE h.user_id = ${user.id}
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
