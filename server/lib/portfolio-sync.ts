/**
 * Portfolio sync: TzKT FA2 balances + shared `token_metadata` +
 * `wallet_holdings` upserts.  Replaces the legacy `user_owned_tokens`
 * bulk writer removed in cockpit Phase 6.
 */

import { db } from "../db";
import { tokenMetadata, userWallets, walletHoldings } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { getOwnedFa2TokensPage, getTokenBalance } from "../tzkt";
import type { OwnedFa2Token } from "../tzkt";

function upsertMetadataFromToken(token: OwnedFa2Token): Record<string, unknown> {
  const meta = (token.metadata && typeof token.metadata === "object")
    ? (token.metadata as Record<string, unknown>)
    : {};
  const name =
    typeof token.name === "string" && token.name.trim()
      ? token.name.trim()
      : typeof meta.name === "string"
        ? meta.name
        : null;
  const thumb =
    token.thumbnail ??
    (typeof meta.thumbnailUri === "string" ? meta.thumbnailUri : null) ??
    (typeof meta.displayUri === "string" ? meta.displayUri : null) ??
    null;
  return {
    tokenContract: token.contract!,
    tokenId: token.tokenId,
    name,
    symbol: typeof token.symbol === "string" ? token.symbol : null,
    thumbnail: thumb,
    displayUri:
      typeof meta.displayUri === "string" ? meta.displayUri : null,
    artifactUri:
      typeof meta.artifactUri === "string" ? meta.artifactUri : null,
    mimeType:
      typeof meta.mimeType === "string"
        ? meta.mimeType
        : typeof meta.mime === "string"
          ? meta.mime
          : null,
    creators: meta.creators ?? null,
    tags: meta.tags ?? null,
    formats: meta.formats ?? null,
    attributes: meta.attributes ?? null,
    raw: meta as object,
  };
}

async function upsertTokenMetadataRow(token: OwnedFa2Token): Promise<void> {
  if (!token.contract || !token.tokenId) return;
  const row = upsertMetadataFromToken(token);
  const now = new Date();
  await db
    .insert(tokenMetadata)
    .values({
      tokenContract: row.tokenContract as string,
      tokenId: row.tokenId as string,
      name: row.name as string | null,
      symbol: row.symbol as string | null,
      thumbnail: row.thumbnail as string | null,
      displayUri: row.displayUri as string | null,
      artifactUri: row.artifactUri as string | null,
      mimeType: row.mimeType as string | null,
      creators: row.creators as any,
      tags: row.tags as any,
      formats: row.formats as any,
      attributes: row.attributes as any,
      raw: row.raw as any,
      fetchedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [tokenMetadata.tokenContract, tokenMetadata.tokenId],
      set: {
        name: sql`COALESCE(EXCLUDED.name, ${tokenMetadata.name})`,
        symbol: sql`COALESCE(EXCLUDED.symbol, ${tokenMetadata.symbol})`,
        thumbnail: sql`COALESCE(EXCLUDED.thumbnail, ${tokenMetadata.thumbnail})`,
        displayUri: sql`COALESCE(EXCLUDED.display_uri, ${tokenMetadata.displayUri})`,
        artifactUri: sql`COALESCE(EXCLUDED.artifact_uri, ${tokenMetadata.artifactUri})`,
        mimeType: sql`COALESCE(EXCLUDED.mime_type, ${tokenMetadata.mimeType})`,
        creators: sql`COALESCE(EXCLUDED.creators, ${tokenMetadata.creators})`,
        tags: sql`COALESCE(EXCLUDED.tags, ${tokenMetadata.tags})`,
        formats: sql`COALESCE(EXCLUDED.formats, ${tokenMetadata.formats})`,
        attributes: sql`COALESCE(EXCLUDED.attributes, ${tokenMetadata.attributes})`,
        raw: sql`COALESCE(EXCLUDED.raw, ${tokenMetadata.raw})`,
        updatedAt: now,
      },
    });
}

/**
 * Pull the current TzKT FA2 snapshot for one linked wallet into
 * `token_metadata` + `wallet_holdings`.  Does not delete rows missing
 * from TzKT (holdings-derive + zero-balance cleanup handle churn).
 */
export async function syncWalletPortfolioFromTzkt(
  userId: number,
  walletAddress: string
): Promise<void> {
  const userWalletRows = await db
    .select({ walletAddress: userWallets.walletAddress })
    .from(userWallets)
    .where(eq(userWallets.userId, userId));
  const userAddrs = new Set(userWalletRows.map((r) => r.walletAddress));

  const pageSize = 250;
  let offset = 0;
  let keepGoing = true;
  const now = new Date();

  while (keepGoing) {
    const page = await getOwnedFa2TokensPage(walletAddress, pageSize, offset);
    for (const token of page.items) {
      if (!token.contract || !/^[0-9]+$/.test(token.tokenId)) continue;
      await upsertTokenMetadataRow(token);
      const isCreator = Boolean(
        token.creatorAddress && userAddrs.has(token.creatorAddress)
      );
      await db
        .insert(walletHoldings)
        .values({
          userId,
          walletAddress,
          tokenContract: token.contract,
          tokenId: token.tokenId,
          balance: token.balance,
          firstAcquiredAt: null,
          lastActivityAt: null,
          derivedAt: now,
          tzktFirstTime: null,
          tzktLastTime: null,
          isCreator,
        })
        .onConflictDoUpdate({
          target: [
            walletHoldings.walletAddress,
            walletHoldings.tokenContract,
            walletHoldings.tokenId,
          ],
          set: {
            userId: sql`excluded.user_id`,
            balance: sql`excluded.balance`,
            isCreator: sql`excluded.is_creator`,
            derivedAt: sql`excluded.derived_at`,
          },
        });
    }
    keepGoing = page.hasMore;
    offset = page.nextOffset;
  }

  const wtf = await getTokenBalance(walletAddress);
  const wtfBalance = String(wtf?.balance ?? "0");
  await db
    .insert(walletHoldings)
    .values({
      userId,
      walletAddress,
      tokenContract: "WTF",
      tokenId: "0",
      balance: wtfBalance,
      firstAcquiredAt: null,
      lastActivityAt: null,
      derivedAt: now,
      isCreator: false,
    })
    .onConflictDoUpdate({
      target: [
        walletHoldings.walletAddress,
        walletHoldings.tokenContract,
        walletHoldings.tokenId,
      ],
      set: {
        userId: sql`excluded.user_id`,
        balance: sql`excluded.balance`,
        derivedAt: sql`excluded.derived_at`,
      },
    });

  await db
    .insert(tokenMetadata)
    .values({
      tokenContract: "WTF",
      tokenId: "0",
      name: "WTF",
      symbol: "WTF",
      thumbnail: null,
      raw: { synthetic: true, source: "tzkt_wtf_balance" } as any,
      fetchedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [tokenMetadata.tokenContract, tokenMetadata.tokenId],
      set: {
        name: sql`COALESCE(${tokenMetadata.name}, EXCLUDED.name)`,
        updatedAt: now,
      },
    });
}

export async function runPortfolioSyncForAll(): Promise<{
  itemsIn: number;
  itemsOut: number;
}> {
  const wallets = await db.select().from(userWallets);
  let ok = 0;
  let err = 0;
  for (const w of wallets) {
    try {
      await syncWalletPortfolioFromTzkt(w.userId, w.walletAddress);
      ok++;
    } catch (e) {
      console.error(
        `[portfolio-sync] ${w.walletAddress}:`,
        e instanceof Error ? e.message : e
      );
      err++;
    }
  }
  console.log(
    `[portfolio-sync] done: ${ok} ok, ${err} errors, ${wallets.length} wallets`
  );
  return { itemsIn: wallets.length, itemsOut: ok };
}
